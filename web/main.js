import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.17.0/dist/maplibre-gl.mjs';
import {createMap} from './map.js';

const status = document.getElementById('map-status');
const dot = document.getElementById('map-dot');

function updateStatus(message, kind = '') {
  status.textContent = message;
  dot.className = 'map-status-panel__dot' + (kind ? ' ' + kind : '');
}

try {
  const controller = createMap({
    lib: maplibregl,
    container: 'map',
    onReady: () => updateStatus('지도 준비 완료 · 지도를 드래그하거나 확대해 보세요.', 'ready'),
    onError: () => updateStatus('일부 지도 타일을 불러오지 못했습니다. 네트워크를 확인해 주세요.', 'error'),
  });
  document.getElementById('zoom-in').addEventListener('click', controller.zoomIn);
  document.getElementById('zoom-out').addEventListener('click', controller.zoomOut);
  document.getElementById('reset-view').addEventListener('click', controller.reset);
} catch (error) {
  console.error('Map preview initialization failed:', error);
  updateStatus('지도를 시작하지 못했습니다. WebGL 지원과 네트워크를 확인해 주세요.', 'error');
}
