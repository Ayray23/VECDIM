// Sync client for the VECDIM field app.
//
// Pure logic with no React Native imports, so it can be unit tested in Node and
// checked against the real server schema (see backend/src/mobile-contract.test.js).
// The app owns storage and UI; this module owns the wire format and result handling.

export const API_PORT = 4000;
const EMULATOR_HOST_URL = `http://10.0.2.2:${API_PORT}`; // Android emulator's alias for the computer running the backend

/**
 * Where the backend lives.
 * 1. EXPO_PUBLIC_API_URL, if set, always wins.
 * 2. Otherwise, the computer running `expo start`: its LAN address is already in the dev
 *    server's hostUri (for example "192.168.1.20:8081"), so a phone on the same Wi-Fi reaches
 *    the backend without any configuration.
 * 3. Otherwise (localhost or tunnel mode, no usable address) the Android emulator alias.
 */
export function resolveApiUrl({ envUrl, hostUri } = {}) {
  if (typeof envUrl === 'string' && envUrl.trim()) return envUrl.trim().replace(/\/+$/, '');
  const host = typeof hostUri === 'string' ? hostUri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split(/[/:?#]/)[0] : '';
  const isLanAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(host) && !host.startsWith('127.') && host !== '0.0.0.0';
  return isLanAddress ? `http://${host}:${API_PORT}` : EMULATOR_HOST_URL;
}

export const SYNC_BATCH_SIZE = 100; // the server accepts 1-100 records per request
export const SYNC_TIMEOUT_MS = 20000;

const STATUS_LABELS = { pending_sync: 'PENDING SYNC', synced: 'SYNCED', rejected: 'REJECTED' };

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? String(status ?? '').toUpperCase();
}

export function isPending(record) {
  return record?.status === 'pending_sync';
}

function numberOrNull(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Maps a saved app record onto the server's sync payload (see backend fieldRecordSchema). */
export function toSyncPayload(record) {
  const exposed = Number(record.exposed);
  const dead = Number(record.dead);
  return {
    id: record.recordId,
    state: record.state,
    lga: record.lga,
    ward: record.ward,
    collectionDate: record.collectionDate,
    species: record.species,
    insecticide: record.insecticide,
    exposedCount: exposed,
    deadCount: dead,
    // Same formula and rounding as the on-screen mortality figure.
    mortalityPct: exposed > 0 ? Math.round((dead / exposed) * 1000) / 10 : 0,
    gpsLatitude: Number(record.latitude),
    gpsLongitude: Number(record.longitude),
    gpsAccuracyM: Number(record.gpsAccuracyM),
    larvalDensity: numberOrNull(record.larvalDensity),
    urbanRural: String(record.urban ?? '').toLowerCase(),
    irs: Boolean(record.irsCovered),
    itnUsePct: numberOrNull(record.itnUsePercent)
  };
}

export function chunk(items, size = SYNC_BATCH_SIZE) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

// Fields the server outcome adds to a saved record; cleared whenever a new outcome arrives.
function withoutOutcome(record) {
  const { rejectionReason, serverFlags, syncError, syncWarnings, syncedAt, ...rest } = record;
  return rest;
}

function describeIssue(issue) {
  const field = Array.isArray(issue?.path) && issue.path.length ? `${issue.path.join('.')}: ` : '';
  return `${field}${issue?.message ?? 'invalid value'}`;
}

/**
 * Applies per-record server results to saved records.
 * - synced / already_exists -> status `synced` (idempotent retries are success)
 * - rejected by validation  -> status `rejected`, with the reason and flags, awaiting a fix
 * - any other rejection     -> stays `pending_sync` (a server problem, retried later)
 */
export function applySyncResults(records, results, { now = new Date() } = {}) {
  const byId = new Map((results ?? []).map((result) => [result.id, result]));
  return records.map((record) => {
    const result = byId.get(record.recordId);
    if (!result) return record;

    if (result.status === 'synced' || result.status === 'already_exists') {
      const next = { ...withoutOutcome(record), status: 'synced', syncedAt: now.toISOString() };
      if (result.warnings?.length) next.syncWarnings = result.warnings.map((warning) => warning.message);
      return next;
    }
    if (result.status === 'rejected' && result.reason === 'validation_failed') {
      return {
        ...withoutOutcome(record),
        status: 'rejected',
        rejectionReason: result.message ?? 'The server rejected this record.',
        serverFlags: result.flags ?? []
      };
    }
    return { ...withoutOutcome(record), status: 'pending_sync', syncError: result.message ?? 'The server could not save this record yet.' };
  });
}

// One request. Returns {type:'results'|'invalid'|'error', ...} and never throws.
async function sendBatch({ batch, deviceId, baseUrl, fetchImpl, headers, timeoutMs }) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/v1/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ deviceId, records: batch.map(toSyncPayload) }),
      ...(controller ? { signal: controller.signal } : {})
    });
    const body = await response.json().catch(() => null);

    if (response.status === 200 && Array.isArray(body?.results)) return { type: 'results', results: body.results };
    if (response.status === 400 && body?.error === 'validation_error') {
      return { type: 'invalid', message: describeIssue(body.details?.[0]) };
    }
    return { type: 'error', message: `The server responded with status ${response.status}.` };
  } catch {
    return { type: 'error', message: 'Could not reach the server. Records stay on this device and will upload later.' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Uploads every `pending_sync` record in batches.
 *
 * Returns the changed records keyed by id (`updated`), so the caller can merge them
 * into whatever the current list is, plus counts and an `error` when the network or
 * server stopped the run. Records not reached stay `pending_sync`.
 *
 * If the server rejects a whole batch as malformed (HTTP 400), the records are resent
 * one at a time so a single bad record cannot block the rest.
 */
export async function syncPending({
  records,
  deviceId,
  baseUrl,
  fetchImpl = globalThis.fetch,
  headers = {},
  timeoutMs = SYNC_TIMEOUT_MS,
  now = new Date()
}) {
  const result = { updated: {}, synced: 0, rejected: 0, deferred: 0, error: null };
  const pending = records.filter(isPending);

  const record = (batch, results) => {
    for (const next of applySyncResults(batch, results, { now })) {
      result.updated[next.recordId] = next;
      if (next.status === 'synced') result.synced += 1;
      else if (next.status === 'rejected') result.rejected += 1;
      else result.deferred += 1;
    }
  };
  const request = (batch) => sendBatch({ batch, deviceId, baseUrl, fetchImpl, headers, timeoutMs });

  for (const batch of chunk(pending)) {
    const outcome = await request(batch);

    if (outcome.type === 'results') {
      record(batch, outcome.results);
    } else if (outcome.type === 'invalid') {
      for (const single of batch) {
        const retry = await request([single]);
        if (retry.type === 'results') {
          record([single], retry.results);
        } else if (retry.type === 'invalid') {
          record([single], [{ id: single.recordId, status: 'rejected', reason: 'validation_failed', message: retry.message, flags: [] }]);
        } else {
          result.error = retry.message;
          return result;
        }
      }
    } else {
      result.error = outcome.message;
      return result;
    }
  }
  return result;
}
