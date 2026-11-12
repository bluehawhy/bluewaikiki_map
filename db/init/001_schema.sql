CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS roadmap;

CREATE TABLE IF NOT EXISTS roadmap.datasets (
  id uuid PRIMARY KEY,
  dataset_key text NOT NULL,
  version text NOT NULL,
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  source_name text NOT NULL,
  source_url text,
  attribution text NOT NULL,
  usage_rights text NOT NULL,
  archive_path text NOT NULL,
  feature_count bigint NOT NULL DEFAULT 0 CHECK (feature_count >= 0),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_key, version),
  UNIQUE (dataset_key, checksum_sha256)
);

CREATE TABLE IF NOT EXISTS roadmap.active_datasets (
  dataset_key text PRIMARY KEY,
  dataset_id uuid NOT NULL UNIQUE REFERENCES roadmap.datasets(id) ON DELETE RESTRICT,
  activated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roadmap.layers (
  dataset_id uuid NOT NULL REFERENCES roadmap.datasets(id) ON DELETE CASCADE,
  layer text NOT NULL,
  source_path text NOT NULL,
  feature_count bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (dataset_id, layer)
);

CREATE TABLE IF NOT EXISTS roadmap.features (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_id uuid NOT NULL REFERENCES roadmap.datasets(id) ON DELETE CASCADE,
  layer text NOT NULL,
  source_id text NOT NULL,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry NOT NULL CHECK (ST_SRID(geom) = 4326)
);
CREATE INDEX IF NOT EXISTS idx_features_geom ON roadmap.features USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_features_dataset_layer ON roadmap.features(dataset_id, layer);

CREATE TABLE IF NOT EXISTS roadmap.import_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  dataset_key text NOT NULL,
  version text NOT NULL,
  checksum_sha256 text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','failed','skipped')),
  error_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_runs_lookup ON roadmap.import_runs(dataset_key, version, checksum_sha256, created_at DESC);
