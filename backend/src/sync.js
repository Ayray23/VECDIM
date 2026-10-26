import { fieldRecordSchema } from './records.js';

export const syncBatchSchema = fieldRecordSchema.array().min(1).max(100);

export async function syncFieldRecords(query, records) {
  const parsed = syncBatchSchema.safeParse(records);
  if (!parsed.success) {
    const error = new Error('Invalid sync batch.');
    error.code = 'VALIDATION_ERROR';
    error.details = parsed.error.issues;
    throw error;
  }

  const results = [];
  for (const record of parsed.data) {
    try {
      const insert = await query(`
        INSERT INTO field_records (
          id, state, lga, ward, collection_date, species, insecticide,
          exposed_count, dead_count, mortality_pct, gps_latitude, gps_longitude,
          gps_accuracy_m, location, larval_density, urban_rural, irs, itn_use_pct,
          sync_status
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
          $13, ST_SetSRID(ST_MakePoint($12,$11),4326)::geography,
          $14,$15,$16,$17,'synced'
        ) ON CONFLICT (id) DO NOTHING RETURNING *
      `, [
        record.id, record.state, record.lga, record.ward, record.collectionDate,
        record.species, record.insecticide, record.exposedCount, record.deadCount,
        record.mortalityPct, record.gpsLatitude, record.gpsLongitude,
        record.gpsAccuracyM, record.larvalDensity ?? null, record.urbanRural,
        record.irs, record.itnUsePct ?? null
      ]);

      if (insert.rows.length) {
        results.push({ id: record.id, status: 'synced', record: insert.rows[0] });
      } else {
        const existing = await query('SELECT * FROM field_records WHERE id = $1', [record.id]);
        results.push({ id: record.id, status: 'already_exists', record: existing.rows[0] ?? null });
      }
    } catch (error) {
      results.push({ id: record.id, status: 'rejected', reason: 'server_error' });
    }
  }

  return {
    accepted: results.filter((item) => item.status === 'synced' || item.status === 'already_exists').length,
    rejected: results.filter((item) => item.status === 'rejected').length,
    results
  };
}
