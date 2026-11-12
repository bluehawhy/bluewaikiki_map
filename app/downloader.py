"""Official data-provider download integration point (not implemented yet).

Do not automate account login or scrape download endpoints until permission,
terms, and official download workflow are confirmed. A future adapter must write
completed ZIP files and corresponding .json manifests to /data/inbox atomically.
"""
import os


def download_if_enabled():
    mode = os.getenv('MAP_DOWNLOADER', 'disabled')
    if mode == 'disabled':
        return
    raise RuntimeError('Downloader mode is not yet implemented: ' + repr(mode))
