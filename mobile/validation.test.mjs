import assert from 'node:assert/strict';
import { validateRecord } from '../packages/validation/mobile.js';

const validRecord = (overrides = {}) => ({
  recordId: 'record-b',
  state: 'Osun',
  lga: 'Ife Central',
  ward: 'Ife Central Ward 1',
  collectionDate: '2026-01-01',
  species: 'An. gambiae s.s.',
  insecticide: 'Pirimiphos-methyl',
  exposed: '100',
  dead: '90',
  larvalDensity: '1',
  urban: '1',
  irsCovered: true,
  itnUsePercent: '50',
  latitude: '7.48',
  longitude: '4.56',
  gpsAccuracyM: '10',
  status: 'saved',
  ...overrides
});

const ids = (record, existing = []) => validateRecord(record, existing).map((flag) => flag.ruleId);
const messages = (record, existing = []) => validateRecord(record, existing);

for (const accuracy of ['10', '10.0']) {
  assert.equal(ids(validRecord({ gpsAccuracyM: accuracy })).includes('GPS_accuracy_poor'), false, `accuracy ${accuracy} should not warn`);
  assert.equal(ids(validRecord({ gpsAccuracyM: accuracy })).includes('GPS_accuracy_unusable'), false, `accuracy ${accuracy} should not block`);
}
for (const accuracy of ['10.1', '50']) {
  const flags = messages(validRecord({ gpsAccuracyM: accuracy }));
  assert.equal(flags.some((flag) => flag.ruleId === 'GPS_accuracy_poor' && flag.severity === 'Warn'), true, `accuracy ${accuracy} should warn`);
  assert.equal(flags.some((flag) => flag.ruleId === 'GPS_accuracy_unusable'), false, `accuracy ${accuracy} should not block`);
}
{
  const flags = messages(validRecord({ gpsAccuracyM: '50.1' }));
  assert.equal(flags.some((flag) => flag.ruleId === 'GPS_accuracy_unusable' && flag.severity === 'Block'), true, 'accuracy 50.1 should block');
  assert.equal(flags.some((flag) => flag.ruleId === 'GPS_accuracy_poor'), false, 'accuracy 50.1 should not be a warning-only case');
}
{
  const record = validRecord({ recordId: 'VD00002' });
  const earlier = validRecord({ recordId: 'VD00001', status: 'saved' });
  const flags = messages(record, [earlier]);
  assert.equal(flags.some((flag) => flag.ruleId === 'duplicate' && flag.severity === 'Warn'), true, 'matching earlier record should produce a warning');
  assert.equal(flags.some((flag) => flag.severity === 'Block'), false, 'duplicate warning must not block saving');
  const earlierIdIsNotFlagged = ids(earlier, [record]);
  assert.equal(earlierIdIsNotFlagged.includes('duplicate'), false, 'earliest record ID must be retained when only a later duplicate exists');
}
{
  const record = validRecord();
  const rejectedDuplicate = validRecord({ recordId: 'rejected-copy', status: 'rejected' });
  assert.equal(ids(record, [rejectedDuplicate]).includes('duplicate'), false, 'rejected records must not trigger duplicate warning');
}
{
  const flags = messages(validRecord({ gpsAccuracyM: '50.1' }));
  const accuracyFlag = flags.find((flag) => flag.ruleId === 'GPS_accuracy_unusable');
  assert.ok(accuracyFlag.message.includes('recapture'), 'block message should tell user how to fix GPS accuracy');
}
console.log('mobile validation focused tests: PASS');
console.log('Covered: GPS accuracy 10, 10.1, 50, 50.1 m; duplicate warning; rejected duplicate exclusion; block/warn severity and corrective message.');
