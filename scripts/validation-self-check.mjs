import assert from 'node:assert/strict';
import { calculateMortality, classifyMortality, haversineKm, validateRecord } from '../packages/validation/index.js';

const base = {
  record_id: 'self-check-1', state: 'Osun', lga: 'Ife Central', ward: 'Ife Central Ward 1',
  latitude: 7.47895, longitude: 4.57504, gps_accuracy_m: 6, collection_date: '2026-10-08',
  species: 'An. gambiae s.s.', insecticide: 'Pirimiphos-methyl', n_exposed: 100, n_dead: 92,
  larval_density: 12, urban: 0, irs_covered: 1, itn_use_pct: 68.5,
};
const ids = (record, options = {}) => validateRecord(record, { scope: 'device', ...options }).map((x) => x.ruleId);
const serverIds = (record) => validateRecord(record, { scope: 'server', refDate: '2026-10-08' }).map((x) => x.ruleId);

assert.equal(calculateMortality(100, 92), 92);
assert.equal(classifyMortality(89.9), 'Resistant');
assert.equal(classifyMortality(90), 'Possible resistance');
assert.equal(classifyMortality(97.9), 'Possible resistance');
assert.equal(classifyMortality(98), 'Susceptible');
assert.ok(Math.abs(haversineKm(7.48, 4.56, 7.77, 4.56) - 32.1) < 1);

for (const accuracy of [10]) assert.ok(!ids({ ...base, gps_accuracy_m: accuracy }).includes('GPS_accuracy_poor'));
for (const accuracy of [10.1, 50]) assert.ok(ids({ ...base, gps_accuracy_m: accuracy }).includes('GPS_accuracy_poor'));
assert.ok(ids({ ...base, gps_accuracy_m: 50.1 }).includes('GPS_accuracy_unusable'));
assert.ok(ids({ ...base, latitude: 0, longitude: 0 }).includes('GPS_zero_zero'));
assert.ok(ids({ ...base, latitude: 3.9 }).includes('GPS_outside_nigeria'));
assert.ok(ids({ ...base, latitude: 6.5, longitude: 3.2 }).includes('GPS_state_mismatch'));
assert.ok(ids({ ...base, n_dead: 101 }).includes('n_dead_gt_n_exposed'));
assert.ok(ids({ ...base, collection_date: '2026-10-09' }, { refDate: '2026-10-08' }).includes('future_date'));
assert.ok(ids({ ...base, latitude: 7.77, longitude: 4.56 }).includes('GPS_far_from_lga'));
assert.ok(ids({ ...base, record_id: 'self-check-2' }, { existingRecords: [base] }).includes('duplicate'));
assert.ok(serverIds({ ...base, slide_positivity_pct: 101 }).includes('positivity_out_range'));
assert.ok(serverIds({ ...base, temp_c: 50.1 }).includes('temp_implausible'));
assert.ok(serverIds({ ...base, rainfall_mm: 1500.1 }).includes('rainfall_implausible'));

console.log('VECDIM validation self-check: PASS');
console.log('Covered: mortality boundaries, GPS accuracy boundaries, GPS/state/LGA checks, dead/exposed, future dates, duplicates, and server enrichment ranges.');
