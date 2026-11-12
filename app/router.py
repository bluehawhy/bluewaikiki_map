"""Make FastAPI work with Dashboard's path-preserving slug reverse proxy."""
import os
from urllib.parse import urlsplit

from app.api import app as application


class StripDashboardPrefix:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] in ('http', 'websocket'):
            base = (os.getenv('BASE_PATH') or urlsplit(os.getenv('PUBLIC_API_URL', '')).path).rstrip('/')
            path = scope.get('path', '')
            if base.startswith('/') and base and (path == base or path.startswith(base + '/')):
                scope = dict(scope)
                scope['path'] = path[len(base):] or '/'
                scope['root_path'] = base
                scope['raw_path'] = scope['path'].encode('utf-8')
        await self.app(scope, receive, send)


asgi = StripDashboardPrefix(application)
