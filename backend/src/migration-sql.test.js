import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../migrations/', import.meta.url));

// Extracts the pattern from `month ~ '<pattern>'`. Migration SQL is executed with
// standard_conforming_strings on, so the text between the quotes reaches the regex
// engine verbatim (a doubled backslash would match a literal backslash).
async function monthPattern(file) {
  const sql = await readFile(`${dir}${file}`, 'utf8');
  const match = sql.match(/month ~ '([^']+)'/);
  assert.ok(match, `${file} should define a month format check`);
  return new RegExp(match[1]);
}

for (const file of ['005_align_alerts_to_api_contract.sql', '007_fix_alerts_month_check.sql']) {
  test(`${file} month check accepts YYYY-MM and rejects other formats`, async () => {
    const pattern = await monthPattern(file);
    assert.equal(pattern.test('2026-10'), true);
    assert.equal(pattern.test('1999-01'), true);
    assert.equal(pattern.test('2026-1'), false);
    assert.equal(pattern.test('26-10'), false);
    assert.equal(pattern.test('2026-10-05'), false);
    assert.equal(pattern.test('October'), false);
  });
}
