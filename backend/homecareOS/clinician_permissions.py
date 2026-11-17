"""
HomeCare OS — Clinician Portal Permissions, Roles & Audit Engine
=================================================================
Mirrors frontend clinicianRoleConfig to enforce strict object-level security,
per-tab read/write permissions, immutable entry rules, and PHI-free audit logging.

================================================================================
CLINICAL DEFINITIONS & CONFIDENTIALITY RULES (PHASE 1)
================================================================================
1. "Treating Doctor" Definition:
   A user linked to an active StaffMember with role 'doctor' who has an assigned,
   in-progress, or upcoming non-cancelled Booking for this patient within the
   clinical access window (or is explicitly designated as the primary doctor).

2. "Care Manager" Definition:
   A staff member with role 'care_manager' who is explicitly assigned to this
   specific patient as patient.assigned_care_manager. An unassigned care manager
   does NOT have treating privileges for patients they do not manage.

3. Psychotherapy Notes Confidentiality Rule:
   Psychotherapy notes are strictly restricted clinical documents.
   Visible ONLY to:
     a) The author psychotherapist (note.author) or assigned psychotherapist
     b) The patient's treating doctor (is_treating_doctor_for_patient)
     c) The patient's assigned care manager (is_care_manager_for_patient)
     d) System administrators (super_admin, admin) for regulatory oversight
   EXPLICITLY DENIED:
     - Nurses (registered nurses, nursing assistants)
     - Physiotherapists
     - Speech therapists
     - Non-assigned care managers (care managers not assigned to this patient)
     - Non-treating doctors (doctors without an active booking for this patient)

4. Addendum Rights Rule:
   Once a clinical entry (DoctorNote, PhysioNote, TherapyNote, ClinicalConsent)
   is digitally signed, it is permanently locked against direct editing or deletion.
   Later updates must be appended as an addendum.
   Who may add an addendum:
     - The original author of the entry
     - The patient's assigned treating doctor
     - The patient's assigned care manager
   All other roles (another doctor, a nurse, unassigned clinicians) get 403 or 404.
================================================================================
"""
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.models import AuditLog


ROLE_ALIASES = {
    'physio': 'physiotherapist',
    'physiotherapist': 'physiotherapist',
    'speech': 'speech_therapist',
    'speech_therapist': 'speech_therapist',
    'psychologist': 'psychotherapist',
    'psychotherapist': 'psychotherapist',
    'nurse': 'nurse',
    'nursing_assistant': 'nurse',
    'doctor': 'doctor',
    'dietician': 'dietician',
    'nutritionist': 'dietician',
}


def normalize_clinical_role(role):
    """Normalizes role strings to canonical clinician portal keys."""
    if not role:
        return None
    r = str(role).strip().lower()
    return ROLE_ALIASES.get(r, r)


# ==============================================================================
# CLINICAL AUTHORSHIP & WRITE ROLES MATRIX (SINGLE SOURCE OF TRUTH)
# ==============================================================================
# A signed or recorded clinical entry means the logged-in user is the author.
# Admin, super_admin, and care_manager can READ clinical records (within scoping)
# but CANNOT create or sign clinical entries (doctor notes, prescriptions, lab orders,
# referrals, consents, therapy notes, nursing notes, vitals, or MAR administrations).
CLINICAL_WRITE_ROLES = {
    'doctor_notes': ('doctor',),       # Assigned treating doctor only
    'prescriptions': ('doctor', 'nurse'), # Doctor (prescribe) or Nurse (transcribed order)
    'lab_orders': ('doctor',),         # Doctor only
    'referrals': ('doctor',),          # Doctor only
    'consents': ('doctor',),           # Doctor only
    'therapy_notes': {
        'physiotherapy': ('physiotherapist',),
        'speech_therapy': ('speech_therapist',),
        'psychotherapy': ('psychotherapist',),
        'dietetics': ('dietician',),
        'nutrition': ('dietician',),
    },
    'therapy_notes_all': ('physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician'),
    'vitals': ('nurse', 'doctor'),     # Nurse and doctor
    'intake_output': ('nurse', 'doctor'), # Nurse and doctor
    'nurse_notes': ('nurse',),         # Nurse only
    'mar_administer': ('nurse',),      # Nurse only
    # Management actions (unchanged):
    'active_complaint': ('doctor', 'care_manager', 'admin', 'super_admin'),
    'history_care_plan': ('doctor', 'care_manager', 'admin', 'super_admin'),
    'scheduled_items': ('doctor', 'care_manager', 'admin', 'super_admin'),
    'scheduled_items_mark_done': {
        'procedure': ('nurse', 'doctor', 'care_manager', 'admin', 'super_admin'),
        'blood_test': ('nurse', 'doctor', 'care_manager', 'admin', 'super_admin'),
        'appointment': ('physiotherapist', 'speech_therapist', 'psychotherapist', 'dietician', 'doctor', 'care_manager', 'admin', 'super_admin'),
    },
    'addendum': ('author', 'treating_doctor', 'assigned_care_manager', 'super_admin', 'admin'),
}


