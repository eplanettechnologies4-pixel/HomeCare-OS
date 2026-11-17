import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPKTHour,
  getPKTGreeting,
  formatPKTTime,
  formatPKTDate,
} from './timeFormatters.js';

describe('Asia/Karachi Time and Greeting Formatters', () => {
  it('formats 13:11 PKT as 01:11:00 PM and returns "Good afternoon"', () => {
    // 13:11 PKT is 08:11 UTC
    const d1311 = new Date('2026-11-14T08:11:00.000Z');
    assert.equal(getPKTHour(d1311), 13);
    assert.equal(getPKTGreeting(d1311), 'Good afternoon');
    assert.equal(formatPKTTime(d1311, { includeSeconds: true }), '01:11:00 PM');
    assert.equal(formatPKTTime(d1311, { includeSeconds: false }), '01:11 PM');
  });

  it('formats 00:05 PKT as 12:05:00 AM and returns "Good evening"', () => {
    // 00:05 PKT is 19:05 UTC previous day
    const d0005 = new Date('2026-11-13T19:05:00.000Z');
    assert.equal(getPKTHour(d0005), 0);
    assert.equal(getPKTGreeting(d0005), 'Good evening');
    assert.equal(formatPKTTime(d0005, { includeSeconds: true }), '12:05:00 AM');
    assert.equal(formatPKTTime(d0005, { includeSeconds: false }), '12:05 AM');
  });

  it('formats 12:00 PKT as 12:00:00 PM and returns "Good afternoon"', () => {
    // 12:00 PKT is 07:00 UTC
    const d1200 = new Date('2026-11-14T07:00:00.000Z');
    assert.equal(getPKTHour(d1200), 12);
    assert.equal(getPKTGreeting(d1200), 'Good afternoon');
    assert.equal(formatPKTTime(d1200, { includeSeconds: true }), '12:00:00 PM');
    assert.equal(formatPKTTime(d1200, { includeSeconds: false }), '12:00 PM');
  });

  it('formats 08:30 PKT as 08:30:00 AM and returns "Good morning"', () => {
    // 08:30 PKT is 03:30 UTC
    const d0830 = new Date('2026-11-14T03:30:00.000Z');
    assert.equal(getPKTHour(d0830), 8);
    assert.equal(getPKTGreeting(d0830), 'Good morning');
    assert.equal(formatPKTTime(d0830, { includeSeconds: true }), '08:30:00 AM');
  });

  it('formats 19:45 PKT as 07:45:00 PM and returns "Good evening"', () => {
    // 19:45 PKT is 14:45 UTC
    const d1945 = new Date('2026-11-14T14:45:00.000Z');
    assert.equal(getPKTHour(d1945), 19);
    assert.equal(getPKTGreeting(d1945), 'Good evening');
    assert.equal(formatPKTTime(d1945, { includeSeconds: true }), '07:45:00 PM');
  });

  it('formats date strictly in Asia/Karachi timezone', () => {
    const d = new Date('2026-11-14T08:11:00.000Z');
    const formatted = formatPKTDate(d);
    assert.match(formatted, /Nov 14, 2026/);
  });
});

