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

const users = {
  uniosun: { id: 'u-uniosun', username: 'u_uniosun_01', role: 'UNIOSUN', state: null },
  vecdim: { id: 'u-vecdim', username: 'u_vecdim_osun', role: 'VECDIM', state: 'Osun' },
  field: { id: 'u-field', username: 'u_field_01', role: 'Field', state: 'Lagos' }
};
const headersFor = (key) => ({ 'x-user-id': users[key].username, 'x-role': users[key].role.toLowerCase() });

// Builds a mock query: user lookups return `user`; everything else goes to `onRecordQuery`.
function queryFor(user, onRecordQuery) {
  const calls = [];
  const query = async (sql, params) => {
    if (sql.includes('FROM users')) return { rows: user ? [user] : [] };
    calls.push({ sql, params });
    return onRecordQuery(sql, params);
  };
  return { query, calls };
}

test('GET /api/records/:id returns a record to UNIOSUN', async () => {
  const { query } = queryFor(users.uniosun, async () => ({ rows: [{ ...validRecord, sync_status: 'pending_sync' }] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records/${validRecord.id}`, { headers: headersFor('uniosun') });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).record.id, validRecord.id);
  });
});

test('GET /api/records/:id returns 404 for a missing record', async () => {
  const { query } = queryFor(users.uniosun, async () => ({ rows: [] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records/${validRecord.id}`, { headers: headersFor('uniosun') });
    assert.equal(response.status, 404);
  });
});

test('GET /api/records/:id returns 400 for a malformed id', async () => {
  const { query } = queryFor(users.uniosun, async () => ({ rows: [] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records/not-a-uuid`, { headers: headersFor('uniosun') });
    assert.equal(response.status, 400);
  });
});

test('GET /api/records/:id hides a record outside the caller state as 404', async () => {
  // validRecord is in Osun; the Field user is assigned to Lagos.
  const { query } = queryFor(users.field, async () => ({ rows: [{ ...validRecord, sync_status: 'synced' }] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records/${validRecord.id}`, { headers: headersFor('field') });
    assert.equal(response.status, 404);
  });
});

test('GET /api/records/:id returns an in-state record to a VECDIM user', async () => {
  const { query } = queryFor(users.vecdim, async () => ({ rows: [{ ...validRecord, sync_status: 'synced' }] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records/${validRecord.id}`, { headers: headersFor('vecdim') });
    assert.equal(response.status, 200);
  });
});

test('GET /api/records returns paginated records for UNIOSUN', async () => {
  const { query, calls } = queryFor(users.uniosun, async () => ({ rows: [{ id: validRecord.id }] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records?limit=10&offset=20`, { headers: headersFor('uniosun') });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.records.length, 1);
    assert.equal(body.limit, 10);
    assert.equal(body.offset, 20);
    assert.deepEqual(calls.at(-1).params, [10, 20]);
  });
});

test('GET /api/records is scoped to the assigned state and ignores a caller-supplied state', async () => {
  const { query, calls } = queryFor(users.vecdim, async () => ({ rows: [] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records?limit=10&offset=20&state=Lagos`, { headers: headersFor('vecdim') });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.at(-1).params, ['Osun', 10, 20]);
  });
});

test('UNIOSUN may filter records by state', async () => {
  const { query, calls } = queryFor(users.uniosun, async () => ({ rows: [] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records?state=Kano`, { headers: headersFor('uniosun') });
    assert.equal(response.status, 200);
    assert.deepEqual(calls.at(-1).params, ['Kano', 50, 0]);
  });
});

test('record reads without identity headers return 401 and never query records', async () => {
  const { query, calls } = queryFor(users.uniosun, async () => ({ rows: [{ id: validRecord.id }] }));
  const app = createApp({ checkDatabaseConnection: async () => true, query });
  await withServer(app, async (baseUrl) => {
    for (const url of [`${baseUrl}/api/records`, `${baseUrl}/api/v1/records`, `${baseUrl}/api/records/${validRecord.id}`]) {
      const response = await fetch(url);
      assert.equal(response.status, 401, url);
    }
    assert.equal(calls.length, 0);
  });
});

test('record reads return 403 for an unknown user or a role mismatch', async () => {
  const unknown = queryFor(null, async () => ({ rows: [] }));
  await withServer(createApp({ checkDatabaseConnection: async () => true, query: unknown.query }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records`, { headers: { 'x-user-id': 'nobody', 'x-role': 'uniosun' } });
    assert.equal(response.status, 403);
  });

  const mismatch = queryFor(users.field, async () => ({ rows: [] }));
  await withServer(createApp({ checkDatabaseConnection: async () => true, query: mismatch.query }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/records`, { headers: { 'x-user-id': users.field.username, 'x-role': 'uniosun' } });
    assert.equal(response.status, 403);
    assert.equal(mismatch.calls.length, 0);
  });
});
