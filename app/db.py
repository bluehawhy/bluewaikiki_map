"""Strictly dedicated map PostGIS connection.

The Dashboard DATABASE_URL belongs to the *shared* project database and must
never silently become the map database. Map uses MAP_DATABASE_URL or PG* only.
"""
import os

import psycopg
from psycopg.conninfo import conninfo_to_dict, make_conninfo


def postgres_options() -> dict[str, str]:
    if os.getenv('MAP_DATABASE_URL'):
        return conninfo_to_dict(os.environ['MAP_DATABASE_URL'])
    return {
        'host': os.getenv('PGHOST', 'db'),
        'port': os.getenv('PGPORT', '5432'),
        'dbname': os.getenv('PGDATABASE', 'bluewaikiki_map'),
        'user': os.environ['PGUSER'],
        'password': os.environ['PGPASSWORD'],
    }


def gdal_connection() -> tuple[str, dict[str, str]]:
    """Return a password-free GDAL connection argument and a protected env."""
    options = postgres_options()
    public = {key: value for key, value in options.items() if key != 'password'}
    env = os.environ.copy()
    if 'password' in options:
        env['PGPASSWORD'] = options['password']
    return 'PG:' + make_conninfo(**public), env


def connect(*, autocommit=False):
    return psycopg.connect(
        **postgres_options(),
        connect_timeout=10,
        autocommit=autocommit,
    )
