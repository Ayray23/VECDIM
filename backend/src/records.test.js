import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFieldRecord, fieldRecordSchema, getFieldRecord, listFieldRecords } from './records.js';

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

test('schema rejects dead count above exposed count', () => {
  const result = fieldRecordSchema.safeParse({ ...validRecord, deadCount: 101 });
  assert.equal(result.success, false);
});

test('createFieldRecord inserts a pending-sync record', async () => {
  let captured;
  const query = async (sql, params) => {
    captured = { sql, params };
    return { rows: [{ id: validRecord.id, sync_status: 'pending_sync' }] };
  };

  const result = await createFieldRecord(query, validRecord);
  assert.equal(result.created, true);
  assert.equal(result.record.sync_status, 'pending_sync');
  assert.equal(captured.params[0], validRecord.id);
  assert.match(captured.sql, /ST_SetSRID\(ST_MakePoint/);
});

test('createFieldRecord is idempotent for an existing UUID', async () => {
  let calls = 0;
  const query = async (_sql, params) => {
    calls += 1;
    if (calls === 1) return { rows: [] };
    assert.deepEqual(params, [validRecord.id]);
    return { rows: [{ id: validRecord.id, sync_status: 'pending_sync' }] };
  };

  const result = await createFieldRecord(query, validRecord);
  assert.equal(result.created, false);
  assert.equal(result.record.id, validRecord.id);
});

test('getFieldRecord returns the requested record', async () => {
  const query = async (_sql, params) => ({ rows: [{ id: params[0] }] });
  const result = await getFieldRecord(query, validRecord.id);
  assert.equal(result.id, validRecord.id);
});

test('listFieldRecords applies pagination', async () => {
  let params;
  const query = async (_sql, values) => {
    params = values;
    return { rows: [{ id: validRecord.id }] };
  };
  const result = await listFieldRecords(query, { limit: 10, offset: 20 });
  assert.deepEqual(params, [10, 20]);
  assert.equal(result.length, 1);
});
