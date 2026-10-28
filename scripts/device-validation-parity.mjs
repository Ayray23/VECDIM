import fs from 'node:fs';
import path from 'node:path';
import { validateRecord } from '../mobile/validation.js';
import { parseCsv } from './parity-utils.mjs';

const root = process.argv[2];
if (!root) { console.error('Usage: node scripts/device-validation-parity.mjs <candidate-pack-root>'); process.exit(2); }
const inputPath = path.join(root, 'data', 'vecdim_dummy_entomology_data.csv');
const referencePath = path.join(root, 'outputs', 'validation_flags_all.csv');
for (const file of [inputPath, referencePath]) { if (!fs.existsSync(file)) { console.error(`Required candidate-pack file not found: ${file}`); process.exit(2); } }
const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'));
const reference = parseCsv(fs.readFileSync(referencePath, 'utf8'));
if (rows.length !== 1525 || reference.length !== 1525) { console.error(`Expected 1,525 input and reference rows; got input=${rows.length}, reference=${reference.length}.`); process.exit(1); }
const referenceById = new Map(reference.map((row) => [row.record_id, row]));
const inputIds = new Set(rows.map((row) => row.record_id));
if (inputIds.size !== rows.length || referenceById.size !== reference.length || rows.some((row) => !referenceById.has(row.record_id))) { console.error('Input and reference records do not have unique, matching record_id values.'); process.exit(1); }
const number = (value) => value === '' || value == null || /^NA$/i.test(value) ? '' : String(value);
const mapped = rows.map((row) => ({ recordId: row.record_id, state: row.state, lga: row.lga, ward: row.ward, collectionDate: row.collection_date, species: row.species, insecticide: row.insecticide, exposed: number(row.n_exposed), dead: number(row.n_dead), larvalDensity: number(row.larval_density), urban: number(row.urban), irsCovered: row.irs_covered === '1' || row.irs_covered === 'TRUE' || row.irs_covered === 'true', itnUsePercent: number(row.itn_use_pct), latitude: number(row.latitude), longitude: number(row.longitude), status: 'saved' }));
const byId = [...mapped].sort((a, b) => a.recordId.localeCompare(b.recordId));
const indexById = new Map(byId.map((record, index) => [record.recordId, index]));
const applicableRules = ['GPS_outside_nigeria', 'GPS_zero_zero', 'GPS_state_mismatch', 'GPS_far_from_lga', 'n_dead_gt_n_exposed', 'future_date', 'duplicate'];
const mismatches = Object.fromEntries(applicableRules.map((rule) => [rule, []]));
let deviceMissingCore = 0; let referenceMissingCore = 0; let missingCoreDisagreements = 0;
const referenceDate = '2026-10-08';
for (const record of mapped) {
  const row = rows.find((item) => item.record_id === record.recordId);
  const expected = referenceById.get(record.recordId);
  const earlierRecords = byId.slice(0, indexById.get(record.recordId));
  const flags = validateRecord(record, earlierRecords, { referenceDate });
  const flagIds = new Set(flags.map((flag) => flag.ruleId));
  for (const rule of applicableRules) { const actual = flagIds.has(rule); const expectedFlag = /^TRUE$/i.test(expected[rule] || ''); if (actual !== expectedFlag) mismatches[rule].push({ record_id: record.recordId, expected: expectedFlag, actual }); }
  const formMissingCore = !record.species || !record.itnUsePercent;
  if (formMissingCore) deviceMissingCore += 1;
  if (/^TRUE$/i.test(expected.missing_core || '')) referenceMissingCore += 1;
  if (formMissingCore !== (!row.species || !number(row.itn_use_pct))) missingCoreDisagreements += 1;
}
console.log(`device_rows=${mapped.length}`); console.log('alignment=record_id');
for (const rule of applicableRules) { console.log(`${rule}=${rows.length - mismatches[rule].length}/${rows.length} matched; mismatches=${mismatches[rule].length}`); for (const item of mismatches[rule].slice(0, 5)) console.log(`  ${item.record_id}: expected=${item.expected}, actual=${item.actual}`); }
console.log(`device_missing_core_required_fields=${deviceMissingCore}`);
console.log(`reference_missing_core_server_enrichment_inclusive=${referenceMissingCore}`);
console.log(`missing_core_field_mapping_disagreements=${missingCoreDisagreements}`);
console.log('GPS accuracy boundary tests are covered separately; accuracy is not present in the reference CSV.');
const totalMismatches = Object.values(mismatches).reduce((sum, list) => sum + list.length, 0);
if (totalMismatches > 0 || missingCoreDisagreements > 0) { console.error(`DEVICE PARITY FAIL: ${totalMismatches} rule-cell mismatches; missing_core mapping disagreements=${missingCoreDisagreements}.`); process.exit(1); }
console.log('DEVICE PARITY PASS: all applicable reference rules match; missing_core uses the device-specific field contract.');
