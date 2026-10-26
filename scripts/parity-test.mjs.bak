import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RULE_IDS, validateRecord } from '../packages/validation/index.js';
import { compareParity, parseCsv } from './parity-utils.mjs';

const root = process.argv[2];
if (!root) {
  console.error('Usage: node scripts/parity-test.mjs <candidate-pack-root>');
  process.exit(2);
}

const dataFile = path.join(root, 'data', 'vecdim_dummy_entomology_data.csv');
const expectedFile = path.join(root, 'outputs', 'validation_flags_all.csv');
const referenceScript = path.join(root, 'R', '01_validate_and_clean.R');
if (!fs.existsSync(dataFile)) {
  console.error(`Candidate input data not found: ${dataFile}`);
  process.exit(2);
}

let rows;
try {
  rows = parseCsv(fs.readFileSync(dataFile, 'utf8'));
} catch (error) {
  console.error(`Could not read candidate input CSV: ${error.message}`);
  process.exit(1);
}
if (rows.length !== 1525) {
  console.error(`Expected 1,525 input rows; got ${rows.length}.`);
  process.exit(1);
}

if (!fs.existsSync(expectedFile)) {
  if (!fs.existsSync(referenceScript)) {
    console.error(`Reference output not found: ${expectedFile}`);
    console.error(`Cannot generate it because the supplied R stage is missing: ${referenceScript}`);
    process.exit(2);
  }
  console.log('Reference flags are absent; running the supplied R validation stage...');
  fs.mkdirSync(path.dirname(expectedFile), { recursive: true });
  const result = spawnSync('Rscript', [referenceScript], { cwd: root, encoding: 'utf8' });
  if (result.error) {
    console.error(`Could not run Rscript: ${result.error.message}`);
    console.error('Install R and the candidate pack dependencies, or provide outputs/validation_flags_all.csv.');
    process.exit(2);
  }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0 || !fs.existsSync(expectedFile)) {
    console.error(`The R validation stage did not generate ${expectedFile}.`);
    process.exit(result.status || 1);
  }
}

let expected;
try {
  expected = parseCsv(fs.readFileSync(expectedFile, 'utf8'));
} catch (error) {
  console.error(`Could not read reference CSV: ${error.message}`);
  process.exit(1);
}
if (expected.length !== 1525) {
  console.error(`Expected 1,525 reference rows; got ${expected.length}.`);
  process.exit(1);
}

let comparison;
try {
  const duplicateContext = rows.map((row, index) => ({
    ...row,
    record_id: row.record_id || `parity-row-${index + 1}`
  }));
  comparison = compareParity({
    inputRows: rows,
    expectedRows: expected,
    ruleIds: RULE_IDS,
    validateRow: (_row, index) => validateRecord(duplicateContext[index], {
      scope: 'server',
      refDate: '2026-10-08',
      existingRecords: duplicateContext
    })
  });
} catch (error) {
  console.error(`Parity input error: ${error.message}`);
  process.exit(1);
}

console.log(`rows=${rows.length}`);
console.log(`alignment=${comparison.alignment}`);
console.log(`actual_flagged=${comparison.actualFlaggedRecords}`);
console.log(`actual_cleaned=${comparison.actualCleanedRecords}`);
console.log(`reference_flagged=${comparison.expectedFlaggedRecords}`);
console.log(`reference_cleaned=${comparison.expectedCleanedRecords}`);
console.log(`mismatched_rule_cells=${comparison.mismatches}`);
for (const rule of RULE_IDS) console.log(`${rule}=${comparison.counts[rule]}`);
if (comparison.examples.length) {
  console.error('Mismatch examples:');
  for (const item of comparison.examples) {
    console.error(`  ${item.row} ${item.rule}: expected=${item.expected} actual=${item.actual} (reference CSV line ${item.referenceRow})`);
  }
}
if (comparison.mismatches > 5) {
  console.error('PARITY FAIL: more than 5 differing rule cells.');
  process.exit(1);
}
if (comparison.expectedFlaggedRecords !== 222 || comparison.expectedCleanedRecords !== 1303) {
  console.error('PARITY FAIL: the R reference totals do not match the supplied 222 flagged / 1,303 cleaned records.');
  process.exit(1);
}
if (comparison.actualFlaggedRecords !== 222 || comparison.actualCleanedRecords !== 1303) {
  console.error('PARITY FAIL: validator totals do not match the supplied 222 flagged / 1,303 cleaned records.');
  process.exit(1);
}
console.log(`PARITY PASS: ${comparison.mismatches} differing rule cells (maximum allowed: 5).`);
