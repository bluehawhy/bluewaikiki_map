"""Initialize only project-specific schema against existing PostGIS database.

The dedicated project PostGIS container installs extension on first bootstrap.
Application startup never modifies BlueWaikiki shared PostgreSQL.
"""
import logging
from pathlib import Path

from app.db import connect

LOG = logging.getLogger('map.bootstrap')
SCHEMA = Path(__file__).resolve().parent.parent / 'db/init/001_schema.sql'
LOCK_KEY = 71824923


def initialize_schema() -> bool:
    try:
        with connect() as conn:
            # PostgreSQL extensions are cluster-level prerequisites.
            ready = conn.execute("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='postgis')").fetchone()[0]
            if not ready:
                LOG.warning('map_postgis_extension_missing: initialize the dedicated PostGIS database')
                return False
            with conn.transaction():
                conn.execute('SELECT pg_advisory_xact_lock(%s)', (LOCK_KEY,))
                script = SCHEMA.read_text(encoding='utf-8')
                script = script.replace('CREATE EXTENSION IF NOT EXISTS postgis;', '', 1)
                conn.execute(script, prepare=False)
        LOG.info('map_schema_ready')
        return True
    except Exception as exc:
        # Avoid raw DB exception text (connection URI can be included).
        LOG.error('map_schema_unavailable error_type=%s', type(exc).__name__)
        return False