TAB_TO_WRITE_ACTION = {
    'doctor_notes': 'doctor_notes',
    'prescriptions': 'prescriptions',
    'consents': 'consents',
    'referrals': 'referrals',
    'lab_results': 'lab_orders',
    'vital_charts': 'vitals',
    'nursing_notes': 'nurse_notes',
    'physiotherapy': 'therapy_notes',
}


def check_clinical_write_permission(user, action_key, discipline=None, patient=None):
    """
    Validates whether the user has authorization to perform a clinical write action.
    Enforces that the logged-in user matches the authorized clinical authorship role.
    Admin, super_admin, and care_manager cannot create or sign clinical entries.
    """
    if not user or not user.is_authenticated:
        return False, "Authentication required."

    from homecareOS.permissions import get_user_role
    raw_role = get_user_role(user)
    role = normalize_clinical_role(raw_role)

    # Non-clinical support roles are always denied
    if raw_role in ('accountant', 'crm_executive', 'patient_family', 'family') or role in ('accountant', 'crm_executive', 'patient_family', 'family'):
        return False, f"Role '{raw_role}' is not authorized for clinical writes."

    # Management actions
    if action_key in ('active_complaint', 'history_care_plan', 'scheduled_items'):
        allowed = CLINICAL_WRITE_ROLES.get(action_key, ())
        if raw_role in allowed or role in allowed:
            return True, ""
        return False, f"Role '{raw_role}' is not authorized to perform management action '{action_key}'."

    # Clinical entries: admin, super_admin, care_manager, branch_manager are strictly DENIED
    if raw_role in ('super_admin', 'admin', 'care_manager', 'branch_manager') or role in ('super_admin', 'admin', 'care_manager', 'branch_manager'):
        return False, f"Role '{raw_role}' cannot create or sign clinical entries ({action_key})."

    if action_key == 'therapy_notes':
        if not discipline:
            if role in CLINICAL_WRITE_ROLES['therapy_notes_all']:
                return True, ""
            return False, f"Role '{role}' is not authorized to write therapy notes."
        disc = str(discipline).lower().strip()
        if disc in ('physio', 'physiotherapy'):
            disc = 'physiotherapy'
        elif disc in ('speech', 'speech_therapy'):
            disc = 'speech_therapy'
        elif disc in ('psych', 'psychotherapy', 'psychology'):
            disc = 'psychotherapy'
        elif disc in ('dietetics', 'nutrition', 'dietitian', 'dietician'):
            disc = 'dietetics'
        allowed_roles = CLINICAL_WRITE_ROLES['therapy_notes'].get(disc, ())
        if not allowed_roles and disc in ('dietetics', 'nutrition'):
            allowed_roles = ('dietician',)
        if role in allowed_roles:
            return True, ""
        return False, f"Role '{role}' is not authorized to write {discipline} therapy notes."

    allowed = CLINICAL_WRITE_ROLES.get(action_key, ())
    if role not in allowed and raw_role not in allowed:
        return False, f"Role '{role}' is not authorized to create or sign '{action_key}'. Allowed: {', '.join(allowed)}."

    # Doctor note scoping check: must be assigned treating doctor within time window
    if action_key == 'doctor_notes' and patient is not None:
        from patients.scoping import is_treating_doctor_for_patient
        if not is_treating_doctor_for_patient(user, patient):
            return False, "Only the assigned treating doctor within the active care window may create or sign doctor notes."

    # Doctor prescribing check: must be assigned treating doctor within time window
    if action_key == 'prescriptions' and role == 'doctor' and patient is not None:
        from patients.scoping import is_treating_doctor_for_patient
        if not is_treating_doctor_for_patient(user, patient):
            return False, "Only the assigned treating doctor within the active care window may prescribe medication."

    return True, ""


