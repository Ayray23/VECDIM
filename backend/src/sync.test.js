import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncBatchSchema, syncFieldRecords } from './sync.js';
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
  assert.match(retriedSql, /rejection_reason = NULL/);
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
