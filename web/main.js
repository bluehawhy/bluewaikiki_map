import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs';
import {createMap, DEFAULT_ROAD_LINE_WIDTHS, normalizeRoadLineWidths} from './map.js';

const status = document.getElementById('map-status');
const dot = document.getElementById('map-dot');
const modeButton = document.getElementById('toggle-3d');
const dialog = document.getElementById('feature-modal');
const copyStatus = document.getElementById('feature-modal-copy-status');
const roadStyleButton = document.getElementById('road-style-toggle');
const roadStylePanel = document.getElementById('road-style-panel');
const centerWidthInput = document.getElementById('center-line-width');
const laneWidthInput = document.getElementById('lane-line-width');
const centerWidthValue = document.getElementById('center-line-width-value');
const laneWidthValue = document.getElementById('lane-line-width-value');
const ROAD_STYLE_STORAGE_KEY = 'bluewaikiki-map-road-line-widths-v1';

function readRoadLineWidths() {
  try {
    const value = window.localStorage.getItem(ROAD_STYLE_STORAGE_KEY);
    if (value) return normalizeRoadLineWidths(JSON.parse(value));
  } catch (error) {
    console.warn('Could not read saved line widths:', error);
  }
  return {...DEFAULT_ROAD_LINE_WIDTHS};
}

function storeRoadLineWidths(values) {
  try {
    window.localStorage.setItem(ROAD_STYLE_STORAGE_KEY, JSON.stringify(values));
  } catch (error) {
    // Private browsing / disabled storage: current view still works.
    console.warn('Line width preferences could not be saved:', error);
  }
}

const savedRoadLineWidths = readRoadLineWidths();

function reflectRoadLineWidths(values) {
  centerWidthInput.value = String(values.center);
  laneWidthInput.value = String(values.lane);
  centerWidthValue.textContent = values.center.toFixed(2) + 'px';
  laneWidthValue.textContent = values.lane.toFixed(2) + 'px';
}

function setRoadStylePanelOpen(open) {
  roadStylePanel.hidden = !open;
  roadStyleButton.setAttribute('aria-expanded', String(open));
  roadStyleButton.setAttribute('aria-label', open ? '차선 두께 설정 닫기' : '차선 두께 설정 열기');
}

function applyRoadLineWidths(values) {
  const next = controller?.setRoadLineWidths(values)
    || normalizeRoadLineWidths(values);
  reflectRoadLineWidths(next);
  storeRoadLineWidths(next);
}

reflectRoadLineWidths(savedRoadLineWidths);
roadStyleButton.addEventListener('click', () => {
  setRoadStylePanelOpen(roadStylePanel.hidden);
});
document.getElementById('road-style-close').addEventListener('click', () => {
  setRoadStylePanelOpen(false);
  roadStyleButton.focus();
});
centerWidthInput.addEventListener('input', () =>
  applyRoadLineWidths({center: Number(centerWidthInput.value)}));
laneWidthInput.addEventListener('input', () =>
  applyRoadLineWidths({lane: Number(laneWidthInput.value)}));
document.getElementById('road-style-reset').addEventListener('click', () =>
  applyRoadLineWidths({...DEFAULT_ROAD_LINE_WIDTHS}));
document.addEventListener('pointerdown', event => {
  if (!roadStylePanel.hidden &&
      !roadStylePanel.contains(event.target) &&
      !roadStyleButton.contains(event.target)) {
    setRoadStylePanelOpen(false);
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !roadStylePanel.hidden) {
    setRoadStylePanelOpen(false);
    roadStyleButton.focus();
  }
});
let selectedJSON = '';
let controller;

function updateStatus(message, kind = '') {
  status.textContent = message;
  dot.className = 'map-status-panel__dot' + (kind ? ' ' + kind : '');
}

function updateModeButton(is3D) {
  modeButton.textContent = is3D ? '2D' : '3D';
  modeButton.setAttribute('aria-pressed', String(is3D));
  modeButton.setAttribute('aria-label', is3D ? '2D 평면 지도 보기' : '3D 건물 보기');
  modeButton.title = is3D ? '2D 지도로 전환' : '3D 건물 보기';
  updateStatus(is3D
    ? '3D 건물 모드 · 건물 높이는 OpenMapTiles 기반입니다.'
    : '2D 지도 모드 · 도로나 건물을 눌러 속성을 확인하세요.', 'ready');
}