def enforce_clinical_write_permission(user, action_key, discipline=None, patient=None):
    """Raises PermissionDenied if check_clinical_write_permission is False."""
    allowed, msg = check_clinical_write_permission(user, action_key, discipline=discipline, patient=patient)
    if not allowed:
        raise PermissionDenied(msg)


# Target rights matrix per user requirements
ROLE_CHART_RIGHTS = {
    'doctor': {
        'medical_records': 'write',
        'doctor_notes': 'write',
        'consents': 'write',
        'procedures': 'write',
        'referrals': 'write',
        'prescriptions': 'write',
        'nursing_notes': 'read',
        'physiotherapy': 'read',
        'vital_charts': 'write',
        'lab_results': 'write',  # order labs
    },
    'physiotherapist': {
        'medical_records': 'read',
        'doctor_notes': 'read',
        'consents': 'read',
        'procedures': 'read',
        'referrals': 'read',
        'prescriptions': 'read',  # no prescribing
        'nursing_notes': 'read',
        'physiotherapy': 'write',  # their own therapy notes and plan
        'vital_charts': 'read',
        'lab_results': 'read',
    },
    'speech_therapist': {
        'medical_records': 'read',
        'doctor_notes': 'read',
        'consents': 'read',
        'procedures': 'read',
        'referrals': 'read',
        'prescriptions': 'read',  # no prescribing
        'nursing_notes': 'read',
        'physiotherapy': 'write',  # their own speech therapy notes and plan
        'vital_charts': 'read',
        'lab_results': 'read',
    },
    'psychotherapist': {
        'medical_records': 'read',
        'doctor_notes': 'read',
        'consents': 'read',
        'procedures': 'read',
        'referrals': 'read',
        'prescriptions': 'read',  # no prescribing
        'nursing_notes': 'read',
        'physiotherapy': 'write',  # their own psychotherapy notes and plan
        'vital_charts': 'read',
        'lab_results': 'read',
    },
    'nurse': {
        'medical_records': 'read',
        'doctor_notes': 'read',
        'consents': 'read',
        'procedures': 'write',  # send requests
        'referrals': 'read',
        'prescriptions': 'read',  # only MAR administer
        'nursing_notes': 'write',  # vitals, intake/output, nursing notes
        'physiotherapy': 'read',
        'vital_charts': 'write',
        'lab_results': 'read',
    },
    'dietician': {
        'medical_records': 'read',
        'doctor_notes': 'read',
        'consents': 'read',
        'procedures': 'read',
        'referrals': 'read',
        'prescriptions': 'read',
        'nursing_notes': 'read',
        'physiotherapy': 'write', # own dietetic notes
        'vital_charts': 'read',
        'lab_results': 'read',
    },
}


