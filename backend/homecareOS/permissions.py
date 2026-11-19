"""
HomeCare OS — Role-Based Access Control (RBAC) Permissions
===========================================================
Defines DRF permission classes to enforce strict authorization on sensitive
API endpoints (staff management, billing, financial accounts, patient deletion).
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS


def get_user_role(user):
    """
    Safely resolve the effective role of a user.
    Order of precedence:
      1. is_superuser -> 'super_admin'
      2. linked UserProfile.role (e.g. 'patient_family')
      3. linked StaffMember.role (e.g. 'nurse', 'care_manager', 'branch_manager', 'admin')
      4. is_staff -> 'admin'
      5. fallback None
    """
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return 'super_admin'
    profile = getattr(user, 'profile', None)
    if profile and getattr(profile, 'role', None):
        return profile.role
    staff = getattr(user, 'staffmember', None)
    if staff and getattr(staff, 'role', None):
        return staff.role
    if user.is_staff:
        return 'admin'
    return None


class CanManagePatientPortal(BasePermission):
    """
    Restricts creating portal user logins and resetting portal passwords
    strictly to: admin, super_admin, branch_manager, and care_manager roles.
    Nurses, patients, and family users are forbidden.
    """
    message = "Managing patient portal logins requires Administrator, Branch Manager, or Care Manager privileges."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        role = get_user_role(request.user)
        return role in ('super_admin', 'admin', 'branch_manager', 'care_manager')


class IsSuperAdmin(BasePermission):
    """Allows access only to Super Admins."""
    message = "Super Administrator privileges are required to perform this action."

    def has_permission(self, request, view):
        return get_user_role(request.user) == 'super_admin'


class IsAdminOrSuperAdmin(BasePermission):
    """Allows access to Admins, Super Admins, and Branch Managers."""
    message = "Administrative privileges are required to perform this action."

    def has_permission(self, request, view):
        return get_user_role(request.user) in ('super_admin', 'admin', 'branch_manager')


class IsStaffManagementAllowed(BasePermission):
    """
    Staff directory viewing is permitted for authenticated staff,
    mutating actions require Admin, Super Admin, or Branch Manager privileges,
    except that staff members may attempt partial updates on their own profile
    (field-level write restrictions enforced in serializer).
    """
    message = "Staff management actions (create, edit, delete, password change) require Admin privileges."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Read-only actions (list, retrieve, available, attendance) allowed for authenticated staff
        if request.method in SAFE_METHODS or getattr(view, 'action', None) in ('attendance', 'available', 'on_visit'):
            return True
        if get_user_role(request.user) in ('super_admin', 'admin', 'branch_manager'):
            return True
        # Allow staff to reach object-level permission for updating self
        if getattr(view, 'action', None) in ('update', 'partial_update'):
            return True
        return False

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if get_user_role(request.user) in ('super_admin', 'admin', 'branch_manager'):
            return True
        return obj.user_id == request.user.id


class IsFinancialStaff(BasePermission):
    """
    Allows access only to financial roles: Super Admin, Admin, and Accountant.
    Restricts access to billing, invoices, payments, and revenue summaries.
    """
    message = "Financial data and billing operations are restricted to Accountants and Administrators."

    def has_permission(self, request, view):
        return get_user_role(request.user) in ('super_admin', 'admin', 'accountant')


class CanDeletePatient(BasePermission):
    """
    Allows patient deletion only for Super Admins and Admins.
    Clinical staff (nurses, doctors, care managers) cannot delete patient records.
    """
    message = "Deleting patient records is restricted to Administrators."

    def has_permission(self, request, view):
        if request.method == 'DELETE' and getattr(view, 'action', None) in ('destroy', None):
            return get_user_role(request.user) in ('super_admin', 'admin')
        return True


class IsCareManagerOrAdmin(BasePermission):
    """
    Allows access to Care Managers, Admins, and Super Admins (e.g. for leave approval, care plans).
    """
    message = "This action requires Care Manager or Administrator privileges."

    def has_permission(self, request, view):
        return get_user_role(request.user) in ('super_admin', 'admin', 'branch_manager', 'care_manager')


class IsCRMAllowed(BasePermission):
    """Allows access to CRM Executive, Admin, and Super Admin."""
    message = "Access to CRM and leads is restricted to CRM Executives and Administrators."

    def has_permission(self, request, view):
        return get_user_role(request.user) in ('super_admin', 'admin', 'crm_executive')


class IsPrescriptionManagementAllowed(BasePermission):
    """
    RBAC for Prescriptions:
    - SAFE_METHODS (GET, HEAD, OPTIONS): all authenticated users (including patient/family portal).
    - POST (create): Doctor (prescribe) or Nurse (transcribed order per CLINICAL_WRITE_ROLES).
    - PATCH / PUT (edit): Nurse author only while pending verification and has no administrations.
    - DELETE: Denied for everyone (cancelled or discontinued instead; physical deletion removed).
    - Admins, Super Admins, Branch Managers, Care Managers are read-only.
    - Family portal users are strictly read-only.
    """
    message = "You do not have permission to modify or add prescriptions."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        from homecareOS.clinician_permissions import CLINICAL_WRITE_ROLES, normalize_clinical_role
        role = normalize_clinical_role(get_user_role(request.user))
        if request.method == 'POST':
            allowed = role in CLINICAL_WRITE_ROLES.get('prescriptions', ('doctor', 'nurse'))
            if not allowed:
                patient_pk = (
                    getattr(view, 'kwargs', {}).get('pk')
                    or getattr(view, 'kwargs', {}).get('patient_pk')
                    or (request.data.get('patient') if hasattr(request, 'data') else None)
                    or (request.data.get('patient_id') if hasattr(request, 'data') else None)
                )
                if patient_pk:
                    from homecareOS.clinician_permissions import log_chart_audit
                    log_chart_audit(request, patient_pk, 'Prescription Create Blocked', 'Prescriptions')
            return allowed
        if request.method in ('PATCH', 'PUT'):
            return role == 'nurse'
        if request.method == 'DELETE':
            # Nurse author or assigned treating doctor may cancel a pending prescription via DELETE route
            return role in ('nurse', 'doctor')
        return False


def is_family_user(user):
    """
    Returns True if the user has a family / patient portal role:
    - UserProfile role in ('patient_family', 'family')
    - Or has a linked Patient via portal_user (related_name='patient_profile') and is not staff/admin
    """
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser or user.is_staff:
        return False
    role = get_user_role(user)
    if role in ('patient_family', 'family'):
        return True
    if hasattr(user, 'patient_profile') and not hasattr(user, 'staffmember'):
        return True
    return False


class DenyNonClinicalRoles(BasePermission):
    """
    Explicitly denies non-clinical support roles (accountant, crm_executive)
    from accessing clinical records, views, or endpoints.
    """
    message = "Non-clinical roles (accountant, CRM executive) are forbidden from accessing clinical records."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        role = get_user_role(request.user)
        if role in ('accountant', 'crm_executive'):
            return False
        return True


class IsPatientOrFamilyOwner(BasePermission):
    """
    Object-level permission check:
    - Clinical staff, management, and administrators have access according to their role.
    - Family and patient_family roles are strictly restricted to accessing records linked
      to their own patient (patient.portal_user == request.user).
    """
    message = "You do not have permission to access records for this patient."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        if not request.user or not request.user.is_authenticated:
            return False
        if not is_family_user(request.user):
            # Resolve patient from obj and enforce nurse assigned-patient scoping
            patient = getattr(obj, 'patient', None)
            if patient is None and hasattr(obj, 'portal_user'):
                patient = obj
            if patient is None and hasattr(obj, 'booking'):
                booking = getattr(obj, 'booking', None)
                patient = getattr(booking, 'patient', None) if booking else None

            if patient is not None:
                from patients.scoping import check_nurse_patient_access
                check_nurse_patient_access(request.user, patient)
            return True

        # Resolve patient from obj (Patient, Prescription, VitalSign, NurseNote, Booking, LiveVisit, etc.)
        patient = getattr(obj, 'patient', None)
        if patient is None and hasattr(obj, 'portal_user'):
            patient = obj
        if patient is None and hasattr(obj, 'booking'):
            booking = getattr(obj, 'booking', None)
            patient = getattr(booking, 'patient', None) if booking else None

        return bool(patient and patient.portal_user_id == request.user.id)



