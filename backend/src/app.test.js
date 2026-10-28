import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { createApp } from './app.js';

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

test('health returns connected when the database check succeeds', async () => {
  const app = createApp({ checkDatabaseConnection: async () => true });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'vecdim-backend',
      database: 'connected'
    });
  });
});

test('health returns service unavailable when the database check fails', async () => {
  const app = createApp({ checkDatabaseConnection: async () => { throw new Error('database down'); } });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      status: 'error',
      service: 'vecdim-backend',
      database: 'disconnected'
    });
  });
});

test('malformed JSON returns a JSON 400 without a stack trace', async () => {
  const app = createApp({ checkDatabaseConnection: async () => true, query: async () => ({ rows: [] }) });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"records": [oops'
    });
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.equal(body.error, 'invalid_json');
    assert.equal(JSON.stringify(body).includes('node_modules'), false);
  });
});

test('oversized request bodies return a JSON 413', async () => {
  const app = createApp({ checkDatabaseConnection: async () => true, query: async () => ({ rows: [] }) });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ records: [], pad: 'x'.repeat(1.2 * 1024 * 1024) })
    });
    assert.equal(response.status, 413);
    assert.equal((await response.json()).error, 'payload_too_large');
  });
});
