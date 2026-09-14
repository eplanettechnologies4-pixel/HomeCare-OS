"""
HomeCare OS — LMS Models
========================
Five models following the existing project patterns:

  Course          — a training course with category & metadata
  Lecture         — a video lecture within a course (file or URL)
  CourseAssignment— staff member ↔ course assignment with status lifecycle
  LectureProgress — per-assignment watch-progress ping (mirrors GPS ping pattern)
  Certificate     — auto-issued PDF when all lectures in a course are completed
"""
import uuid
from django.db import models
from django.utils import timezone


def _cert_number():
    """Generate a unique, human-readable certificate number: CERT-<8-hex>."""
    return f"CERT-{uuid.uuid4().hex[:8].upper()}"


class Course(models.Model):
    class Category(models.TextChoices):
        ONBOARDING    = 'onboarding',    'New Staff Onboarding'
        CLINICAL      = 'clinical',      'Clinical Skills'
        COMPLIANCE    = 'compliance',    'Compliance & Safety'
        LEADERSHIP    = 'leadership',    'Leadership & Management'
        TECHNOLOGY    = 'technology',    'Technology & Systems'
        SOFT_SKILLS   = 'soft_skills',   'Soft Skills'
        OTHER         = 'other',         'Other'

    title       = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category    = models.CharField(max_length=30, choices=Category.choices, default=Category.ONBOARDING)
    created_by  = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, related_name='lms_courses_created'
    )
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title

    @property
    def lecture_count(self):
        return self.lectures.count()

    @property
    def enrolled_count(self):
        return self.assignments.count()


class Lecture(models.Model):
    """
    A single video lecture within a Course.
    Supports either an uploaded video file (reusing the existing media storage
    pattern from patients/daily-report/ReportPhoto) or an external video URL.
    At least one of video_file or video_url must be set.
    """
    course           = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='lectures')
    title            = models.CharField(max_length=200)
    # Media file — stored under MEDIA_ROOT/lms/videos/ (same pattern as ReportPhoto)
    video_file       = models.FileField(upload_to='lms/videos/', blank=True, null=True)
    video_url        = models.URLField(blank=True)  # e.g. YouTube embed or internal URL
    duration_seconds = models.PositiveIntegerField(default=0, help_text='Expected duration in seconds')
    order            = models.PositiveSmallIntegerField(default=1)
    description      = models.TextField(blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['course', 'order']
        unique_together = [('course', 'order')]

    def __str__(self):
        return f"{self.course.title} — #{self.order}: {self.title}"

    @property
    def video_source(self):
        """Returns the best available video source (file URL preferred)."""
        if self.video_file:
            return self.video_file.url
        return self.video_url or ''


class CourseAssignment(models.Model):
    class Status(models.TextChoices):
        NOT_STARTED = 'not_started', 'Not Started'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED   = 'completed',   'Completed'

    staff         = models.ForeignKey(
        'staff.StaffMember', on_delete=models.CASCADE, related_name='course_assignments'
    )
    course        = models.ForeignKey(Course, on_delete=models.CASCADE, related_name='assignments')
    assigned_by   = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, related_name='lms_assignments_made'
    )
    assigned_date = models.DateTimeField(auto_now_add=True)
    due_date      = models.DateField(null=True, blank=True)
    status        = models.CharField(max_length=15, choices=Status.choices, default=Status.NOT_STARTED)
    completed_date = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-assigned_date']
        unique_together = [('staff', 'course')]  # one active assignment per staff-course pair

    def __str__(self):
        return f"{self.staff} → {self.course} [{self.status}]"

    def recalculate_status(self):
        """
        Called after each LectureProgress update.
        Marks the assignment completed once every lecture has a completed progress record.
        Mirrors the GPS-ping periodic-update architecture — called server-side on each ping.
        """
        lectures = self.course.lectures.all()
        if not lectures.exists():
            return

        completed_lecture_ids = set(
            self.lecture_progresses.filter(completed=True).values_list('lecture_id', flat=True)
        )
        all_completed = all(lec.id in completed_lecture_ids for lec in lectures)

        if all_completed and self.status != self.Status.COMPLETED:
            self.status = self.Status.COMPLETED
            self.completed_date = timezone.now()
            self.save(update_fields=['status', 'completed_date'])
            # Auto-issue certificate
            Certificate.issue(self)
        elif not all_completed and self.status == self.Status.NOT_STARTED:
            self.status = self.Status.IN_PROGRESS
            self.save(update_fields=['status'])


