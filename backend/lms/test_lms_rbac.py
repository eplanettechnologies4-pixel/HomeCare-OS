"""
Unit and integration tests for LMS Role-Based Access Control (RBAC),
Staff Portal trainings API, lecture progress calculation, media protection,
and public certificate verification.
"""
import tempfile
from django.contrib.auth.models import User
from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status

from accounts.models import UserProfile, UserRole
from staff.models import StaffMember, StaffRole
from lms.models import Course, Lecture, CourseAssignment, LectureProgress, Certificate


class LMSRBACTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # 1. Admin / HR user
        self.admin_user = User.objects.create_user(
            username='admin_test', email='admin@test.com', password='password123', is_staff=True
        )
        UserProfile.objects.create(user=self.admin_user, role=UserRole.ADMIN)

        # 2. Nurse A
        self.nurse_a_user = User.objects.create_user(
            username='nurse_a', email='nursea@test.com', password='password123'
        )
        UserProfile.objects.create(user=self.nurse_a_user, role=UserRole.NURSE)
        self.nurse_a_staff = StaffMember.objects.create(
            user=self.nurse_a_user,
            first_name='Alice',
            last_name='Nurse',
            role=StaffRole.NURSE,
            employee_id='EMP-NA-01',
            hire_date='2026-01-01',
        )

        # 3. Nurse B
        self.nurse_b_user = User.objects.create_user(
            username='nurse_b', email='nurseb@test.com', password='password123'
        )
        UserProfile.objects.create(user=self.nurse_b_user, role=UserRole.NURSE)
        self.nurse_b_staff = StaffMember.objects.create(
            user=self.nurse_b_user,
            first_name='Bob',
            last_name='Nurse',
            role=StaffRole.NURSE,
            employee_id='EMP-NB-02',
            hire_date='2026-01-01',
        )

        # 4. Courses
        self.course_1 = Course.objects.create(
            title='Infection Control 101',
            description='Mandatory infection prevention practices.',
            category=Course.Category.CLINICAL,
            created_by=self.admin_user,
        )
        self.lecture_1a = Lecture.objects.create(
            course=self.course_1,
            title='Hand Hygiene',
            order=1,
            duration_seconds=600,
        )
        self.lecture_1b = Lecture.objects.create(
            course=self.course_1,
            title='PPE Standards',
            order=2,
            duration_seconds=900,
        )

        self.course_2 = Course.objects.create(
            title='Ventilator Care Advanced',
            description='Advanced ICU ventilator maintenance.',
            category=Course.Category.CLINICAL,
            created_by=self.admin_user,
        )
        self.lecture_2a = Lecture.objects.create(
            course=self.course_2,
            title='Ventilator Setup',
            order=1,
            duration_seconds=1200,
        )

        # Assign course_1 to Nurse A
        self.assignment_a1 = CourseAssignment.objects.create(
            staff=self.nurse_a_staff,
            course=self.course_1,
            assigned_by=self.admin_user,
            is_mandatory=True,
        )

        # Assign course_2 to Nurse B only
        self.assignment_b2 = CourseAssignment.objects.create(
            staff=self.nurse_b_staff,
            course=self.course_2,
            assigned_by=self.admin_user,
            is_mandatory=False,
        )

    # ── Test 1: Nurse gets 403 on admin mutations ─────────────────────────────
    def test_nurse_forbidden_from_admin_mutations(self):
        self.client.force_authenticate(user=self.nurse_a_user)

        # 1. Create course -> 403
        res = self.client.post('/api/lms/courses/', {'title': 'Hacked Course', 'category': 'clinical'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Delete course -> 403
        res = self.client.delete(f'/api/lms/courses/{self.course_1.id}/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Add lecture -> 403
        res = self.client.post('/api/lms/lectures/', {
            'course': self.course_1.id,
            'title': 'Unauthorized Lecture',
            'order': 3
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Assign course -> 403
        res = self.client.post(f'/api/lms/courses/{self.course_1.id}/assign/', {
            'staff_ids': [self.nurse_b_staff.id]
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # 5. Generate certificate -> 403
        res = self.client.post('/api/lms/certificates/', {
            'staff': self.nurse_a_staff.id,
            'title': 'Self Awarded Certificate'
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ── Test 2: Nurse sees only her assigned courses on admin & staff endpoints
    def test_nurse_sees_only_assigned_courses(self):
        self.client.force_authenticate(user=self.nurse_a_user)

        # GET /api/staff-portal/trainings/
        res = self.client.get('/api/staff-portal/trainings/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        course_ids = [c['course_id'] for c in res.data]
        self.assertIn(self.course_1.id, course_ids)
        self.assertNotIn(self.course_2.id, course_ids)

        # Course details check
        c1_item = [c for c in res.data if c['course_id'] == self.course_1.id][0]
        self.assertEqual(c1_item['mandatory'], True)
        self.assertEqual(c1_item['status'], 'not_started')

        # Generic admin courses endpoint should also scope to assigned only
        res_admin = self.client.get('/api/lms/courses/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        admin_courses = res_admin.data.get('results', res_admin.data) if isinstance(res_admin.data, dict) else res_admin.data
        admin_course_ids = [c['id'] for c in admin_courses]
        self.assertIn(self.course_1.id, admin_course_ids)
        self.assertNotIn(self.course_2.id, admin_course_ids)

        # Enrolled count should not leak total count to nurse
        self.assertEqual(admin_courses[0]['enrolled_count'], 0)

    # ── Test 3: Nurse A cannot read or progress Nurse B's trainings (404) ─────
    def test_nurse_cannot_access_other_nurse_trainings(self):
        self.client.force_authenticate(user=self.nurse_a_user)

        # Nurse A tries to get Course 2 (assigned to Nurse B only) -> 404
        res = self.client.get(f'/api/staff-portal/trainings/{self.course_2.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Nurse A tries to update progress on Course 2 lecture -> 404
        res = self.client.post(
            f'/api/staff-portal/trainings/{self.course_2.id}/lectures/{self.lecture_2a.id}/progress/',
            {'watched_seconds': 500, 'percentage': 50}
        )
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

        # Nurse A tries to query Nurse B's training overview via admin staff view -> 403
        res = self.client.get(f'/api/lms/staff/{self.nurse_b_staff.id}/training/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Nurse A tries to query Nurse B's certificates via admin staff view -> 403
        res = self.client.get(f'/api/lms/staff/{self.nurse_b_staff.id}/certificates/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ── Test 4: Lecture progress & server-side course completion ──────────────
    def test_nurse_lecture_progress_and_auto_completion(self):
        self.client.force_authenticate(user=self.nurse_a_user)

        # Mark lecture 1 completed
        res1 = self.client.post(
            f'/api/staff-portal/trainings/{self.course_1.id}/lectures/{self.lecture_1a.id}/progress/',
            {'watched_seconds': 600, 'percentage': 100, 'completed': True}
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertTrue(res1.data['completed'])
        self.assertEqual(res1.data['course_progress_pct'], 50)
        self.assertEqual(res1.data['course_status'], CourseAssignment.Status.IN_PROGRESS)

        # Mark lecture 2 completed -> course auto-completes and certificate auto-issues!
        res2 = self.client.post(
            f'/api/staff-portal/trainings/{self.course_1.id}/lectures/{self.lecture_1b.id}/progress/',
            {'watched_seconds': 900, 'percentage': 100, 'completed': True}
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data['completed'])
        self.assertEqual(res2.data['course_progress_pct'], 100)
        self.assertEqual(res2.data['course_status'], CourseAssignment.Status.COMPLETED)
        self.assertIsNotNone(res2.data['certificate'])

        # Refresh assignment from DB
        self.assignment_a1.refresh_from_db()
        self.assertEqual(self.assignment_a1.status, CourseAssignment.Status.COMPLETED)
        self.assertTrue(hasattr(self.assignment_a1, 'certificate'))

        # Nurse can now view her certificate in /api/staff-portal/certificates/
        res_certs = self.client.get('/api/staff-portal/certificates/')
        self.assertEqual(res_certs.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_certs.data), 1)
        self.assertEqual(res_certs.data[0]['recipient_name'], 'Alice Nurse')

    # ── Test 5: HR / Admin maintains full access ──────────────────────────────
    def test_admin_hr_full_access(self):
        self.client.force_authenticate(user=self.admin_user)

        # Admin can create courses
        res = self.client.post('/api/lms/courses/', {
            'title': 'New HR Onboarding Course',
            'category': 'onboarding',
            'description': 'Orientation for all new hires.'
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        new_course_id = res.data['id']

        # Admin can assign courses with optional is_mandatory and due_date
        res_assign = self.client.post(
            f'/api/lms/courses/{new_course_id}/assign/',
            {
                'staff_ids': [self.nurse_a_staff.id],
                'due_date': '2026-12-31',
                'is_mandatory': True,
            },
            format='json'
        )
        self.assertEqual(res_assign.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_assign.data['count'], 1)

        # Verify assignment was saved with mandatory flag
        new_assign = CourseAssignment.objects.get(course_id=new_course_id, staff=self.nurse_a_staff)
        self.assertTrue(new_assign.is_mandatory)
        self.assertEqual(str(new_assign.due_date), '2026-12-31')

        # Admin can view all assignments
        res_all_assign = self.client.get('/api/lms/assignments/')
        self.assertEqual(res_all_assign.status_code, status.HTTP_200_OK)
        all_assign_items = res_all_assign.data.get('results', res_all_assign.data) if isinstance(res_all_assign.data, dict) else res_all_assign.data
        self.assertGreaterEqual(len(all_assign_items), 2)

    # ── Test 6: Public certificate verification does not leak clinical data ───
    def test_public_certificate_verify_privacy(self):
        # Create a certificate
        cert = Certificate.issue(self.assignment_a1)

        # Unauthenticated client
        unauth_client = APIClient()
        res = unauth_client.get(f'/api/certificates/verify/{cert.certificate_id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['valid'])
        self.assertEqual(res.data['recipient_name'], 'Alice Nurse')
        self.assertEqual(res.data['title'], 'Infection Control 101')

        # Verify no clinical or sensitive fields are returned
        data = res.data
        self.assertNotIn('patient', data)
        self.assertNotIn('medical_record', data)
        self.assertNotIn('diagnosis', data)
        self.assertNotIn('hourly_rate', data)
        self.assertNotIn('phone', data)
        self.assertNotIn('email', data)

    # ── Test 7: LMS Media Protection ──────────────────────────────────────────
    def test_lms_media_protection(self):
        import os
        from django.conf import settings

        # Create a dummy video file on disk in MEDIA_ROOT/lms/videos/
        media_videos_dir = os.path.join(settings.MEDIA_ROOT, 'lms', 'videos')
        os.makedirs(media_videos_dir, exist_ok=True)
        video_filename = 'test_lecture_vid_a1.mp4'
        video_path = os.path.join(media_videos_dir, video_filename)
        with open(video_path, 'wb') as f:
            f.write(b'dummy_video_stream_content_bytes')

        self.lecture_1a.video_file = f"lms/videos/{video_filename}"
        self.lecture_1a.save(update_fields=['video_file'])

        # 1. Unauthenticated request -> 401
        unauth_client = APIClient()
        res_unauth = unauth_client.get(f'/media/lms/videos/{video_filename}')
        self.assertEqual(res_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        # 2. Nurse A (assigned to course_1 containing lecture_1a) -> 200 OK
        self.client.force_authenticate(user=self.nurse_a_user)
        res_a = self.client.get(f'/media/lms/videos/{video_filename}')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)

        # 3. Nurse B (NOT assigned to course_1) -> 403 Forbidden!
        self.client.force_authenticate(user=self.nurse_b_user)
        res_b = self.client.get(f'/media/lms/videos/{video_filename}')
        self.assertEqual(res_b.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Admin -> 200 OK
        self.client.force_authenticate(user=self.admin_user)
        res_admin = self.client.get(f'/media/lms/videos/{video_filename}')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)

        # Clean up temporary test file
        try:
            if os.path.exists(video_path):
                os.remove(video_path)
        except OSError:
            pass
