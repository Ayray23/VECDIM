import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applySyncResults, chunk, isPending, statusLabel, syncPending, toSyncPayload } from './sync.js';

const NOW = new Date('2026-10-28T10:00:00Z');

function savedRecord(n, overrides = {}) {
  return {
    recordId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    state: 'Osun', lga: 'Iwo', ward: 'Iwo Ward 1', collectionDate: '2026-10-26',
    species: 'An. gambiae s.s.', insecticide: 'Pirimiphos-methyl',
    exposed: '100', dead: '92', larvalDensity: '12', urban: 'Rural', irsCovered: true, itnUsePercent: '68.5',
    latitude: '7.63', longitude: '4.18', gpsAccuracyM: '6',
    status: 'pending_sync', ...overrides
  };
}

const jsonResponse = (status, body) => ({ status, json: async () => body });
const allSynced = (batch) => batch.records.map((record) => ({ id: record.id, status: 'synced' }));

// A fake server: records every request and answers with `respond(body, callNumber)`.
function fakeFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, init, body });
    return respond(body, calls.length);
  };
  return { fetchImpl, calls };
}

test('toSyncPayload maps an app record onto the server schema', () => {
  assert.deepEqual(toSyncPayload(savedRecord(1)), {
    id: '00000000-0000-4000-8000-000000000001',
    state: 'Osun', lga: 'Iwo', ward: 'Iwo Ward 1', collectionDate: '2026-10-26',
    species: 'An. gambiae s.s.', insecticide: 'Pirimiphos-methyl',
    exposedCount: 100, deadCount: 92, mortalityPct: 92,
    gpsLatitude: 7.63, gpsLongitude: 4.18, gpsAccuracyM: 6,
    larvalDensity: 12, urbanRural: 'rural', irs: true, itnUsePct: 68.5
  });
});

test('toSyncPayload rounds mortality like the on-screen figure and handles blanks', () => {
  assert.equal(toSyncPayload(savedRecord(1, { exposed: '3', dead: '2' })).mortalityPct, 66.7);
  assert.equal(toSyncPayload(savedRecord(1, { urban: 'Urban' })).urbanRural, 'urban');
  assert.equal(toSyncPayload(savedRecord(1, { larvalDensity: '', itnUsePercent: '' })).larvalDensity, null);
  assert.equal(toSyncPayload(savedRecord(1, { irsCovered: false })).irs, false);
});

test('chunk splits into batches of at most 100', () => {
  assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
  assert.deepEqual(chunk(Array.from({ length: 250 }, (_, i) => i)).map((batch) => batch.length), [100, 100, 50]);
  assert.deepEqual(chunk([]), []);
});

test('status helpers', () => {
  assert.equal(isPending(savedRecord(1)), true);
  assert.equal(isPending(savedRecord(1, { status: 'synced' })), false);
  assert.equal(statusLabel('pending_sync'), 'PENDING SYNC');
  assert.equal(statusLabel('rejected'), 'REJECTED');
  assert.equal(statusLabel('whatever'), 'WHATEVER');
});

test('applySyncResults treats synced and already_exists as synced and keeps warnings', () => {
  const [a, b, c] = [savedRecord(1), savedRecord(2), savedRecord(3)];
  const out = applySyncResults([a, b, c], [
    { id: a.recordId, status: 'synced' },
    { id: b.recordId, status: 'already_exists' },
    { id: c.recordId, status: 'synced', warnings: [{ ruleId: 'GPS_accuracy_poor', message: 'GPS accuracy is 20 m.' }] }
  ], { now: NOW });

  assert.deepEqual(out.map((record) => record.status), ['synced', 'synced', 'synced']);
  assert.equal(out[0].syncedAt, NOW.toISOString());
  assert.equal(out[0].syncWarnings, undefined);
  assert.deepEqual(out[2].syncWarnings, ['GPS accuracy is 20 m.']);
});

