import secrets
import string

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q, ProtectedError
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
    is_family_user, IsPatientOrFamilyOwner, get_user_role, DenyNonClinicalRoles,
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
    enforce_addendum_permission, CLINICAL_WRITE_ROLES,
    check_clinical_write_permission, enforce_clinical_write_permission,
)
from .record_integrity import (
    handle_mark_entered_in_error,
    validate_clinical_record_edit,
    handle_clinical_record_destroy_blocked,
)




def _save_prescription_record(request, serializer, patient):
    """
    Saves a prescription record enforcing clinical authorship rules:
    - Doctor: verified order, prescribed_by = doctor name, entered_by = doctor user.
    - Nurse: transcribed order (pending_verification), ordering_doctor_name required,
             entered_by = nurse user. Doctor is not author. Notifies doctor.
    - All other roles: 403 Forbidden.
    """
    from staff.models import StaffMember
    from notifications.models import Notification
    from bookings.models import Booking, BookingStatus
    from rest_framework.exceptions import PermissionDenied, ValidationError

    if not patient:
        raise ValidationError({'patient': ['Patient is required.']})

    check_clinician_patient_access(request.user, patient)

    raw_role = get_user_role(request.user)
    role = normalize_clinical_role(raw_role)

    # 1. Non-doctor, non-nurse roles get 403
    if role not in ('doctor', 'nurse') and raw_role not in ('doctor', 'nurse'):
        log_chart_audit(request, patient, 'Prescription Create Blocked', 'Prescriptions')
        raise PermissionDenied(f"Role '{raw_role}' is not authorized to create or transcribe medication orders.")

    staff = StaffMember.objects.filter(user=request.user).first()

    # 2. Doctor Creation (Normal Verified Order)
    if role == 'doctor':
        if not is_treating_doctor_for_patient(request.user, patient):
            log_chart_audit(request, patient, 'Prescription Create Blocked', 'Prescriptions')
            raise PermissionDenied("Only the assigned treating doctor within the active care window may prescribe medication.")

        doctor_name = staff.full_name if staff else (request.user.get_full_name() or request.user.username)
        now = timezone.now()
        prescription = serializer.save(
            patient=patient,
            entry_mode=Prescription.EntryMode.DOCTOR,
            entered_by=request.user,
            uploaded_by=staff,
            ordering_doctor=staff,
            ordering_doctor_name=doctor_name,
            prescribed_by=doctor_name,
            verification_status=Prescription.VerificationStatus.VERIFIED,
            verified_by=request.user,
            verified_at=now,
            order_source=request.data.get('order_source') or serializer.validated_data.get('order_source') or Prescription.OrderSource.WRITTEN,
        )
        log_chart_audit(request, patient, 'Created Prescription Order', 'Prescriptions', record_id=prescription.id)
        return prescription

    # 3. Nurse Transcription (Pending Verification)
    if role == 'nurse':
        ordering_doc_name = (
            request.data.get('ordering_doctor_name') or
            serializer.validated_data.get('ordering_doctor_name') or
            request.data.get('prescribed_by') or
            serializer.validated_data.get('prescribed_by') or
            ''
        ).strip()

        if not ordering_doc_name or ordering_doc_name == 'Attending Physician':
            raise ValidationError({'ordering_doctor_name': ['Ordering doctor name is required for transcribed orders.']})

        ordering_doc_id = request.data.get('ordering_doctor')
        ordering_doctor_staff = None
        if ordering_doc_id:
            try:
                ordering_doctor_staff = StaffMember.objects.filter(pk=ordering_doc_id, role='doctor').first()
            except Exception:
                pass

        nurse_name = staff.full_name if staff else (request.user.get_full_name() or request.user.username)
        author_record = f"Transcribed by {nurse_name}"

        prescription = serializer.save(
            patient=patient,
            entry_mode=Prescription.EntryMode.TRANSCRIBED,
            entered_by=request.user,
            uploaded_by=staff,
            ordering_doctor=ordering_doctor_staff,
            ordering_doctor_name=ordering_doc_name,
            prescribed_by=author_record,
            verification_status=Prescription.VerificationStatus.PENDING_VERIFICATION,
            order_source=request.data.get('order_source') or serializer.validated_data.get('order_source') or Prescription.OrderSource.WRITTEN,
        )
        log_chart_audit(request, patient, 'Created Transcribed Prescription', 'Prescriptions', record_id=prescription.id)

        # Notify treating doctor using Notification mechanism
        try:
            doc_booking = Booking.objects.filter(
                patient=patient, assigned_staff__role='doctor'
            ).exclude(status=BookingStatus.CANCELLED).order_by('-scheduled_time').first()
            recipient_user = None
            if doc_booking and doc_booking.assigned_staff and doc_booking.assigned_staff.user:
                recipient_user = doc_booking.assigned_staff.user
            elif ordering_doctor_staff and ordering_doctor_staff.user:
                recipient_user = ordering_doctor_staff.user

            if recipient_user:
                Notification.objects.create(
                    recipient=recipient_user,
                    icon_key='pill',
                    message=f"New transcribed prescription for {patient.full_name} entered by {nurse_name} requires verification.",
                    target_screen='PatientFile',
                    target_params={'patient_id': patient.id, 'prescription_id': prescription.id, 'action': 'verify'}
                )
        except Exception:
            pass

        return prescription


