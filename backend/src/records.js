import { z } from 'zod';

export const fieldRecordSchema = z.object({
  id: z.string().uuid(),
  state: z.string().trim().min(1),
  lga: z.string().trim().min(1),
  ward: z.string().trim().min(1),
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  species: z.string().trim().min(1),
  insecticide: z.string().trim().min(1),
  exposedCount: z.number().int().min(1),
  deadCount: z.number().int().min(0),
  mortalityPct: z.number().min(0).max(100),
  gpsLatitude: z.number().min(-90).max(90),
  gpsLongitude: z.number().min(-180).max(180),
  gpsAccuracyM: z.number().min(0),
  larvalDensity: z.number().min(0).nullable().optional(),
  urbanRural: z.enum(['urban', 'rural']),
  irs: z.boolean(),
  itnUsePct: z.number().min(0).max(100).nullable().optional(),
  syncStatus: z.enum(['pending_sync', 'synced', 'rejected']).optional()
}).superRefine((record, ctx) => {
  if (record.deadCount > record.exposedCount) {
    ctx.addIssue({ code: 'custom', path: ['deadCount'], message: 'deadCount cannot exceed exposedCount' });
  }
});

const INSERT_SQL = `
  INSERT INTO field_records (
    id, state, lga, ward, collection_date, species, insecticide,
    exposed_count, dead_count, mortality_pct, gps_latitude, gps_longitude,
    gps_accuracy_m, location, larval_density, urban_rural, irs, itn_use_pct,
    sync_status
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10, $11, $12,
    $13, ST_SetSRID(ST_MakePoint($12, $11), 4326)::geography, $14, $15, $16, $17,
    $18
  )
  ON CONFLICT (id) DO NOTHING
  RETURNING *
`;

function toDbParams(record) {
  return [
    record.id,
    record.state,
    record.lga,
    record.ward,
    record.collectionDate,
    record.species,
    record.insecticide,
    record.exposedCount,
    record.deadCount,
    record.mortalityPct,
    record.gpsLatitude,
    record.gpsLongitude,
    record.gpsAccuracyM,
    record.larvalDensity ?? null,
    record.urbanRural,
    record.irs,
    record.itnUsePct ?? null,
    record.syncStatus ?? 'pending_sync'
  ];
}

export async function createFieldRecord(query, record) {
  const result = await query(INSERT_SQL, toDbParams(record));
  if (result.rows.length === 0) {
    const existing = await query('SELECT * FROM field_records WHERE id = $1', [record.id]);
    return { created: false, record: existing.rows[0] ?? null };
  }
  return { created: true, record: result.rows[0] };
}

export async function getFieldRecord(query, id) {
  const result = await query('SELECT * FROM field_records WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function listFieldRecords(query, { limit = 50, offset = 0, state = null } = {}) {
  if (state) {
    const scoped = await query(
      'SELECT * FROM field_records WHERE state = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [state, limit, offset]
    );
    return scoped.rows;
  }
  const result = await query(
    'SELECT * FROM field_records ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset]
  );
  return result.rows;
}
