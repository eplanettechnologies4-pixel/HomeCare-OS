import test from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineMeters,
  formatElapsedTime,
  getVisitStatusLabel,
} from './visitHelpers.js';

test('haversineMeters returns 0 for identical coords and ~111km per degree lat', () => {
  assert.equal(haversineMeters(24.8607, 67.0011, 24.8607, 67.0011), 0);
  const d = haversineMeters(24.8607, 67.0011, 24.8617, 67.0011);
  assert.ok(d > 105 && d < 120, `Expected ~111m, got ${d}`);
  assert.equal(haversineMeters(null, 67.0, 24.8, 67.0), null);
});

test('formatElapsedTime formats minutes and hours cleanly', () => {
  const base = Date.UTC(2026, 10, 26, 8, 0, 0);
  const iso = new Date(base).toISOString();
  assert.equal(formatElapsedTime(iso, base + 45 * 60000), '45 mins');
  assert.equal(formatElapsedTime(iso, base + 60 * 60000), '1 hr 0 mins');
  assert.equal(formatElapsedTime(iso, base + 135 * 60000), '2 hrs 15 mins');
  assert.equal(formatElapsedTime(iso, base - 5000), '0 mins');
});

test('getVisitStatusLabel handles active, denied, outside area, and ended states', () => {
  assert.equal(getVisitStatusLabel(null).label, 'Not started');
  assert.equal(
    getVisitStatusLabel({ is_ended: false, checkin_verified: true }).label,
    'In progress — location verified',
  );
  assert.equal(
    getVisitStatusLabel({ is_ended: false, checkin_location_denied: true }).tone,
    'warning',
  );
  assert.equal(
    getVisitStatusLabel({ is_ended: false, checkin_outside_area: true }).label,
    'In progress — outside area',
  );
  assert.equal(
    getVisitStatusLabel({ is_ended: false, checkin_low_accuracy: true }).label,
    'In progress — low accuracy',
  );
  assert.equal(
    getVisitStatusLabel({ is_ended: false, checkin_denial_reason: 'location not verified: no patient coordinates' }).label,
    'In progress — no patient coordinates',
  );
  assert.equal(
    getVisitStatusLabel({ is_ended: true, checkin_verified: true }).label,
    'Visit completed',
  );
});

