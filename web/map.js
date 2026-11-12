// Framework-independent MapLibre adapter. React/Vue can reuse createMap().
import {attachFeatureInspector} from './feature-inspector.js';
export const INITIAL_VIEW = Object.freeze({
  center: [129.0756, 35.1796], // Bus Timer's Busan/Yeonje-gu anchor
  zoom: 14,
});

// Warm neutral building shade shared by 2D footprints and 3D extrusions.
const BUILDING_COLOR = '#DDCEB5';
const BUILDING_OPACITY = 0.5;
// A feature with any actual tile attribute uses a lighter orange.
// OpenMapTiles may add render_height/min_height automatically at zoom >= 14.
const BUILDING_DATA_COLOR = '#F5C79F';
const BUILDING_DATA_OPACITY = 0.7; // 30% transparency
const HAS_BUILDING_DATA = [
  'any',
  ['has', 'render_height'],
  ['has', 'render_min_height'],
  ['has', 'colour'],
  ['has', 'hide_3d'],
  ['has', 'name'],
  ['has', 'name:ko'],
];
const BUILDING_COLOR_EXPRESSION = ['case', HAS_BUILDING_DATA, BUILDING_DATA_COLOR, BUILDING_COLOR];
const BUILDING_OPACITY_EXPRESSION = ['case', HAS_BUILDING_DATA,
  BUILDING_DATA_OPACITY, BUILDING_OPACITY];
const BUILDING_LAYER = 'bluewaikiki-3d-buildings';
const THREE_D_VIEW = Object.freeze({pitch: 58, bearing: -16, minZoom: 15.5});

// Original Bus Timer Style JSON stays unchanged. Enable 3D as a runtime layer,
// so future adjustments to the 2D style do not require rebuilding the map.
function add3DBuildingLayer(map) {
  if (!map.getSource('openmaptiles') || map.getLayer(BUILDING_LAYER)) return;
  map.addLayer({
    id: BUILDING_LAYER,
    type: 'fill-extrusion',
    source: 'openmaptiles',
    'source-layer': 'building',
    minzoom: 14,
    filter: ['!=', ['get', 'hide_3d'], true],
    layout: {visibility: 'none'},
    paint: {
      'fill-extrusion-color': BUILDING_COLOR_EXPRESSION,
      'fill-extrusion-opacity': BUILDING_OPACITY_EXPRESSION,
      'fill-extrusion-vertical-gradient': true,
      // OpenMapTiles render_height / render_min_height include OSM level data
      // and can be estimated when the original building height is unavailable.
      'fill-extrusion-height': [
        'interpolate', ['linear'], ['zoom'],
        14, 0, 15.5, ['max', 3, ['coalesce', ['get', 'render_height'], 9]],
      ],
      'fill-extrusion-base': [
        'interpolate', ['linear'], ['zoom'],
        14, 0, 15.5, ['max', 0, ['coalesce', ['get', 'render_min_height'], 0]],
      ],
    },
  }, map.getLayer('major-place-labels') ? 'major-place-labels' : undefined);
}

export function createMap({
  lib, container, styleUrl, onReady, onError, onModeChange, onFeatureSelect, onFeatureClear,
} = {}) {
  if (!lib?.Map) throw new Error('MapLibre GL JS is not available');
  if (!container) throw new Error('Missing map container');
  let threeDEnabled = false;
  const map = new lib.Map({
    container,
    style: styleUrl || new URL('./styles/bus_transit_style.json', import.meta.url).href,
    center: [...INITIAL_VIEW.center],
    zoom: INITIAL_VIEW.zoom,
    minZoom: 3,
    maxZoom: 20,
    maxPitch: 70,
    antialias: true,
    attributionControl: false,
    dragRotate: false,
    touchPitch: false,
    renderWorldCopies: false,
  });
  map.addControl(new lib.AttributionControl({compact: true}), 'bottom-right');
  map.touchZoomRotate.disableRotation();
  const inspector = attachFeatureInspector(map, {
    onSelect: onFeatureSelect,
    onClear: onFeatureClear,
  });

  function updateBuildingLayers() {
    if (!map.getSource('openmaptiles')) return;
    add3DBuildingLayer(map);
    if (map.getLayer(BUILDING_LAYER)) {
      map.setLayoutProperty(BUILDING_LAYER, 'visibility', threeDEnabled ? 'visible' : 'none');
    }
    // Keep both flat footprints and 3D volumes a soft translucent beige.
    if (map.getLayer('buildings')) {
      map.setPaintProperty('buildings', 'fill-color', BUILDING_COLOR_EXPRESSION);
      map.setPaintProperty('buildings', 'fill-opacity', BUILDING_OPACITY_EXPRESSION);
      map.setLayoutProperty('buildings', 'visibility', threeDEnabled ? 'none' : 'visible');
    }
    // Road-name symbols can render through/over extruded buildings.
    // Hide road names in 3D; retain the familiar labels on the 2D map.
    if (map.getLayer('road-labels')) {
      map.setLayoutProperty('road-labels', 'visibility', threeDEnabled ? 'none' : 'visible');
    }
  }

  function viewOptions(is3D, includeCenter = false) {
    const view = {
      pitch: is3D ? THREE_D_VIEW.pitch : 0,
      bearing: is3D ? THREE_D_VIEW.bearing : 0,
      zoom: is3D ? Math.max(map.getZoom(), THREE_D_VIEW.minZoom) : map.getZoom(),
      duration: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 0 : 700,
    };
    if (includeCenter) {
      view.center = [...INITIAL_VIEW.center];
      view.zoom = is3D ? THREE_D_VIEW.minZoom : INITIAL_VIEW.zoom;
    }
    return view;
  }

  // Reapply if a consuming framework replaces the map style at runtime.
  map.on('style.load', updateBuildingLayers);
  map.on('load', () => onReady?.(map));
  map.on('error', event => onError?.(event?.error || new Error('Map tile unavailable')));

  const controller = {
    map,
    zoomIn: () => map.zoomIn(),
    zoomOut: () => map.zoomOut(),
    reset: () => map.flyTo({...viewOptions(threeDEnabled, true), essential: true}),
    set3DEnabled(enabled) {
      threeDEnabled = Boolean(enabled);
      if (map.isStyleLoaded()) updateBuildingLayers();
      inspector.set3DEnabled(threeDEnabled);
      map.easeTo(viewOptions(threeDEnabled));
      onModeChange?.(threeDEnabled);
      return threeDEnabled;
    },
    toggle3D() {
      return controller.set3DEnabled(!threeDEnabled);
    },
    is3DEnabled: () => threeDEnabled,
    clearFeatureSelection: () => inspector.clear(),
    resize: () => map.resize(),
    destroy: () => {
      inspector.destroy();
      map.remove();
    },
  };
  return controller;
}
