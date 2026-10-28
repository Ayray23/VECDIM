-- Repair for databases that already applied the original migration 005.
-- That migration wrote the pattern with a doubled backslash, which the regex
-- engine reads as a literal backslash, so no valid YYYY-MM value could be stored.
-- Safe to run on databases that applied the corrected 005: it recreates the same check.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_month_format_chk;

ALTER TABLE alerts
  ADD CONSTRAINT alerts_month_format_chk
  CHECK (month IS NULL OR month ~ '^\d{4}-\d{2}$');
