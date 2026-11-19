import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAllergens, getAllergyInfo } from './allergyHelpers.js';

test('getAllergyInfo returns not_recorded for empty, null or not_recorded status', () => {
  const cases = [null, undefined, '', 'not_recorded', 'UNKNOWN'];
  for (const c of cases) {
    const info = getAllergyInfo(c);
    assert.equal(info.status, 'not_recorded');
    assert.equal(info.label, 'Allergies not recorded');
    assert.equal(info.badgeClass.includes('amber'), true);
    assert.equal(info.hasAllergens, false);
  }
});

test('getAllergyInfo returns nkda only when explicitly nkda', () => {
  const info = getAllergyInfo('nkda');
  assert.equal(info.status, 'nkda');
  assert.equal(info.label, 'NKDA');
  assert.equal(info.badgeClass.includes('emerald'), true);
  assert.equal(info.hasAllergens, false);
});

test('getAllergyInfo returns has_allergies with parsed allergens', () => {
  const info = getAllergyInfo('has_allergies', 'Penicillin, Aspirin\nSulfa');
  assert.equal(info.status, 'has_allergies');
  assert.equal(info.label, 'Allergies');
  assert.equal(info.hasAllergens, true);
  assert.equal(info.missingDetails, false);
  assert.deepEqual(info.allergens, ['Penicillin', 'Aspirin', 'Sulfa']);
  assert.equal(info.badgeClass.includes('rose'), true);
});

test('getAllergyInfo returns missing details when has_allergies but empty text', () => {
  const info = getAllergyInfo('has_allergies', '');
  assert.equal(info.status, 'has_allergies');
  assert.equal(info.label, 'Allergies - details missing');
  assert.equal(info.missingDetails, true);
  assert.equal(info.allergens.length, 0);
  assert.equal(info.badgeClass.includes('rose'), true);
});

test('parseAllergens handles delimiters and filters out noise', () => {
  const text = 'Peanuts; Shellfish, Dust\nNKDA, None';
  const parsed = parseAllergens(text);
  assert.deepEqual(parsed, ['Peanuts', 'Shellfish', 'Dust']);
});

