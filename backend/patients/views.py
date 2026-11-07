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
    is_family_user, IsPatientOrFamilyOwner, get_user_role,
)
from accounts.models import AuditLog
from .models import (
    Patient, Prescription, VitalSign, NurseNote, LabResult,
    DailyReport, ReportPhoto, MARAdministration, DoctorNote, PhysioNote,
    TherapyNote, ClinicalConsent,
)
from .serializers import (
    PatientListSerializer, PatientDetailSerializer,
    PrescriptionSerializer, VitalSignSerializer,
    NurseNoteSerializer, LabResultSerializer,
    DailyReportSerializer, MARAdministrationSerializer,
)
from .scoping import (
    check_nurse_patient_access, filter_queryset_for_nurse,
    check_clinician_patient_access, filter_queryset_for_clinician,
    can_view_psychotherapy_note, is_treating_doctor_for_patient,
)
from homecareOS.clinician_permissions import (
    can_user_access_chart_tab, enforce_tab_permission,
    validate_entry_immutability, log_chart_audit, normalize_clinical_role,
    enforce_addendum_permission,
)


class PatientViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanDeletePatient, IsPatientOrFamilyOwner]
    queryset = Patient.objects.select_related('assigned_care_manager').all().order_by('-created_at')

    def get_queryset(self):
        qs = Patient.objects.select_related('assigned_care_manager').all().order_by('-created_at')
        user = self.request.user
        if is_family_user(user):
            return qs.filter(portal_user=user)
        return filter_queryset_for_nurse(qs, user, patient_field=None)

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
        obj = super().get_object()
        check_nurse_patient_access(user, obj)
        return obj

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

    @action(detail=True, methods=['get', 'post'], url_path='doctor-notes')
    def doctor_notes(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        from staff_portal.serializers import DoctorNoteSerializer

        if request.method == 'GET':
            log_chart_audit(request, patient, 'Read Patient Record', 'Doctor Notes')
            notes = patient.doctor_notes.select_related('doctor', 'signed_by').order_by('-created_at')
            return Response(DoctorNoteSerializer(notes, many=True).data)

        # POST: create doctor note
        enforce_tab_permission(request.user, 'doctor_notes', action='write')
        staff = getattr(request.user, 'staffmember', None)
        notes_text = request.data.get('notes', '')
        plan_text = request.data.get('plan', '')
        booking_id = request.data.get('booking_id')
        booking = None
        if booking_id:
            from bookings.models import Booking
            booking = Booking.objects.filter(pk=booking_id, patient=patient).first()

        is_signed = bool(request.data.get('is_signed', False))
        note = DoctorNote.objects.create(
            patient=patient,
            doctor=staff,
            booking=booking,
            notes=notes_text,
            plan=plan_text,
            is_signed=is_signed,
            signed_at=timezone.now() if is_signed else None,
            signed_by=staff if is_signed else None,
        )
        log_chart_audit(request, patient, 'Write Clinical Entry', 'Doctor Notes', record_id=note.id)
        return Response(DoctorNoteSerializer(note).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'put', 'patch', 'delete'], url_path=r'doctor-notes/(?P<note_id>\d+)')
    def doctor_note_detail(self, request, pk=None, note_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        note = get_object_or_404(DoctorNote, pk=note_id, patient=patient)
        from staff_portal.serializers import DoctorNoteSerializer

        if request.method == 'GET':
            log_chart_audit(request, patient, 'Read Patient Record', 'Doctor Notes', record_id=note.id)
            return Response(DoctorNoteSerializer(note).data)

        if request.method == 'DELETE':
            enforce_tab_permission(request.user, 'doctor_notes', action='write')
            if note.is_signed:
                return Response(
                    {'error': 'Signed clinical entries are permanently locked and cannot be deleted.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            note.delete()
            log_chart_audit(request, patient, 'Delete Clinical Entry', 'Doctor Notes', record_id=note_id)
            return Response(status=status.HTTP_204_NO_CONTENT)

        # PUT/PATCH: immutable if signed
        enforce_tab_permission(request.user, 'doctor_notes', action='write')
        if note.is_signed:
            return Response(
                {'error': 'Signed clinical entries are immutable. Submit an addendum with an audit reason instead.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if 'notes' in request.data:
            note.notes = request.data['notes']
        if 'plan' in request.data:
            note.plan = request.data['plan']
        note.save(update_fields=['notes', 'plan', 'updated_at'])
        log_chart_audit(request, patient, 'Update Clinical Entry', 'Doctor Notes', record_id=note.id)
        return Response(DoctorNoteSerializer(note).data)

    @action(detail=True, methods=['post'], url_path=r'doctor-notes/(?P<note_id>\d+)/sign')
    def sign_doctor_note(self, request, pk=None, note_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        enforce_tab_permission(request.user, 'doctor_notes', action='write')
        note = get_object_or_404(DoctorNote, pk=note_id, patient=patient)
        staff = getattr(request.user, 'staffmember', None)
        note.is_signed = True
        note.signed_at = timezone.now()
        note.signed_by = staff
        note.save(update_fields=['is_signed', 'signed_at', 'signed_by', 'updated_at'])
        log_chart_audit(request, patient, 'Sign Clinical Entry', 'Doctor Notes', record_id=note.id)
        from staff_portal.serializers import DoctorNoteSerializer
        return Response(DoctorNoteSerializer(note).data)

    @action(detail=True, methods=['post'], url_path=r'doctor-notes/(?P<note_id>\d+)/addendum')
    def add_doctor_note_addendum(self, request, pk=None, note_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        note = get_object_or_404(DoctorNote, pk=note_id, patient=patient)
        enforce_addendum_permission(request.user, patient, note)

        text = request.data.get('text', '').strip()
        reason = request.data.get('reason', '').strip()
        if not text or not reason:
            return Response({'error': 'Both addendum text and reason are required.'}, status=status.HTTP_400_BAD_REQUEST)

        staff = getattr(request.user, 'staffmember', None)
        role = staff.role if staff else 'admin'
        author_name = staff.full_name if staff else (request.user.get_full_name() or request.user.username)
        addendum = {
            'text': text,
            'reason': reason,
            'author': author_name,
            'role': role,
            'timestamp': timezone.now().isoformat(),
        }
        note.addenda.append(addendum)
        note.save(update_fields=['addenda', 'updated_at'])
        log_chart_audit(request, patient, 'Add Addendum', 'Doctor Notes', record_id=note.id)
        from staff_portal.serializers import DoctorNoteSerializer
        return Response(DoctorNoteSerializer(note).data)

    @action(detail=True, methods=['get'], url_path='physio-notes')
    def physio_notes(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        from staff_portal.serializers import PhysioNoteSerializer
        notes = patient.physio_notes.select_related('physio', 'signed_by').order_by('-created_at')
        log_chart_audit(request, patient, 'Read Patient Record', 'Physio Notes')
        return Response(PhysioNoteSerializer(notes, many=True).data)

    @action(detail=True, methods=['get', 'post'], url_path='therapy-notes')
    def therapy_notes(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        from staff_portal.serializers import TherapyNoteSerializer

        if request.method == 'GET':
            log_chart_audit(request, patient, 'Read Patient Record', 'Therapy Notes')
            all_notes = patient.therapy_notes.select_related('author', 'signed_by').order_by('-created_at')
            # Filter psychotherapy notes strictly by confidentiality rule
            visible_notes = [
                n for n in all_notes
                if n.discipline != 'psychotherapy' or can_view_psychotherapy_note(request.user, n)
            ]
            # Confidentiality audit: every read of psychotherapy notes by non-author creates an AuditLog entry
            staff = getattr(request.user, 'staffmember', None)
            psychotherapy_notes_read = [
                n for n in visible_notes
                if n.discipline == 'psychotherapy' and (not staff or n.author_id != staff.id)
            ]
            if psychotherapy_notes_read:
                note_ids_str = ", ".join(str(n.id) for n in psychotherapy_notes_read)
                user_role = get_user_role(request.user)
                actor_name = staff.full_name if staff else (request.user.get_full_name() or request.user.username)
                AuditLog.objects.create(
                    actor=request.user,
                    actor_name=actor_name,
                    action='Read Psychotherapy Notes',
                    target_user=f"Patient {patient.patient_code or f'PT-{patient.id}'} (ID: {patient.id})",
                    details=f"Confidential access by non-author | Role: {user_role} | Patient ID: {patient.id} | Note IDs: [{note_ids_str}]",
                    ip_address=request.META.get('REMOTE_ADDR') if hasattr(request, 'META') else None,
                    timestamp=timezone.now()
                )
            return Response(TherapyNoteSerializer(visible_notes, many=True).data)

        # POST: create therapy note
        enforce_tab_permission(request.user, 'physiotherapy', action='write')
        staff = getattr(request.user, 'staffmember', None)
        discipline = request.data.get('discipline')
        if not discipline:
            if staff and staff.role in ('speech', 'speech_therapist'):
                discipline = 'speech_therapy'
            elif staff and staff.role in ('psychologist', 'psychotherapist'):
                discipline = 'psychotherapy'
            else:
                discipline = 'physiotherapy'

        booking_id = request.data.get('booking_id')
        booking = None
        if booking_id:
            from bookings.models import Booking
            booking = Booking.objects.filter(pk=booking_id, patient=patient).first()

        is_signed = bool(request.data.get('is_signed', False))
        note = TherapyNote.objects.create(
            patient=patient,
            author=staff,
            booking=booking,
            discipline=discipline,
            session_notes=request.data.get('session_notes', ''),
            plan=request.data.get('plan', ''),
            goals=request.data.get('goals', ''),
            exercises=request.data.get('exercises', []),
            is_signed=is_signed,
            signed_at=timezone.now() if is_signed else None,
            signed_by=staff if is_signed else None,
        )
        log_chart_audit(request, patient, 'Write Clinical Entry', f'Therapy Notes ({discipline})', record_id=note.id)
        return Response(TherapyNoteSerializer(note).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'put', 'patch', 'delete'], url_path=r'therapy-notes/(?P<note_id>\d+)')
    def therapy_note_detail(self, request, pk=None, note_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        note = get_object_or_404(TherapyNote, pk=note_id, patient=patient)

        # Confidentiality check for psychotherapy notes
        if note.discipline == 'psychotherapy' and not can_view_psychotherapy_note(request.user, note):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        from staff_portal.serializers import TherapyNoteSerializer
        if request.method == 'GET':
            staff = getattr(request.user, 'staffmember', None)
            if note.discipline == 'psychotherapy' and (not staff or note.author_id != staff.id):
                user_role = get_user_role(request.user)
                actor_name = staff.full_name if staff else (request.user.get_full_name() or request.user.username)
                AuditLog.objects.create(
                    actor=request.user,
                    actor_name=actor_name,
                    action='Read Psychotherapy Note',
                    target_user=f"Patient {patient.patient_code or f'PT-{patient.id}'} (ID: {patient.id})",
                    details=f"Confidential access by non-author | Role: {user_role} | Patient ID: {patient.id} | Note IDs: [{note.id}]",
                    ip_address=request.META.get('REMOTE_ADDR') if hasattr(request, 'META') else None,
                    timestamp=timezone.now()
                )
            log_chart_audit(request, patient, 'Read Patient Record', 'Therapy Notes', record_id=note.id)
            return Response(TherapyNoteSerializer(note).data)

        if request.method == 'DELETE':
            enforce_tab_permission(request.user, 'physiotherapy', action='write')
            if note.is_signed:
                return Response(
                    {'error': 'Signed clinical entries are permanently locked and cannot be deleted.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            note.delete()
            log_chart_audit(request, patient, 'Delete Clinical Entry', 'Therapy Notes', record_id=note_id)
            return Response(status=status.HTTP_204_NO_CONTENT)

        enforce_tab_permission(request.user, 'physiotherapy', action='write')
        if note.is_signed:
            return Response(
                {'error': 'Signed clinical entries are immutable. Submit an addendum with an audit reason instead.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        if 'session_notes' in request.data:
            note.session_notes = request.data['session_notes']
        if 'plan' in request.data:
            note.plan = request.data['plan']
        if 'goals' in request.data:
            note.goals = request.data['goals']
        note.save(update_fields=['session_notes', 'plan', 'goals', 'updated_at'])
        log_chart_audit(request, patient, 'Update Clinical Entry', 'Therapy Notes', record_id=note.id)
        return Response(TherapyNoteSerializer(note).data)

    @action(detail=True, methods=['post'], url_path=r'therapy-notes/(?P<note_id>\d+)/sign')
    def sign_therapy_note(self, request, pk=None, note_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        enforce_tab_permission(request.user, 'physiotherapy', action='write')
        note = get_object_or_404(TherapyNote, pk=note_id, patient=patient)
        if note.discipline == 'psychotherapy' and not can_view_psychotherapy_note(request.user, note):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        staff = getattr(request.user, 'staffmember', None)
        note.is_signed = True
        note.signed_at = timezone.now()
        note.signed_by = staff
        note.save(update_fields=['is_signed', 'signed_at', 'signed_by', 'updated_at'])
        log_chart_audit(request, patient, 'Sign Clinical Entry', 'Therapy Notes', record_id=note.id)
        from staff_portal.serializers import TherapyNoteSerializer
        return Response(TherapyNoteSerializer(note).data)

    @action(detail=True, methods=['post'], url_path=r'therapy-notes/(?P<note_id>\d+)/addendum')
    def add_therapy_note_addendum(self, request, pk=None, note_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        note = get_object_or_404(TherapyNote, pk=note_id, patient=patient)
        if note.discipline == 'psychotherapy' and not can_view_psychotherapy_note(request.user, note):
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)

        enforce_addendum_permission(request.user, patient, note)

        text = request.data.get('text', '').strip()
        reason = request.data.get('reason', '').strip()
        if not text or not reason:
            return Response({'error': 'Both addendum text and reason are required.'}, status=status.HTTP_400_BAD_REQUEST)

        staff = getattr(request.user, 'staffmember', None)
        role = staff.role if staff else 'admin'
        author_name = staff.full_name if staff else (request.user.get_full_name() or request.user.username)
        addendum = {
            'text': text,
            'reason': reason,
            'author': author_name,
            'role': role,
            'timestamp': timezone.now().isoformat(),
        }
        note.addenda.append(addendum)
        note.save(update_fields=['addenda', 'updated_at'])
        log_chart_audit(request, patient, 'Add Addendum', 'Therapy Notes', record_id=note.id)
        from staff_portal.serializers import TherapyNoteSerializer
        return Response(TherapyNoteSerializer(note).data)

    @action(detail=True, methods=['get', 'post'], url_path='consents')
    def consents(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        from staff_portal.serializers import ClinicalConsentSerializer

        if request.method == 'GET':
            log_chart_audit(request, patient, 'Read Patient Record', 'Consents')
            consents = patient.consents.select_related('signed_by').order_by('-created_at')
            return Response(ClinicalConsentSerializer(consents, many=True).data)

        # POST: create consent
        enforce_tab_permission(request.user, 'consents', action='write')
        staff = getattr(request.user, 'staffmember', None)
        consent = ClinicalConsent.objects.create(
            patient=patient,
            consent_type=request.data.get('consent_type', 'General Care & Treatment'),
            title=request.data.get('title', 'Informed Consent'),
            description=request.data.get('description', ''),
            granted_by=request.data.get('granted_by', patient.full_name),
            relationship=request.data.get('relationship', 'Self'),
            is_granted=bool(request.data.get('is_granted', True)),
            is_signed=bool(request.data.get('is_signed', False)),
            signed_at=timezone.now() if request.data.get('is_signed') else None,
            signed_by=staff if request.data.get('is_signed') else None,
        )
        log_chart_audit(request, patient, 'Write Clinical Entry', 'Consents', record_id=consent.id)
        return Response(ClinicalConsentSerializer(consent).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='procedures')
    def procedures(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        from staff_portal.models import StaffRequest
        from staff_portal.serializers import StaffRequestSerializer

        if request.method == 'GET':
            log_chart_audit(request, patient, 'Read Patient Record', 'Procedures')
            requests = StaffRequest.objects.filter(
                patient=patient,
                request_type='procedure_change'
            ).select_related('staff', 'booking').order_by('-created_at')
            return Response(StaffRequestSerializer(requests, many=True).data)

        # POST: create procedure request (Doctor or Nurse)
        enforce_tab_permission(request.user, 'procedures', action='write')
        staff = getattr(request.user, 'staffmember', None)
        if not staff:
            return Response({'error': 'No staff profile found.'}, status=status.HTTP_403_FORBIDDEN)

        req = StaffRequest.objects.create(
            staff=staff,
            patient=patient,
            request_type='procedure_change',
            urgency=request.data.get('urgency', 'routine'),
            notes=request.data.get('notes', ''),
            details=request.data.get('details', ''),
            status='pending',
        )
        log_chart_audit(request, patient, 'Write Clinical Entry', 'Procedures', record_id=req.id)
        return Response(StaffRequestSerializer(req).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='referrals')
    def referrals(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        from staff_portal.models import StaffRequest
        from staff_portal.serializers import StaffRequestSerializer

        if request.method == 'GET':
            log_chart_audit(request, patient, 'Read Patient Record', 'Referrals')
            requests = StaffRequest.objects.filter(
                patient=patient,
                request_type='referral'
            ).select_related('staff', 'booking').order_by('-created_at')
            return Response(StaffRequestSerializer(requests, many=True).data)

        # POST: create referral (Doctor, Physio, Speech, Psych)
        enforce_tab_permission(request.user, 'referrals', action='write')
        staff = getattr(request.user, 'staffmember', None)
        if not staff:
            return Response({'error': 'No staff profile found.'}, status=status.HTTP_403_FORBIDDEN)

        req = StaffRequest.objects.create(
            staff=staff,
            patient=patient,
            request_type='referral',
            urgency=request.data.get('urgency', 'routine'),
            notes=request.data.get('notes', ''),
            details=request.data.get('details', ''),
            status='pending',
        )
        log_chart_audit(request, patient, 'Write Clinical Entry', 'Referrals', record_id=req.id)
        return Response(StaffRequestSerializer(req).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get', 'post'], url_path='medical-records')
    def medical_records(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)

        if request.method == 'GET':
            log_chart_audit(request, patient, 'Read Patient Record', 'Medical Records')
            return Response({
                'patient_id': patient.id,
                'patient_code': patient.patient_code,
                'mr_number': patient.mr_number,
                'primary_diagnosis': patient.primary_diagnosis or '',
                'secondary_diagnoses': patient.secondary_diagnoses or '',
                'allergies': patient.allergies or '',
                'blood_type': patient.blood_type or '',
                'care_manager': patient.assigned_care_manager.full_name if patient.assigned_care_manager else 'Care Coordinator',
                'age': patient.age,
                'gender': patient.get_gender_display() if hasattr(patient, 'get_gender_display') else patient.gender,
            })

        # POST / PUT: Update medical records (doctor only)
        enforce_tab_permission(request.user, 'medical_records', action='write')
        if 'primary_diagnosis' in request.data:
            patient.primary_diagnosis = request.data['primary_diagnosis']
        if 'secondary_diagnoses' in request.data:
            patient.secondary_diagnoses = request.data['secondary_diagnoses']
        if 'allergies' in request.data:
            patient.allergies = request.data['allergies']
        if 'blood_type' in request.data:
            patient.blood_type = request.data['blood_type']
        patient.save()
        log_chart_audit(request, patient, 'Write Clinical Entry', 'Medical Records', record_id=patient.id)
        return Response({
            'success': True,
            'primary_diagnosis': patient.primary_diagnosis,
            'secondary_diagnoses': patient.secondary_diagnoses,
            'allergies': patient.allergies,
            'blood_type': patient.blood_type,
        })


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
        try:
            from staff.models import StaffMember
            staff = StaffMember.objects.filter(user=request.user).first()
        except Exception:
            pass

        prescription = serializer.save(patient=patient, uploaded_by=staff)
        return Response(
            PrescriptionSerializer(prescription, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    # ── Mobile: Daily Report Submission ───────────────────────────────────────

    @action(
        detail=True,
        methods=['post'],
        parser_classes=[MultiPartParser, FormParser, JSONParser],
        url_path='daily_report'
    )
    def daily_report(self, request, pk=None):
        """
        POST /api/patients/{id}/daily_report/
        Consolidated mobile daily report submission:
          1. Parse care_items_checked
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

        booking = None
        if booking_id:
            try:
                booking = Booking.objects.get(pk=booking_id, patient=patient)
            except Booking.DoesNotExist:
                return Response(
                    {'error': 'Booking not found for this patient.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

        nurse_note = NurseNote.objects.create(
            patient=patient,
            recorded_by=staff,
            booking=booking,
            note=notes_text or 'Daily visit report submitted via mobile.',
        )

        report = DailyReport.objects.create(
            patient=patient,
            booking=booking,
            submitted_by=staff,
            care_items_checked=care_items,
            notes=notes_text,
            nurse_note=nurse_note,
        )

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
        patient = self.get_object()

        if not patient.portal_user_id:
            return Response(
                {'error': 'This patient does not have a portal account yet. Create one first.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

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
        patient_param = self.request.query_params.get('patient') or self.request.query_params.get('patient_id')
        if patient_param:
            check_nurse_patient_access(user, patient_param)
            qs = qs.filter(patient_id=patient_param)
        return filter_queryset_for_nurse(qs, user, patient_field='patient')

    def perform_create(self, serializer):
        patient = serializer.validated_data.get('patient')
        if patient:
            check_nurse_patient_access(self.request.user, patient)
        serializer.save()

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
        obj = super().get_object()
        if hasattr(obj, 'patient') and obj.patient:
            check_nurse_patient_access(user, obj.patient)
        return obj


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
        check_nurse_patient_access(user, patient_pk)
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
        patient_param = self.request.query_params.get('patient') or self.request.query_params.get('patient_id')
        if patient_param:
            check_nurse_patient_access(user, patient_param)
            qs = qs.filter(patient_id=patient_param)
        return filter_queryset_for_nurse(qs, user, patient_field='patient')

    def perform_create(self, serializer):
        patient = serializer.validated_data.get('patient')
        if patient:
            check_nurse_patient_access(self.request.user, patient)
        serializer.save()

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
        obj = super().get_object()
        if hasattr(obj, 'patient') and obj.patient:
            check_nurse_patient_access(user, obj.patient)
        return obj


class NurseNoteViewSet(viewsets.ModelViewSet):
    queryset = NurseNote.objects.select_related('patient', 'recorded_by').all()
    serializer_class = NurseNoteSerializer
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_family_user(user):
            return qs.filter(patient__portal_user=user)
        patient_param = self.request.query_params.get('patient') or self.request.query_params.get('patient_id')
        if patient_param:
            check_nurse_patient_access(user, patient_param)
            qs = qs.filter(patient_id=patient_param)
        return filter_queryset_for_nurse(qs, user, patient_field='patient')

    def perform_create(self, serializer):
        patient = serializer.validated_data.get('patient')
        if patient:
            check_nurse_patient_access(self.request.user, patient)
        serializer.save()

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
        obj = super().get_object()
        if hasattr(obj, 'patient') and obj.patient:
            check_nurse_patient_access(user, obj.patient)
        return obj


class LabResultViewSet(viewsets.ModelViewSet):
    queryset = LabResult.objects.all()
    serializer_class = LabResultSerializer
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_family_user(user):
            return qs.filter(patient__portal_user=user)
        patient_param = self.request.query_params.get('patient') or self.request.query_params.get('patient_id')
        if patient_param:
            check_nurse_patient_access(user, patient_param)
            qs = qs.filter(patient_id=patient_param)
        return filter_queryset_for_nurse(qs, user, patient_field='patient')

    def perform_create(self, serializer):
        patient = serializer.validated_data.get('patient')
        if patient:
            check_nurse_patient_access(self.request.user, patient)
        serializer.save()

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
        obj = super().get_object()
        if hasattr(obj, 'patient') and obj.patient:
            check_nurse_patient_access(user, obj.patient)
        return obj
