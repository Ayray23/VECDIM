import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lagosToday, summarizeFlags, syncBatchSchema, syncFieldRecords, toValidationRecord } from './sync.js';
import { createSyncRouter } from './sync-routes.js';

const validRecord = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  state: 'Osun',
  lga: 'Iwo',
  ward: 'Ward 1',
  collectionDate: '2026-10-26',
  species: 'Anopheles gambiae',
  insecticide: 'Deltamethrin',
  exposedCount: 100,
  deadCount: 95,
  mortalityPct: 95,
  gpsLatitude: 7.63,
  gpsLongitude: 4.18,
  gpsAccuracyM: 6,
  larvalDensity: 12,
  urbanRural: 'rural',
  irs: false,
  itnUsePct: 80
};

test('sync batch accepts one or more records and limits batches to 100', () => {
  assert.equal(syncBatchSchema.safeParse([validRecord]).success, true);
  assert.equal(syncBatchSchema.safeParse([]).success, false);
  assert.equal(syncBatchSchema.safeParse(Array.from({ length: 101 }, (_, index) => ({ ...validRecord, id: `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, '0')}` }))).success, false);
});

test('syncFieldRecords marks a new record as synced', async () => {
  let insertParams;
  const loggedQueries = [];
  const query = async (sql, params) => {
    loggedQueries.push({ sql, params });
    if (sql.includes('INSERT INTO sync_batches')) return { rows: [] };
    if (sql.includes('INSERT INTO field_records')) {
      insertParams = params;
      assert.match(sql, /WHERE field_records\.sync_status = 'rejected'/);
      return { rows: [{ id: validRecord.id, sync_status: 'synced', resubmitted: false }] };
    }
    return { rows: [] };
  };

  const result = await syncFieldRecords(query, [validRecord], { deviceId: 'device-1' });
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 0);
  assert.equal(result.outcome, 'accepted');
  assert.equal(result.results[0].status, 'synced');
  assert.equal(insertParams[0], validRecord.id);
  assert.ok(loggedQueries.some(({ sql }) => sql.includes('INSERT INTO sync_batch_records')));
  assert.ok(loggedQueries.some(({ sql, params }) => sql.includes('UPDATE sync_batches') && params[3] === 'accepted'));
  assert.ok(loggedQueries.some(({ sql, params }) => sql.includes('INSERT INTO sync_batches') && params[1] === 'device-1'));
});

test('syncFieldRecords reports an existing UUID as already_exists', async () => {
  let calls = 0;
  const query = async (_sql, params) => {
    calls += 1;
    const sql = _sql;
    if (sql.includes('INSERT INTO field_records')) return { rows: [] };
    if (sql.includes('SELECT * FROM field_records')) {
      assert.deepEqual(params, [validRecord.id]);
      return { rows: [{ id: validRecord.id, sync_status: 'synced' }] };
    }
    return { rows: [] };
  };

  const result = await syncFieldRecords(query, [validRecord]);
  assert.equal(result.accepted, 1);
  assert.equal(result.results[0].status, 'already_exists');
});

test('syncFieldRecords rejects one failed record without rejecting the whole batch', async () => {
  const second = { ...validRecord, id: '550e8400-e29b-41d4-a716-446655440001' };
  const query = async (sql, params) => {
    if (sql.includes('INSERT INTO field_records') && params[0] === second.id) throw new Error('secret database detail');
    if (sql.includes('INSERT INTO field_records')) return { rows: [{ id: validRecord.id, sync_status: 'synced' }] };
    return { rows: [] };
  };

  const result = await syncFieldRecords(query, [validRecord, second]);
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.outcome, 'partial');
  assert.deepEqual(result.results.map((item) => item.status), ['synced', 'rejected']);
  assert.equal(result.results[1].message, 'Record could not be saved.');
});

test('syncFieldRecords logs invalid batches before returning validation errors', async () => {
  const calls = [];
  const query = async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [] };
  };

  await assert.rejects(
    () => syncFieldRecords(query, [{ ...validRecord, deadCount: 101 }]),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.equal(calls.some(({ sql }) => sql.includes('INSERT INTO sync_batches')), true);
  assert.equal(calls.some(({ sql }) => sql.includes('INSERT INTO sync_batch_records')), true);
  assert.equal(calls.some(({ sql }) => sql.includes('INSERT INTO field_records')), false);
  assert.equal(calls.some(({ sql, params }) => sql.includes('UPDATE sync_batches') && params[1] === 1), true);
});

