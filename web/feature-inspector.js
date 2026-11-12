// Inspect actual, currently-rendered OpenMapTiles features without modifying OSM.
const ROAD_LAYERS = ['major-roads', 'local-roads', 'pedestrian-paths'];
const ROAD_SOURCE = 'bw-road-selection';
const BUILDING_SOURCE = 'bw-building-selection';
const ROAD_OUTLINE = 'bw-selected-road-outline';
const ROAD_LINE = 'bw-selected-road-line';
const BUILDING_FILL = 'bw-selected-building-fill';
const BUILDING_EXTRUSION = 'bw-selected-building-extrusion';
const EMPTY = {type: 'FeatureCollection', features: []};

function readyLayers(map, candidates) {
  return candidates.filter(id => map.getLayer(id) &&
    map.getLayoutProperty(id, 'visibility') !== 'none');
}

function distanceToLine(point, geometry, map) {
  if (!geometry || (geometry.type !== 'LineString' && geometry.type !== 'MultiLineString')) {
    return Infinity;
  }
  const paths = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  let distance = Infinity;
  for (const path of paths) {
    for (let index = 1; index < path.length; index++) {
      const a = map.project(path[index - 1]);
      const b = map.project(path[index]);
      const dx = b.x - a.x, dy = b.y - a.y;
      const scale = dx * dx + dy * dy;
      const t = scale ? Math.max(0, Math.min(1,
        ((point.x - a.x) * dx + (point.y - a.y) * dy) / scale)) : 0;
      distance = Math.min(distance,
        Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
    }
  }
  return distance;
}

function clickedFeature(map, point, threeDEnabled) {
  // Building takes priority over roads if its footprint/wall occupies the pixel.
  const buildingLayers = readyLayers(map,
    threeDEnabled ? ['bluewaikiki-3d-buildings'] : ['buildings']);
  if (buildingLayers.length) {
    const hit = map.queryRenderedFeatures(point, {layers: buildingLayers})
      .find(f => f.source === 'openmaptiles' && f.sourceLayer === 'building');
    if (hit) return {kind: 'building', hit};
  }

  // Roads are lines and can be thinner than a mouse/touch target.
  const roadLayers = readyLayers(map, ROAD_LAYERS);
  if (!roadLayers.length) return null;
  const tolerance = 12;
  const nearby = map.queryRenderedFeatures([
    [point.x - tolerance, point.y - tolerance],
    [point.x + tolerance, point.y + tolerance],
  ], {layers: roadLayers});

  let nearest = null, closest = tolerance + 1;
  for (const feature of nearby) {
    if (feature.source !== 'openmaptiles' || feature.sourceLayer !== 'transportation') continue;
    const d = distanceToLine(point, feature.geometry, map);
    if (d < closest) { nearest = feature; closest = d; }
  }
  return nearest ? {kind: 'road', hit: nearest} : null;
}

function asGeoJSON(feature) {
  return {
    type: 'Feature',
    ...(feature.id === undefined ? {} : {id: feature.id}),
    properties: {...feature.properties},
    geometry: feature.geometry,
  };
}

function collection(feature) {
  return feature ? {type: 'FeatureCollection', features: [feature]} : EMPTY;
}

export function attachFeatureInspector(map, {onSelect, onClear} = {}) {
  let selected = null;
  let threeD = false;

  function install() {
    if (!map.getSource('openmaptiles')) return;
    if (!map.getSource(ROAD_SOURCE)) {
      map.addSource(ROAD_SOURCE, {type: 'geojson', data: collection(
        selected?.kind === 'road' ? selected.feature : null)});
    }
    if (!map.getSource(BUILDING_SOURCE)) {
      map.addSource(BUILDING_SOURCE, {type: 'geojson', data: collection(
        selected?.kind === 'building' ? selected.feature : null)});
    }

    // Keep selection above ordinary roads but below 3D volumes.
    const beforeRoad = map.getLayer('bluewaikiki-3d-buildings')
      ? 'bluewaikiki-3d-buildings' : 'major-place-labels';
    if (!map.getLayer(ROAD_OUTLINE)) {
      map.addLayer({
        id: ROAD_OUTLINE, type: 'line', source: ROAD_SOURCE,
        layout: {'line-cap': 'round', 'line-join': 'round'},
        paint: {'line-color': '#FFFFFF', 'line-opacity': 0.98, 'line-width': 12},
      }, beforeRoad);
    }
    if (!map.getLayer(ROAD_LINE)) {
      map.addLayer({
        id: ROAD_LINE, type: 'line', source: ROAD_SOURCE,
        layout: {'line-cap': 'round', 'line-join': 'round'},
        paint: {'line-color': '#F36A2B', 'line-opacity': 0.96, 'line-width': 7},
      }, beforeRoad);
    }
    const beforeLabel = map.getLayer('major-place-labels') ? 'major-place-labels' : undefined;
    if (!map.getLayer(BUILDING_FILL)) {
      map.addLayer({
        id: BUILDING_FILL, type: 'fill', source: BUILDING_SOURCE,
        layout: {visibility: 'none'},
        paint: {'fill-color': '#F2A14D', 'fill-opacity': 0.9,
          'fill-outline-color': '#B96211'},
      }, beforeLabel);
    }
    if (!map.getLayer(BUILDING_EXTRUSION)) {
      map.addLayer({
        id: BUILDING_EXTRUSION, type: 'fill-extrusion', source: BUILDING_SOURCE,
        layout: {visibility: 'none'},
        paint: {
          'fill-extrusion-color': '#F2A14D',
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-height': ['max', 3,
            ['to-number', ['get', 'render_height'], 9]],
          'fill-extrusion-base': ['max', 0,
            ['to-number', ['get', 'render_min_height'], 0]],
        },
      }, beforeLabel);
    }
    updateLayerVisibility();
  }

  function updateLayerVisibility() {
    if (map.getLayer(BUILDING_FILL)) {
      map.setLayoutProperty(BUILDING_FILL, 'visibility', threeD ? 'none' : 'visible');
    }
    if (map.getLayer(BUILDING_EXTRUSION)) {
      map.setLayoutProperty(BUILDING_EXTRUSION, 'visibility', threeD ? 'visible' : 'none');
    }
  }

  function refresh() {
    const road = map.getSource(ROAD_SOURCE);
    if (road) road.setData(collection(selected?.kind === 'road' ? selected.feature : null));
    const building = map.getSource(BUILDING_SOURCE);
    if (building) building.setData(collection(
      selected?.kind === 'building' ? selected.feature : null));
  }

  function clear() {
    if (!selected) return;
    selected = null;
    refresh();
    onClear?.();
  }

  function handleClick(event) {
    const match = clickedFeature(map, event.point, threeD);
    if (!match) { clear(); return; }
    const {kind, hit} = match;
    selected = {
      kind,
      source: hit.source,
      sourceLayer: hit.sourceLayer,
      styleLayer: hit.layer.id,
      feature: asGeoJSON(hit),
    };
    refresh();
    onSelect?.(selected);
  }

  map.on('style.load', install);
  map.on('click', handleClick);
  return {
    clear,
    set3DEnabled(value) {
      threeD = Boolean(value);
      updateLayerVisibility();
    },
    destroy() {
      map.off('style.load', install);
      map.off('click', handleClick);
    },
  };
}
