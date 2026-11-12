"""Offline, sequential SHP importer with atomic active-version promotion.

The source downloader is deliberately separate; only local approved manifests
are ingested. Secrets are passed to GDAL through PGPASSWORD, not arguments.
"""
import argparse
import hashlib
import json
import logging
import os
import re
import shutil
import stat
import subprocess
import tempfile
import uuid
import zipfile
from pathlib import Path, PurePosixPath

from psycopg import sql

from app.db import connect, gdal_connection

LOG = logging.getLogger('map.importer')
ROOT = Path(os.getenv('MAP_DATA_DIR', '/data'))
INBOX = ROOT / 'inbox'
RAW = ROOT / 'raw'
WORK = ROOT / 'work'
KEY_RE = re.compile(r'^[a-z0-9][a-z0-9._-]{0,127}$')
SHA_RE = re.compile(r'^[0-9a-f]{64}$')
FILE_SUFFIXES = {'.shp', '.shx', '.dbf', '.prj', '.cpg', '.qix'}
LOCK_KEY = 71824922


class InvalidDataset(ValueError):
    pass


def load_manifest(path: Path) -> dict:
    if path.parent.resolve() != INBOX.resolve() or path.suffix.lower() != '.json' or path.is_symlink():
        raise InvalidDataset('manifest_must_be_in_inbox')
    manifest = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(manifest, dict):
        raise InvalidDataset('invalid_manifest')
    for field in ('dataset_key', 'version', 'archive', 'sha256', 'source_name', 'attribution', 'usage_rights'):
        if not isinstance(manifest.get(field), str) or not manifest[field].strip():
            raise InvalidDataset('missing_manifest_field_' + field)
    for field in ('dataset_key', 'version'):
        if not KEY_RE.fullmatch(manifest[field]):
            raise InvalidDataset('invalid_manifest_field_' + field)
    if not SHA_RE.fullmatch(manifest['sha256']):
        raise InvalidDataset('invalid_sha256')
    name = manifest['archive']
    if Path(name).name != name or not name.lower().endswith('.zip'):
        raise InvalidDataset('invalid_archive_name')
    if len(manifest.get('source_url', '')) > 2000:
        raise InvalidDataset('invalid_source_url')
    return manifest


def calculate_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def extract_shapefiles(zip_path: Path, workdir: Path) -> list[Path]:
    max_bytes = int(os.getenv('IMPORT_MAX_UNCOMPRESSED_BYTES', str(4 * 1024 ** 3)))
    with zipfile.ZipFile(zip_path) as archive:
        entries = archive.infolist()
        if len(entries) > 10000 or sum(e.file_size for e in entries) > max_bytes:
            raise InvalidDataset('archive_limits_exceeded')
        seen_names = set()
        for item in entries:
            if item.filename in seen_names:
                raise InvalidDataset('duplicate_archive_entries')
            seen_names.add(item.filename)
            relative = PurePosixPath(item.filename)
            if relative.is_absolute() or '..' in relative.parts or '\\' in item.filename:
                raise InvalidDataset('unsafe_archive_path')
            filetype = (item.external_attr >> 16) & 0o170000
            if filetype == stat.S_IFLNK:
                raise InvalidDataset('archive_symlinks_forbidden')
            if item.is_dir() or Path(item.filename).suffix.lower() not in FILE_SUFFIXES:
                continue
            target = workdir.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as src, target.open('wb') as dst:
                shutil.copyfileobj(src, dst, length=1024 * 1024)
    shapefiles = sorted(workdir.rglob('*'))
    shapefiles = [p for p in shapefiles if p.is_file() and p.suffix.lower() == '.shp']
    if not shapefiles:
        raise InvalidDataset('no_shapefiles')
    for shp in shapefiles:
        siblings = {p.suffix.lower() for p in shp.parent.iterdir() if p.stem.lower() == shp.stem.lower()}
        if not {'.shp', '.shx', '.dbf', '.prj'} <= siblings:
            raise InvalidDataset('missing_shapefile_sidecar_or_projection')
    return shapefiles


