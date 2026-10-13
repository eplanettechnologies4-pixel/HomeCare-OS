import secrets
import string

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from homecareOS.permissions import (
    CanDeletePatient, IsPrescriptionManagementAllowed, CanManagePatientPortal,
    is_family_user, IsPatientOrFamilyOwner
)
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
    permission_classes = [IsAuthenticated, CanDeletePatient, IsPatientOrFamilyOwner]
    queryset = Patient.objects.select_related('assigned_care_manager').all().order_by('-created_at')

    def get_queryset(self):
        qs = Patient.objects.select_related('assigned_care_manager').all().order_by('-created_at')
        user = self.request.user
        if is_family_user(user):
            return qs.filter(portal_user=user)
        return qs

    def get_object(self):
        user = self.request.user
        if is_family_user(user):
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            lookup_val = self.kwargs.get(lookup_url_kwarg)
            if lookup_val is not None:
                target = Patient.objects.filter(**{self.lookup_field: lookup_val}).first()
                if target and target.portal_user_id != user.id:
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You do not have permission to access this patient's records.")
        return super().get_object()

    def get_permissions(self):
        if self.action in ['create_portal_user', 'reset_portal_password']:
            return [IsAuthenticated(), CanManagePatientPortal()]
        return super().get_permissions()

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

    def _handle_notes(self, request):
        patient = self.get_object()
        if request.method == 'POST':
            staff = getattr(request.user, 'staffmember', None)
            note_text = request.data.get('note', '') or request.data.get('notes', '')
            booking_id = request.data.get('booking') or request.data.get('booking_id')
            booking = None
            if booking_id:
                from bookings.models import Booking
                booking = Booking.objects.filter(pk=booking_id, patient=patient).first()
            created_note = NurseNote.objects.create(
                patient=patient,
                recorded_by=staff,
                booking=booking,
                note=note_text or 'Nurse note recorded.'
            )
            return Response(NurseNoteSerializer(created_note).data, status=status.HTTP_201_CREATED)
        notes = patient.nurse_notes.select_related('recorded_by').order_by('-recorded_at')
        return Response(NurseNoteSerializer(notes, many=True).data)

    @action(detail=True, methods=['get', 'post'])
    def nurse_notes(self, request, pk=None):
        return self._handle_notes(request)

    @action(detail=True, methods=['get'])
    def labs(self, request, pk=None):
        patient = self.get_object()
        data = list(LabResultSerializer(patient.lab_results.all(), many=True).data)
        try:
            from lab.models import LabReport
            reports = LabReport.objects.filter(lab_order__patient=patient).select_related('lab_order')
            for rep in reports:
                for test in rep.lab_order.tests.all():
                    # If not already present
                    val = str(rep.result_data.get(test.name, 'Completed'))
                    data.append({
                        'id': f"rep-{rep.id}-{test.id}",
                        'patient': patient.id,
                        'test_name': test.name,
                        'result_value': val,
                        'unit': '',
                        'reference_range': '',
                        'is_abnormal': rep.flagged_abnormal,
                        'collected_at': rep.lab_order.collected_at.isoformat() if rep.lab_order.collected_at else rep.uploaded_at.isoformat(),
                        'reported_at': rep.uploaded_at.isoformat(),
                        'document': rep.result_file.url if rep.result_file else None,
                    })
        except Exception:
            pass
        return Response(data)

    @action(
        detail=True,
        methods=['get', 'post'],
        parser_classes=[MultiPartParser, FormParser, JSONParser],
        permission_classes=[IsPrescriptionManagementAllowed],
    )
    def prescriptions(self, request, pk=None):
        patient = self.get_object()
        if request.method == 'GET':
            return Response(
                PrescriptionSerializer(
                    patient.prescriptions.all(),
                    many=True,
                    context={'request': request}
                ).data
            )

        # POST /api/patients/{id}/prescriptions/
        serializer = PrescriptionSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Attach staff member if available from authenticated user
        staff = None
        if hasattr(request.user, 'staffmember'):
            staff = request.user.staffmember

        # Check if booking is provided in request
        booking_id = request.data.get('booking') or request.data.get('booking_id')
        booking = None
        if booking_id:
            from bookings.models import Booking
            booking = Booking.objects.filter(pk=booking_id, patient=patient).first()

        prescription = serializer.save(
            patient=patient,
            uploaded_by=staff,
            booking=booking or serializer.validated_data.get('booking')
        )
        return Response(
            PrescriptionSerializer(prescription, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )

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

    @action(detail=True, methods=['get', 'post'])
    def notes(self, request, pk=None):
        return self._handle_notes(request)

    # ── Patient Portal Login Actions ──────────────────────────────────────────

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticated, CanManagePatientPortal],
        url_path='create_portal_user'
    )
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
            import re
            base = f"{patient.first_name.strip().lower()}.{patient.last_name.strip().lower()}"
            base = re.sub(r'[^a-z0-9.]', '', base).strip('.') or 'patient'
            username = base
            suffix = 1
            while User.objects.filter(username__iexact=username).exists():
                username = f"{base}{suffix}"
                suffix += 1

        if not password:
            import secrets, string
            alphabet = string.ascii_letters + string.digits + "@#!"
            password = ''.join(secrets.choice(alphabet) for _ in range(12))

        if len(password) < 8:
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
                'password': password,
                'patient_id': patient.id,
                'user_id': user.id,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=['post'],
        permission_classes=[IsAuthenticated, CanManagePatientPortal],
        url_path='reset_portal_password'
    )
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
    permission_classes = [IsPrescriptionManagementAllowed, IsPatientOrFamilyOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_family_user(user):
            return qs.filter(patient__portal_user=user)
        return qs

    def get_object(self):
        user = self.request.user
        if is_family_user(user):
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            lookup_val = self.kwargs.get(lookup_url_kwarg)
            if lookup_val is not None:
                target = Prescription.objects.filter(**{self.lookup_field: lookup_val}).first()
                if target and (not target.patient or target.patient.portal_user_id != user.id):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You do not have permission to access this prescription.")
        return super().get_object()


class PatientPrescriptionDetailView(APIView):
    """
    Endpoint for /api/patients/{patient_pk}/prescriptions/{prescription_pk}/
    Supports:
    - GET: view prescription details and file URL
    - PATCH / PUT: update prescription (Admins only)
    - DELETE: delete prescription (Admins only)
    """
    permission_classes = [IsPrescriptionManagementAllowed, IsPatientOrFamilyOwner]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_object(self, patient_pk, prescription_pk):
        user = self.request.user
        if is_family_user(user):
            target_patient = Patient.objects.filter(pk=patient_pk).first()
            if target_patient and target_patient.portal_user_id != user.id:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You do not have permission to access this patient's records.")
        return get_object_or_404(Prescription, pk=prescription_pk, patient_id=patient_pk)

    def get(self, request, patient_pk, prescription_pk):
        prescription = self.get_object(patient_pk, prescription_pk)
        return Response(PrescriptionSerializer(prescription, context={'request': request}).data)

    def patch(self, request, patient_pk, prescription_pk):
        prescription = self.get_object(patient_pk, prescription_pk)
        serializer = PrescriptionSerializer(
            prescription, data=request.data, partial=True, context={'request': request}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, patient_pk, prescription_pk):
        return self.patch(request, patient_pk, prescription_pk)

    def delete(self, request, patient_pk, prescription_pk):
        prescription = self.get_object(patient_pk, prescription_pk)
        prescription.delete()
        return Response({'detail': 'Prescription deleted successfully.'}, status=status.HTTP_204_NO_CONTENT)



class VitalSignViewSet(viewsets.ModelViewSet):
    queryset = VitalSign.objects.select_related('patient', 'recorded_by').all()
    serializer_class = VitalSignSerializer
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_family_user(user):
            return qs.filter(patient__portal_user=user)
        return qs

    def get_object(self):
        user = self.request.user
        if is_family_user(user):
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            lookup_val = self.kwargs.get(lookup_url_kwarg)
            if lookup_val is not None:
                target = VitalSign.objects.filter(**{self.lookup_field: lookup_val}).first()
                if target and (not target.patient or target.patient.portal_user_id != user.id):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You do not have permission to access these vitals.")
        return super().get_object()


class NurseNoteViewSet(viewsets.ModelViewSet):
    queryset = NurseNote.objects.select_related('patient', 'recorded_by').all()
    serializer_class = NurseNoteSerializer
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_family_user(user):
            return qs.filter(patient__portal_user=user)
        return qs

    def get_object(self):
        user = self.request.user
        if is_family_user(user):
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            lookup_val = self.kwargs.get(lookup_url_kwarg)
            if lookup_val is not None:
                target = NurseNote.objects.filter(**{self.lookup_field: lookup_val}).first()
                if target and (not target.patient or target.patient.portal_user_id != user.id):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You do not have permission to access this note.")
        return super().get_object()


class LabResultViewSet(viewsets.ModelViewSet):
    queryset = LabResult.objects.all()
    serializer_class = LabResultSerializer
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_family_user(user):
            return qs.filter(patient__portal_user=user)
        return qs

    def get_object(self):
        user = self.request.user
        if is_family_user(user):
            lookup_url_kwarg = self.lookup_url_kwarg or self.lookup_field
            lookup_val = self.kwargs.get(lookup_url_kwarg)
            if lookup_val is not None:
                target = LabResult.objects.filter(**{self.lookup_field: lookup_val}).first()
                if target and (not target.patient or target.patient.portal_user_id != user.id):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You do not have permission to access this lab result.")
        return super().get_object()