def can_user_access_chart_tab(user, tab_name, action='read'):
    """
    Validates whether the user is permitted to read or write a given patient chart tab.
    Admin / super_admin / care_manager bypass with full read rights, but CANNOT
    write or sign clinical entries.
    """
    if not user or not user.is_authenticated:
        return False

    from homecareOS.permissions import get_user_role
    role = get_user_role(user)

    if action == 'read':
        if user.is_superuser:
            return True
        if role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return True

        canonical = normalize_clinical_role(role)
        if not canonical or canonical not in ROLE_CHART_RIGHTS:
            return False

        allowed_level = ROLE_CHART_RIGHTS[canonical].get(tab_name)
        if not allowed_level:
            return False
        return allowed_level in ('read', 'write')

    elif action == 'write':
        # Admin, super_admin, care_manager cannot create or sign clinical entries
        if tab_name in TAB_TO_WRITE_ACTION:
            action_key = TAB_TO_WRITE_ACTION[tab_name]
            allowed, _ = check_clinical_write_permission(user, action_key)
            return allowed
        if tab_name == 'procedures':
            canonical = normalize_clinical_role(role)
            return canonical in ('doctor', 'nurse')

        canonical = normalize_clinical_role(role)
        if not canonical or canonical not in ROLE_CHART_RIGHTS:
            return False
        return ROLE_CHART_RIGHTS[canonical].get(tab_name) == 'write'

    return False


def enforce_tab_permission(user, tab_name, action='read'):
    """Raises PermissionDenied if user does not have permission for the chart tab."""
    if not can_user_access_chart_tab(user, tab_name, action=action):
        raise PermissionDenied(f"Your role is not authorized to {action} the '{tab_name}' chart section.")


def validate_entry_immutability(instance):
    """
    Immutable clinical entries rule:
    Signing locks an entry. Later changes are rejected.
    Updates must be submitted as addenda.
    """
    if getattr(instance, 'is_signed', False):
        raise ValidationError({
            'detail': 'Signed clinical entries are immutable and locked against direct edits. Submit an addendum with an audit reason instead.'
        })


