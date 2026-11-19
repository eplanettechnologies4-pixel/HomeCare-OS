import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRosterHours,
  calculateWeeklyBarPercent,
  getDutyStatusConfig,
  getTierChipConfig,
  filterPatientFiles,
  TIER_ORDER,
} from './rosterHelpers.js';

test('formatRosterHours formats decimal hours with h suffix', () => {
  assert.equal(formatRosterHours(8), '8.0h');
  assert.equal(formatRosterHours(12.5), '12.5h');
  assert.equal(formatRosterHours(0), '0.0h');
  assert.equal(formatRosterHours(null), '0.0h');
});

test('calculateWeeklyBarPercent calculates percent and overtime against max hours', () => {
  const norm = calculateWeeklyBarPercent(30, 60);
  assert.equal(norm.percent, 50);
  assert.equal(norm.isOvertime, false);
  assert.equal(norm.remaining, 30.0);

  const full = calculateWeeklyBarPercent(60, 60);
  assert.equal(full.percent, 100);
  assert.equal(full.isOvertime, false);
  assert.equal(full.remaining, 0.0);

  const over = calculateWeeklyBarPercent(72, 60);
  assert.equal(over.percent, 100); // capped at 100%
  assert.equal(over.isOvertime, true);
  assert.equal(over.remaining, 0.0);
});

test('getDutyStatusConfig handles on_duty, standby, off_duty', () => {
  const on = getDutyStatusConfig('On duty');
  assert.equal(on.label, 'On duty');
  assert.equal(on.color, '#059669');

  const standby = getDutyStatusConfig('Standby');
  assert.equal(standby.label, 'Standby');
  assert.equal(standby.color, '#D97706');

  const off = getDutyStatusConfig('Off');
  assert.equal(off.label, 'Off duty');
  assert.equal(off.color, '#4B5563');
});

test('getTierChipConfig maps acute tiers correctly and unclassified is distinct', () => {
  const crit = getTierChipConfig('critical');
  assert.equal(crit.label, 'Critical');
  assert.equal(crit.order, 1);

  const unclass = getTierChipConfig('unclassified');
  assert.equal(unclass.label, 'Unclassified');
  assert.equal(unclass.badge, 'Needs review');
  assert.equal(unclass.order, 4);

  const stable = getTierChipConfig('stable');
  assert.equal(stable.label, 'Stable');
  assert.equal(stable.order, 5);

  assert.notEqual(unclass.order, stable.order);
  assert.deepEqual(TIER_ORDER, ['critical', 'less_critical', 'mild', 'unclassified', 'stable']);
});

test('filterPatientFiles filters patients by name, mr_number, code', () => {
  const pts = [
    { id: 1, name: 'Rashid Minhas', mr_number: 'MR-001', patient_code: 'PT-1' },
    { id: 2, name: 'Fatima Jinnah', mr_number: 'MR-002', patient_code: 'PT-2' },
  ];

  const resName = filterPatientFiles(pts, 'rashid');
  assert.equal(resName.length, 1);
  assert.equal(resName[0].id, 1);

  const resMr = filterPatientFiles(pts, 'MR-002');
  assert.equal(resMr.length, 1);
  assert.equal(resMr[0].id, 2);

  const resEmpty = filterPatientFiles(pts, '');
  assert.equal(resEmpty.length, 2);
});