def import_stage(stage_schema: str, shapefiles: list[Path], workdir: Path) -> list[tuple[str, str, str]]:
    layers = []
    pg_connection, pg_env = gdal_connection()
    for index, path in enumerate(shapefiles, start=1):
        relative = path.relative_to(workdir).as_posix()
        stable_layer = (path.stem[:90].lower() + '_' + hashlib.sha256(relative.encode()).hexdigest()[:10])
        table_name = f'layer_{index:04d}'
        command = [
            'ogr2ogr', '-f', 'PostgreSQL', pg_connection, str(path),
            '-t_srs', 'EPSG:4326', '-lco', f'SCHEMA={stage_schema}',
            '-lco', 'GEOMETRY_NAME=geom', '-lco', 'FID=map_fid',
            '-nln', table_name,
        ]
        result = subprocess.run(command, env=pg_env, capture_output=True, text=True, check=False, timeout=3600)
        if result.returncode:
            # Do not log GDAL stdout/stderr; data source paths and connection details
            # might be included. Report only the process exit code.
            raise InvalidDataset(f'ogr2ogr_failed_exit_{result.returncode}')
        layers.append((table_name, stable_layer, relative))
    return layers


def validate_stage(conn, stage_schema: str, layers: list[tuple[str, str, str]]) -> int:
    total = 0
    for table, _, _ in layers:
        statement = sql.SQL('''
            SELECT count(*) AS total,
                   count(*) FILTER (WHERE geom IS NULL OR ST_IsEmpty(geom)
                     OR ST_SRID(geom) <> 4326 OR NOT ST_IsValid(geom)) AS invalid
            FROM {}.{}
        ''').format(sql.Identifier(stage_schema), sql.Identifier(table))
        count, invalid = conn.execute(statement).fetchone()
        if invalid:
            raise InvalidDataset('invalid_geometry')
        total += count
    if total == 0:
        raise InvalidDataset('empty_dataset')
    return total


def publish(conn, manifest: dict, checksum: str, archive_path: Path,
            stage_schema: str, layers: list[tuple[str, str, str]], feature_count: int):
    dataset_id = uuid.uuid4()
    with conn.transaction():
        conn.execute('''
            INSERT INTO roadmap.datasets
              (id,dataset_key,version,checksum_sha256,source_name,source_url,
               attribution,usage_rights,archive_path,feature_count)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ''', (dataset_id, manifest['dataset_key'], manifest['version'], checksum,
              manifest['source_name'], manifest.get('source_url'), manifest['attribution'],
              manifest['usage_rights'], str(archive_path), feature_count))
        for table, layer, original in layers:
            source = sql.SQL('{}.{}').format(sql.Identifier(stage_schema), sql.Identifier(table))
            conn.execute(sql.SQL('''
                INSERT INTO roadmap.features (dataset_id,layer,source_id,properties,geom)
                SELECT %s,%s,t.map_fid::text,to_jsonb(t)-'geom'-'map_fid',t.geom
                FROM {} AS t
            ''').format(source), (dataset_id, layer))
            count = conn.execute(sql.SQL('SELECT count(*) FROM {}').format(source)).fetchone()[0]
            conn.execute('''
                INSERT INTO roadmap.layers (dataset_id,layer,source_path,feature_count)
                VALUES (%s,%s,%s,%s)
            ''', (dataset_id, layer, original, count))
        # Promote only after every layer is imported. Existing active snapshot
        # stays readable until this transaction commits.
        conn.execute('''
            INSERT INTO roadmap.active_datasets(dataset_key,dataset_id)
            VALUES (%s,%s)
            ON CONFLICT (dataset_key) DO UPDATE SET
              dataset_id=EXCLUDED.dataset_id,activated_at=now()
        ''', (manifest['dataset_key'], dataset_id))
    return dataset_id


def has_prior_attempt(conn, manifest: dict, checksum: str) -> str | None:
    row = conn.execute('''
        SELECT status FROM roadmap.import_runs
        WHERE dataset_key=%s AND version=%s AND checksum_sha256=%s
        ORDER BY created_at DESC, id DESC LIMIT 1
    ''', (manifest['dataset_key'], manifest['version'], checksum)).fetchone()
    return row[0] if row else None


def record_run(conn, manifest: dict, checksum: str, status: str, error_type: str | None = None):
    with conn.transaction():
        conn.execute('''
            INSERT INTO roadmap.import_runs(dataset_key,version,checksum_sha256,status,error_type)
            VALUES (%s,%s,%s,%s,%s)
        ''', (manifest['dataset_key'], manifest['version'], checksum, status, error_type))


