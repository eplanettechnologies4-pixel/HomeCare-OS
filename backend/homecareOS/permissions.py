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
    but mutating actions (create, edit, delete, password changes)
    require Admin or Super Admin privileges.
    """
    message = "Staff management actions (create, edit, delete, password change) require Admin privileges."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        # Read-only actions (list, retrieve, available, attendance) allowed for authenticated staff
        if request.method in SAFE_METHODS or getattr(view, 'action', None) in ('attendance', 'available', 'on_visit'):
            return True
        # Mutations require administrative role
        return get_user_role(request.user) in ('super_admin', 'admin', 'branch_manager')


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
        if request.method == 'DELETE':
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
    - POST (create): Doctors, Nurses, Care Managers, Branch Managers, and Admins.
    - PATCH / PUT / DELETE: Admins, Super Admins, Branch Managers only.
    - Family portal users are strictly read-only.
    """
    message = "You do not have permission to modify or add prescriptions."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        role = get_user_role(request.user)
        if request.method == 'POST':
            return role in ('super_admin', 'admin', 'branch_manager', 'doctor', 'nurse', 'care_manager')
        if request.method in ('PATCH', 'PUT', 'DELETE'):
            return role in ('super_admin', 'admin', 'branch_manager')
        return False


