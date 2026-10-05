import test from 'node:test';
import assert from 'node:assert/strict';
import { backupDue, latestBackupDeadline, nextBackupDeadline } from '../js/drive-schedule.js';
const time = (s) => Date.parse(s);

test('daily deadline is exactly 11 PM IST regardless of device timezone', () => {
  const deadline = time('2026-10-05T23:00:00+05:30');
  assert.equal(latestBackupDeadline(deadline - 1), deadline - 86400000);
  assert.equal(latestBackupDeadline(deadline), deadline);
  assert.equal(nextBackupDeadline(deadline), deadline + 86400000);
});

test('opening next morning catches up, while a successful backup suppresses repeats', () => {
  const morning = time('2026-10-06T08:00:00+05:30');
  assert.equal(backupDue(time('2026-10-05T22:00:00+05:30'), morning), true);
  assert.equal(backupDue(morning, morning + 60000), false);
  assert.equal(backupDue(morning, time('2026-10-06T22:59:59+05:30')), false);
  assert.equal(backupDue(morning, time('2026-10-06T23:00:00+05:30')), true);
});

test('month and year rollover and several missed days remain due', () => {
  assert.equal(latestBackupDeadline(time('2027-01-01T08:00:00+05:30')), time('2026-12-31T23:00:00+05:30'));
  assert.equal(backupDue(time('2026-09-28T23:05:00+05:30'), time('2026-10-05T08:00:00+05:30')), true);
  assert.equal(backupDue(null, time('2026-10-05T08:00:00+05:30')), true);
});