def import_manifest(path: Path, force: bool = False) -> str:
    manifest = load_manifest(path)
    archive = INBOX / manifest['archive']
    if not archive.is_file() or archive.is_symlink():
        raise InvalidDataset('archive_missing_or_symlink')
    checksum = calculate_sha256(archive)
    if checksum != manifest['sha256']:
        raise InvalidDataset('checksum_mismatch')

    # PostgreSQL advisory lock is held on an independent session for the whole import.
    with connect(autocommit=True) as lock_conn:
        locked = lock_conn.execute('SELECT pg_try_advisory_lock(%s)', (LOCK_KEY,)).fetchone()[0]
        if not locked:
            return 'busy'
        stage = 'map_stg_' + uuid.uuid4().hex
        try:
            with connect(autocommit=True) as conn:
                if conn.execute('''
                    SELECT 1 FROM roadmap.datasets WHERE dataset_key=%s AND checksum_sha256=%s
                ''', (manifest['dataset_key'], checksum)).fetchone():
                    return 'already_published'
                if not force and has_prior_attempt(conn, manifest, checksum) == 'failed':
                    return 'previously_failed_use_force_to_retry'
                if conn.execute('''
                    SELECT 1 FROM roadmap.datasets WHERE dataset_key=%s AND version=%s
                ''', (manifest['dataset_key'], manifest['version'])).fetchone():
                    raise InvalidDataset('version_already_published_with_different_checksum')
                conn.execute(sql.SQL('CREATE SCHEMA {}').format(sql.Identifier(stage)))
            workdir = WORK / stage
            workdir.mkdir(parents=True, exist_ok=False)
            try:
                shapefiles = extract_shapefiles(archive, workdir)
                layers = import_stage(stage, shapefiles, workdir)
                with connect() as conn:
                    total = validate_stage(conn, stage, layers)
                archive_target = RAW / manifest['dataset_key'] / manifest['version'] / (checksum + '.zip')
                archive_target.parent.mkdir(parents=True, exist_ok=True)
                if not archive_target.exists():
                    temp_target = archive_target.with_suffix('.partial')
                    shutil.copyfile(archive, temp_target)
                    if calculate_sha256(temp_target) != checksum:
                        temp_target.unlink(missing_ok=True)
                        raise InvalidDataset('archived_checksum_mismatch')
                    temp_target.replace(archive_target)
                elif calculate_sha256(archive_target) != checksum:
                    raise InvalidDataset('existing_archive_checksum_mismatch')
                with connect() as conn:
                    dataset_id = publish(conn, manifest, checksum, archive_target, stage, layers, total)
                with connect() as conn:
                    record_run(conn, manifest, checksum, 'success')
                LOG.info('published dataset=%s version=%s layers=%d features=%d id=%s',
                         manifest['dataset_key'], manifest['version'], len(layers), total, dataset_id)
                return 'published'
            finally:
                shutil.rmtree(workdir, ignore_errors=True)
        except Exception as exc:
            # Only exception class is persisted; raw database and GDAL errors can
            # contain connection details and are intentionally not logged.
            LOG.error('import_failed dataset=%s version=%s error_type=%s',
                      manifest['dataset_key'], manifest['version'], type(exc).__name__)
            with connect() as conn:
                record_run(conn, manifest, checksum, 'failed', type(exc).__name__)
            raise
        finally:
            with connect(autocommit=True) as conn:
                conn.execute(sql.SQL('DROP SCHEMA IF EXISTS {} CASCADE').format(sql.Identifier(stage)))
            lock_conn.execute('SELECT pg_advisory_unlock(%s)', (LOCK_KEY,))


def main():
    parser = argparse.ArgumentParser(description='Import one approved local manifest')
    parser.add_argument('manifest', type=Path)
    parser.add_argument('--force', action='store_true', help='retry a previously failed manifest')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    try:
        print(import_manifest(args.manifest, force=args.force))
    except Exception as exc:
        print('import_failed type=' + type(exc).__name__)
        raise SystemExit(1) from None


if __name__ == '__main__':
    main()
