"""Single Function container: FastAPI + one low-load sequential importer.

The downloader remains disabled until a verified official delivery mechanism
and durable archive storage are configured.
"""
import logging
import os
from threading import Thread

import uvicorn

from app.bootstrap import initialize_schema
from app.scheduler import main as run_scheduler


def main():
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    if initialize_schema() and os.getenv('MAP_RUN_SCHEDULER', '0') == '1':
        Thread(name='map-scheduler', target=run_scheduler, daemon=True).start()
    else:
        logging.warning('map_importer_not_started: prerequisite unavailable or disabled')
    uvicorn.run('app.router:asgi', host='0.0.0.0', port=int(os.getenv('PORT', '8080')), workers=1)


if __name__ == '__main__':
    main()
