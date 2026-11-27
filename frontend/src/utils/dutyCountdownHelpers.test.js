import { test } from 'node:test';
import assert from 'node:assert';
import {
  calculateDutyCountdown,
  getShiftCategory,
  formatNextShift,
} from './dutyCountdownHelpers.js';

test('Duty Countdown Helper - Before shift, during shift, after shift', () => {
  const start = new Date('2026-11-26T08:00:00');
  const end = new Date('2026-11-26T16:00:00');

  // 1. Before shift (06:30)
  const before = calculateDutyCountdown(start, end, new Date('2026-11-26T06:30:00'));
  assert.strictEqual(before.status, 'before_shift');
  assert.strictEqual(before.hours_remaining, 1);
  assert.strictEqual(before.minutes_remaining, 30);
  assert.strictEqual(before.formatted_text, 'Starts in 1 hrs 30 mins');

  // 2. During shift (12:15)
  const during = calculateDutyCountdown(start, end, new Date('2026-11-26T12:15:00'));
  assert.strictEqual(during.status, 'on_duty');
  assert.strictEqual(during.hours_remaining, 3);
  assert.strictEqual(during.minutes_remaining, 45);
  assert.strictEqual(during.formatted_text, 'On duty, ends in 3 hrs 45 mins');

  // 3. After shift (16:30)
  const after = calculateDutyCountdown(start, end, new Date('2026-11-26T16:30:00'));
  assert.strictEqual(after.status, 'off_duty');
  assert.strictEqual(after.hours_remaining, 0);
  assert.strictEqual(after.minutes_remaining, 0);
  assert.strictEqual(after.formatted_text, 'Off duty');
});

test('Duty Countdown Helper - Overnight 20:00 to 08:00 checked at 23:00, 03:00 and 09:00', () => {
  const start = new Date('2026-11-26T20:00:00');
  const end = new Date('2026-11-27T08:00:00');

  // Checked at 23:00 (inside overnight shift)
  const at23 = calculateDutyCountdown(start, end, new Date('2026-11-26T23:00:00'));
  assert.strictEqual(at23.status, 'on_duty');
  assert.strictEqual(at23.hours_remaining, 9);
  assert.strictEqual(at23.minutes_remaining, 0);
  assert.strictEqual(at23.formatted_text, 'On duty, ends in 9 hrs 0 mins');

  // Checked at 03:00 (inside overnight shift past midnight)
  const at03 = calculateDutyCountdown(start, end, new Date('2026-11-27T03:00:00'));
  assert.strictEqual(at03.status, 'on_duty');
  assert.strictEqual(at03.hours_remaining, 5);
  assert.strictEqual(at03.minutes_remaining, 0);
  assert.strictEqual(at03.formatted_text, 'On duty, ends in 5 hrs 0 mins');

  // Checked at 09:00 (after overnight shift has ended)
  const at09 = calculateDutyCountdown(start, end, new Date('2026-11-27T09:00:00'));
  assert.strictEqual(at09.status, 'off_duty');
  assert.strictEqual(at09.hours_remaining, 0);
  assert.strictEqual(at09.minutes_remaining, 0);
  assert.strictEqual(at09.formatted_text, 'Off duty');
});

test('Shift category boundaries: 05:59, 06:00, 12:59, 13:00, 19:59, 20:00', () => {
  assert.strictEqual(getShiftCategory('05:59'), 'Night');
  assert.strictEqual(getShiftCategory('06:00'), 'Morning');
  assert.strictEqual(getShiftCategory('12:59'), 'Morning');
  assert.strictEqual(getShiftCategory('13:00'), 'Evening');
  assert.strictEqual(getShiftCategory('19:59'), 'Evening');
  assert.strictEqual(getShiftCategory('20:00'), 'Night');
});

test('Next Shift Helper - handles upcoming shifts and null fallback', () => {
  assert.strictEqual(formatNextShift(null), 'No upcoming shift in published roster');
  assert.strictEqual(formatNextShift(undefined), 'No upcoming shift in published roster');

  const shift1 = {
    date_formatted: 'Fri, 27 Nov 2026',
    shift_name: 'Morning Shift',
    window: '8:00 AM - 4:00 PM',
  };
  assert.strictEqual(formatNextShift(shift1), 'Fri, 27 Nov 2026, Morning Shift (8:00 AM - 4:00 PM)');

  // Duty after midnight
  const shiftAfterMidnight = {
    date_formatted: 'Sat, 28 Nov 2026',
    shift_name: 'Night Shift',
    window: '12:30 AM - 8:30 AM',
  };
  assert.strictEqual(formatNextShift(shiftAfterMidnight), 'Sat, 28 Nov 2026, Night Shift (12:30 AM - 8:30 AM)');
});
