import secrets
import string

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from homecareOS.permissions import CanDeletePatient
from .models import (
    Patient, Prescription, VitalSign, NurseNote, LabResult,
    DailyReport, ReportPhoto, MARAdministration,
)
from .serializers import (
    PatientListSerializer, PatientDetailSerializer,
    PrescriptionSerializer, VitalSignSerializer,
    NurseNoteSerializer, LabResultSerializer,
    DailyReportSerializer, MARAdministrationSerializer,
)


class PatientViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanDeletePatient]
    queryset = Patient.objects.select_related('assigned_care_manager').all().order_by('-created_at')

    def get_serializer_class(self):
        if self.action in ['list']:
            return PatientListSerializer
        return PatientDetailSerializer

    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        """All visits (bookings) for this patient in reverse chronological order."""
        patient = self.get_object()
        from bookings.serializers import BookingListSerializer
        bookings = patient.bookings.all().order_by('-scheduled_time')
        return Response(BookingListSerializer(bookings, many=True).data)

    @action(detail=True, methods=['get'])
    def vitals(self, request, pk=None):
        patient = self.get_object()
        return Response(VitalSignSerializer(patient.vitals.all(), many=True).data)

    @action(detail=True, methods=['get'])
    def nurse_notes(self, request, pk=None):
        patient = self.get_object()
        return Response(NurseNoteSerializer(patient.nurse_notes.all(), many=True).data)

    @action(detail=True, methods=['get'])
    def labs(self, request, pk=None):
        patient = self.get_object()
        return Response(LabResultSerializer(patient.lab_results.all(), many=True).data)

    @action(detail=True, methods=['get'])
    def prescriptions(self, request, pk=None):
        patient = self.get_object()
        return Response(PrescriptionSerializer(patient.prescriptions.all(), many=True).data)

    # ── Mobile actions ────────────────────────────────────────────────────────

    @action(
        detail=True, methods=['post'],
        url_path='daily-report',
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def daily_report(self, request, pk=None):
        """
        POST /api/patients/{id}/daily-report/

        Multipart form body:
          - booking_id        (int, required)
          - care_items_checked (JSON string, e.g. '["BP Check","Medication Given"]')
          - notes             (text)
          - photos            (multiple file fields, key='photos')

        Server-side actions (atomic):
          1. Resolve the submitting staff member from the JWT
          2. Create a NurseNote from the notes text
          3. Create a DailyReport linking booking, patient, care items, and nurse note
          4. Attach uploaded photos as ReportPhoto objects
        """
        import json
        from staff.models import StaffMember
        from bookings.models import Booking

        patient = self.get_object()

        # Resolve the submitting staff from JWT
        try:
            staff = StaffMember.objects.get(user=request.user)
        except StaffMember.DoesNotExist:
            return Response(
                {'error': 'No StaffMember profile found for this account.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        booking_id = request.data.get('booking_id')
        notes_text = request.data.get('notes', '')
        care_items_raw = request.data.get('care_items_checked', '[]')
        photo_files = request.FILES.getlist('photos')

        # Parse care_items_checked — accept both JSON string and Python list
        if isinstance(care_items_raw, str):
            try:
                care_items = json.loads(care_items_raw)
            except (json.JSONDecodeError, ValueError):
                return Response(
                    {'error': 'care_items_checked must be a valid JSON array.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            care_items = care_items_raw

        # Resolve the booking (must belong to this patient)
        booking = None
        if booking_id:
            try:
                booking = Booking.objects.get(pk=booking_id, patient=patient)
            except Booking.DoesNotExist:
                return Response(
                    {'error': 'Booking not found for this patient.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

        now = timezone.now()

        # 1. Auto-create a NurseNote so Form A is populated
        nurse_note = NurseNote.objects.create(
            patient=patient,
            recorded_by=staff,
            booking=booking,
            note=notes_text or 'Daily visit report submitted via mobile.',
        )

        # 2. Create the DailyReport record
        report = DailyReport.objects.create(
            patient=patient,
            booking=booking,
            submitted_by=staff,
            care_items_checked=care_items,
            notes=notes_text,
            nurse_note=nurse_note,
        )

        # 3. Attach uploaded photos
        for photo_file in photo_files:
            photo = ReportPhoto.objects.create(image=photo_file)
            report.photos.add(photo)

        return Response(
            {
                'daily_report_id': report.id,
                'nurse_note_id': nurse_note.id,
                'photo_count': len(photo_files),
                'detail': 'Daily report submitted successfully.',
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='mar/administer')
    def mar_administer(self, request, pk=None):
        """
        POST /api/patients/{id}/mar/administer/
        Body: {"prescription_id": <int>, "day_number": <int>}

        Records a single dose as administered.
        - administered_by comes from the JWT (never client-supplied)
        - administered_at is set server-side (never trust client clock)
        - Idempotent: returns 409 if the dose was already recorded today
        """
        from staff.models import StaffMember

        patient = self.get_object()

        try:
            staff = StaffMember.objects.get(user=request.user)
        except StaffMember.DoesNotExist:
            return Response({'error': 'No StaffMember profile found.'}, status=status.HTTP_403_FORBIDDEN)

        prescription_id = request.data.get('prescription_id')
        day_number = request.data.get('day_number')

        if prescription_id is None or day_number is None:
            return Response(
                {'error': 'prescription_id and day_number are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            prescription = Prescription.objects.get(pk=prescription_id, patient=patient)
        except Prescription.DoesNotExist:
            return Response({'error': 'Prescription not found for this patient.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()

        # Idempotency: check if already administered today for this day_number
        already_administered = MARAdministration.objects.filter(
            prescription=prescription,
            day_number=day_number,
            administered_at__date=now.date(),
        ).exists()

        if already_administered:
            return Response(
                {
                    'error': 'already_administered',
                    'detail': (
                        f'{prescription.medication} has already been marked as administered '
                        f'for day_number={day_number} today ({now.date()}). '
                        'Double-administration prevented.'
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        record = MARAdministration.objects.create(
            prescription=prescription,
            day_number=day_number,
            administered_by=staff,
            administered_at=now,
        )

        return Response(MARAdministrationSerializer(record).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='mar/due-today')
    def mar_due_today(self, request, pk=None):
        """
        GET /api/patients/{id}/mar/due-today/

        Returns today's due (and overdue) medications for this patient.
        Pre-filters server-side so the mobile TodaysMedsScreen doesn't need
        to download all prescriptions and filter locally.

        Each item includes:
          - prescription details
          - administered (bool) — whether it's already been ticked today
        """
        patient = self.get_object()
        now = timezone.now()
        today_day_number = now.weekday()

        prescriptions = patient.prescriptions.all()
        result = []

        for rx in prescriptions:
            administered_today = MARAdministration.objects.filter(
                prescription=rx,
                day_number=today_day_number,
                administered_at__date=now.date(),
            ).exists()

            result.append({
                **PrescriptionSerializer(rx).data,
                'administered': administered_today,
                'day_number': today_day_number,
            })

        return Response(result)

    @action(detail=True, methods=['get'])
    def notes(self, request, pk=None):
        patient = self.get_object()
        notes = patient.nurse_notes.select_related('recorded_by').order_by('-recorded_at')
        return Response(NurseNoteSerializer(notes, many=True).data)

    # ── Patient Portal Login Actions ──────────────────────────────────────────

    @action(detail=True, methods=['post'], url_path='create_portal_user')
    def create_portal_user(self, request, pk=None):
        """
        POST /api/patients/{id}/create_portal_user/
        Body: {"username": "...", "password": "..."}

        Creates a Django User account with role=patient_family and links it
        to this Patient via Patient.portal_user.  Idempotent: if the patient
        already has a portal account an error is returned so the caller can
        handle the duplicate gracefully.
        """
        from accounts.models import UserProfile, UserRole

        patient = self.get_object()

        if patient.portal_user_id:
            return Response(
                {'error': 'This patient already has a portal login account.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        username = (request.data.get('username') or '').strip()
        password = (request.data.get('password') or '').strip()

        if not username:
            return Response({'error': 'username is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not password or len(password) < 8:
            return Response(
                {'error': 'password must be at least 8 characters.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username__iexact=username).exists():
            return Response(
                {'error': f'Username "{username}" is already taken. Please choose another.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                password=password,
                first_name=patient.first_name,
                last_name=patient.last_name,
                email=getattr(patient, 'email', '') or '',
            )
            UserProfile.objects.create(
                user=user,
                role=UserRole.PATIENT_FAMILY,
                status='active',
            )
            patient.portal_user = user
            patient.save(update_fields=['portal_user'])

        return Response(
            {
                'detail': 'Portal account created successfully.',
                'username': username,
                'patient_id': patient.id,
                'user_id': user.id,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='reset_portal_password')
    def reset_portal_password(self, request, pk=None):
        """
        POST /api/patients/{id}/reset_portal_password/

        Generates a new random 12-character password for the linked portal
        user account and returns it in plaintext so the admin can share it
        with the patient / family.  Mirrors the staff reset-password flow.
        """
        patient = self.get_object()

        if not patient.portal_user_id:
            return Response(
                {'error': 'This patient does not have a portal account yet. Create one first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Generate a secure random password (letters + digits + safe symbols)
        alphabet = string.ascii_letters + string.digits + '@#!'
        new_password = ''.join(secrets.choice(alphabet) for _ in range(12))

        patient.portal_user.set_password(new_password)
        patient.portal_user.save(update_fields=['password'])

        return Response(
            {
                'detail': 'Password reset successfully.',
                'username': patient.portal_user.username,
                'new_password': new_password,
                'patient_id': patient.id,
            },
            status=status.HTTP_200_OK,
        )


class PrescriptionViewSet(viewsets.ModelViewSet):
    queryset = Prescription.objects.all()
    serializer_class = PrescriptionSerializer


class VitalSignViewSet(viewsets.ModelViewSet):
    queryset = VitalSign.objects.select_related('patient', 'recorded_by').all()
    serializer_class = VitalSignSerializer


class NurseNoteViewSet(viewsets.ModelViewSet):
    queryset = NurseNote.objects.select_related('patient', 'recorded_by').all()
    serializer_class = NurseNoteSerializer


class LabResultViewSet(viewsets.ModelViewSet):
    queryset = LabResult.objects.all()
    serializer_class = LabResultSerializer

