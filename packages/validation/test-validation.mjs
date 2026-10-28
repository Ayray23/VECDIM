import assert from 'node:assert/strict';
import { calculateMortality, classifyMortality, haversineKm, validateRecord } from './index.js';

const base = {
  record_id: '00000000-0000-4000-8000-000000000001',
  state: 'Osun',
  lga: 'Ife Central',
  ward: 'Ife Central Ward 1',
  latitude: 7.47895,
  longitude: 4.57504,
  gps_accuracy_m: 6,
  collection_date: '2026-10-08',
  species: 'An. gambiae s.s.',
  insecticide: 'Pirimiphos-methyl',
  n_exposed: 100,
  n_dead: 92,
  larval_density: 12,
  urban: 0,
  irs_covered: 1,
  itn_use_pct: 68.5,
};

const rules = (record, options = {}) => validateRecord(record, { scope: 'device', ...options }).map((item) => item.ruleId);
const serverRules = (record, options = {}) => validateRecord(record, { scope: 'server', refDate: '2026-10-08', ...options }).map((item) => item.ruleId);

assert.equal(calculateMortality(100, 89.9), 89.9);
assert.equal(classifyMortality(89.9), 'Resistant');
assert.equal(classifyMortality(90.0), 'Possible resistance');
assert.equal(classifyMortality(97.9), 'Possible resistance');
assert.equal(classifyMortality(98.0), 'Susceptible');

assert.ok(Math.abs(haversineKm(7.48, 4.56, 7.77, 4.56) - 32.1) < 1);
assert.ok(!rules(base).includes('GPS_far_from_lga'));

assert.ok(rules({ ...base, gps_accuracy_m: 10 }).every((id) => id !== 'GPS_accuracy_poor' && id !== 'GPS_accuracy_unusable'));
assert.ok(rules({ ...base, gps_accuracy_m: 10.1 }).includes('GPS_accuracy_poor'));
assert.ok(rules({ ...base, gps_accuracy_m: 50 }).includes('GPS_accuracy_poor'));
assert.ok(rules({ ...base, gps_accuracy_m: 50.1 }).includes('GPS_accuracy_unusable'));

assert.ok(rules({ ...base, latitude: 0, longitude: 0 }).includes('GPS_zero_zero'));
assert.ok(rules({ ...base, latitude: 3.9 }).includes('GPS_outside_nigeria'));
assert.ok(rules({ ...base, latitude: 6.5, longitude: 3.2 }).includes('GPS_state_mismatch'));
assert.ok(rules({ ...base, n_dead: 101 }).includes('n_dead_gt_n_exposed'));
assert.ok(rules({ ...base, collection_date: '2026-10-09' }, { refDate: '2026-10-08' }).includes('future_date'));

const farFromIfe = { ...base, state: 'Osun', lga: 'Ife Central', latitude: 7.77, longitude: 4.56 };
assert.ok(rules(farFromIfe).includes('GPS_far_from_lga'));

const duplicate = { ...base, record_id: '00000000-0000-4000-8000-000000000002' };
assert.ok(rules(duplicate, { existingRecords: [base] }).includes('duplicate'));
assert.ok(!rules(base, { existingRecords: [base] }).includes('duplicate'));
assert.ok(rules(duplicate, { existingRecords: [base, { ...base, ward: 'Other Ward' }] }).includes('duplicate'));

// Server-only enrichment rules.
assert.ok(serverRules({ ...base, slide_positivity_pct: 101 }).includes('positivity_out_range'));
assert.ok(serverRules({ ...base, slide_positivity_pct: -0.1 }).includes('positivity_out_range'));
assert.ok(serverRules({ ...base, temp_c: 9.9 }).includes('temp_implausible'));
assert.ok(serverRules({ ...base, temp_c: 50.1 }).includes('temp_implausible'));
assert.ok(serverRules({ ...base, rainfall_mm: -0.1 }).includes('rainfall_implausible'));
assert.ok(serverRules({ ...base, rainfall_mm: 1500.1 }).includes('rainfall_implausible'));

// Server-side missing_core follows the R reference: it depends on NDVI, rainfall, ITN use and species.
const enriched = { ...base, ndvi: 0.42, rainfall_mm: 120 };
assert.ok(!serverRules(enriched).includes('missing_core'));
assert.ok(serverRules(base).includes('missing_core'));
assert.ok(serverRules({ ...enriched, ndvi: null }).includes('missing_core'));
assert.ok(serverRules({ ...enriched, rainfall_mm: '' }).includes('missing_core'));
assert.ok(serverRules({ ...enriched, itn_use_pct: undefined }).includes('missing_core'));
assert.ok(serverRules({ ...enriched, species: '' }).includes('missing_core'));
// CSV missing-value markers (including surrounding whitespace and case variants) must match R NA semantics.
assert.ok(serverRules({ ...enriched, ndvi: 'NA' }).includes('missing_core'));
assert.ok(serverRules({ ...enriched, rainfall_mm: 'NA' }).includes('missing_core'));
assert.ok(serverRules({ ...enriched, itn_use_pct: 'NA' }).includes('missing_core'));
assert.ok(serverRules({ ...enriched, species: 'NA' }).includes('missing_core'));
assert.ok(serverRules({ ...enriched, ndvi: ' n/a ' }).includes('missing_core'));
assert.ok(serverRules({ ...enriched, rainfall_mm: 'NULL' }).includes('missing_core'));
assert.ok(rules({ ...base, species: 'NA' }).includes('missing_core'));

console.log('validation unit tests: PASS');
