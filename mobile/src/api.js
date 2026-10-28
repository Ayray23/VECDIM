const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export function getApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error('Backend URL is not configured. Set EXPO_PUBLIC_API_URL in mobile/.env and restart Expo.');
  }
  return API_BASE_URL;
}

export function toApiRecord(record) {
  const exposedCount = Number(record.exposed);
  const deadCount = Number(record.dead);
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  const accuracy = Number(record.gpsAccuracyM);
  const mortalityPct = exposedCount > 0 ? Math.round((deadCount / exposedCount) * 1000) / 10 : 0;

  return {
    id: record.recordId,
    state: record.state,
    lga: record.lga,
    ward: record.ward,
    collectionDate: record.collectionDate,
    species: record.species,
    insecticide: record.insecticide,
    exposedCount,
    deadCount,
    mortalityPct,
    gpsLatitude: latitude,
    gpsLongitude: longitude,
    gpsAccuracyM: accuracy,
    larvalDensity: record.larvalDensity === '' ? null : Number(record.larvalDensity),
    urbanRural: String(record.urban).toLowerCase(),
    irs: Boolean(record.irsCovered),
    itnUsePct: record.itnUsePercent === '' ? null : Number(record.itnUsePercent),
    syncStatus: 'pending_sync'
  };
}

export async function syncPendingRecords(records, deviceId) {
  const pending = records.filter((record) => record.status === 'pending_sync');
  if (!pending.length) return { results: [], accepted: 0, rejected: 0, outcome: 'empty' };

  const response = await fetch(`${getApiBaseUrl()}/api/v1/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId,
      records: pending.map(toApiRecord)
    })
  });

  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(`Backend returned an invalid response (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    throw new Error(body.message || body.error || `Sync failed (HTTP ${response.status}).`);
  }

  return body;
}
