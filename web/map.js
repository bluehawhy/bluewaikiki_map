// Framework-independent map adapter; can be imported by React/Vue or any ES module.
export const INITIAL_VIEW = Object.freeze({
  center: [129.0756, 35.1796], // Bus Timer's Busan/Yeonje-gu map anchor
  zoom: 14,
});

// The style file is a byte-for-byte copy of Bus Timer's
// assets/map/bus_transit_style.json (OpenFreeMap/OpenMapTiles/OSM).
export function createMap({lib, container, styleUrl, onReady, onError} = {}) {
  if (!lib?.Map) throw new Error('MapLibre GL JS is not available');
  if (!container) throw new Error('Missing map container');
  const map = new lib.Map({
    container,
    style: styleUrl || new URL('./styles/bus_transit_style.json', import.meta.url).href,
    center: [...INITIAL_VIEW.center],
    zoom: INITIAL_VIEW.zoom,
    minZoom: 3,
    maxZoom: 20,
    attributionControl: false,
    dragRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
  });
  map.addControl(new lib.AttributionControl({compact: true}), 'bottom-right');
  map.touchZoomRotate.disableRotation();
  map.on('load', () => onReady?.(map));
  map.on('error', event => onError?.(event?.error || new Error('Map tile unavailable')));
  return {
    map,
    zoomIn: () => map.zoomIn(),
    zoomOut: () => map.zoomOut(),
    reset: () => map.flyTo({
      center: [...INITIAL_VIEW.center],
      zoom: INITIAL_VIEW.zoom,
      bearing: 0,
      pitch: 0,
      essential: true,
    }),
    resize: () => map.resize(),
    destroy: () => map.remove(),
  };
}