test('applySyncResults marks validation rejections as rejected with the reason and flags', () => {
  const a = savedRecord(1);
  const flags = [{ ruleId: 'GPS_zero_zero', severity: 'Block', message: 'The GPS location is 0,0.' }];
  const [out] = applySyncResults([a], [{ id: a.recordId, status: 'rejected', reason: 'validation_failed', message: 'The GPS location is 0,0.', flags }]);
  assert.equal(out.status, 'rejected');
  assert.equal(out.rejectionReason, 'The GPS location is 0,0.');
  assert.deepEqual(out.serverFlags, flags);
});

test('applySyncResults keeps records pending after a server error so they are retried', () => {
  const a = savedRecord(1);
  const [out] = applySyncResults([a], [{ id: a.recordId, status: 'rejected', reason: 'server_error', message: 'Record could not be saved.' }]);
  assert.equal(out.status, 'pending_sync');
  assert.equal(out.syncError, 'Record could not be saved.');
});

test('applySyncResults clears an earlier outcome and ignores unknown ids', () => {
  const stale = savedRecord(1, { status: 'pending_sync', rejectionReason: 'old', serverFlags: [{}], syncError: 'old error' });
  const other = savedRecord(2);
  const [out, untouched] = applySyncResults([stale, other], [{ id: stale.recordId, status: 'synced' }, { id: 'nope', status: 'synced' }], { now: NOW });
  assert.equal(out.rejectionReason, undefined);
  assert.equal(out.serverFlags, undefined);
  assert.equal(out.syncError, undefined);
  assert.equal(untouched, other);
});

test('syncPending uploads pending records to the sync endpoint and reports them synced', async () => {
  const records = [savedRecord(1), savedRecord(2)];
  const { fetchImpl, calls } = fakeFetch((body) => jsonResponse(200, { results: allSynced(body) }));
  const result = await syncPending({ records, deviceId: 'device-1', baseUrl: 'http://10.0.2.2:4000/', fetchImpl, now: NOW });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://10.0.2.2:4000/api/v1/sync');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.equal(calls[0].body.deviceId, 'device-1');
  assert.deepEqual(calls[0].body.records.map((record) => record.id), records.map((record) => record.recordId));
  assert.equal(result.synced, 2);
  assert.equal(result.error, null);
  assert.equal(result.updated[records[0].recordId].status, 'synced');
});

test('syncPending skips records that are not pending and makes no request when nothing is pending', async () => {
  const records = [savedRecord(1, { status: 'synced' }), savedRecord(2, { status: 'rejected' })];
  const { fetchImpl, calls } = fakeFetch(() => { throw new Error('should not be called'); });
  const result = await syncPending({ records, deviceId: 'd', baseUrl: 'http://x', fetchImpl });
  assert.equal(calls.length, 0);
  assert.deepEqual(result, { updated: {}, synced: 0, rejected: 0, deferred: 0, error: null });
});

test('syncPending sends extra headers and splits more than 100 records across requests', async () => {
  const records = Array.from({ length: 230 }, (_, i) => savedRecord(i + 1));
  const { fetchImpl, calls } = fakeFetch((body) => jsonResponse(200, { results: allSynced(body) }));
  const result = await syncPending({ records, deviceId: 'd', baseUrl: 'http://x', fetchImpl, headers: { 'x-user-id': 'u1' } });

  assert.deepEqual(calls.map((call) => call.body.records.length), [100, 100, 30]);
  assert.equal(calls[0].init.headers['x-user-id'], 'u1');
  assert.equal(result.synced, 230);
});

