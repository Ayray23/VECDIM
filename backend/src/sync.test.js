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
  const query = async (sql, params) => {
    insertParams = params;
    assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
    return { rows: [{ id: validRecord.id, sync_status: 'synced' }] };
  };

  const result = await syncFieldRecords(query, [validRecord]);
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 0);
  assert.equal(result.results[0].status, 'synced');
  assert.equal(insertParams[0], validRecord.id);
});

test('syncFieldRecords reports an existing UUID as already_exists', async () => {
  let calls = 0;
  const query = async (_sql, params) => {
    calls += 1;
    if (calls === 1) return { rows: [] };
    assert.deepEqual(params, [validRecord.id]);
    return { rows: [{ id: validRecord.id, sync_status: 'synced' }] };
  };

  const result = await syncFieldRecords(query, [validRecord]);
  assert.equal(result.accepted, 1);
  assert.equal(result.results[0].status, 'already_exists');
});

test('syncFieldRecords rejects one failed record without rejecting the whole batch', async () => {
  const second = { ...validRecord, id: '550e8400-e29b-41d4-a716-446655440001' };
  const query = async (_sql, params) => {
    if (params[0] === second.id) throw new Error('database failure');
    return { rows: [{ id: validRecord.id, sync_status: 'synced' }] };
  };

  const result = await syncFieldRecords(query, [validRecord, second]);
  assert.equal(result.accepted, 1);
  assert.equal(result.rejected, 1);
  assert.deepEqual(result.results.map((item) => item.status), ['synced', 'rejected']);
});

test('syncFieldRecords rejects an invalid batch before database writes', async () => {
  let calls = 0;
  const query = async () => {
    calls += 1;
    return { rows: [] };
  };

  await assert.rejects(
    () => syncFieldRecords(query, [{ ...validRecord, deadCount: 101 }]),
    (error) => error.code === 'VALIDATION_ERROR'
  );
  assert.equal(calls, 0);
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
