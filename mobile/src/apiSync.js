import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const RECORDS_KEY = '@vecdim/records-v1';

function normalizeRecord(record) {
  return {
    recordId: record.recordId,
    state: record.state,
    lga: record.lga,
    ward: record.ward,
    collectionDate: record.collectionDate,
    species: record.species,
    insecticide: record.insecticide,
    exposed: Number(record.exposed),
    dead: Number(record.dead),
    larvalDensity: Number(record.larvalDensity),
    urban: record.urban,
    irsCovered: Boolean(record.irsCovered),
    itnUsePercent: Number(record.itnUsePercent),
    latitude: Number(record.latitude),
    longitude: Number(record.longitude),
    gpsAccuracyM: Number(record.gpsAccuracyM),
    validationFlags: Array.isArray(record.validationFlags) ? record.validationFlags : [],
    capturedAt: record.capturedAt,
    savedAt: record.savedAt,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok) {
    const error = new Error(body?.message || body?.error || `Backend request failed (${response.status})`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

export async function syncPendingRecords() {
  const raw = await AsyncStorage.getItem(RECORDS_KEY);
  const records = raw ? JSON.parse(raw) : [];
  const pending = records.filter((record) => record.status === 'pending_sync' || record.status === 'rejected');
  if (!pending.length) return { attempted: 0, synced: 0, rejected: 0, alreadyExists: 0 };

  const result = await request('/sync', {
    method: 'POST',
    body: JSON.stringify({ records: pending.slice(0, 100).map(normalizeRecord) }),
  });

  const outcomes = new Map((result.results || []).map((item) => [item.recordId, item]));
  const nextRecords = records.map((record) => {
    const outcome = outcomes.get(record.recordId);
    if (!outcome) return record;
    if (outcome.status === 'synced' || outcome.status === 'already_exists') {
      return { ...record, status: 'synced', syncedAt: new Date().toISOString(), syncError: null };
    }
    return { ...record, status: 'rejected', syncError: outcome.message || outcome.error || 'Server rejected this record.' };
  });

  await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(nextRecords));
  return { attempted: pending.length, synced: nextRecords.filter((r) => pending.some((p) => p.recordId === r.recordId) && r.status === 'synced').length, rejected: nextRecords.filter((r) => pending.some((p) => p.recordId === r.recordId) && r.status === 'rejected').length, alreadyExists: (result.results || []).filter((r) => r.status === 'already_exists').length, results: result.results || [] };
}

export async function checkBackendHealth() {
  const base = API_BASE_URL.replace(/\/api\/v1\/?$/, '');
  const response = await fetch(`${base}/health`);
  return response.ok ? response.json() : null;
}
