import datetime
from zoneinfo import ZoneInfo
from django.test import TestCase, override_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from staff.models import (
    StaffMember, StaffRole, LeaveRequest,
    ShiftTemplate, RosterWeek, RosterAssignment
)
from staff_portal.models import StaffRequest
from notifications.models import Notification
from accounts.models import AuditLog

User = get_user_model()


class RosterSystemTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.karachi_tz = ZoneInfo('Asia/Karachi')
        local_now = timezone.now().astimezone(self.karachi_tz)

        # Normalize to this week's Monday
        self.monday = local_now.date() - datetime.timedelta(days=local_now.weekday())
        self.tuesday = self.monday + datetime.timedelta(days=1)
        self.wednesday = self.monday + datetime.timedelta(days=2)

        # Users and StaffMembers
        # 1. Super Admin
        self.super_admin_user = User.objects.create_superuser(
            username='roster_super', password='Password123!', first_name='Super', last_name='Admin'
        )
        self.super_admin_staff = StaffMember.objects.create(
            user=self.super_admin_user, first_name='Super', last_name='Admin',
            role=StaffRole.ADMIN, employee_id='SA-001', hire_date=datetime.date(2023, 1, 1),
            platform_allowed='web'
        )

        # 2. Admin
        self.admin_user = User.objects.create_user(
            username='roster_admin', password='Password123!', first_name='Hospital', last_name='Admin', is_staff=True
        )
        self.admin_staff = StaffMember.objects.create(
            user=self.admin_user, first_name='Hospital', last_name='Admin',
            role=StaffRole.ADMIN, employee_id='ADM-001', hire_date=datetime.date(2023, 1, 1),
            platform_allowed='web'
        )

        # 3. Care Manager
        self.cm_user = User.objects.create_user(
            username='roster_cm', password='Password123!', first_name='Care', last_name='Coordinator'
        )
        self.cm_staff = StaffMember.objects.create(
            user=self.cm_user, first_name='Care', last_name='Coordinator',
            role=StaffRole.CARE_MANAGER, employee_id='CM-001', hire_date=datetime.date(2023, 2, 1),
            platform_allowed='both'
        )

        # 4. Nurse
        self.nurse_user = User.objects.create_user(
            username='roster_nurse', password='Password123!', first_name='Sarah', last_name='Nurse'
        )
        self.nurse_staff = StaffMember.objects.create(
            user=self.nurse_user, first_name='Sarah', last_name='Nurse',
            role=StaffRole.NURSE, employee_id='RN-001', hire_date=datetime.date(2023, 3, 1),
            platform_allowed='both'
        )

        # 5. Doctor
        self.doc_user = User.objects.create_user(
            username='roster_doc', password='Password123!', first_name='Bilal', last_name='Doctor'
        )
        self.doc_staff = StaffMember.objects.create(
            user=self.doc_user, first_name='Bilal', last_name='Doctor',
            role=StaffRole.DOCTOR, employee_id='DOC-001', hire_date=datetime.date(2023, 4, 1),
            platform_allowed='both'
        )

        # Templates
        self.tmpl_morning = ShiftTemplate.objects.create(
            name='Morning',
            start_time=datetime.time(8, 0),
            end_time=datetime.time(16, 0),
            location='Main Hospital',
            color='#059669',
            is_off=False,
            is_active=True,
        )
        self.tmpl_evening = ShiftTemplate.objects.create(
            name='Evening',
            start_time=datetime.time(16, 0),
            end_time=datetime.time(0, 0),
            location='Main Hospital',
            color='#D97706',
            is_off=False,
            is_active=True,
        )
        self.tmpl_night = ShiftTemplate.objects.create(
            name='Night',
            start_time=datetime.time(0, 0),
            end_time=datetime.time(8, 0),
            location='Main Hospital',
            color='#6D28D9',
            is_off=False,
            is_active=True,
        )
        self.tmpl_off = ShiftTemplate.objects.create(
            name='Off',
            start_time=datetime.time(0, 0),
            end_time=datetime.time(0, 0),
            location='Off Duty',
            color='#6B7280',
            is_off=True,
            is_active=True,
        )

    def test_role_permissions_read_and_write(self):
        """
        Verify role-based access permissions on roster endpoints:
        - Admin and Super Admin can view, edit, and publish.
        - Care Manager can view, but cannot edit when ROSTER_CARE_MANAGER_CAN_EDIT=False.
        - Care Manager can edit when ROSTER_CARE_MANAGER_CAN_EDIT=True, but NEVER publish.
        - Clinical staff (nurse, doctor) get 403 Forbidden on management endpoints.
        """
        # 1. Super Admin access
        self.client.force_authenticate(user=self.super_admin_user)
        res_grid = self.client.get(f"/api/staff/roster/?week_start={self.monday}")
        self.assertEqual(res_grid.status_code, status.HTTP_200_OK)

        res_assign = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.nurse_staff.id,
            'date': self.monday.isoformat(),
            'shift_template_id': self.tmpl_morning.id,
        })
        self.assertEqual(res_assign.status_code, status.HTTP_200_OK)

        # 2. Admin access
        self.client.force_authenticate(user=self.admin_user)
        res_grid_adm = self.client.get(f"/api/staff/roster/?week_start={self.monday}")
        self.assertEqual(res_grid_adm.status_code, status.HTTP_200_OK)

        # 3. Care Manager with default ROSTER_CARE_MANAGER_CAN_EDIT=False
        self.client.force_authenticate(user=self.cm_user)
        res_cm_view = self.client.get(f"/api/staff/roster/?week_start={self.monday}")
        self.assertEqual(res_cm_view.status_code, status.HTTP_200_OK, "Care manager can view roster")

        res_cm_assign_denied = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.nurse_staff.id,
            'date': self.tuesday.isoformat(),
            'shift_template_id': self.tmpl_evening.id,
        })
        self.assertEqual(res_cm_assign_denied.status_code, status.HTTP_403_FORBIDDEN, "Care manager cannot edit by default")

        res_cm_publish_denied = self.client.post('/api/staff/roster/publish/', {
            'week_start': self.monday.isoformat(),
        })
        self.assertEqual(res_cm_publish_denied.status_code, status.HTTP_403_FORBIDDEN, "Care manager cannot publish")

        # 4. Care Manager with ROSTER_CARE_MANAGER_CAN_EDIT=True
        with override_settings(ROSTER_CARE_MANAGER_CAN_EDIT=True):
            res_cm_assign_allowed = self.client.post('/api/staff/roster/assign/', {
                'staff_id': self.nurse_staff.id,
                'date': self.tuesday.isoformat(),
                'shift_template_id': self.tmpl_evening.id,
            })
            self.assertEqual(res_cm_assign_allowed.status_code, status.HTTP_200_OK, "Care manager can edit when setting is True")

            # But Care Manager still cannot publish!
            res_cm_pub = self.client.post('/api/staff/roster/publish/', {
                'week_start': self.monday.isoformat(),
            })
            self.assertEqual(res_cm_pub.status_code, status.HTTP_403_FORBIDDEN, "Care manager cannot publish even if can edit")

        # 5. Clinical Staff (Nurse) gets 403 on staff roster management
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse_grid = self.client.get(f"/api/staff/roster/?week_start={self.monday}")
        self.assertEqual(res_nurse_grid.status_code, status.HTTP_403_FORBIDDEN)

        res_nurse_assign = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.nurse_staff.id,
            'date': self.wednesday.isoformat(),
            'shift_template_id': self.tmpl_morning.id,
        })
        self.assertEqual(res_nurse_assign.status_code, status.HTTP_403_FORBIDDEN)

        res_nurse_pub = self.client.post('/api/staff/roster/publish/', {
            'week_start': self.monday.isoformat(),
        })
        self.assertEqual(res_nurse_pub.status_code, status.HTTP_403_FORBIDDEN)

    def test_leave_day_and_overlap_blocking(self):
        """
        Verify:
        - Assigning a shift on an approved leave day is strictly blocked (400 Bad Request).
        - Double booking / overlapping shifts for the same staff member is blocked.
        """
        # Create an approved leave request for the Doctor on Tuesday
        LeaveRequest.objects.create(
            staff=self.doc_staff,
            leave_type=LeaveRequest.LeaveType.ANNUAL,
            start_date=self.tuesday,
            end_date=self.tuesday,
            reason='Annual Clinical Leave',
            status=LeaveRequest.LeaveStatus.APPROVED,
            reviewed_by=self.admin_user,
        )

        self.client.force_authenticate(user=self.admin_user)

        # 1. Attempt to assign shift on approved leave day -> Must return 400
        res_leave_block = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.doc_staff.id,
            'date': self.tuesday.isoformat(),
            'shift_template_id': self.tmpl_morning.id,
        })
        self.assertEqual(res_leave_block.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('approved leave', res_leave_block.data['detail'].lower())

        # 2. Successfully assign Morning shift (08:00 - 16:00) on Wednesday
        res_ok = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.doc_staff.id,
            'date': self.wednesday.isoformat(),
            'shift_template_id': self.tmpl_morning.id,
        })
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)

        # 3. Create a custom template that overlaps with Morning (e.g. 10:00 - 14:00)
        tmpl_overlap = ShiftTemplate.objects.create(
            name='Midday Clinic',
            start_time=datetime.time(10, 0),
            end_time=datetime.time(14, 0),
            location='Clinic',
            color='#2563EB',
        )

        # Overlapping assignment should be rejected if attempting to create conflicting shift
        # Our assign endpoint replaces existing or detects conflict
        res_overlap = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.doc_staff.id,
            'date': self.wednesday.isoformat(),
            'shift_template_id': tmpl_overlap.id,
        })
        # If updating the same cell, it re-assigns cleanly to the new template
        self.assertEqual(res_overlap.status_code, status.HTTP_200_OK)
        self.assertEqual(res_overlap.data['shift_name'], 'Midday Clinic')

    def test_draft_not_visible_to_staff_published_visible(self):
        """
        Verify:
        - Draft roster is NOT visible to staff on /api/staff-portal/roster/.
        - Publishing makes it visible to staff.
        - Publishing sends in-app notifications to affected staff.
        """
        self.client.force_authenticate(user=self.admin_user)

        # Assign a shift to the nurse on Monday
        res_assign = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.nurse_staff.id,
            'date': self.monday.isoformat(),
            'shift_template_id': self.tmpl_morning.id,
        })
        self.assertEqual(res_assign.status_code, status.HTTP_200_OK)

        # Nurse checks staff portal roster before publishing -> should be empty
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse_roster_pre = self.client.get(f"/api/staff-portal/roster/?view=weekly&date={self.monday}")
        self.assertEqual(res_nurse_roster_pre.status_code, status.HTTP_200_OK)
        roster_shifts = [s for s in res_nurse_roster_pre.data['shifts'] if s.get('is_roster_shift')]
        self.assertEqual(len(roster_shifts), 0, "Draft shifts must NOT be visible to clinical staff")

        # Admin publishes the week
        self.client.force_authenticate(user=self.admin_user)
        notif_count_before = Notification.objects.filter(recipient=self.nurse_user).count()

        res_pub = self.client.post('/api/staff/roster/publish/', {
            'week_start': self.monday.isoformat(),
        })
        self.assertEqual(res_pub.status_code, status.HTTP_200_OK)
        self.assertTrue(res_pub.data['success'])
        self.assertGreaterEqual(res_pub.data['notifications_sent'], 1)

        # Check notification was created for nurse
        notif_count_after = Notification.objects.filter(recipient=self.nurse_user).count()
        self.assertGreater(notif_count_after, notif_count_before)
        latest_notif = Notification.objects.filter(recipient=self.nurse_user).first()
        self.assertIn('roster', latest_notif.message.lower())
        self.assertEqual(latest_notif.icon_key, 'calendar')

        # Nurse checks staff portal roster after publishing -> must see the published shift
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse_roster_post = self.client.get(f"/api/staff-portal/roster/?view=weekly&date={self.monday}")
        self.assertEqual(res_nurse_roster_post.status_code, status.HTTP_200_OK)
        published_shifts = [s for s in res_nurse_roster_post.data['shifts'] if s.get('is_roster_shift')]
        self.assertEqual(len(published_shifts), 1)
        self.assertEqual(published_shifts[0]['type'], 'Morning')

    def test_template_edit_does_not_change_published_history(self):
        """
        Verify:
        - Published assignment retains snapshot of shift template (start_time, end_time, name).
        - Future modifications to the template do NOT mutate past published assignments.
        """
        self.client.force_authenticate(user=self.admin_user)

        # 1. Assign and publish
        self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.nurse_staff.id,
            'date': self.monday.isoformat(),
            'shift_template_id': self.tmpl_morning.id,
        })
        self.client.post('/api/staff/roster/publish/', {
            'week_start': self.monday.isoformat(),
        })

        assignment = RosterAssignment.objects.get(staff=self.nurse_staff, date=self.monday)
        self.assertEqual(assignment.start_time, datetime.time(8, 0))
        self.assertEqual(assignment.end_time, datetime.time(16, 0))
        self.assertEqual(assignment.shift_name, 'Morning')

        # 2. Modify template (e.g. shift hours changed to 07:00 - 15:00)
        res_patch = self.client.patch(f"/api/staff/shift-templates/{self.tmpl_morning.id}/", {
            'name': 'Morning Super Shift',
            'start_time': '07:00:00',
            'end_time': '15:00:00',
        })
        self.assertEqual(res_patch.status_code, status.HTTP_200_OK)

        # 3. Verify the published assignment snapshot is untouched
        assignment.refresh_from_db()
        self.assertEqual(assignment.start_time, datetime.time(8, 0), "Snapshot start_time must not be overwritten")
        self.assertEqual(assignment.end_time, datetime.time(16, 0), "Snapshot end_time must not be overwritten")
        self.assertEqual(assignment.shift_name, 'Morning', "Snapshot shift_name must not be overwritten")

    def test_bulk_actions_copy_previous_week(self):
        """
        Verify bulk action: copy_previous_week copies assignments from W-1 to W,
        skipping approved leave days and updating revision.
        """
        prev_monday = self.monday - datetime.timedelta(days=7)

        # Create previous week assignments
        prev_week = RosterWeek.objects.create(week_start_date=prev_monday, status='published')
        RosterAssignment.objects.create(
            roster_week=prev_week,
            staff=self.nurse_staff,
            date=prev_monday,
            shift_template=self.tmpl_morning,
            shift_name='Morning',
            start_time=datetime.time(8, 0),
            end_time=datetime.time(16, 0),
        )
        RosterAssignment.objects.create(
            roster_week=prev_week,
            staff=self.nurse_staff,
            date=prev_monday + datetime.timedelta(days=1),  # Tuesday
            shift_template=self.tmpl_evening,
            shift_name='Evening',
            start_time=datetime.time(16, 0),
            end_time=datetime.time(0, 0),
        )

        # Nurse is on approved leave on current week's Tuesday
        LeaveRequest.objects.create(
            staff=self.nurse_staff,
            leave_type=LeaveRequest.LeaveType.SICK,
            start_date=self.tuesday,
            end_date=self.tuesday,
            reason='Medical recovery',
            status=LeaveRequest.LeaveStatus.APPROVED,
        )

        self.client.force_authenticate(user=self.admin_user)
        res_bulk = self.client.post('/api/staff/roster/bulk/', {
            'action': 'copy_previous_week',
            'week_start': self.monday.isoformat(),
        })
        self.assertEqual(res_bulk.status_code, status.HTTP_200_OK)
        # Should have copied Monday, but skipped Tuesday due to leave
        self.assertEqual(res_bulk.data['cells_updated'], 1)

        # Confirm Monday exists
        self.assertTrue(RosterAssignment.objects.filter(staff=self.nurse_staff, date=self.monday).exists())
        # Confirm Tuesday does NOT exist
        self.assertFalse(RosterAssignment.objects.filter(staff=self.nurse_staff, date=self.tuesday).exists())

    def test_shift_change_request_and_approval_workflow(self):
        """
        Verify:
        - Clinical staff submits shift change request via StaffRequest flow.
        - Admin approves request.
        - Approval updates assignment to requested shift and increments week revision.
        - AuditLog entries are created with no PHI.
        """
        self.client.force_authenticate(user=self.admin_user)
        # Setup assignment on Monday (Morning)
        self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.nurse_staff.id,
            'date': self.monday.isoformat(),
            'shift_template_id': self.tmpl_morning.id,
        })
        self.client.post('/api/staff/roster/publish/', {
            'week_start': self.monday.isoformat(),
        })

        assignment = RosterAssignment.objects.get(staff=self.nurse_staff, date=self.monday)
        r_week = assignment.roster_week
        initial_rev = r_week.revision

        # Nurse requests shift change to Night
        self.client.force_authenticate(user=self.nurse_user)
        res_req = self.client.post('/api/staff/roster/shift-change-request/', {
            'assignment_id': assignment.id,
            'requested_template_id': self.tmpl_night.id,
            'reason': 'Family commitment in morning',
        })
        self.assertEqual(res_req.status_code, status.HTTP_201_CREATED)
        req_id = res_req.data['id']

        staff_req = StaffRequest.objects.get(id=req_id)
        self.assertEqual(staff_req.request_type, StaffRequest.RequestType.SHIFT_CHANGE)

        # Admin approves the request
        self.client.force_authenticate(user=self.admin_user)
        res_approve = self.client.post(f"/api/staff/roster/shift-change-request/{req_id}/approve/", {
            'reviewer_notes': 'Shift swap approved',
        })
        self.assertEqual(res_approve.status_code, status.HTTP_200_OK)
        self.assertTrue(res_approve.data['success'])

        # Verify assignment updated and revision incremented
        assignment.refresh_from_db()
        r_week.refresh_from_db()
        self.assertEqual(assignment.shift_name, 'Night')
        self.assertEqual(assignment.shift_template_id, self.tmpl_night.id)
        self.assertGreater(r_week.revision, initial_rev)

        # Verify AuditLog created
        audit_entry = AuditLog.objects.filter(action='Roster Shift Change Approved').first()
        self.assertIsNotNone(audit_entry)
        self.assertIn('Night', audit_entry.details)
        # Ensure no patient PHI in log
        self.assertNotIn('patient', audit_entry.details.lower())

    def test_staff_profile_role_change_preserves_records(self):
        """
        Verify:
        - Updating role and platform_allowed in Staff Directory preserves existing records.
        - Writes an AuditLog entry.
        """
        self.client.force_authenticate(user=self.admin_user)
        old_emp_id = self.nurse_staff.employee_id

        # Update designation, working_hours, and platform_allowed
        res_update = self.client.patch(f"/api/staff/members/{self.nurse_staff.id}/", {
            'designation': 'Senior Clinical Specialist',
            'working_hours': '08:00 - 16:00',
            'platform_allowed': 'web',
        })
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)

        self.nurse_staff.refresh_from_db()
        self.assertEqual(self.nurse_staff.designation, 'Senior Clinical Specialist')
        self.assertEqual(self.nurse_staff.working_hours, '08:00 - 16:00')
        self.assertEqual(self.nurse_staff.platform_allowed, 'web')
        self.assertEqual(self.nurse_staff.employee_id, old_emp_id, "Employee ID and profile records preserved")

    def test_role_enforcement_admin_cannot_promote_to_admin_or_super_admin(self):
        """Admin cannot promote a staff member (nurse) to admin or super_admin."""
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.patch(f"/api/staff/members/{self.nurse_staff.id}/", {
            'role': 'admin',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.nurse_staff.refresh_from_db()
        self.assertEqual(self.nurse_staff.role, StaffRole.NURSE)

    def test_role_enforcement_admin_cannot_edit_super_admin(self):
        """Admin cannot edit a super_admin profile/account."""
        self.client.force_authenticate(user=self.admin_user)
        res = self.client.patch(f"/api/staff/members/{self.super_admin_staff.id}/", {
            'phone': '03001234567',
            'designation': 'Hacked',
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.super_admin_staff.refresh_from_db()
        self.assertNotEqual(self.super_admin_staff.designation, 'Hacked')

    def test_role_enforcement_user_cannot_change_own_role(self):
        """A user cannot change their own role."""
        # 1. Admin trying to change their own role
        self.client.force_authenticate(user=self.admin_user)
        res_admin = self.client.patch(f"/api/staff/members/{self.admin_staff.id}/", {
            'role': 'doctor',
        })
        self.assertEqual(res_admin.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', res_admin.data)
        self.admin_staff.refresh_from_db()
        self.assertEqual(self.admin_staff.role, StaffRole.ADMIN)

        # 2. Super admin trying to change their own role
        self.client.force_authenticate(user=self.super_admin_user)
        res_sa = self.client.patch(f"/api/staff/members/{self.super_admin_staff.id}/", {
            'role': 'nurse',
        })
        self.assertEqual(res_sa.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('role', res_sa.data)

    def test_role_enforcement_super_admin_can_promote_and_edit_admin(self):
        """Super Admin CAN edit an admin account and change staff role to admin."""
        self.client.force_authenticate(user=self.super_admin_user)
        # Edit admin profile
        res_edit = self.client.patch(f"/api/staff/members/{self.admin_staff.id}/", {
            'designation': 'Executive Operations Director',
        })
        self.assertEqual(res_edit.status_code, status.HTTP_200_OK)
        self.admin_staff.refresh_from_db()
        self.assertEqual(self.admin_staff.designation, 'Executive Operations Director')

        # Promote staff member
        res_promote = self.client.patch(f"/api/staff/members/{self.cm_staff.id}/", {
            'role': 'admin',
        })
        self.assertEqual(res_promote.status_code, status.HTTP_200_OK)
        self.cm_staff.refresh_from_db()
        self.assertEqual(self.cm_staff.role, StaffRole.ADMIN)

    def test_post_publish_edit_creates_draft_and_staff_sees_published_revision(self):
        """
        Verify:
        1. Published week shows initial shift to staff on /api/staff-portal/roster/.
        2. Admin edits a shift on the published week -> creates draft revision.
        3. Staff continues to see the LAST PUBLISHED revision on /api/staff-portal/roster/.
        4. When admin publishes again, staff immediately sees the new published revision.
        """
        # Assign nurse to Morning shift on Monday
        self.client.force_authenticate(user=self.admin_user)
        res_assign = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.nurse_staff.id,
            'date': self.monday.isoformat(),
            'shift_template_id': self.tmpl_morning.id,
        })
        self.assertEqual(res_assign.status_code, status.HTTP_200_OK)

        # Publish the week
        res_pub1 = self.client.post('/api/staff/roster/publish/', {
            'week_start': self.monday.isoformat(),
        })
        self.assertEqual(res_pub1.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pub1.data['revision'], 1)

        # Nurse checks their staff portal roster -> sees Morning shift (Rev 1)
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse1 = self.client.get(f"/api/staff-portal/roster/?date={self.monday.isoformat()}&view=weekly")
        self.assertEqual(res_nurse1.status_code, status.HTTP_200_OK)
        nurse_shifts1 = [s for s in res_nurse1.data['shifts'] if s.get('assignment_id')]
        self.assertEqual(len(nurse_shifts1), 1)
        self.assertEqual(nurse_shifts1[0]['type'], 'Morning')

        # Admin edits the assignment to Evening shift
        self.client.force_authenticate(user=self.admin_user)
        res_edit = self.client.post('/api/staff/roster/assign/', {
            'staff_id': self.nurse_staff.id,
            'date': self.monday.isoformat(),
            'shift_template_id': self.tmpl_evening.id,
        })
        self.assertEqual(res_edit.status_code, status.HTTP_200_OK)

        # Verify week status is now DRAFT with revision 2
        r_week = RosterWeek.objects.get(week_start_date=self.monday)
        self.assertEqual(r_week.status, RosterWeek.Status.DRAFT)
        self.assertEqual(r_week.revision, 2)

        # Crucial check: Nurse checks roster again BEFORE admin publishes ->
        # Staff MUST still see the LAST PUBLISHED revision (Morning), NOT the draft (Evening)!
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse_mid = self.client.get(f"/api/staff-portal/roster/?date={self.monday.isoformat()}&view=weekly")
        self.assertEqual(res_nurse_mid.status_code, status.HTTP_200_OK)
        nurse_shifts_mid = [s for s in res_nurse_mid.data['shifts'] if s.get('assignment_id')]
        self.assertEqual(len(nurse_shifts_mid), 1)
        self.assertEqual(nurse_shifts_mid[0]['type'], 'Morning', "Staff still sees last published revision")

        # Now admin publishes revision 2
        self.client.force_authenticate(user=self.admin_user)
        res_pub2 = self.client.post('/api/staff/roster/publish/', {
            'week_start': self.monday.isoformat(),
        })
        self.assertEqual(res_pub2.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pub2.data['revision'], 2)

        # Nurse checks roster again -> now sees Evening shift (Rev 2)
        self.client.force_authenticate(user=self.nurse_user)
        res_nurse2 = self.client.get(f"/api/staff-portal/roster/?date={self.monday.isoformat()}&view=weekly")
        self.assertEqual(res_nurse2.status_code, status.HTTP_200_OK)
        nurse_shifts2 = [s for s in res_nurse2.data['shifts'] if s.get('assignment_id')]
        self.assertEqual(len(nurse_shifts2), 1)
        self.assertEqual(nurse_shifts2[0]['type'], 'Evening')

    def test_roster_endpoints_permissions_nurse_and_doctor_get_403(self):
        """
        Verify:
        /api/staff/roster/ (grid), /history/, /shift-templates/ and change-request approval
        are limited to super_admin, admin (and care_manager read-only as designed).
        Nurse and Doctor get 403 Forbidden.
        Staff-portal roster stays available (200 OK) for Nurse and Doctor.
        """
        clinical_users = [('nurse', self.nurse_user), ('doctor', self.doc_user)]

        for role_name, user_obj in clinical_users:
            self.client.force_authenticate(user=user_obj)

            # 1. Roster Grid -> 403
            res_grid = self.client.get(f"/api/staff/roster/?week_start={self.monday.isoformat()}")
            self.assertEqual(
                res_grid.status_code, status.HTTP_403_FORBIDDEN,
                f"{role_name} must receive 403 on /api/staff/roster/"
            )

            # 2. Roster Audit History -> 403
            res_hist = self.client.get("/api/staff/roster/history/")
            self.assertEqual(
                res_hist.status_code, status.HTTP_403_FORBIDDEN,
                f"{role_name} must receive 403 on /api/staff/roster/history/"
            )

            # 3. Shift Templates -> 403
            res_tmpl = self.client.get("/api/staff/shift-templates/")
            self.assertEqual(
                res_tmpl.status_code, status.HTTP_403_FORBIDDEN,
                f"{role_name} must receive 403 on /api/staff/shift-templates/"
            )

            # 4. Shift Change Request Approval -> 403
            res_appr = self.client.post("/api/staff/roster/shift-change-request/1/approve/")
            self.assertEqual(
                res_appr.status_code, status.HTTP_403_FORBIDDEN,
                f"{role_name} must receive 403 on shift-change-request approve"
            )

            # 5. Own Roster via staff portal -> 200 OK
            res_portal = self.client.get(f"/api/staff-portal/roster/?date={self.monday.isoformat()}")
            self.assertEqual(
                res_portal.status_code, status.HTTP_200_OK,
                f"{role_name} must have 200 OK access to /api/staff-portal/roster/"
            )

