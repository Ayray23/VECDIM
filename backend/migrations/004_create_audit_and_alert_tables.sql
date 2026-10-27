CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('Field', 'VECDIM', 'UNIOSUN')),
  organisation TEXT NOT NULL CHECK (organisation IN ('VECDIM', 'UNIOSUN')),
  state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((role = 'Field' AND state IS NOT NULL) OR role IN ('VECDIM', 'UNIOSUN'))
);

CREATE TABLE IF NOT EXISTS validation_results (
  id BIGSERIAL PRIMARY KEY,
  record_id UUID NOT NULL REFERENCES field_records(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('Block', 'Warn')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (record_id, rule_code)
);

CREATE INDEX IF NOT EXISTS validation_results_record_idx
  ON validation_results (record_id);

CREATE INDEX IF NOT EXISTS validation_results_severity_idx
  ON validation_results (severity);

CREATE TABLE IF NOT EXISTS sync_batches (
  id UUID PRIMARY KEY,
  device_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  record_count INTEGER NOT NULL CHECK (record_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'partial', 'rejected', 'failed'))
);

CREATE TABLE IF NOT EXISTS sync_batch_records (
  id BIGSERIAL PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES sync_batches(id) ON DELETE CASCADE,
  record_id UUID NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'already_exists', 'rejected')),
  error_code TEXT,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sync_batch_records_batch_idx
  ON sync_batch_records (batch_id);

CREATE INDEX IF NOT EXISTS sync_batch_records_record_idx
  ON sync_batch_records (record_id);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  record_id UUID,
  state TEXT NOT NULL,
  lga TEXT NOT NULL,
  alert_tier TEXT NOT NULL CHECK (alert_tier IN ('ALERT', 'WARNING', 'WATCH')),
  resistance_flag BOOLEAN NOT NULL DEFAULT FALSE,
  risk_probability NUMERIC,
  alert_date DATE,
  source TEXT NOT NULL DEFAULT 'analysis',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS alerts_state_idx
  ON alerts (state);

CREATE INDEX IF NOT EXISTS alerts_tier_idx
  ON alerts (alert_tier);

CREATE INDEX IF NOT EXISTS alerts_date_idx
  ON alerts (alert_date);
