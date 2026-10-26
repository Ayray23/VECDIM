import { fieldRecordSchema } from './records.js';
import { randomUUID } from 'node:crypto';

export const syncBatchSchema = fieldRecordSchema.array().min(1).max(100);

function batchOutcome(accepted, rejected) {
  if (accepted === 0) return 'rejected';
  if (rejected > 0) return 'partial';
  return 'accepted';
}

function safeDeviceId(deviceId) {
  return typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim().slice(0, 200) : 'unknown';
}

async function logBatchStart(query, { batchId, deviceId, recordCount }) {
  await query(`
    INSERT INTO sync_batches (id, device_id, record_count, accepted_count, rejected_count, outcome)
    VALUES ($1, $2, $3, 0, 0, 'failed')
  `, [batchId, deviceId, recordCount]);
}

async function logBatchRecord(query, batchId, recordId, result) {
  await query(`
    INSERT INTO sync_batch_records (batch_id, record_id, outcome, error_code, error_message)
    VALUES ($1, $2, $3, $4, $5)
  `, [
    batchId,
    recordId,
    result.status === 'synced' ? 'accepted' : result.status === 'already_exists' ? 'already_exists' : 'rejected',
    result.status === 'rejected' ? result.reason : null,
    result.status === 'rejected' ? result.message ?? result.reason : null
  ]);
}

export async function syncFieldRecords(query, records, { deviceId } = {}) {
  const batchId = randomUUID();
  const requestedRecords = Array.isArray(records) ? records : [];
  const parsed = syncBatchSchema.safeParse(records);
  if (!parsed.success) {
    try {
      await logBatchStart(query, {
        batchId,
        deviceId: safeDeviceId(deviceId),
        recordCount: requestedRecords.length
      });
      for (const record of requestedRecords) {
        if (typeof record?.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id)) continue;
        await logBatchRecord(query, batchId, record.id, {
          status: 'rejected',
          reason: 'validation_error',
          message: 'The field record is invalid.'
        });
      }
      await query(`
        UPDATE sync_batches
        SET rejected_count = $2, outcome = 'rejected'
        WHERE id = $1
      `, [batchId, requestedRecords.length]);
    } catch {
      // The validation response remains useful even if the attempt could not be logged.
    }
    const error = new Error('Invalid sync batch.');
    error.code = 'VALIDATION_ERROR';
    error.details = parsed.error.issues;
    error.batchId = batchId;
    throw error;
  }

  await logBatchStart(query, {
    batchId,
    deviceId: safeDeviceId(deviceId),
    recordCount: parsed.data.length
  });

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
        ) ON CONFLICT (id) DO UPDATE SET
          state = EXCLUDED.state,
          lga = EXCLUDED.lga,
          ward = EXCLUDED.ward,
          collection_date = EXCLUDED.collection_date,
          species = EXCLUDED.species,
          insecticide = EXCLUDED.insecticide,
          exposed_count = EXCLUDED.exposed_count,
          dead_count = EXCLUDED.dead_count,
          mortality_pct = EXCLUDED.mortality_pct,
          gps_latitude = EXCLUDED.gps_latitude,
          gps_longitude = EXCLUDED.gps_longitude,
          gps_accuracy_m = EXCLUDED.gps_accuracy_m,
          location = EXCLUDED.location,
          larval_density = EXCLUDED.larval_density,
          urban_rural = EXCLUDED.urban_rural,
          irs = EXCLUDED.irs,
          itn_use_pct = EXCLUDED.itn_use_pct,
          sync_status = 'synced',
          rejection_reason = NULL,
          updated_at = NOW()
        WHERE field_records.sync_status = 'rejected'
        RETURNING *, (xmax <> 0) AS resubmitted
      `, [
        record.id, record.state, record.lga, record.ward, record.collectionDate,
        record.species, record.insecticide, record.exposedCount, record.deadCount,
        record.mortalityPct, record.gpsLatitude, record.gpsLongitude,
        record.gpsAccuracyM, record.larvalDensity ?? null, record.urbanRural,
        record.irs, record.itnUsePct ?? null
      ]);

      if (insert.rows.length) {
        results.push({
          id: record.id,
          status: 'synced',
          ...(insert.rows[0].resubmitted ? { resubmitted: true } : {}),
          record: insert.rows[0]
        });
      } else {
        const existing = await query('SELECT * FROM field_records WHERE id = $1', [record.id]);
        results.push({ id: record.id, status: 'already_exists', record: existing.rows[0] ?? null });
      }
    } catch (error) {
      results.push({ id: record.id, status: 'rejected', reason: 'server_error', message: 'Record could not be saved.' });
    }
    await logBatchRecord(query, batchId, record.id, results.at(-1));
  }

  const accepted = results.filter((item) => item.status === 'synced' || item.status === 'already_exists').length;
  const rejected = results.filter((item) => item.status === 'rejected').length;
  const outcome = batchOutcome(accepted, rejected);
  await query(`
    UPDATE sync_batches
    SET accepted_count = $2, rejected_count = $3, outcome = $4
    WHERE id = $1
  `, [batchId, accepted, rejected, outcome]);

  return {
    batchId,
    accepted,
    rejected,
    outcome,
    results
  };
}
