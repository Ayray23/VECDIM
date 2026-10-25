import fs from 'node:fs';
import path from 'node:path';
import { RULE_IDS, validateRecord } from '../packages/validation/index.js';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

const root = process.argv[2];
if (!root) {
  console.error('Usage: node scripts/parity-test.mjs <candidate-pack-root>');
  process.exit(2);
}

const dataFile = path.join(root, 'data', 'vecdim_dummy_entomology_data.csv');
const expectedFile = path.join(root, 'outputs', 'validation_flags_all.csv');
if (!fs.existsSync(dataFile) || !fs.existsSync(expectedFile)) {
  console.error('Candidate pack must contain data/vecdim_dummy_entomology_data.csv and outputs/validation_flags_all.csv.');
  console.error('No synthetic data or expected output is copied into this repository.');
  process.exit(2);
}

const rows = parseCsv(fs.readFileSync(dataFile, 'utf8'));
const expected = parseCsv(fs.readFileSync(expectedFile, 'utf8'));
if (rows.length !== 1525 || expected.length !== 1525) {
  console.error(`Expected 1,525 rows in both files; got data=${rows.length}, expected=${expected.length}.`);
  process.exit(1);
}

let mismatches = 0;
const counts = Object.fromEntries(RULE_IDS.map((rule) => [rule, 0]));
for (let index = 0; index < rows.length; index += 1) {
  const actualFlags = new Set(validateRecord(rows[index], { scope: 'server', refDate: '2026-10-08' }).map((flag) => flag.ruleId));
  const expectedRow = expected[index];
  for (const rule of RULE_IDS) {
    const actual = actualFlags.has(rule);
    const wanted = expectedRow[rule] === 'TRUE';
    if (actual) counts[rule] += 1;
    if (actual !== wanted) mismatches += 1;
  }
}

console.log(`rows=${rows.length}`);
console.log(`mismatched_rule_cells=${mismatches}`);
for (const rule of RULE_IDS) console.log(`${rule}=${counts[rule]}`);
if (mismatches > 5) {
  console.error('PARITY FAIL: more than 5 differing rule cells.');
  process.exit(1);
}
console.log('PARITY PASS: within the permitted tolerance.');
