import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLINICIAN_ROLE_CONFIG,
  getClinicianConfig,
  normalizeRole,
  canRoleWriteClinical,
  CLINICAL_WRITE_ROLES,
} from './clinicianRoleConfig.js';

describe('Clinician Role Config: Tile Orders & Sidebar Navigation', () => {
  it('enforces single clinical authorship role matrix across frontend and backend', () => {
    // Clinical authorship: doctor prescribes, nurse transcribes orders
    assert.deepEqual(CLINICAL_WRITE_ROLES.doctor_notes, ['doctor']);
    assert.deepEqual(CLINICAL_WRITE_ROLES.prescriptions, ['doctor', 'nurse']);
    assert.deepEqual(CLINICAL_WRITE_ROLES.lab_orders, ['doctor']);
    assert.deepEqual(CLINICAL_WRITE_ROLES.referrals, ['doctor']);
    assert.deepEqual(CLINICAL_WRITE_ROLES.consents, ['doctor']);

    // canRoleWriteClinical checks for prescriptions
    assert.equal(canRoleWriteClinical('doctor', 'prescriptions'), true);
    assert.equal(canRoleWriteClinical('nurse', 'prescriptions'), true);
    assert.equal(canRoleWriteClinical('admin', 'prescriptions'), false);
    assert.equal(canRoleWriteClinical('care_manager', 'prescriptions'), false);

    // Nurse only: nurse_notes, mar_administer
    assert.deepEqual(CLINICAL_WRITE_ROLES.nurse_notes, ['nurse']);
    assert.deepEqual(CLINICAL_WRITE_ROLES.mar_administer, ['nurse']);

    // Nurse only: vitals, intake_output, nurse_notes, mar_administer
    assert.deepEqual(CLINICAL_WRITE_ROLES.vitals, ['nurse']);
    assert.deepEqual(CLINICAL_WRITE_ROLES.intake_output, ['nurse']);

    // canRoleWriteClinical checks
    assert.equal(canRoleWriteClinical('doctor', 'doctor_notes'), true);
    assert.equal(canRoleWriteClinical('nurse', 'doctor_notes'), false);
    assert.equal(canRoleWriteClinical('admin', 'doctor_notes'), false);
    assert.equal(canRoleWriteClinical('care_manager', 'doctor_notes'), false);

    assert.equal(canRoleWriteClinical('nurse', 'nurse_notes'), true);
    assert.equal(canRoleWriteClinical('doctor', 'nurse_notes'), false);

    assert.equal(canRoleWriteClinical('nurse', 'vitals'), true);
    assert.equal(canRoleWriteClinical('doctor', 'vitals'), false);
    assert.equal(canRoleWriteClinical('physiotherapist', 'vitals'), false);
    assert.equal(canRoleWriteClinical('admin', 'vitals'), false);

    assert.equal(canRoleWriteClinical('physiotherapist', 'therapy_notes'), true);
    assert.equal(canRoleWriteClinical('speech_therapist', 'therapy_notes'), true);
    assert.equal(canRoleWriteClinical('psychotherapist', 'therapy_notes'), true);
    assert.equal(canRoleWriteClinical('dietician', 'therapy_notes'), true);
    assert.equal(canRoleWriteClinical('doctor', 'therapy_notes'), false);
    assert.equal(canRoleWriteClinical('admin', 'therapy_notes'), false);
  });
  it('configures Nurse with nursing_notes first and as default tile', () => {
    const cfg = getClinicianConfig('nurse');
    assert.equal(cfg.defaultPatientFileTile, 'nursing_notes');
    assert.equal(cfg.patientFileTiles[0], 'nursing_notes');
    assert.equal(cfg.patientFileTiles[1], 'monitoring');
    assert.ok(cfg.patientFileTiles.includes('medications'));
  });

  it('configures Doctor with doctor_notes first and as default tile', () => {
    const cfg = getClinicianConfig('doctor');
    assert.equal(cfg.defaultPatientFileTile, 'doctor_notes');
    assert.equal(cfg.patientFileTiles[0], 'doctor_notes');
    assert.equal(cfg.patientFileTiles[1], 'nursing_notes');
    assert.equal(cfg.patientFileTiles[2], 'monitoring');
  });

  it('configures Therapists (physio, speech, psychologist, dietician) with rehabilitation_notes first and as default', () => {
    const roles = ['physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician'];
    for (const r of roles) {
      const cfg = getClinicianConfig(r);
      assert.equal(cfg.defaultPatientFileTile, 'rehabilitation_notes', `Default tile mismatch for ${r}`);
      assert.equal(cfg.patientFileTiles[0], 'rehabilitation_notes', `First tile mismatch for ${r}`);
      assert.ok(cfg.patientFileTiles.includes('monitoring'), `Monitoring missing for ${r}`);
    }
  });

  it('normalizes legacy and short role aliases correctly', () => {
    assert.equal(normalizeRole('physio'), 'physiotherapist');
    assert.equal(normalizeRole('speech'), 'speech_therapist');
    assert.equal(normalizeRole('psychologist'), 'psychotherapist');
    assert.equal(normalizeRole('nurse'), 'nurse');
    assert.equal(normalizeRole('doctor'), 'doctor');
  });

  it('does NOT expose legacy patient-chart in sidebar groups for staff roles', () => {
    for (const [roleKey, cfg] of Object.entries(CLINICIAN_ROLE_CONFIG)) {
      const allItemIds = cfg.sidebarGroups.flatMap(g => g.items.map(i => i.id));
      assert.ok(!allItemIds.includes('patient-chart'), `patient-chart unexpectedly in sidebar for ${roleKey}`);
      assert.ok(!allItemIds.includes('nurse-patient-detail'), `nurse-patient-detail unexpectedly in sidebar for ${roleKey}`);
      assert.ok(allItemIds.includes('patient-file'), `patient-file missing from sidebar for ${roleKey}`);
    }
  });

  it('verifies sidebar group order: Overview, Profile (Me / Clinician Profile), then Clinical Care', () => {
    for (const [roleKey, cfg] of Object.entries(CLINICIAN_ROLE_CONFIG)) {
      const titles = cfg.sidebarGroups.map(g => g.title);
      assert.equal(titles[0], 'Overview', `First group for ${roleKey} should be Overview`);
      if (roleKey === 'nurse') {
        assert.equal(titles[1], 'Me', 'Second group for nurse should be Me');
        assert.equal(titles[2], 'Care', 'Third group for nurse should be Care');
      } else {
        assert.equal(titles[1], 'Clinician Profile', `Second group for ${roleKey} should be Clinician Profile`);
      }
    }
  });
});
