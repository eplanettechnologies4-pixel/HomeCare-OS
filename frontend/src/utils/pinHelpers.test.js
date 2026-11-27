import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizePinInput,
  isValidSixDigitPin,
  getPinStatusMeta,
  getUnlockCountdown,
  buildDutyPinShareMessage,
} from './pinHelpers.js';

test('sanitizePinInput strips non-digits and limits to 6 digits', () => {
  assert.equal(sanitizePinInput('12a3-45678'), '123456');
  assert.equal(sanitizePinInput(''), '');
  assert.equal(sanitizePinInput(null), '');
});

test('isValidSixDigitPin validates exactly 6 digits', () => {
  assert.equal(isValidSixDigitPin('123456'), true);
  assert.equal(isValidSixDigitPin('12345'), false);
  assert.equal(isValidSixDigitPin('12345a'), false);
});

test('getPinStatusMeta returns expected badges', () => {
  assert.equal(getPinStatusMeta('active').label, 'Active');
  assert.equal(getPinStatusMeta('locked_out').label, 'Locked Out');
  assert.equal(getPinStatusMeta('revoked').label, 'Revoked');
  assert.equal(getPinStatusMeta('expired').label, 'Expired');
});

test('getUnlockCountdown detects 5-minute warning and expiry', () => {
  const now = Date.UTC(2026, 10, 27, 10, 0, 0);
  const in4m = new Date(now + 4 * 60000).toISOString();
  const res4 = getUnlockCountdown(in4m, now);
  assert.equal(res4.expired, false);
  assert.equal(res4.remainingMinutes, 4);
  assert.equal(res4.showWarning, true);

  const in10m = new Date(now + 10 * 60000).toISOString();
  const res10 = getUnlockCountdown(in10m, now);
  assert.equal(res10.showWarning, false);

  const past = new Date(now - 1000).toISOString();
  assert.equal(getUnlockCountdown(past, now).expired, true);
});

test('buildDutyPinShareMessage includes date, shift, and PIN without patient name', () => {
  const msg = buildDutyPinShareMessage({
    date: '2026-11-28',
    shiftLabel: 'Morning Shift',
    pin: '654321',
  });
  assert.match(msg, /2026-11-28/);
  assert.match(msg, /Morning Shift/);
  assert.match(msg, /654321/);
});

