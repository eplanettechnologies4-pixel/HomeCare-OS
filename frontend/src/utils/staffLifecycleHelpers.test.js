import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStageBadge,
  isReviewDue,
  calculateProgress,
  checkCanAdvance,
} from './staffLifecycleHelpers.js';

test('getStageBadge returns proper badge config for all lifecycle stages', () => {
  const trainee = getStageBadge('trainee');
  assert.equal(trainee.label, 'Trainee');
  assert.equal(trainee.className, 'badge-blue');

  const probation = getStageBadge('probation');
  assert.equal(probation.label, 'Probation');
  assert.equal(probation.className, 'badge-amber');

  const active = getStageBadge('active');
  assert.equal(active.label, 'Active');
  assert.equal(active.className, 'badge-green');

  const notReviewed = getStageBadge(null);
  assert.equal(notReviewed.label, 'Not reviewed');
  assert.equal(notReviewed.className, 'badge-grey');

  const undefinedStage = getStageBadge(undefined);
  assert.equal(undefinedStage.label, 'Not reviewed');
});

test('isReviewDue returns true when probation_end_date is within 14 days or overdue', () => {
  const today = new Date('2026-08-01');

  // Exactly 14 days away
  assert.equal(isReviewDue('probation', '2026-08-15', today), true);

  // 7 days away
  assert.equal(isReviewDue('probation', '2026-08-08', today), true);

  // Overdue (ended yesterday)
  assert.equal(isReviewDue('probation', '2026-07-31', today), true);

  // 30 days away (not due)
  assert.equal(isReviewDue('probation', '2026-08-31', today), false);

  // Not in probation stage
  assert.equal(isReviewDue('trainee', '2026-08-05', today), false);
  assert.equal(isReviewDue('active', '2026-08-05', today), false);
  assert.equal(isReviewDue(null, '2026-08-05', today), false);
});

test('calculateProgress properly counts verified and waived requirements', () => {
  const reqs = [
    { requirement_type: { gate: 'trainee_to_probation', is_active: true, kind: 'document', required_count: 1 }, status: 'verified' },
    { requirement_type: { gate: 'trainee_to_probation', is_active: true, kind: 'document', required_count: 1 }, status: 'waived' },
    { requirement_type: { gate: 'trainee_to_probation', is_active: true, kind: 'document', required_count: 1 }, status: 'pending' },
    {
      requirement_type: { gate: 'trainee_to_probation', is_active: true, kind: 'document', required_count: 2 },
      status: 'verified',
      documents: [{ is_current: true }, { is_current: true }]
    },
  ];

  const progress = calculateProgress(reqs, 'trainee_to_probation');
  assert.equal(progress.total, 4);
  assert.equal(progress.completed, 3);
  assert.equal(progress.label, 'Docs 3/4');
  assert.equal(progress.percentage, 75);
});

test('checkCanAdvance blocks when requirements are missing or count not met', () => {
  const incompleteReqs = [
    { label: 'ID Card', gate: 'trainee_to_probation', is_active: true, status: 'verified', kind: 'document', required_count: 1 },
    { label: 'Blood Tests', gate: 'trainee_to_probation', is_active: true, status: 'pending', kind: 'document', required_count: 1 },
    {
      label: 'Guardian ID',
      gate: 'trainee_to_probation',
      is_active: true,
      status: 'verified',
      kind: 'document',
      required_count: 2,
      documents: [{ is_current: true }] // only 1 of 2
    },
  ];

  const result1 = checkCanAdvance('trainee', incompleteReqs);
  assert.equal(result1.canAdvance, false);
  assert.equal(result1.missing.length, 2);
  assert.ok(result1.missing.includes('Blood Tests'));
  assert.ok(result1.missing.some(m => m.includes('Guardian ID')));

  // When all satisfied
  const completedReqs = [
    { label: 'ID Card', gate: 'trainee_to_probation', is_active: true, status: 'verified', kind: 'document', required_count: 1 },
    { label: 'Blood Tests', gate: 'trainee_to_probation', is_active: true, status: 'waived', kind: 'document', required_count: 1 },
    {
      label: 'Guardian ID',
      gate: 'trainee_to_probation',
      is_active: true,
      status: 'verified',
      kind: 'document',
      required_count: 2,
      documents: [{ is_current: true }, { is_current: true }]
    },
  ];

  const result2 = checkCanAdvance('trainee', completedReqs);
  assert.equal(result2.canAdvance, true);
  assert.equal(result2.missing.length, 0);
});

