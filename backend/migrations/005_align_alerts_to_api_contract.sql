ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS month TEXT,
  ADD COLUMN IF NOT EXISTS n_records INTEGER,
  ADD COLUMN IF NOT EXISTS mean_risk NUMERIC;

UPDATE alerts
SET month = COALESCE(month, TO_CHAR(alert_date, 'YYYY-MM'))
WHERE month IS NULL AND alert_date IS NOT NULL;

UPDATE alerts
SET n_records = COALESCE(n_records, 0),
    mean_risk = COALESCE(mean_risk, risk_probability)
WHERE n_records IS NULL OR mean_risk IS NULL;

ALTER TABLE alerts
  ADD CONSTRAINT alerts_month_format_chk
  CHECK (month IS NULL OR month ~ '^\d{4}-\d{2}$');

ALTER TABLE alerts
  ADD CONSTRAINT alerts_n_records_chk
  CHECK (n_records IS NULL OR n_records >= 0);

CREATE INDEX IF NOT EXISTS alerts_state_lga_month_idx
  ON alerts (state, lga, month);
