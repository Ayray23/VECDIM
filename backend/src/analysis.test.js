import test from 'node:test';
import assert from 'node:assert/strict';
import { recordsToCsv } from './analysis.js';

test('recordsToCsv preserves record fields and escapes CSV values', () => {
  const csv = recordsToCsv([
    { record_id: 'r1', state: 'Osun', note: 'A, B' },
    { record_id: 'r2', state: 'Oyo', note: 'plain' }
  ]);

  assert.equal(csv, 'record_id,state,note\nr1,Osun,"A, B"\nr2,Oyo,plain\n');
});

test('recordsToCsv rejects a non-array input', () => {
  assert.throws(() => recordsToCsv(null), /records must be an array/);
});
