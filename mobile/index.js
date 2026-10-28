import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import App from './App';

const RECORDS_KEY = '@vecdim/records-v1';
const DEVICE_ID_KEY = '@vecdim/device-id-v1';
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://10.143.115.204:4000/api/v1').replace(/\/$/, '');

function toApiRecord(record) {
  const exposedCount = Number(record.exposed);
  const deadCount = Number(record.dead);
  const mortalityPct = exposedCount > 0 ? (deadCount / exposedCount) * 100 : NaN;
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
    gpsLatitude: Number(record.latitude),
    gpsLongitude: Number(record.longitude),
    gpsAccuracyM: Number(record.gpsAccuracyM),
    larvalDensity: record.larvalDensity === '' ? null : Number(record.larvalDensity),
    urbanRural: String(record.urban).toLowerCase(),
    irs: Boolean(record.irsCovered),
    itnUsePct: record.itnUsePercent === '' ? null : Number(record.itnUsePercent),
    syncStatus: 'pending_sync'
  };
}

async function getDeviceId() {
  const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = Crypto.randomUUID();
  await AsyncStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

async function syncPendingRecords() {
  const raw = await AsyncStorage.getItem(RECORDS_KEY);
  if (!raw) return;

  let records;
  try {
    records = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(records)) return;

  const pending = records.filter((record) => record?.status !== 'draft' && record?.status !== 'synced' && record?.status !== 'rejected');
  if (!pending.length) return;

  const payload = pending.map(toApiRecord);
  if (payload.some((record) => !record.id || !Number.isFinite(record.exposedCount) || !Number.isFinite(record.deadCount) || !Number.isFinite(record.mortalityPct) || !Number.isFinite(record.gpsLatitude) || !Number.isFinite(record.gpsLongitude) || !Number.isFinite(record.gpsAccuracyM))) return;

  const deviceId = await getDeviceId();
  const response = await fetch(`${API_BASE_URL}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: payload, deviceId })
  });

  if (!response.ok) return;
  const body = await response.json();
  if (!Array.isArray(body.results)) return;

  const results = new Map(body.results.map((result) => [result.id, result]));
  const updated = records.map((record) => {
    const result = results.get(record.recordId);
    if (!result) return record;
    if (result.status === 'synced' || result.status === 'already_exists') return { ...record, status: 'synced', syncedAt: new Date().toISOString(), syncBatchId: body.batchId };
    if (result.status === 'rejected') return { ...record, status: 'rejected', rejectionReason: result.reason || 'server_error', rejectionMessage: result.message || 'Record could not be synchronized.' };
    return record;
  });
  await AsyncStorage.setItem(RECORDS_KEY, JSON.stringify(updated));
}

function SyncBootstrap() {
  const run = useCallback(() => syncPendingRecords().catch(() => {}), []);

  useEffect(() => {
    run();
    const timer = setInterval(run, 15000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') run();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [run]);

  return <App />;
}

registerRootComponent(SyncBootstrap);
