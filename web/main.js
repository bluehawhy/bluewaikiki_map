import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs';
import {createMap} from './map.js';

const status = document.getElementById('map-status');
const dot = document.getElementById('map-dot');
const modeButton = document.getElementById('toggle-3d');

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
    : '2D 지도 모드 · 지도를 드래그하거나 확대해 보세요.', 'ready');
}

try {
  const controller = createMap({
    lib: maplibregl,
    container: 'map',
    onReady: () => {
      modeButton.disabled = false;
      updateModeButton(false);
    },
    onModeChange: updateModeButton,
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
