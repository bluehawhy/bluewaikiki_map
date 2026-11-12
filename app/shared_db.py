"""Optional shared BlueWaikiki PostgreSQL connection for future A/B APIs.

Never import this module from map ingestion or map query services. This module
contains no user/auth endpoints and creates no shared tables by itself.
"""
import os
import psycopg


def connect_shared(*, autocommit=False):
    dsn = os.environ.get('DATABASE_URL')
    if not dsn:
        raise RuntimeError('Shared DATABASE_URL not configured')
    return psycopg.connect(dsn, autocommit=autocommit, connect_timeout=10)
