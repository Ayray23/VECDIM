import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareParity, parseCsv } from './parity-utils.mjs';

test('CSV parser handles BOM, escaped quotes, commas, and embedded newlines', () => {
  assert.deepEqual(parseCsv('\uFEFFrecord_id,note\r\n1,"field, with ""quotes"""\r\n2,"two\nlines"\r\n'), [
    { record_id: '1', note: 'field, with "quotes"' },
    { record_id: '2', note: 'two\nlines' }
  ]);
});

test('parity comparison aligns by record_id rather than file row order', () => {
  const inputRows = [
    { record_id: 'a', value: 'flagged' },
    { record_id: 'b', value: 'clear' }
  ];
  const expectedRows = [
    { record_id: 'b', rule_a: 'FALSE' },
    { record_id: 'a', rule_a: 'TRUE' }
  ];

  const result = compareParity({
    inputRows,
    expectedRows,
    ruleIds: ['rule_a'],
    validateRow: (row) => row.value === 'flagged' ? [{ ruleId: 'rule_a' }] : []
  });

  assert.equal(result.alignment, 'record_id');
  assert.equal(result.mismatches, 0);
  assert.equal(result.counts.rule_a, 1);
  assert.equal(result.actualFlaggedRecords, 1);
  assert.equal(result.actualCleanedRecords, 1);
  assert.equal(result.expectedFlaggedRecords, 1);
  assert.equal(result.expectedCleanedRecords, 1);
});

test('parity comparison rejects missing rule columns and duplicate record IDs', () => {
  assert.throws(() => compareParity({
    inputRows: [{ record_id: 'a' }],
    expectedRows: [{ record_id: 'a' }],
    ruleIds: ['missing_rule'],
    validateRow: () => []
  }), /missing rule column/);

  assert.throws(() => compareParity({
    inputRows: [{ record_id: 'a' }, { record_id: 'a' }],
    expectedRows: [{ record_id: 'a', rule_a: 'FALSE' }, { record_id: 'b', rule_a: 'FALSE' }],
    ruleIds: ['rule_a'],
    validateRow: () => []
  }), /duplicate record_id/);
});

test('parity comparison reports malformed flag cells and actual mismatches', () => {
  const base = {
    inputRows: [{ record_id: 'a' }],
    ruleIds: ['rule_a'],
    validateRow: () => [{ ruleId: 'rule_a' }]
  };

  assert.throws(() => compareParity({ ...base, expectedRows: [{ record_id: 'a', rule_a: 'yes' }] }), /Invalid boolean value/);
  const result = compareParity({ ...base, expectedRows: [{ record_id: 'a', rule_a: 'FALSE' }] });
  assert.equal(result.mismatches, 1);
  assert.deepEqual(result.examples[0], {
    row: 'record_id=a', rule: 'rule_a', expected: false, actual: true, referenceRow: 2
  });
});

test('aggregate parity totals exclude device-only rules outside the R rule set', () => {
  const result = compareParity({
    inputRows: [{ record_id: 'a' }],
    expectedRows: [{ record_id: 'a', rule_a: 'FALSE' }],
    ruleIds: ['rule_a'],
    validateRow: () => [{ ruleId: 'GPS_accuracy_poor' }]
  });

  assert.equal(result.mismatches, 0);
  assert.equal(result.actualFlaggedRecords, 0);
  assert.equal(result.actualCleanedRecords, 1);
});