def _handle_prescription_action(request, patient_pk, prescription_pk, action):
    """
    Handles verification, rejection, cancellation, and discontinuation of prescriptions:
    - verify: Treating doctor only. Verified status, server timestamp, audit log.
    - reject: Treating doctor only. Reason required. Status rejected, audit log.
    - discontinue: Treating doctor only. Reason required. Status discontinued, audit log.
    - cancel: Nurse author only while pending and no administrations. Reason required.
    """
    patient = get_object_or_404(Patient, pk=patient_pk)
    prescription = get_object_or_404(Prescription, pk=prescription_pk, patient=patient)

    raw_role = get_user_role(request.user)
    role = normalize_clinical_role(raw_role)

    # 1. Scoping check: unassigned clinician gets 404
    check_clinician_patient_access(request.user, patient)

    # 2. Action routing
    if action == 'verify':
        if role != 'doctor' or raw_role in ('super_admin', 'admin', 'care_manager', 'nurse', 'accountant', 'crm_executive'):
            log_chart_audit(request, patient, 'Prescription Verify Blocked', 'Prescriptions', record_id=prescription.id)
            return Response({'detail': "Only a doctor may verify medication orders."}, status=status.HTTP_403_FORBIDDEN)
        if not is_treating_doctor_for_patient(request.user, patient):
            log_chart_audit(request, patient, 'Prescription Verify Blocked', 'Prescriptions', record_id=prescription.id)
            return Response({'detail': "Only the assigned treating doctor within the active care window may verify medication orders."}, status=status.HTTP_403_FORBIDDEN)
        if prescription.verification_status != Prescription.VerificationStatus.PENDING_VERIFICATION:
            return Response({'detail': f"Prescription is already {prescription.verification_status}."}, status=status.HTTP_400_BAD_REQUEST)

        prescription.verification_status = Prescription.VerificationStatus.VERIFIED
        prescription.verified_by = request.user
        prescription.verified_at = timezone.now()
        prescription.verification_note = request.data.get('note', '') or request.data.get('verification_note', '')
        prescription.save(update_fields=['verification_status', 'verified_by', 'verified_at', 'verification_note'])
        log_chart_audit(request, patient, 'Verified Prescription Order', 'Prescriptions', record_id=prescription.id)
        return Response(PrescriptionSerializer(prescription, context={'request': request}).data, status=status.HTTP_200_OK)

    elif action == 'reject':
        if role != 'doctor' or raw_role in ('super_admin', 'admin', 'care_manager', 'nurse', 'accountant', 'crm_executive'):
            log_chart_audit(request, patient, 'Prescription Reject Blocked', 'Prescriptions', record_id=prescription.id)
            return Response({'detail': "Only a doctor may reject medication orders."}, status=status.HTTP_403_FORBIDDEN)
        if not is_treating_doctor_for_patient(request.user, patient):
            log_chart_audit(request, patient, 'Prescription Reject Blocked', 'Prescriptions', record_id=prescription.id)
            return Response({'detail': "Only the assigned treating doctor within the active care window may reject medication orders."}, status=status.HTTP_403_FORBIDDEN)
        if prescription.verification_status != Prescription.VerificationStatus.PENDING_VERIFICATION:
            return Response({'detail': f"Prescription is already {prescription.verification_status}."}, status=status.HTTP_400_BAD_REQUEST)

        reason = (request.data.get('reason') or request.data.get('rejection_reason') or '').strip()
        if not reason:
            return Response({'reason': ['Rejection reason is required.']}, status=status.HTTP_400_BAD_REQUEST)

        prescription.verification_status = Prescription.VerificationStatus.REJECTED
        prescription.status_reason = reason
        prescription.status_changed_by = request.user
        prescription.status_changed_at = timezone.now()
        prescription.save(update_fields=['verification_status', 'status_reason', 'status_changed_by', 'status_changed_at'])
        log_chart_audit(request, patient, 'Rejected Prescription Order', 'Prescriptions', record_id=prescription.id)
        return Response(PrescriptionSerializer(prescription, context={'request': request}).data, status=status.HTTP_200_OK)

    elif action == 'discontinue':
        if role != 'doctor' or raw_role in ('super_admin', 'admin', 'care_manager', 'nurse', 'accountant', 'crm_executive'):
            log_chart_audit(request, patient, 'Prescription Discontinue Blocked', 'Prescriptions', record_id=prescription.id)
            return Response({'detail': "Only a doctor may discontinue medication orders."}, status=status.HTTP_403_FORBIDDEN)
        if not is_treating_doctor_for_patient(request.user, patient):
            log_chart_audit(request, patient, 'Prescription Discontinue Blocked', 'Prescriptions', record_id=prescription.id)
            return Response({'detail': "Only the assigned treating doctor within the active care window may discontinue medication orders."}, status=status.HTTP_403_FORBIDDEN)
        if prescription.verification_status != Prescription.VerificationStatus.VERIFIED:
            return Response({'detail': "Only verified prescriptions can be discontinued."}, status=status.HTTP_400_BAD_REQUEST)

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'reason': ['Discontinuation reason is required.']}, status=status.HTTP_400_BAD_REQUEST)

        prescription.verification_status = Prescription.VerificationStatus.DISCONTINUED
        prescription.status_reason = reason
        prescription.status_changed_by = request.user
        prescription.status_changed_at = timezone.now()
        prescription.save(update_fields=['verification_status', 'status_reason', 'status_changed_by', 'status_changed_at'])
        log_chart_audit(request, patient, 'Discontinued Prescription Order', 'Prescriptions', record_id=prescription.id)
        return Response(PrescriptionSerializer(prescription, context={'request': request}).data, status=status.HTTP_200_OK)

    elif action == 'cancel':
        if prescription.verification_status != Prescription.VerificationStatus.PENDING_VERIFICATION:
            return Response({'detail': f"Prescription cannot be cancelled: order is already {prescription.verification_status}."}, status=status.HTTP_400_BAD_REQUEST)
        if prescription.verified_at is not None or prescription.administrations.exists():
            return Response({'detail': "Prescription cannot be cancelled: order has been verified or administrations have occurred."}, status=status.HTTP_400_BAD_REQUEST)

        # Allowed: author nurse who entered it, or assigned treating doctor
        is_nurse_author = (role == 'nurse' and (not prescription.entered_by or prescription.entered_by == request.user))
        is_treating_doc = (role == 'doctor' and is_treating_doctor_for_patient(request.user, patient))
        if not (is_nurse_author or is_treating_doc):
            return Response({'detail': "Only the authoring nurse or assigned treating doctor may cancel a pending order."}, status=status.HTTP_403_FORBIDDEN)

        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'reason': ['Cancellation reason is required.']}, status=status.HTTP_400_BAD_REQUEST)

        prescription.verification_status = Prescription.VerificationStatus.CANCELLED
        prescription.status_reason = reason
        prescription.status_changed_by = request.user
        prescription.status_changed_at = timezone.now()
        prescription.save(update_fields=['verification_status', 'status_reason', 'status_changed_by', 'status_changed_at'])
        log_chart_audit(request, patient, 'Cancelled Prescription Order', 'Prescriptions', record_id=prescription.id)
        return Response(PrescriptionSerializer(prescription, context={'request': request}).data, status=status.HTTP_200_OK)

    return Response({'error': 'Invalid action.'}, status=status.HTTP_400_BAD_REQUEST)


class PatientViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, CanDeletePatient, IsPatientOrFamilyOwner]
    queryset = Patient.objects.select_related('assigned_care_manager').all().order_by('-created_at')
    search_fields = ['first_name', 'last_name', 'mr_number']

    def get_queryset(self):
        qs = Patient.objects.select_related('assigned_care_manager').all().order_by('-created_at')
        user = self.request.user
        if is_family_user(user):
            qs = qs.filter(portal_user=user)
        else:
            qs = filter_queryset_for_nurse(qs, user, patient_field=None)
        q = self.request.query_params.get('q') or self.request.query_params.get('search')
        if q:
            qs = qs.filter(
                Q(first_name__icontains=q) |
                Q(last_name__icontains=q) |
                Q(mr_number__icontains=q)
            )
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

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        has_clinical_records = (
            instance.vitals.exists() or
            instance.nurse_notes.exists() or
            instance.lab_results.exists() or
            instance.prescriptions.exists() or
            instance.doctor_notes.exists() or
            instance.physio_notes.exists() or
            instance.therapy_notes.exists() or
            instance.consents.exists() or
            instance.scheduled_items.exists() or
            (hasattr(instance, 'lab_orders') and instance.lab_orders.exists())
        )
        if has_clinical_records:
            return Response(
                {'detail': 'Patient cannot be deleted because clinical records exist. Patient records are permanent and protected.'},
                status=status.HTTP_409_CONFLICT
            )
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {'detail': 'Patient cannot be deleted because protected clinical records exist.'},
                status=status.HTTP_409_CONFLICT
            )

    @action(detail=True, methods=['get'])
    def timeline(self, request, pk=None):
        """All visits (bookings) for this patient in reverse chronological order."""
        patient = self.get_object()
        from bookings.serializers import BookingListSerializer
        bookings = patient.bookings.all().order_by('-scheduled_time')
        return Response(BookingListSerializer(bookings, many=True).data)

    @action(detail=True, methods=['get', 'post'])
    def vitals(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        if request.method == 'GET':
            return Response(VitalSignSerializer(patient.vitals.all(), many=True).data)
        enforce_clinical_write_permission(request.user, 'vitals', patient=patient)
        staff_member = getattr(request.user, 'staffmember', None) or getattr(request.user, 'staff_profile', None)
        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        data['patient'] = patient.id
        serializer = VitalSignSerializer(data=data)
        if serializer.is_valid():
            v = serializer.save(
                patient=patient,
                recorded_by=staff_member,
                recorded_at=serializer.validated_data.get('recorded_at') or timezone.now()
            )
            return Response(VitalSignSerializer(v).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _handle_notes(self, request):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        if request.method == 'POST':
            enforce_clinical_write_permission(request.user, 'nurse_notes', patient=patient)
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

    @action(detail=True, methods=['get', 'post'], url_path='nurse-notes')
    def nurse_notes(self, request, pk=None):
        return self._handle_notes(request)

    @action(detail=True, methods=['get', 'post'], url_path='nurse_notes')
    def nurse_notes_underscore(self, request, pk=None):
        return self._handle_notes(request)

    @action(detail=True, methods=['get', 'post'])
    def labs(self, request, pk=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        if request.method == 'GET':
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

        # POST: create lab order
        enforce_clinical_write_permission(request.user, 'lab_orders', patient=patient)
        staff = getattr(request.user, 'staffmember', None)
        test_name = request.data.get('test_name', 'General Lab Order')
        from lab.models import LabOrder, LabOrderStatus, LabTest
        test, _ = LabTest.objects.get_or_create(name=test_name, defaults={'sample_type': 'Blood', 'price': 0})
        now = timezone.now()
        order = LabOrder.objects.create(
            patient=patient,
            scheduled_collection_time=now + timezone.timedelta(hours=2),
            notes=request.data.get('notes') or request.data.get('reference_range', ''),
            status=LabOrderStatus.REQUESTED,
        )
        order.tests.add(test)
        result = LabResult.objects.create(
            patient=patient,
            test_name=test_name,
            result_value=request.data.get('value', 'Pending Collection'),
            unit=request.data.get('unit', ''),
            reference_range=request.data.get('reference_range', ''),
            collected_at=now,
            reported_at=now,
        )
        log_chart_audit(request, patient, 'Write Clinical Entry', 'Lab Orders', record_id=order.id)
        return Response(LabResultSerializer(result).data, status=status.HTTP_201_CREATED)

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
        enforce_clinical_write_permission(request.user, 'doctor_notes', patient=patient)
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
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.get_full_name() or request.user.username,
                action='Clinical Delete Blocked',
                target_user=f"Patient {patient.patient_code or patient.id}",
                details=f"Blocked physical deletion on DoctorNote #{note_id}",
                timestamp=timezone.now()
            )
            return Response(
                {'detail': 'Physical deletion of clinical records is prohibited.'},
                status=status.HTTP_405_METHOD_NOT_ALLOWED
            )


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
        enforce_clinical_write_permission(request.user, 'doctor_notes', patient=patient)
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
        staff = getattr(request.user, 'staffmember', None)
        discipline = request.data.get('discipline')
        if not discipline:
            if staff and staff.role in ('speech', 'speech_therapist'):
                discipline = 'speech_therapy'
            elif staff and staff.role in ('psychologist', 'psychotherapist'):
                discipline = 'psychotherapy'
            elif staff and staff.role in ('dietician', 'nutritionist'):
                discipline = 'dietetics'
            else:
                discipline = 'physiotherapy'
        enforce_clinical_write_permission(request.user, 'therapy_notes', discipline=discipline, patient=patient)

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
            session_notes=request.data.get('session_notes') or request.data.get('notes', ''),
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
            AuditLog.objects.create(
                actor=request.user,
                actor_name=request.user.get_full_name() or request.user.username,
                action='Clinical Delete Blocked',
                target_user=f"Patient {patient.patient_code or patient.id}",
                details=f"Blocked physical deletion on TherapyNote #{note_id}",
                timestamp=timezone.now()
            )
            return Response(
                {'detail': 'Physical deletion of clinical records is prohibited.'},
                status=status.HTTP_405_METHOD_NOT_ALLOWED
            )


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
        note = get_object_or_404(TherapyNote, pk=note_id, patient=patient)
        enforce_clinical_write_permission(request.user, 'therapy_notes', discipline=note.discipline, patient=patient)
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
        enforce_clinical_write_permission(request.user, 'consents', patient=patient)
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

        # POST: create referral (Doctor only per authorship matrix)
        enforce_clinical_write_permission(request.user, 'referrals', patient=patient)
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
        check_clinician_patient_access(request.user, patient)
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

        prescription = _save_prescription_record(request, serializer, patient)
        return Response(
            PrescriptionSerializer(prescription, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path=r'prescriptions/(?P<rx_id>\d+)/verify')
    def verify_prescription(self, request, pk=None, rx_id=None):
        return _handle_prescription_action(request, pk, rx_id, 'verify')

    @action(detail=True, methods=['post'], url_path=r'prescriptions/(?P<rx_id>\d+)/reject')
    def reject_prescription(self, request, pk=None, rx_id=None):
        return _handle_prescription_action(request, pk, rx_id, 'reject')

    @action(detail=True, methods=['post'], url_path=r'prescriptions/(?P<rx_id>\d+)/discontinue')
    def discontinue_prescription(self, request, pk=None, rx_id=None):
        return _handle_prescription_action(request, pk, rx_id, 'discontinue')

    @action(detail=True, methods=['post'], url_path=r'prescriptions/(?P<rx_id>\d+)/cancel')
    def cancel_prescription(self, request, pk=None, rx_id=None):
        return _handle_prescription_action(request, pk, rx_id, 'cancel')

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
        check_clinician_patient_access(request.user, patient)
        enforce_clinical_write_permission(request.user, 'mar_administer', patient=patient)

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

        # 4. MAR verification status check
        from django.conf import settings
        admin_before_verification = getattr(settings, 'PRESCRIPTION_ADMIN_BEFORE_VERIFICATION', False)
        if prescription.verification_status == Prescription.VerificationStatus.PENDING_VERIFICATION and not admin_before_verification:
            return Response(
                {
                    'error': 'pending_verification',
                    'detail': 'Cannot administer medication: Prescription is awaiting doctor verification.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        if prescription.verification_status in (
            Prescription.VerificationStatus.REJECTED,
            Prescription.VerificationStatus.CANCELLED,
            Prescription.VerificationStatus.DISCONTINUED
        ):
            return Response(
                {
                    'error': f'prescription_{prescription.verification_status}',
                    'detail': f'Cannot administer medication: Prescription is {prescription.verification_status}.'
                },
                status=status.HTTP_400_BAD_REQUEST
            )

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

    @action(detail=True, methods=['post'], url_path=r'vitals/(?P<item_id>\d+)/mark-entered-in-error')
    def mark_patient_vital_entered_in_error(self, request, pk=None, item_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        vital = get_object_or_404(VitalSign, pk=item_id, patient=patient)
        return handle_mark_entered_in_error(request, patient, vital, 'VitalSign')

    @action(detail=True, methods=['post'], url_path=r'nurse-notes/(?P<item_id>\d+)/mark-entered-in-error')
    def mark_patient_nurse_note_entered_in_error(self, request, pk=None, item_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        note = get_object_or_404(NurseNote, pk=item_id, patient=patient)
        return handle_mark_entered_in_error(request, patient, note, 'NurseNote')

    @action(detail=True, methods=['post'], url_path=r'labs/(?P<item_id>\d+)/mark-entered-in-error')
    def mark_patient_lab_result_entered_in_error(self, request, pk=None, item_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        lab_res = get_object_or_404(LabResult, pk=item_id, patient=patient)
        return handle_mark_entered_in_error(request, patient, lab_res, 'LabResult')

    @action(detail=True, methods=['post'], url_path=r'mar/(?P<item_id>\d+)/mark-entered-in-error')
    def mark_patient_mar_entered_in_error(self, request, pk=None, item_id=None):
        patient = self.get_object()
        check_clinician_patient_access(request.user, patient)
        mar = get_object_or_404(MARAdministration, pk=item_id, prescription__patient=patient)
        return handle_mark_entered_in_error(request, patient, mar, 'MARAdministration')


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
    permission_classes = [IsPrescriptionManagementAllowed, IsPatientOrFamilyOwner, DenyNonClinicalRoles]
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
        if not patient and 'patient' in self.request.data:
            try:
                patient = Patient.objects.get(pk=self.request.data.get('patient'))
            except Exception:
                pass
        _save_prescription_record(self.request, serializer, patient)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        raw_role = get_user_role(request.user)
        role = normalize_clinical_role(raw_role)

        if raw_role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response(
                {'detail': "Administrative modification of clinical prescriptions is not permitted. Author nurse may edit while pending; treating doctor may discontinue."},
                status=status.HTTP_403_FORBIDDEN
            )

        if role != 'nurse':
            return Response(
                {'detail': "Only the author nurse may edit a pending transcribed prescription."},
                status=status.HTTP_403_FORBIDDEN
            )

        if instance.verification_status != Prescription.VerificationStatus.PENDING_VERIFICATION:
            return Response(
                {'detail': f"Cannot edit prescription: Order is already {instance.verification_status}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if instance.verified_at is not None or instance.administrations.exists():
            return Response(
                {'detail': "Cannot edit prescription: Order has been verified or dose administrations have occurred."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if instance.entered_by and instance.entered_by != request.user:
            return Response(
                {'detail': "Only the nurse who entered this transcribed order may edit it while pending."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        if getattr(instance, '_prefetched_objects_cache', None):
            instance._prefetched_objects_cache = {}
        log_chart_audit(request, instance.patient, 'Updated Pending Prescription Order', 'Prescriptions', record_id=instance.id)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        raw_role = get_user_role(request.user)
        role = normalize_clinical_role(raw_role)

        if role not in ('nurse', 'doctor'):
            log_chart_audit(request, instance.patient, 'Prescription Delete Blocked', 'Prescriptions', record_id=instance.id)
            return Response(
                {'detail': 'Physical deletion of prescriptions is disabled. Please cancel or discontinue the order instead.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if role == 'nurse' and instance.entered_by and instance.entered_by != request.user:
            log_chart_audit(request, instance.patient, 'Prescription Delete Blocked', 'Prescriptions', record_id=instance.id)
            return Response(
                {'detail': "Only the nurse who entered this transcribed order may cancel it."},
                status=status.HTTP_403_FORBIDDEN
            )

        if role == 'doctor' and not is_treating_doctor_for_patient(request.user, instance.patient):
            log_chart_audit(request, instance.patient, 'Prescription Delete Blocked', 'Prescriptions', record_id=instance.id)
            return Response(
                {'detail': "Only the assigned treating doctor within the active care window may cancel a prescription."},
                status=status.HTTP_403_FORBIDDEN
            )

        if instance.verification_status != Prescription.VerificationStatus.PENDING_VERIFICATION:
            return Response(
                {'detail': f"Cannot cancel prescription: Order is already {instance.verification_status}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if instance.verified_at is not None or instance.administrations.exists():
            return Response(
                {'detail': "Cannot cancel prescription: Order has been verified or dose administrations have occurred."},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = (request.data.get('reason') if hasattr(request, 'data') else None) or request.query_params.get('reason') or ''
        if not str(reason).strip():
            return Response(
                {'error': 'reason_required', 'detail': 'A cancellation reason is required to cancel a prescription.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        instance.verification_status = Prescription.VerificationStatus.CANCELLED
        instance.status_reason = str(reason).strip()
        instance.status_changed_by = request.user
        instance.status_changed_at = timezone.now()
        instance.save(update_fields=['verification_status', 'status_reason', 'status_changed_by', 'status_changed_at'])
        log_chart_audit(request, instance.patient, 'Cancelled Prescription Order', 'Prescriptions', record_id=instance.id)
        return Response({'detail': 'Prescription successfully cancelled.', 'status': 'cancelled'}, status=status.HTTP_200_OK)

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
    - PATCH / PUT: update pending transcribed prescription (author nurse only; admins/CM denied)
    - DELETE: permanently disabled (cancelled or discontinued instead; returns 403)
    """
    permission_classes = [IsPrescriptionManagementAllowed, IsPatientOrFamilyOwner, DenyNonClinicalRoles]
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
        raw_role = get_user_role(request.user)
        role = normalize_clinical_role(raw_role)

        if raw_role in ('super_admin', 'admin', 'branch_manager', 'care_manager'):
            return Response(
                {'detail': "Administrative modification of clinical prescriptions is not permitted. Author nurse may edit while pending; treating doctor may discontinue."},
                status=status.HTTP_403_FORBIDDEN
            )

        if role != 'nurse':
            return Response(
                {'detail': "Only the author nurse may edit a pending transcribed prescription."},
                status=status.HTTP_403_FORBIDDEN
            )

        if prescription.verification_status != Prescription.VerificationStatus.PENDING_VERIFICATION:
            return Response(
                {'detail': f"Cannot edit prescription: Order is already {prescription.verification_status}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if prescription.verified_at is not None or prescription.administrations.exists():
            return Response(
                {'detail': "Cannot edit prescription: Order has been verified or dose administrations have occurred."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if prescription.entered_by and prescription.entered_by != request.user:
            return Response(
                {'detail': "Only the nurse who entered this transcribed order may edit it while pending."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = PrescriptionSerializer(
            prescription, data=request.data, partial=True, context={'request': request}
        )
        if serializer.is_valid():
            serializer.save()
            log_chart_audit(request, prescription.patient, 'Updated Pending Prescription Order', 'Prescriptions', record_id=prescription.id)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def put(self, request, patient_pk, prescription_pk):
        return self.patch(request, patient_pk, prescription_pk)

    def delete(self, request, patient_pk, prescription_pk):
        prescription = self.get_object(patient_pk, prescription_pk)
        raw_role = get_user_role(request.user)
        role = normalize_clinical_role(raw_role)

        if role not in ('nurse', 'doctor'):
            log_chart_audit(request, prescription.patient, 'Prescription Delete Blocked', 'Prescriptions', record_id=prescription.id)
            return Response(
                {'detail': 'Physical deletion of prescriptions is disabled. Please cancel or discontinue the order instead.'},
                status=status.HTTP_403_FORBIDDEN
            )

        if role == 'nurse' and prescription.entered_by and prescription.entered_by != request.user:
            log_chart_audit(request, prescription.patient, 'Prescription Delete Blocked', 'Prescriptions', record_id=prescription.id)
            return Response(
                {'detail': "Only the nurse who entered this transcribed order may cancel it."},
                status=status.HTTP_403_FORBIDDEN
            )

        if role == 'doctor' and not is_treating_doctor_for_patient(request.user, prescription.patient):
            log_chart_audit(request, prescription.patient, 'Prescription Delete Blocked', 'Prescriptions', record_id=prescription.id)
            return Response(
                {'detail': "Only the assigned treating doctor within the active care window may cancel a prescription."},
                status=status.HTTP_403_FORBIDDEN
            )

        if prescription.verification_status != Prescription.VerificationStatus.PENDING_VERIFICATION:
            return Response(
                {'detail': f"Cannot cancel prescription: Order is already {prescription.verification_status}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if prescription.verified_at is not None or prescription.administrations.exists():
            return Response(
                {'detail': "Cannot cancel prescription: Order has been verified or dose administrations have occurred."},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = (request.data.get('reason') if hasattr(request, 'data') else None) or request.query_params.get('reason') or ''
        if not str(reason).strip():
            return Response(
                {'error': 'reason_required', 'detail': 'A cancellation reason is required to cancel a prescription.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        prescription.verification_status = Prescription.VerificationStatus.CANCELLED
        prescription.status_reason = str(reason).strip()
        prescription.status_changed_by = request.user
        prescription.status_changed_at = timezone.now()
        prescription.save(update_fields=['verification_status', 'status_reason', 'status_changed_by', 'status_changed_at'])
        log_chart_audit(request, prescription.patient, 'Cancelled Prescription Order', 'Prescriptions', record_id=prescription.id)
        return Response({'detail': 'Prescription successfully cancelled.', 'status': 'cancelled'}, status=status.HTTP_200_OK)


class PatientPrescriptionActionView(APIView):
    """
    Direct endpoint for prescription verification workflows:
    - /api/patients/{patient_pk}/prescriptions/{prescription_pk}/verify/
    - /api/patients/{patient_pk}/prescriptions/{prescription_pk}/reject/
    - /api/patients/{patient_pk}/prescriptions/{prescription_pk}/discontinue/
    - /api/patients/{patient_pk}/prescriptions/{prescription_pk}/cancel/
    """
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner, DenyNonClinicalRoles]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    action = None

    def post(self, request, patient_pk, prescription_pk):
        return _handle_prescription_action(request, patient_pk, prescription_pk, self.action)


class VitalSignViewSet(viewsets.ModelViewSet):
    queryset = VitalSign.objects.select_related('patient', 'recorded_by').all()
    serializer_class = VitalSignSerializer
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner, DenyNonClinicalRoles]

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
        enforce_clinical_write_permission(self.request.user, 'vitals', patient=patient)
        save_kwargs = {}
        if not serializer.validated_data.get('recorded_at'):
            save_kwargs['recorded_at'] = timezone.now()
        staff_member = getattr(self.request.user, 'staffmember', None) or getattr(self.request.user, 'staff_profile', None)
        if staff_member:
            save_kwargs['recorded_by'] = staff_member
        serializer.save(**save_kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        err_resp = validate_clinical_record_edit(request, instance.patient, instance, 'VitalSign')
        if err_resp:
            return err_resp
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        err_resp = validate_clinical_record_edit(request, instance.patient, instance, 'VitalSign')
        if err_resp:
            return err_resp
        return super().partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        patient = serializer.instance.patient
        if patient:
            check_nurse_patient_access(self.request.user, patient)
        enforce_clinical_write_permission(self.request.user, 'vitals', patient=patient)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        return handle_clinical_record_destroy_blocked(request, instance.patient, instance, 'VitalSign')

    @action(detail=True, methods=['post'], url_path='mark-entered-in-error')
    def mark_entered_in_error(self, request, pk=None):
        instance = self.get_object()
        return handle_mark_entered_in_error(request, instance.patient, instance, 'VitalSign')


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
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner, DenyNonClinicalRoles]

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
        enforce_clinical_write_permission(self.request.user, 'nurse_notes', patient=patient)
        staff_member = getattr(self.request.user, 'staffmember', None) or getattr(self.request.user, 'staff_profile', None)
        serializer.save(recorded_by=staff_member)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        err_resp = validate_clinical_record_edit(request, instance.patient, instance, 'NurseNote')
        if err_resp:
            return err_resp
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        err_resp = validate_clinical_record_edit(request, instance.patient, instance, 'NurseNote')
        if err_resp:
            return err_resp
        return super().partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        patient = serializer.instance.patient
        if patient:
            check_nurse_patient_access(self.request.user, patient)
        enforce_clinical_write_permission(self.request.user, 'nurse_notes', patient=patient)
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        return handle_clinical_record_destroy_blocked(request, instance.patient, instance, 'NurseNote')

    @action(detail=True, methods=['post'], url_path='mark-entered-in-error')
    def mark_entered_in_error(self, request, pk=None):
        instance = self.get_object()
        return handle_mark_entered_in_error(request, instance.patient, instance, 'NurseNote')


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
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner, DenyNonClinicalRoles]

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
        enforce_clinical_write_permission(self.request.user, 'lab_orders', patient=patient)
        serializer.save()

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        AuditLog.objects.create(
            actor=request.user,
            actor_name=request.user.get_full_name() or request.user.username,
            action='Clinical Edit Blocked',
            target_user=f"Patient {instance.patient.patient_code or instance.patient.id}",
            details=f"Blocked direct edit on LabResult #{instance.id}",
            timestamp=timezone.now()
        )
        return Response(
            {'detail': 'Direct edit of lab results is disabled. Mark as entered in error and enter a new result.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        return handle_clinical_record_destroy_blocked(request, instance.patient, instance, 'LabResult')

    @action(detail=True, methods=['post'], url_path='mark-entered-in-error')
    def mark_entered_in_error(self, request, pk=None):
        instance = self.get_object()
        return handle_mark_entered_in_error(request, instance.patient, instance, 'LabResult')


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