test('syncPending applies a partial result: some synced, some rejected by validation', async () => {
  const [good, bad] = [savedRecord(1), savedRecord(2)];
  const { fetchImpl } = fakeFetch(() => jsonResponse(200, {
    results: [
      { id: good.recordId, status: 'synced' },
      { id: bad.recordId, status: 'rejected', reason: 'validation_failed', message: 'GPS accuracy is unusable.', flags: [] }
    ]
  }));
  const result = await syncPending({ records: [good, bad], deviceId: 'd', baseUrl: 'http://x', fetchImpl, now: NOW });

  assert.equal(result.synced, 1);
  assert.equal(result.rejected, 1);
  assert.equal(result.updated[bad.recordId].status, 'rejected');
  assert.equal(result.updated[bad.recordId].rejectionReason, 'GPS accuracy is unusable.');
});

test('a network failure leaves every record pending and reports the problem', async () => {
  const records = [savedRecord(1), savedRecord(2)];
  const fetchImpl = async () => { throw new TypeError('Network request failed'); };
  const result = await syncPending({ records, deviceId: 'd', baseUrl: 'http://x', fetchImpl });

  assert.deepEqual(result.updated, {});
  assert.equal(result.synced, 0);
  assert.match(result.error, /Could not reach the server/);
});

test('a server error stops the run, keeps earlier batches, and leaves the rest pending', async () => {
  const records = Array.from({ length: 150 }, (_, i) => savedRecord(i + 1));
  const { fetchImpl, calls } = fakeFetch((body, n) => (n === 1 ? jsonResponse(200, { results: allSynced(body) }) : jsonResponse(503, {})));
  const result = await syncPending({ records, deviceId: 'd', baseUrl: 'http://x', fetchImpl });

  assert.equal(calls.length, 2);
  assert.equal(result.synced, 100);
  assert.equal(Object.keys(result.updated).length, 100);
  assert.match(result.error, /status 503/);
});

test('a request that exceeds the timeout is aborted and reported as unreachable', async () => {
  const fetchImpl = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  const result = await syncPending({ records: [savedRecord(1)], deviceId: 'd', baseUrl: 'http://x', fetchImpl, timeoutMs: 20 });
  assert.match(result.error, /Could not reach the server/);
  assert.deepEqual(result.updated, {});
});

test('when the server rejects a whole batch as malformed, records are resent one by one', async () => {
  const [a, b, c] = [savedRecord(1), savedRecord(2), savedRecord(3)];
  const { fetchImpl, calls } = fakeFetch((body) => {
    if (body.records.length > 1) return jsonResponse(400, { error: 'validation_error', details: [{ path: [1, 'deadCount'], message: 'deadCount cannot exceed exposedCount' }] });
    if (body.records[0].id === b.recordId) return jsonResponse(400, { error: 'validation_error', details: [{ path: [0, 'deadCount'], message: 'deadCount cannot exceed exposedCount' }] });
    return jsonResponse(200, { results: allSynced(body) });
  });
  const result = await syncPending({ records: [a, b, c], deviceId: 'd', baseUrl: 'http://x', fetchImpl, now: NOW });

  assert.deepEqual(calls.map((call) => call.body.records.length), [3, 1, 1, 1]);
  assert.equal(result.updated[a.recordId].status, 'synced');
  assert.equal(result.updated[c.recordId].status, 'synced');
  assert.equal(result.updated[b.recordId].status, 'rejected');
  assert.equal(result.updated[b.recordId].rejectionReason, '0.deadCount: deadCount cannot exceed exposedCount');
  assert.equal(result.error, null);
});

test('a network failure during the one-by-one fallback stops the run', async () => {
  const [a, b] = [savedRecord(1), savedRecord(2)];
  let n = 0;
  const fetchImpl = async (_url, init) => {
    n += 1;
    if (n === 1) return jsonResponse(400, { error: 'validation_error', details: [] });
    if (n === 2) return jsonResponse(200, { results: allSynced(JSON.parse(init.body)) });
    throw new TypeError('offline');
  };
  const result = await syncPending({ records: [a, b], deviceId: 'd', baseUrl: 'http://x', fetchImpl });

  assert.equal(result.updated[a.recordId].status, 'synced');
  assert.equal(result.updated[b.recordId], undefined);
  assert.match(result.error, /Could not reach the server/);
});
