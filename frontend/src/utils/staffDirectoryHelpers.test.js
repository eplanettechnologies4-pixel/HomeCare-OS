import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLiveStatusBadge,
  canAssignPatient,
  canScheduleDuty,
  filterAndSortStaff,
  paginateStaff,
} from './staffDirectoryHelpers.js';

test('getLiveStatusBadge returns correct badge metadata', () => {
  assert.equal(getLiveStatusBadge('available').status, 'available');
  assert.equal(getLiveStatusBadge('available').label, 'Available');
  assert.equal(getLiveStatusBadge('available').className, 'badge-green');

  assert.equal(getLiveStatusBadge('on_duty_now').status, 'on_duty_now');
  assert.equal(getLiveStatusBadge('on_duty_now').label, 'On duty now');
  assert.equal(getLiveStatusBadge('on_duty_now').className, 'badge-teal');

  assert.equal(getLiveStatusBadge('off_duty').status, 'off_duty');
  assert.equal(getLiveStatusBadge('off_duty').label, 'Off duty');
  assert.equal(getLiveStatusBadge('off_duty').className, 'badge-grey');

  // Inactive overrides everything
  assert.equal(getLiveStatusBadge('on_duty_now', false).status, 'inactive');
  assert.equal(getLiveStatusBadge('on_duty_now', false).label, 'Inactive');
  assert.equal(getLiveStatusBadge('on_duty_now', false).className, 'badge-red');
});

test('canAssignPatient enforces clinical and lifecycle checks', () => {
  // Trainee blocked
  const trainee = { role: 'nurse', lifecycle_stage: 'trainee', is_active: true };
  assert.equal(canAssignPatient(trainee).allowed, false);
  assert.match(canAssignPatient(trainee).reason, /Trainees cannot be assigned/);

  // Non-clinical blocked
  const accountant = { role: 'accountant', lifecycle_stage: 'active', is_active: true };
  assert.equal(canAssignPatient(accountant).allowed, false);
  assert.match(canAssignPatient(accountant).reason, /Non-clinical/);

  // Inactive staff blocked
  const inactiveNurse = { role: 'nurse', lifecycle_stage: 'active', is_active: false };
  assert.equal(canAssignPatient(inactiveNurse).allowed, false);
  assert.match(canAssignPatient(inactiveNurse).reason, /inactive/);

  // Active nurse allowed
  const activeNurse = { role: 'nurse', lifecycle_stage: 'active', is_active: true };
  assert.equal(canAssignPatient(activeNurse).allowed, true);

  // Active doctor allowed
  const doctor = { role: 'doctor', lifecycle_stage: 'active', is_active: true };
  assert.equal(canAssignPatient(doctor).allowed, true);

  // Active care manager allowed
  const careMgr = { role: 'care_manager', lifecycle_stage: 'active', is_active: true };
  assert.equal(canAssignPatient(careMgr).allowed, true);

  // canScheduleDuty checks
  assert.equal(canScheduleDuty(trainee).allowed, true);
  assert.equal(canScheduleDuty(accountant).allowed, false);
  assert.equal(canScheduleDuty(inactiveNurse).allowed, false);
  assert.equal(canScheduleDuty(activeNurse).allowed, true);
});

test('filterAndSortStaff filters by search, role, stage, status and sorts', () => {
  const staffList = [
    { id: 1, full_name: 'Zahid Khan', role: 'nurse', role_display: 'Nurse', lifecycle_stage: 'active', live_status: 'available', is_active: true },
    { id: 2, full_name: 'Amina Ali', role: 'doctor', role_display: 'Doctor', lifecycle_stage: 'trainee', live_status: 'off_duty', is_active: true },
    { id: 3, full_name: 'Bilal Ahmed', role: 'nurse', role_display: 'Nurse', lifecycle_stage: 'probation', live_status: 'on_duty_now', is_active: true },
    { id: 4, full_name: 'Danyal Tariq', role: 'accountant', role_display: 'Accountant', lifecycle_stage: 'active', live_status: 'inactive', is_active: false },
  ];

  // Search
  const searchRes = filterAndSortStaff(staffList, { search: 'amina' });
  assert.equal(searchRes.length, 1);
  assert.equal(searchRes[0].full_name, 'Amina Ali');

  // Filter role
  const roleRes = filterAndSortStaff(staffList, { role: 'nurse' });
  assert.equal(roleRes.length, 2);

  // Filter stage
  const stageRes = filterAndSortStaff(staffList, { stage: 'trainee' });
  assert.equal(stageRes.length, 1);
  assert.equal(stageRes[0].full_name, 'Amina Ali');

  // Filter status
  const statusRes = filterAndSortStaff(staffList, { status: 'on_duty_now' });
  assert.equal(statusRes.length, 1);
  assert.equal(statusRes[0].full_name, 'Bilal Ahmed');

  // Sort ascending by name
  const sortAsc = filterAndSortStaff(staffList, { sortField: 'full_name', sortOrder: 'asc' });
  assert.equal(sortAsc[0].full_name, 'Amina Ali');
  assert.equal(sortAsc[3].full_name, 'Zahid Khan');

  // Sort descending by name
  const sortDesc = filterAndSortStaff(staffList, { sortField: 'full_name', sortOrder: 'desc' });
  assert.equal(sortDesc[0].full_name, 'Zahid Khan');
  assert.equal(sortDesc[3].full_name, 'Amina Ali');
});

test('paginateStaff properly slices items with bounded pages', () => {
  const items = Array.from({ length: 35 }, (_, i) => ({ id: i + 1 }));
  const p1 = paginateStaff(items, 1, 10);
  assert.equal(p1.items.length, 10);
  assert.equal(p1.total, 35);
  assert.equal(p1.totalPages, 4);
  assert.equal(p1.currentPage, 1);

  const p4 = paginateStaff(items, 4, 10);
  assert.equal(p4.items.length, 5);
  assert.equal(p4.currentPage, 4);

  // Page out of bounds clamps to last page
  const pExcess = paginateStaff(items, 99, 10);
  assert.equal(pExcess.currentPage, 4);
});
