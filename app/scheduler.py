"""Low-load, scheduled, one-at-a-time import of local GIS data packages."""
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from app.downloader import download_if_enabled
from app.importer import import_manifest

LOG = logging.getLogger('map.scheduler')


def inside_window() -> bool:
    now_hour = datetime.now(ZoneInfo(os.getenv('IMPORT_TIMEZONE', 'Asia/Seoul'))).hour
    start = int(os.getenv('IMPORT_START_HOUR', '1'))
    end = int(os.getenv('IMPORT_END_HOUR', '5'))
    if not (0 <= start <= 23 and 0 <= end <= 23) or start == end:
        raise ValueError('Invalid import time window')
    return start <= now_hour < end if start < end else (now_hour >= start or now_hour < end)


def low_load() -> bool:
    limit = float(os.getenv('IMPORT_MAX_LOAD_1M', '1.5'))
    return os.getloadavg()[0] <= limit


def run_cycle():
    if not inside_window() or not low_load():
        return
    download_if_enabled()  # No-op until official method is verified.
    for manifest in sorted(Path(os.getenv('MAP_DATA_DIR', '/data')).joinpath('inbox').glob('*.json')):
        if not inside_window() or not low_load():
            return
        try:
            result = import_manifest(manifest)
            if result not in ('already_published', 'previously_failed_use_force_to_retry'):
                LOG.info('import status=%s file=%s', result, manifest.name)
            if result == 'busy':
                return
        except Exception as exc:
            LOG.error('import skipped file=%s type=%s', manifest.name, type(exc).__name__)
        # One process, sequential only; keep host load as low as possible.


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    sleep_seconds = max(60, int(os.getenv('IMPORT_CHECK_SECONDS', '300')))
    LOG.info('scheduler started; downloader=%s', os.getenv('MAP_DOWNLOADER', 'disabled'))
    while True:
        try:
            run_cycle()
        except Exception as exc:
            LOG.error('cycle_failed type=%s', type(exc).__name__)
        time.sleep(sleep_seconds)


if __name__ == '__main__':
    main()