class LectureProgress(models.Model):
    """
    Per-lecture watch-progress record for a CourseAssignment.
    Updated by POST /api/lms/lectures/{id}/progress/ — mirrors the 30-second GPS ping pattern.
    Completion threshold: watched_percentage >= COMPLETION_THRESHOLD_PCT
    """
    COMPLETION_THRESHOLD_PCT = 90  # percent

    assignment       = models.ForeignKey(
        CourseAssignment, on_delete=models.CASCADE, related_name='lecture_progresses'
    )
    lecture          = models.ForeignKey(Lecture, on_delete=models.CASCADE, related_name='progresses')
    watched_seconds  = models.PositiveIntegerField(default=0)
    percentage       = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    completed        = models.BooleanField(default=False)
    last_updated     = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('assignment', 'lecture')]

    def __str__(self):
        return f"{self.assignment} — {self.lecture.title} {self.percentage}%"

    def save(self, *args, **kwargs):
        # Auto-mark completed at threshold
        if float(self.percentage) >= self.COMPLETION_THRESHOLD_PCT:
            self.completed = True
        super().save(*args, **kwargs)


def _cert_id():
    """Generate a unique, human-readable certificate ID: CERT-2026-<6-hex>."""
    return f"CERT-2026-{uuid.uuid4().hex[:6].upper()}"


class Certificate(models.Model):
    """
    Certificate model for HomeCare OS LMS.
    Supports both auto-issued course completion certificates and manually generated
    standalone certificates (e.g. Employee of the Month, Special Recognition).
    """
    certificate_id     = models.CharField(max_length=50, blank=True, db_index=True)
    certificate_number = models.CharField(max_length=50, unique=True, default=_cert_id)
    recipient_name     = models.CharField(max_length=150, blank=True)
    staff              = models.ForeignKey(
        'staff.StaffMember', on_delete=models.SET_NULL, null=True, blank=True, related_name='certificates'
    )
    title              = models.CharField(max_length=255, default='Certificate of Completion')
    description        = models.TextField(blank=True)
    issue_date         = models.DateField(default=timezone.now)
    generated_by       = models.ForeignKey(
        'auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='certificates_generated'
    )
    assignment         = models.OneToOneField(
        CourseAssignment, on_delete=models.SET_NULL, null=True, blank=True, related_name='certificate'
    )
    # PDF stored in MEDIA_ROOT/lms/certificates/ — same media pattern as ReportPhoto
    pdf_file           = models.FileField(upload_to='lms/certificates/', blank=True)

    class Meta:
        ordering = ['-issue_date', '-id']

    def __str__(self):
        return f"{self.certificate_id} — {self.recipient_name} ({self.title})"

    def save(self, *args, **kwargs):
        if not self.certificate_id:
            self.certificate_id = _cert_id()
        if not self.certificate_number:
            self.certificate_number = self.certificate_id
        if self.assignment and not self.recipient_name and self.assignment.staff:
            self.recipient_name = self.assignment.staff.full_name
            self.staff = self.assignment.staff
            if not self.title or self.title == 'Certificate of Completion':
                self.title = self.assignment.course.title
        elif self.staff and not self.recipient_name:
            self.recipient_name = self.staff.full_name
        super().save(*args, **kwargs)

    def generate_pdf(self, save_file=True):
        """
        Generate and optionally save the official printed PDF for this certificate.
        Uses HomeCarePDFGenerator with official landscape A4 template, purple/gold corner
        triangles, SECP/IHRA registrations, QR verification code, and company branding.
        """
        from django.core.files.base import ContentFile
        from reports.pdf_generator import HomeCarePDFGenerator

        data = {
            'certificate_id':     self.certificate_id,
            'certificate_number': self.certificate_number or self.certificate_id,
            'recipient_name':     self.recipient_name or (self.staff.full_name if self.staff else 'Recipient'),
            'title':              self.title,
            'description':        self.description or 'For successfully completing all requirements and demonstrating professional clinical excellence.',
            'issue_date':         self.issue_date.strftime('%d %B %Y') if hasattr(self.issue_date, 'strftime') else str(self.issue_date),
            'verification_url':   f"http://localhost:5173/verify-certificate/{self.certificate_id}",
        }

        generator = HomeCarePDFGenerator('certificate', data, generated_by='eHealth Hospital At Home')
        pdf_bytes = generator.generate()

        if save_file:
            filename = f"{self.certificate_id}.pdf"
            self.pdf_file.save(filename, ContentFile(pdf_bytes), save=False)
            Certificate.objects.filter(pk=self.pk).update(pdf_file=self.pdf_file.name)

        return pdf_bytes

    @classmethod
    def issue(cls, assignment):
        """
        Generate and save a certificate PDF for a completed CourseAssignment.
        """
        existing = cls.objects.filter(assignment=assignment).first()
        if existing:
            return existing

        cert_id = _cert_id()
        cert = cls.objects.create(
            assignment=assignment,
            certificate_id=cert_id,
            certificate_number=cert_id,
            recipient_name=assignment.staff.full_name,
            staff=assignment.staff,
            title=assignment.course.title,
            description=f"For successfully completing all lectures and curriculum requirements of the {assignment.course.title} training program.",
            issue_date=timezone.now().date(),
        )
        cert.generate_pdf(save_file=True)
        return cert
