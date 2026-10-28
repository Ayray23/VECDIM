import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { LGA_REFERENCE, STATE_BOUNDS, validateRecord } from '../../packages/validation/index.js';
import { toSyncPayload } from '../../mobile/sync.js';
import { fieldRecordSchema } from './records.js';
import { syncBatchSchema, syncFieldRecords, toValidationRecord } from './sync.js';

// A saved record exactly as the mobile app stores it (see makeRecord/saveRecord in mobile/App.js).
function appRecord(state, lga, [latitude, longitude], overrides = {}) {
  return {
    recordId: '00000000-0000-4000-8000-000000000001', state, lga, ward: `${lga} Ward 1`, collectionDate: '2026-10-26',
    species: 'An. gambiae s.s.', insecticide: 'Pirimiphos-methyl', exposed: '100', dead: '92', larvalDensity: '12',
    urban: 'Rural', irsCovered: true, itnUsePercent: '68.5',
    latitude: String(latitude), longitude: String(longitude), gpsAccuracyM: '6',
    status: 'pending_sync', ...overrides
  };
}

const allLgas = Object.entries(LGA_REFERENCE).flatMap(([state, lgas]) => Object.entries(lgas).map(([lga, point]) => [state, lga, point]));

test('every LGA the app offers produces a payload the server schema accepts', () => {
  assert.equal(allLgas.length, 15);
  for (const [state, lga, point] of allLgas) {
    const payload = toSyncPayload(appRecord(state, lga, point));
    const parsed = fieldRecordSchema.safeParse(payload);
    assert.equal(parsed.success, true, `${state}/${lga}: ${parsed.error?.message}`);
    assert.equal(syncBatchSchema.safeParse([payload]).success, true);
  }
});

test('a record the app lets the user save is never blocked by server validation', () => {
  for (const [state, lga, point] of allLgas) {
    for (const urban of ['Urban', 'Rural']) {
      for (const irsCovered of [true, false]) {
        const payload = toSyncPayload(appRecord(state, lga, point, { urban, irsCovered }));
        const flags = validateRecord(toValidationRecord(payload), { scope: 'device', refDate: '2026-10-28' });
        assert.deepEqual(flags, [], `${state}/${lga}/${urban}/${irsCovered}: ${JSON.stringify(flags)}`);
      }
    }
  }
});

test('the full path from app record to stored record accepts a valid record and rejects a bad one', async () => {
  const inserts = [];
  const query = async (sql, params) => {
    if (sql.includes('INSERT INTO field_records')) {
      inserts.push(params);
      return { rows: [{ id: params[0], resubmitted: false }] };
    }
    return { rows: [] };
  };

  const good = appRecord('Osun', 'Iwo', LGA_REFERENCE.Osun.Iwo);
  const bad = appRecord('Osun', 'Iwo', LGA_REFERENCE.Osun.Iwo, { recordId: '00000000-0000-4000-8000-000000000002', gpsAccuracyM: '80' });
  const result = await syncFieldRecords(query, [good, bad].map(toSyncPayload), { now: new Date('2026-10-28T10:00:00Z') });

  assert.deepEqual(result.results.map((item) => item.status), ['synced', 'rejected']);
  assert.ok(result.results[1].flags.some((flag) => flag.ruleId === 'GPS_accuracy_unusable'));
  assert.equal(inserts[0][17], 'synced');
  assert.equal(inserts[1][17], 'rejected');
});

test('mortality rounding in the payload stays within the server limits', () => {
  const payload = toSyncPayload(appRecord('Osun', 'Iwo', LGA_REFERENCE.Osun.Iwo, { exposed: '3', dead: '3' }));
  assert.equal(payload.mortalityPct, 100);
  assert.equal(fieldRecordSchema.safeParse(payload).success, true);
});

// The app keeps its own copy of the reference tables (it cannot import the shared package),
// so this fails if the copies drift apart.
test('the app reference tables match the shared validation package', async () => {
  const source = await readFile(new URL('../../mobile/App.js', import.meta.url), 'utf8');
  const literal = (name) => {
    const match = source.match(new RegExp(`const ${name} = (\\{[\\s\\S]*?\\});`));
    assert.ok(match, `${name} not found in mobile/App.js`);
    return new Function(`return ${match[1]}`)();
  };
  assert.deepEqual(literal('LGA_REFERENCE'), LGA_REFERENCE);
  assert.deepEqual(literal('STATE_BOUNDS'), STATE_BOUNDS);
});
