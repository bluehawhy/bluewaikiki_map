# Compatible with BlueWaikiki Dashboard project Functions (context: .).
# One container serves the read-only API and schedules GIS imports.
# PostgreSQL/PostGIS is a separate project-owned Docker, not the shared DB.
FROM python:3.12-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MAP_RUN_SCHEDULER=0 \
    PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends gdal-bin ca-certificates tzdata \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY web ./web
COPY db/init/001_schema.sql ./db/init/001_schema.sql
RUN useradd -r -u 10001 -d /srv mapuser \
    && mkdir -p /data/inbox /data/raw /data/work \
    && chown -R mapuser:mapuser /data
USER mapuser
EXPOSE 8080
CMD ["python", "-m", "app.runner"]
