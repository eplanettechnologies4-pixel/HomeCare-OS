"""
LMS serializers — read and write shapes for all five LMS models.
"""
from rest_framework import serializers
from .models import Course, Lecture, CourseAssignment, LectureProgress, Certificate


class LectureSerializer(serializers.ModelSerializer):
    video_source = serializers.ReadOnlyField()

    class Meta:
        model = Lecture
        fields = [
            'id', 'course', 'title', 'video_file', 'video_url',
            'video_source', 'duration_seconds', 'order', 'description', 'created_at',
        ]
        read_only_fields = ['id', 'video_source', 'created_at']


class LectureProgressSerializer(serializers.ModelSerializer):
    lecture_title = serializers.CharField(source='lecture.title', read_only=True)
    lecture_order = serializers.IntegerField(source='lecture.order', read_only=True)
    duration_seconds = serializers.IntegerField(source='lecture.duration_seconds', read_only=True)

    class Meta:
        model = LectureProgress
        fields = [
            'id', 'lecture', 'lecture_title', 'lecture_order',
            'duration_seconds', 'watched_seconds', 'percentage',
            'completed', 'last_updated',
        ]
        read_only_fields = ['id', 'lecture_title', 'lecture_order', 'duration_seconds', 'completed', 'last_updated']


class CertificateSerializer(serializers.ModelSerializer):
    pdf_url = serializers.SerializerMethodField()
    staff_name = serializers.CharField(source='staff.full_name', read_only=True, default=None)
    staff_role = serializers.CharField(source='staff.get_role_display', read_only=True, default=None)
    course_title = serializers.CharField(source='assignment.course.title', read_only=True, default=None)
    generated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Certificate
        fields = [
            'id', 'certificate_id', 'certificate_number', 'recipient_name',
            'staff', 'staff_name', 'staff_role', 'title', 'description', 'issue_date',
            'generated_by', 'generated_by_name', 'assignment', 'course_title',
            'pdf_file', 'pdf_url'
        ]
        read_only_fields = ['id', 'certificate_id', 'certificate_number', 'generated_by', 'pdf_file', 'pdf_url', 'course_title', 'staff_role']

    def get_pdf_url(self, obj):
        request = self.context.get('request')
        if obj.pdf_file:
            if request:
                return request.build_absolute_uri(obj.pdf_file.url)
            return obj.pdf_file.url
        return None

    def get_generated_by_name(self, obj):
        if obj.generated_by:
            return obj.generated_by.get_full_name() or obj.generated_by.username
        return 'System Admin'


class CourseAssignmentSerializer(serializers.ModelSerializer):
    staff_name   = serializers.CharField(source='staff.full_name', read_only=True)
    staff_role   = serializers.CharField(source='staff.role_display', read_only=True)
    staff_id     = serializers.IntegerField(source='staff.id', read_only=True)
    course_title = serializers.CharField(source='course.title', read_only=True)
    course_category = serializers.CharField(source='course.get_category_display', read_only=True)
    lecture_progresses = LectureProgressSerializer(many=True, read_only=True)
    certificate  = CertificateSerializer(read_only=True)
    progress_pct = serializers.SerializerMethodField()

    class Meta:
        model = CourseAssignment
        fields = [
            'id', 'staff', 'staff_id', 'staff_name', 'staff_role',
            'course', 'course_title', 'course_category',
            'assigned_by', 'assigned_date', 'due_date', 'status',
            'completed_date', 'lecture_progresses', 'certificate', 'progress_pct',
        ]
        read_only_fields = [
            'id', 'staff_id', 'staff_name', 'staff_role',
            'course_title', 'course_category', 'assigned_by',
            'assigned_date', 'completed_date', 'lecture_progresses',
            'certificate', 'progress_pct',
        ]

    def get_progress_pct(self, obj):
        lectures = obj.course.lectures.all()
        total = lectures.count()
        if total == 0:
            return 0
        completed = obj.lecture_progresses.filter(completed=True).count()
        return round(completed / total * 100)


class CourseLectureInlineSerializer(serializers.ModelSerializer):
    video_source = serializers.ReadOnlyField()

    class Meta:
        model = Lecture
        fields = ['id', 'title', 'video_file', 'video_url', 'video_source', 'duration_seconds', 'order', 'description']


class CourseSerializer(serializers.ModelSerializer):
    lectures      = CourseLectureInlineSerializer(many=True, read_only=True)
    lecture_count = serializers.ReadOnlyField()
    enrolled_count = serializers.ReadOnlyField()
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = [
            'id', 'title', 'description', 'category', 'category_display',
            'is_active', 'created_by', 'created_by_name', 'created_at', 'updated_at',
            'lectures', 'lecture_count', 'enrolled_count',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at', 'lectures', 'lecture_count', 'enrolled_count']

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.username
        return 'Admin'


class StaffTrainingSerializer(serializers.ModelSerializer):
    """Compact assignment + progress for staff profile Training tab."""
    course_title    = serializers.CharField(source='course.title', read_only=True)
    course_category = serializers.CharField(source='course.get_category_display', read_only=True)
    lectures        = CourseLectureInlineSerializer(source='course.lectures', many=True, read_only=True)
    lecture_progresses = LectureProgressSerializer(many=True, read_only=True)
    certificate     = CertificateSerializer(read_only=True)
    progress_pct    = serializers.SerializerMethodField()
    total_lectures  = serializers.SerializerMethodField()
    completed_lectures = serializers.SerializerMethodField()

    class Meta:
        model = CourseAssignment
        fields = [
            'id', 'course', 'course_title', 'course_category',
            'assigned_date', 'due_date', 'status', 'completed_date',
            'progress_pct', 'total_lectures', 'completed_lectures',
            'lectures', 'lecture_progresses', 'certificate',
        ]

    def get_progress_pct(self, obj):
        total = obj.course.lectures.count()
        if total == 0:
            return 0
        done = obj.lecture_progresses.filter(completed=True).count()
        return round(done / total * 100)

    def get_total_lectures(self, obj):
        return obj.course.lectures.count()

    def get_completed_lectures(self, obj):
        return obj.lecture_progresses.filter(completed=True).count()
