import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createApp } from './app.js';

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

async function withServer(app, callback) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('POST /api/records returns 400 for invalid data', async () => {
  const app = createApp({ checkDatabaseConnection: async () => true, query: async () => ({ rows: [] }) });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validRecord, deadCount: 101 })
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, 'validation_error');
  });
});

test('POST /api/records creates a record', async () => {
  const query = async () => ({ rows: [{ ...validRecord, sync_status: 'pending_sync' }] });
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validRecord)
    });
    const body = await response.json();
    assert.equal(response.status, 201);
    assert.equal(body.status, 'created');
    assert.equal(body.record.id, validRecord.id);
  });
});

test('POST /api/records returns already_exists for an idempotent retry', async () => {
  const query = async (sql) => sql.includes('INSERT INTO') ? { rows: [] } : { rows: [{ ...validRecord, sync_status: 'pending_sync' }] };
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validRecord)
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'already_exists');
  });
});

test('GET /api/records/:id returns a record', async () => {
  const query = async () => ({ rows: [{ ...validRecord, sync_status: 'pending_sync' }] });
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records/${validRecord.id}`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).record.id, validRecord.id);
  });
});

test('GET /api/records/:id returns 404 for a missing record', async () => {
  const app = createApp({ checkDatabaseConnection: async () => true, query: async () => ({ rows: [] }) });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records/${validRecord.id}`);
    assert.equal(response.status, 404);
  });
});

test('GET /api/records returns paginated records', async () => {
  const query = async (_sql, params) => {
    assert.deepEqual(params, [10, 20]);
    return { rows: [{ id: validRecord.id }] };
  };
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records?limit=10&offset=20`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.records.length, 1);
    assert.equal(body.limit, 10);
    assert.equal(body.offset, 20);
  });
});
