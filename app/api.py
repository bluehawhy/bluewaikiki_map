"""Read-only geospatial API; all spatial data comes from validated active snapshots."""
import os
import secrets
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row

from app.db import connect

app = FastAPI(title='BlueWaikiki Map API', version='0.1.0', docs_url=None, redoc_url=None)


def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    configured = os.getenv('MAP_API_TOKEN', '')
    if not configured:
        raise HTTPException(status_code=503, detail='API authentication not configured')
    prefix = 'Bearer '
    if not authorization or not authorization.startswith(prefix) or not secrets.compare_digest(
        authorization[len(prefix):], configured
    ):
        raise HTTPException(status_code=401, detail='Invalid API token', headers={'WWW-Authenticate': 'Bearer'})


protected = [Depends(require_token)]


def parse_bbox(value: str) -> tuple[float, float, float, float]:
    try:
        fields = [float(x) for x in value.split(',')]
    except ValueError as exc:
        raise HTTPException(422, 'bbox must be minLon,minLat,maxLon,maxLat') from exc
    if len(fields) != 4:
        raise HTTPException(422, 'bbox must have exactly four numbers')
    x1, y1, x2, y2 = fields
    if not (-180 <= x1 < x2 <= 180 and -90 <= y1 < y2 <= 90):
        raise HTTPException(422, 'Invalid WGS84 bbox')
    if x2 - x1 > 2 or y2 - y1 > 2:
        raise HTTPException(422, 'BBox too large; request a smaller area')
    return x1, y1, x2, y2


@app.get('/health')
def health():
    """Lightweight app readiness: public vector map does not require PostGIS."""
    return {'status': 'ok', 'map': 'public-vector-preview'}


@app.get('/v1/health/db', dependencies=protected)
def database_health():
    """Independent PostGIS availability; intentionally separate from app readiness."""
    try:
        with connect() as conn:
            status = conn.execute("""
                SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis')
                   AND to_regclass('roadmap.active_datasets') IS NOT NULL
            """).fetchone()[0]
        if not status:
            raise HTTPException(status_code=503, detail='PostGIS or schema not ready')
        return {'status': 'ok'}
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=503, detail='Database unavailable')


@app.get('/v1/datasets', dependencies=protected)
def datasets():
    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute('''
                SELECT d.dataset_key, d.version, d.source_name, d.source_url,
                       d.attribution, d.usage_rights, d.feature_count,
                       d.imported_at, a.activated_at
                FROM roadmap.active_datasets a JOIN roadmap.datasets d ON d.id = a.dataset_id
                ORDER BY d.dataset_key
            ''')
            return {'datasets': cur.fetchall()}


@app.get('/v1/datasets/versions', dependencies=protected)
def dataset_versions(dataset_key: str = Query(min_length=1, max_length=128)):
    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute('''
                SELECT d.dataset_key, d.version, d.checksum_sha256,
                       d.source_name, d.attribution, d.usage_rights,
                       d.feature_count, d.imported_at,
                       (a.dataset_id IS NOT NULL) AS active
                FROM roadmap.datasets d
                LEFT JOIN roadmap.active_datasets a ON a.dataset_id=d.id
                WHERE d.dataset_key=%s
                ORDER BY d.imported_at DESC
            ''', (dataset_key,))
            return {'versions': cur.fetchall()}


@app.get('/v1/layers', dependencies=protected)
def layers(dataset_key: str | None = Query(default=None, max_length=128)):
    with connect() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute('''
                SELECT d.dataset_key, l.layer, l.feature_count
                FROM roadmap.layers l
                JOIN roadmap.active_datasets a ON a.dataset_id = l.dataset_id
                JOIN roadmap.datasets d ON d.id = l.dataset_id
                WHERE (%s::text IS NULL OR d.dataset_key = %s)
                ORDER BY d.dataset_key, l.layer
            ''', (dataset_key, dataset_key))
            return {'layers': cur.fetchall()}


@app.get('/v1/features', dependencies=protected)
def features(
    layer: str = Query(min_length=1, max_length=250),
    bbox: str = Query(description='minLon,minLat,maxLon,maxLat; WGS84'),
    dataset_key: str | None = Query(default=None, max_length=128),
    limit: int = Query(default=500, ge=1, le=2000),
):
    xmin, ymin, xmax, ymax = parse_bbox(bbox)
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute('''
                WITH matching AS (
                  SELECT f.id, f.properties, f.geom
                  FROM roadmap.features f
                  JOIN roadmap.active_datasets a ON a.dataset_id=f.dataset_id
                  JOIN roadmap.datasets d ON d.id=f.dataset_id
                  WHERE f.layer=%s
                    AND (%s::text IS NULL OR d.dataset_key=%s)
                    AND f.geom && ST_MakeEnvelope(%s,%s,%s,%s,4326)
                    AND ST_Intersects(f.geom, ST_MakeEnvelope(%s,%s,%s,%s,4326))
                  ORDER BY f.id
                  LIMIT %s
                )
                SELECT jsonb_build_object(
                  'type','FeatureCollection',
                  'features',COALESCE(jsonb_agg(jsonb_build_object(
                    'type','Feature','id',id,
                    'geometry',ST_AsGeoJSON(geom)::jsonb,
                    'properties',properties
                  )), '[]'::jsonb)
                ) FROM matching
            ''', (layer, dataset_key, dataset_key,
                  xmin, ymin, xmax, ymax, xmin, ymin, xmax, ymax, limit))
            return cur.fetchone()[0]


@app.get('/v1/tiles/{z}/{x}/{y}.mvt', dependencies=protected)
def tile(z: int, x: int, y: int,
         layer: str = Query(min_length=1, max_length=250),
         dataset_key: str | None = Query(default=None, max_length=128)):
    if not 0 <= z <= 22 or not 0 <= x < (1 << z) or not 0 <= y < (1 << z):
        raise HTTPException(422, 'Invalid tile coordinate')
    with connect() as conn:
        with conn.cursor() as cur:
            cur.execute('''
                WITH bounds AS (
                  SELECT ST_TileEnvelope(%s,%s,%s) AS tile_bounds
                ), selection AS (
                  SELECT f.id, f.properties, ST_Transform(ST_Force2D(f.geom),3857) AS geom,
                         b.tile_bounds
                  FROM roadmap.features f
                  JOIN roadmap.active_datasets a ON a.dataset_id=f.dataset_id
                  JOIN roadmap.datasets d ON d.id=f.dataset_id
                  CROSS JOIN bounds b
                  WHERE f.layer=%s
                    AND (%s::text IS NULL OR d.dataset_key=%s)
                    AND f.geom && ST_Transform(ST_Expand(b.tile_bounds, 100.0),4326)
                  LIMIT 10000
                ), mvt_features AS (
                  SELECT id, properties::text AS properties,
                    ST_AsMVTGeom(geom,tile_bounds,4096,64,true) AS geom
                  FROM selection
                  WHERE ST_Intersects(geom,tile_bounds)
                )
                SELECT COALESCE(ST_AsMVT(mvt_features,'map',4096,'geom'),'\\x'::bytea)
                FROM mvt_features
            ''', (z, x, y, layer, dataset_key, dataset_key))
            data = cur.fetchone()[0] or b''
    return Response(content=bytes(data), media_type='application/vnd.mapbox-vector-tile')

# Mount last: authenticated /v1/* endpoints and /health take precedence.
# Assets resolve under the Dashboard slug because the browser uses relative paths.
WEB_ROOT = Path(__file__).resolve().parent.parent / 'web'
app.mount('/', StaticFiles(directory=str(WEB_ROOT), html=True), name='map-preview')
