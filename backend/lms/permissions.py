"""
LMS Permissions
Enforces role-based access control for LMS management and course access.
"""
from rest_framework.permissions import BasePermission, SAFE_METHODS
from homecareOS.permissions import get_user_role

LMS_MANAGER_ROLES = ('super_admin', 'admin', 'branch_manager', 'care_manager')


def is_lms_manager(user):
    """Returns True if the user has an LMS manager role (admin, super_admin, branch_manager, care_manager)."""
    if not user or not user.is_authenticated:
        return False
    role = get_user_role(user)
    return role in LMS_MANAGER_ROLES


class IsLMSManager(BasePermission):
    """
    Grants access strictly to admin, super_admin, branch_manager, and care_manager.
    Nurses, field staff, patients, and unauthorized roles receive 403 Forbidden.
    """
    message = "LMS management operations (course CRUD, lecture upload, staff assignment, certificate generation) require administrative or manager privileges."

    def has_permission(self, request, view):
        return is_lms_manager(request.user)


class IsLMSManagerOrReadOnly(BasePermission):
    """
    Allows read-only access (GET, HEAD, OPTIONS) to authenticated users,
    but write/mutating actions (POST, PUT, PATCH, DELETE) strictly require LMS Manager roles.
    """
    message = "Modifying LMS content requires administrative or manager privileges."

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.method in SAFE_METHODS:
            return True
        return is_lms_manager(request.user)
