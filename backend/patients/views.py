from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
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
    queryset = Patient.objects.select_related('assigned_care_manager').all()

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

