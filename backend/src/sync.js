import { fieldRecordSchema } from './records.js';
import { randomUUID } from 'node:crypto';
import { validateRecord } from '../../packages/validation/index.js';

export const syncBatchSchema = fieldRecordSchema.array().min(1).max(100);

const LAGOS_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Lagos',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

/**
 * Calendar date (YYYY-MM-DD) in Nigeria. Field devices stamp collection dates in
 * Lagos time, so the future-date rule must use the same calendar, not UTC.
 */
export function lagosToday(now = new Date()) {
  return LAGOS_DATE.format(now);
}

/** Maps a sync payload record onto the field names the shared validation rules use. */
export function toValidationRecord(record) {
  return {
    record_id: record.id,
    state: record.state,
    lga: record.lga,
    ward: record.ward,
    latitude: record.gpsLatitude,
    longitude: record.gpsLongitude,
    gps_accuracy_m: record.gpsAccuracyM,
    collection_date: record.collectionDate,
    species: record.species,
    insecticide: record.insecticide,
    n_exposed: record.exposedCount,
    n_dead: record.deadCount,
    larval_density: record.larvalDensity ?? null,
    urban: record.urbanRural === 'urban' ? 1 : 0,
    irs_covered: record.irs ? 1 : 0,
    itn_use_pct: record.itnUsePct ?? null
  };
}

/** One entry per rule (the table keys results by record and rule); Block outranks Warn. */
export function summarizeFlags(flags) {
  const byRule = new Map();
  for (const flag of flags) {
    const entry = byRule.get(flag.ruleId);
    if (!entry) {
      byRule.set(flag.ruleId, { ruleId: flag.ruleId, severity: flag.severity, field: flag.field, messages: [flag.message] });
    } else {
      if (flag.severity === 'Block') entry.severity = 'Block';
      if (!entry.messages.includes(flag.message)) entry.messages.push(flag.message);
    }
  }
  return [...byRule.values()].map(({ messages, ...rest }) => ({ ...rest, message: messages.join(' ') }));
}

async function validateIncoming(query, record, refDate) {
  // Earlier, non-rejected records with the same duplicate key, for the duplicate rule.
  const matches = await query(`
    SELECT id, ward, collection_date::text AS collection_date, species, insecticide, exposed_count, dead_count
    FROM field_records
    WHERE ward = $1 AND collection_date = $2 AND species = $3 AND insecticide = $4
      AND exposed_count = $5 AND dead_count = $6 AND id <> $7 AND sync_status <> 'rejected'
  `, [record.ward, record.collectionDate, record.species, record.insecticide, record.exposedCount, record.deadCount, record.id]);

  const existingRecords = matches.rows.map((row) => ({
    record_id: row.id,
    ward: row.ward,
    collection_date: row.collection_date,
    species: row.species,
    insecticide: row.insecticide,
    n_exposed: row.exposed_count,
    n_dead: row.dead_count
  }));

  return summarizeFlags(validateRecord(toValidationRecord(record), { scope: 'device', refDate, existingRecords }));
}

const UPSERT_SQL = `
  INSERT INTO field_records (
    id, state, lga, ward, collection_date, species, insecticide,
    exposed_count, dead_count, mortality_pct, gps_latitude, gps_longitude,
    gps_accuracy_m, location, larval_density, urban_rural, irs, itn_use_pct,
    sync_status, rejection_reason
  ) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
    $13, ST_SetSRID(ST_MakePoint($12,$11),4326)::geography,
    $14,$15,$16,$17,$18,$19
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
    sync_status = EXCLUDED.sync_status,
    rejection_reason = EXCLUDED.rejection_reason,
    updated_at = NOW()
  WHERE field_records.sync_status = 'rejected'
  RETURNING *, (xmax <> 0) AS resubmitted
`;

const INSERT_VALIDATION_RESULTS_SQL = `
  INSERT INTO validation_results (record_id, rule_code, severity, message)
  SELECT $1::uuid, r.rule_code, r.severity, r.message
  FROM unnest($2::text[], $3::text[], $4::text[]) AS r(rule_code, severity, message)
  ON CONFLICT (record_id, rule_code) DO UPDATE SET severity = EXCLUDED.severity, message = EXCLUDED.message
`;

/**
 * Validates one record, then stores it. A record with a blocking finding is kept
 * as `rejected` (with the reason) so it stays visible and can be corrected and
 * resubmitted under the same UUID; warnings are stored and the record is `synced`.
 */
async function processRecord(query, record, refDate) {
  const flags = await validateIncoming(query, record, refDate);
  const blocks = flags.filter((flag) => flag.severity === 'Block');
  const rejected = blocks.length > 0;
  const rejectionReason = rejected ? blocks.map((flag) => flag.message).join(' ').slice(0, 1000) : null;

  const insert = await query(UPSERT_SQL, [
    record.id, record.state, record.lga, record.ward, record.collectionDate,
    record.species, record.insecticide, record.exposedCount, record.deadCount,
    record.mortalityPct, record.gpsLatitude, record.gpsLongitude,
    record.gpsAccuracyM, record.larvalDensity ?? null, record.urbanRural,
    record.irs, record.itnUsePct ?? null,
    rejected ? 'rejected' : 'synced', rejectionReason
  ]);

  if (!insert.rows.length) {
    const existing = await query('SELECT * FROM field_records WHERE id = $1', [record.id]);
    return { id: record.id, status: 'already_exists', record: existing.rows[0] ?? null };
  }

  const row = insert.rows[0];
  if (row.resubmitted) await query('DELETE FROM validation_results WHERE record_id = $1', [record.id]);
  if (flags.length) {
    await query(INSERT_VALIDATION_RESULTS_SQL, [
      record.id,
      flags.map((flag) => flag.ruleId),
      flags.map((flag) => flag.severity),
      flags.map((flag) => flag.message)
    ]);
  }

  const resubmitted = row.resubmitted ? { resubmitted: true } : {};
  if (rejected) {
    return { id: record.id, status: 'rejected', reason: 'validation_failed', message: rejectionReason, flags, ...resubmitted, record: row };
  }
  return { id: record.id, status: 'synced', ...resubmitted, ...(flags.length ? { warnings: flags } : {}), record: row };
}

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

export async function syncFieldRecords(query, records, { deviceId, now = new Date() } = {}) {
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

  const refDate = lagosToday(now);
  const results = [];
  for (const record of parsed.data) {
    try {
      results.push(await processRecord(query, record, refDate));
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
