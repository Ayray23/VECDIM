-- The candidate specification requires geometry(Point, 4326), not geography.
-- Preserve existing GPS values while converting the stored spatial column.
ALTER TABLE field_records
  ALTER COLUMN location TYPE geometry(Point, 4326)
  USING location::geometry;

DROP INDEX IF EXISTS field_records_location_gix;

CREATE INDEX IF NOT EXISTS field_records_location_gix
  ON field_records USING GIST (location);