test('syncFieldRecords marks a rejected record as resubmitted when its UUID is retried', async () => {
  let retriedSql;
  const query = async (sql) => {
    if (sql.includes('INSERT INTO field_records')) {
      retriedSql = sql;
      return { rows: [{ id: validRecord.id, sync_status: 'synced', resubmitted: true }] };
    }
    return { rows: [] };
  };

  const result = await syncFieldRecords(query, [validRecord]);
  assert.match(retriedSql, /WHERE field_records\.sync_status = 'rejected'/);
  assert.match(retriedSql, /rejection_reason = EXCLUDED\.rejection_reason/);
  assert.equal(result.results[0].status, 'synced');
  assert.equal(result.results[0].resubmitted, true);
});

test('sync route returns validation_error for an invalid batch', async () => {
  const router = createSyncRouter({ query: async () => ({ rows: [] }) });
  const route = router.stack.find((layer) => layer.route?.path === '/');
  assert.ok(route);

  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  await route.route.stack[0].handle({ body: { records: [{ ...validRecord, deadCount: 101 }] } }, response);
  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error, 'validation_error');
});


// ---- Server-side validation of synced records -------------------------------------

const NOW = new Date('2026-10-28T10:00:00Z'); // 11:00 in Lagos

// Mock query: records upserts, the duplicate lookup and validation_results writes are observable.
function syncQuery({ duplicates = [], resubmitted = false, failDuplicateLookup = false } = {}) {
  const log = { upserts: [], resultInserts: [], resultDeletes: [] };
  const query = async (sql, params) => {
    if (sql.includes('INSERT INTO field_records')) {
      log.upserts.push(params);
      return { rows: [{ id: params[0], sync_status: params[17], rejection_reason: params[18], resubmitted }] };
    }
    if (sql.includes('FROM field_records') && sql.includes('exposed_count = $5')) {
      if (failDuplicateLookup) throw new Error('lookup failed');
      return { rows: duplicates };
    }
    if (sql.includes('INSERT INTO validation_results')) {
      log.resultInserts.push(params);
      return { rows: [] };
    }
    if (sql.includes('DELETE FROM validation_results')) {
      log.resultDeletes.push(params);
      return { rows: [] };
    }
    return { rows: [] };
  };
  return { query, log };
}

test('a clean record is stored as synced and writes no validation results', async () => {
  const { query, log } = syncQuery();
  const result = await syncFieldRecords(query, [validRecord], { now: NOW });
  assert.equal(result.results[0].status, 'synced');
  assert.equal(result.results[0].warnings, undefined);
  assert.equal(log.upserts[0][17], 'synced');
  assert.equal(log.upserts[0][18], null);
  assert.equal(log.resultInserts.length, 0);
});

test('a record with a blocking finding is stored as rejected with the reason and flags', async () => {
  const bad = { ...validRecord, gpsLatitude: 0, gpsLongitude: 0 };
  const { query, log } = syncQuery();
  const result = await syncFieldRecords(query, [bad], { now: NOW });

  const item = result.results[0];
  assert.equal(item.status, 'rejected');
  assert.equal(item.reason, 'validation_failed');
  assert.ok(item.flags.some((flag) => flag.ruleId === 'GPS_zero_zero' && flag.severity === 'Block'));
  assert.equal(result.accepted, 0);
  assert.equal(result.rejected, 1);
  assert.equal(result.outcome, 'rejected');

  assert.equal(log.upserts[0][17], 'rejected');
  assert.match(log.upserts[0][18], /0,0/);
  const [recordId, ruleCodes, severities] = log.resultInserts[0];
  assert.equal(recordId, bad.id);
  assert.ok(ruleCodes.includes('GPS_zero_zero'));
  assert.ok(severities.includes('Block'));
});

test('a warning-only record is synced and its warnings are stored and returned', async () => {
  const { query, log } = syncQuery();
  const result = await syncFieldRecords(query, [{ ...validRecord, gpsAccuracyM: 20 }], { now: NOW });

  assert.equal(result.results[0].status, 'synced');
  assert.deepEqual(result.results[0].warnings.map((flag) => flag.ruleId), ['GPS_accuracy_poor']);
  assert.equal(log.upserts[0][17], 'synced');
  assert.deepEqual(log.resultInserts[0][1], ['GPS_accuracy_poor']);
  assert.deepEqual(log.resultInserts[0][2], ['Warn']);
});

test('the duplicate rule uses earlier matching records already on the server', async () => {
  const earlier = {
    id: '550e8400-e29b-41d4-a716-446655440000', ward: 'Ward 1', collection_date: '2026-10-26',
    species: 'Anopheles gambiae', insecticide: 'Deltamethrin', exposed_count: 100, dead_count: 95
  };
  const second = { ...validRecord, id: '550e8400-e29b-41d4-a716-446655440001' };
  const { query } = syncQuery({ duplicates: [earlier] });
  const result = await syncFieldRecords(query, [second], { now: NOW });

  assert.equal(result.results[0].status, 'synced');
  assert.deepEqual(result.results[0].warnings.map((flag) => flag.ruleId), ['duplicate']);
});

