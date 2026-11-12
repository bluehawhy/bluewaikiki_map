#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -e .env ]]; then
  echo '.env already exists; refusing to overwrite secrets' >&2
  exit 1
fi
umask 077
python3 - <<'PY'
import secrets
from pathlib import Path
src = Path('.env.example').read_text()
src = src.replace('POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_SECRET', 'POSTGRES_PASSWORD=' + secrets.token_urlsafe(48))
src = src.replace('MAP_API_TOKEN=REPLACE_WITH_RANDOM_SECRET', 'MAP_API_TOKEN=' + secrets.token_urlsafe(48))
with Path('.env').open('x') as fp:
    fp.write(src)
PY
chmod 600 .env
printf 'Created .env with separate random database and API secrets.\n'