function appendPairs(parent, entries) {
  parent.replaceChildren();
  if (entries.length === 0) {
    const message = document.createElement('p');
    message.className = 'feature-modal__empty';
    message.textContent = '현재 확대 수준의 타일에는 별도 속성이 없습니다.';
    parent.append(message);
    return;
  }
  for (const [key, value] of entries) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    term.textContent = key;
    const description = document.createElement('dd');
    description.textContent = value === null ? 'null'
      : typeof value === 'object' ? JSON.stringify(value) : String(value);
    row.append(term, description);
    parent.append(row);
  }
}

function inspectFeature(selection) {
  const {kind, source, sourceLayer, styleLayer, feature} = selection;
  const properties = feature.properties || {};
  const title = kind === 'building'
    ? '건물 속성 정보' : '도로 속성 정보';
  const name = properties['name:ko'] || properties.name || properties.ref || '';
  document.getElementById('feature-kind').textContent = kind === 'building'
    ? '건물 · OpenMapTiles building' : '도로 · OpenMapTiles transportation';
  document.getElementById('feature-modal-title').textContent = name
    ? title + ' · ' + name : title;
  document.getElementById('feature-modal-note').textContent = kind === 'building'
    ? '실제 벡터 타일 건물 객체입니다. 높이는 추정값일 수 있고, 원본 OSM의 모든 속성이 포함되지는 않습니다.'
    : '현재 화면의 도로 타일 구간입니다. 원본 OSM의 도로 전체가 아니라 타일 경계에서 나뉜 일부일 수 있습니다.';
  appendPairs(document.getElementById('feature-modal-meta'), [
    ['데이터 소스', source],
    ['벡터 레이어', sourceLayer],
    ['지도 스타일 레이어', styleLayer],
    ['객체 ID', feature.id ?? '제공되지 않음'],
    ['좌표 형식', feature.geometry?.type || '알 수 없음'],
  ]);
  appendPairs(document.getElementById('feature-modal-properties'),
    Object.entries(properties).sort(([a],[b]) => a.localeCompare(b)));
  selectedJSON = JSON.stringify({
    type: 'Feature',
    ...(feature.id === undefined ? {} : {id: feature.id}),
    source,
    sourceLayer,
    styleLayer,
    properties,
    geometry: feature.geometry,
  }, null, 2);
  document.getElementById('feature-modal-json').textContent = selectedJSON;
  copyStatus.textContent = '';
  dialog.querySelector('details').open = false;
  if (!dialog.open) dialog.showModal();
}

function clearDialog() {
  if (dialog.open) dialog.close();
}

dialog.addEventListener('click', event => {
  // A native <dialog> dispatches backdrop clicks to the dialog itself.
  // Only close when the pointer is outside its visible rectangle so clicks
  // on the modal content (including blank/padded areas) do not dismiss it.
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) dialog.close();
});

dialog.addEventListener('close', () => controller?.clearFeatureSelection());
document.getElementById('feature-modal-close').addEventListener('click', () => dialog.close());
document.getElementById('feature-modal-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(selectedJSON);
    copyStatus.textContent = 'JSON을 복사했어요.';
  } catch {
    copyStatus.textContent = '복사할 수 없습니다. 보안 연결(HTTPS)을 확인해 주세요.';
  }
});

try {
  controller = createMap({
    lib: maplibregl,
    container: 'map',
    roadLineWidths: savedRoadLineWidths,
    onReady: () => {
      roadStyleButton.disabled = false;
      centerWidthInput.disabled = false;
      laneWidthInput.disabled = false;
      modeButton.disabled = false;
      updateModeButton(false);
    },
    onModeChange: updateModeButton,
    onFeatureSelect: inspectFeature,
    onFeatureClear: clearDialog,
    onError: () => updateStatus('일부 지도 타일을 불러오지 못했습니다. 네트워크를 확인해 주세요.', 'error'),
  });
  document.getElementById('zoom-in').addEventListener('click', controller.zoomIn);
  document.getElementById('zoom-out').addEventListener('click', controller.zoomOut);
  document.getElementById('reset-view').addEventListener('click', controller.reset);
  modeButton.addEventListener('click', controller.toggle3D);
} catch (error) {
  console.error('Map preview initialization failed:', error);
  updateStatus('지도를 시작하지 못했습니다. WebGL 지원과 네트워크를 확인해 주세요.', 'error');
}