test('future dates use the Lagos calendar, not UTC', async () => {
  assert.equal(lagosToday(new Date('2026-10-27T22:30:00Z')), '2026-10-27'); // 23:30 in Lagos
  assert.equal(lagosToday(new Date('2026-10-27T23:30:00Z')), '2026-10-28'); // 00:30 in Lagos

  const tomorrowInUtcTerms = { ...validRecord, collectionDate: '2026-10-28' };
  const after = syncQuery();
  const accepted = await syncFieldRecords(after.query, [tomorrowInUtcTerms], { now: new Date('2026-10-27T23:30:00Z') });
  assert.equal(accepted.results[0].status, 'synced');

  const before = syncQuery();
  const rejected = await syncFieldRecords(before.query, [tomorrowInUtcTerms], { now: new Date('2026-10-27T22:30:00Z') });
  assert.equal(rejected.results[0].status, 'rejected');
  assert.ok(rejected.results[0].flags.some((flag) => flag.ruleId === 'future_date'));
});

test('one blocked record does not stop the rest of the batch', async () => {
  const bad = { ...validRecord, id: '550e8400-e29b-41d4-a716-446655440001', deadCount: 100, exposedCount: 100, gpsAccuracyM: 80 };
  const { query } = syncQuery();
  const result = await syncFieldRecords(query, [validRecord, bad], { now: NOW });

  assert.deepEqual(result.results.map((item) => item.status), ['synced', 'rejected']);
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.outcome, 'partial');
});

test('a corrected resubmission replaces its earlier validation results', async () => {
  const { query, log } = syncQuery({ resubmitted: true });
  const result = await syncFieldRecords(query, [validRecord], { now: NOW });

  assert.equal(result.results[0].status, 'synced');
  assert.equal(result.results[0].resubmitted, true);
  assert.deepEqual(log.resultDeletes, [[validRecord.id]]);
});

test('a resubmission that is still invalid stays rejected', async () => {
  const { query, log } = syncQuery({ resubmitted: true });
  const result = await syncFieldRecords(query, [{ ...validRecord, gpsAccuracyM: 90 }], { now: NOW });

  assert.equal(result.results[0].status, 'rejected');
  assert.equal(result.results[0].reason, 'validation_failed');
  assert.equal(result.results[0].resubmitted, true);
  assert.equal(log.upserts[0][17], 'rejected');
});

test('an infrastructure failure during validation is reported as a retryable server_error', async () => {
  const { query } = syncQuery({ failDuplicateLookup: true });
  const result = await syncFieldRecords(query, [validRecord], { now: NOW });
  assert.equal(result.results[0].status, 'rejected');
  assert.equal(result.results[0].reason, 'server_error');
});

test('validation results are stored once per rule, merging repeated findings', async () => {
  const missingBoth = { ...validRecord, larvalDensity: null, itnUsePct: null };
  const { query, log } = syncQuery();
  await syncFieldRecords(query, [missingBoth], { now: NOW });

  const ruleCodes = log.resultInserts[0][1];
  assert.equal(new Set(ruleCodes).size, ruleCodes.length);
  assert.deepEqual(ruleCodes.filter((code) => code === 'missing_core'), ['missing_core']);

  const summary = summarizeFlags([
    { ruleId: 'missing_core', severity: 'Block', field: 'larval_density', message: 'Enter larval density.' },
    { ruleId: 'missing_core', severity: 'Block', field: 'itn_use_pct', message: 'Enter ITN use percentage.' }
  ]);
  assert.equal(summary.length, 1);
  assert.equal(summary[0].message, 'Enter larval density. Enter ITN use percentage.');
});

test('toValidationRecord maps a sync payload onto the shared rule field names', () => {
  assert.deepEqual(toValidationRecord(validRecord), {
    record_id: validRecord.id, state: 'Osun', lga: 'Iwo', ward: 'Ward 1',
    latitude: 7.63, longitude: 4.18, gps_accuracy_m: 6, collection_date: '2026-10-26',
    species: 'Anopheles gambiae', insecticide: 'Deltamethrin', n_exposed: 100, n_dead: 95,
    larval_density: 12, urban: 0, irs_covered: 0, itn_use_pct: 80
  });
  assert.equal(toValidationRecord({ ...validRecord, urbanRural: 'urban', irs: true }).urban, 1);
  assert.equal(toValidationRecord({ ...validRecord, irs: true }).irs_covered, 1);
});
