CREATE TABLE IF NOT EXISTS field_records (
  id UUID PRIMARY KEY,
  state TEXT NOT NULL,
  lga TEXT NOT NULL,
  ward TEXT NOT NULL,
  collection_date DATE NOT NULL,
  species TEXT NOT NULL,
  insecticide TEXT NOT NULL,
  exposed_count INTEGER NOT NULL CHECK (exposed_count >= 1),
  dead_count INTEGER NOT NULL CHECK (dead_count >= 0 AND dead_count <= exposed_count),
  mortality_pct NUMERIC(5,2) NOT NULL CHECK (mortality_pct >= 0 AND mortality_pct <= 100),
  gps_latitude DOUBLE PRECISION NOT NULL,
  gps_longitude DOUBLE PRECISION NOT NULL,
  gps_accuracy_m DOUBLE PRECISION NOT NULL CHECK (gps_accuracy_m >= 0),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  larval_density NUMERIC(10,2) CHECK (larval_density IS NULL OR larval_density >= 0),
  urban_rural TEXT NOT NULL CHECK (urban_rural IN ('urban', 'rural')),
  irs BOOLEAN NOT NULL,
  itn_use_pct NUMERIC(5,2) CHECK (itn_use_pct IS NULL OR (itn_use_pct >= 0 AND itn_use_pct <= 100)),
  sync_status TEXT NOT NULL DEFAULT 'pending_sync' CHECK (sync_status IN ('pending_sync', 'synced', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS field_records_location_gix
  ON field_records USING GIST (location);

CREATE INDEX IF NOT EXISTS field_records_lga_idx
  ON field_records (state, lga, ward);

CREATE INDEX IF NOT EXISTS field_records_sync_status_idx
  ON field_records (sync_status);

CREATE INDEX IF NOT EXISTS field_records_collection_date_idx
  ON field_records (collection_date);