def can_user_add_addendum(user, patient, entry):
    """
    Validates who may add an addendum to a signed clinical entry:
      1. Original author of the entry
      2. Patient's assigned treating doctor
      3. Patient's assigned care manager
    All others (another doctor, nurse, unassigned clinician) return False.
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True

    staff = getattr(user, 'staffmember', None)
    if not staff:
        return False

    # 1. Original author
    author = (
        getattr(entry, 'author', None) or
        getattr(entry, 'doctor', None) or
        getattr(entry, 'physio', None) or
        getattr(entry, 'signed_by', None)
    )
    if author and author.id == staff.id:
        return True

    # 2. Patient's assigned treating doctor
    from patients.scoping import is_treating_doctor_for_patient, is_care_manager_for_patient
    if staff.role == 'doctor' and is_treating_doctor_for_patient(user, patient):
        return True

    # 3. Patient's assigned care manager
    if staff.role == 'care_manager' and is_care_manager_for_patient(user, patient):
        return True

    return False


def enforce_addendum_permission(user, patient, entry):
    """Raises PermissionDenied if user is not authorized to add an addendum."""
    if not can_user_add_addendum(user, patient, entry):
        raise PermissionDenied(
            "Only the original author, the patient's assigned treating doctor, or the patient's care manager may add an addendum."
        )


def log_chart_audit(request, patient, action, section, record_id=None):
    """
    Records an immutable security AuditLog entry for every read or write of a patient chart.
    STRICT PRIVACY: Absolutely no PHI (patient name, vitals, diagnosis, notes) in log text.
    """
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return None

    staff = getattr(user, 'staffmember', None)
    role = getattr(staff, 'role', '') or ('super_admin' if user.is_superuser else 'user')
    emp_id = getattr(staff, 'employee_id', None) or ('ADMIN' if (user.is_staff or user.is_superuser) else 'USER')
    actor_name = staff.full_name if staff else (user.get_full_name() or user.username)

    # Patient reference uses non-PHI identifier
    patient_id = getattr(patient, 'id', None) or patient
    patient_code = getattr(patient, 'patient_code', '') or f"PT-{patient_id}"
    target_str = f"Patient {patient_code} (ID {patient_id})"

    details = f"Role: {role} | Staff: {emp_id} | Section: {section}"
    if record_id:
        details += f" | Record ID: {record_id}"

    ip = None
    if hasattr(request, 'META'):
        ip = request.META.get('REMOTE_ADDR')

    return AuditLog.objects.create(
        actor=user,
        actor_name=actor_name,
        action=action,
        target_user=target_str,
        details=details,
        ip_address=ip,
        timestamp=timezone.now()
    )


# ================================================================================
# ARCHITECTURAL NOTICE: Django ORM Bulk QuerySet Bypass Caveat
# ================================================================================
# Django ORM's bulk methods:
#   `QuerySet.update(...)`
#   `QuerySet.delete(...)`
# execute direct SQL queries in the database and BYPASS model-level hooks,
# specifically `clean()`, `save()`, `delete()`, and `post_save`/`post_delete` signals.
#
# Consequently, the model-level immutability safeguards implemented in
# `SignedClinicalEntryMixin` on `DoctorNote`, `PhysioNote`, `TherapyNote`, and `ClinicalConsent`:
#   1. Cannot intercept `DoctorNote.objects.filter(...).update(...)`
#   2. Cannot intercept `DoctorNote.objects.filter(...).delete()`
#
# CODEBASE AUDIT RESULTS:
# A comprehensive audit across all apps (patients, staff_portal, bookings, etc.)
# verified ZERO occurrences of bulk `QuerySet.update()` or `QuerySet.delete()`
# on any clinical note or consent model. All modifications route through individual
# model instance `.save()` and `.delete()` calls or through DRF serializers, which
# invoke full validation and enforce immutability.
#
# ARCHITECTURAL POLICY:
# Developers MUST NOT write bulk `QuerySet.update()` or `QuerySet.delete()` queries
# against `DoctorNote`, `PhysioNote`, `TherapyNote`, or `ClinicalConsent`.
# All updates to signed clinical rows must append to the `addenda` JSON array via
# instance `.save()` after undergoing `enforce_addendum_permission()`.
# ================================================================================


# ==============================================================================
# PATIENT FILE: LEGAL GUARDIAN CONTACT VISIBILITY CONFIGURATION (A4)
# ==============================================================================
# Single configuration constant defining role access for guardian contact numbers:
# - 'direct': role sees full name, relation, and phone number directly in JSON response.
# - 'emergency_reveal': role sees name and relation; phone is withheld until
#   an explicit emergency reveal action is triggered, which writes a security AuditLog.
# - 'name_only': role sees name and relation only; phone number is never exposed.
GUARDIAN_CONTACT_VISIBILITY_CONFIG = {
    # Direct access roles: assigned doctor, patient's assigned care manager, admin, super_admin
    'direct_roles': ('super_admin', 'admin', 'treating_doctor', 'assigned_care_manager'),
    # Emergency reveal roles: nurse
    'emergency_reveal_roles': ('nurse', 'nursing_assistant'),
    # All other roles (physiotherapist, speech_therapist, psychotherapist, accountant, crm_executive)
    # fall back to name_only.
}


def get_guardian_contact_visibility(user, patient):
    """
    Evaluates guardian contact visibility for a given user and patient.
    Returns:
      'direct'           -> Include full phone number
      'emergency_reveal' -> Omit phone number; allow emergency reveal action
      'name_only'        -> Omit phone number; no reveal action allowed
    """
    if not user or not user.is_authenticated:
        return 'name_only'
    if getattr(user, 'is_superuser', False):
        return 'direct'

    from homecareOS.permissions import get_user_role
    role = get_user_role(user)

    if role in ('super_admin', 'admin'):
        return 'direct'

    if role == 'doctor':
        from patients.scoping import is_treating_doctor_for_patient
        if is_treating_doctor_for_patient(user, patient):
            return 'direct'

    if role == 'care_manager':
        from patients.scoping import is_care_manager_for_patient
        if is_care_manager_for_patient(user, patient):
            return 'direct'

    if role in GUARDIAN_CONTACT_VISIBILITY_CONFIG['emergency_reveal_roles']:
        return 'emergency_reveal'

    return 'name_only'



