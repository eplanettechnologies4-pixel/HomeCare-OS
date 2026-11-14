import os
import mimetypes
import datetime
from zoneinfo import ZoneInfo
from django.conf import settings
from django.utils import timezone
from django.http import Http404, FileResponse
from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.exceptions import PermissionDenied, NotFound

from accounts.models import AuditLog
from homecareOS.permissions import get_user_role
from homecareOS.clinician_permissions import (
    GUARDIAN_CONTACT_VISIBILITY_CONFIG,
    get_guardian_contact_visibility,
    log_chart_audit,
    normalize_clinical_role,
    ROLE_CHART_RIGHTS,
)
from .models import (
    Patient, Prescription, VitalSign, NurseNote, LabResult,
    DailyReport, MARAdministration, DoctorNote, PhysioNote,
    TherapyNote, ClinicalConsent,
    PatientActiveComplaint, ScheduledItem,
)
from .serializers import (
    PatientActiveComplaintSerializer, ScheduledItemSerializer,
)
from .scoping import (
    check_clinician_patient_access,
    is_treating_doctor_for_patient,
    is_care_manager_for_patient,
    can_view_psychotherapy_note,
)
from bookings.models import Booking, BookingStatus
from staff.models import StaffMember, RosterAssignment
from lab.models import LabOrder, LabOrderStatus, LabReport
from forms_builder.models import FormSubmission, FormTemplate
from quality.models import ManagerVisitChecklist


def _format_author_role(staff):
    """Returns the author's real staff role display, or '-' if no linked staff."""
    if not staff:
        return "-"
    role = getattr(staff, 'role', '')
    display_map = {
        'doctor': 'Doctor',
        'nurse': 'Nurse',
        'physio': 'Physiotherapist',
        'physiotherapist': 'Physiotherapist',
        'speech': 'Speech Therapist',
        'speech_therapist': 'Speech Therapist',
        'psychologist': 'Psychotherapist',
        'psychotherapist': 'Psychotherapist',
        'dietician': 'Dietician',
        'care_manager': 'Care Manager',
        'admin': 'Admin',
        'super_admin': 'Super Admin',
    }
    if role in display_map:
        return display_map[role]
    if hasattr(staff, 'get_role_display'):
        return staff.get_role_display() or "-"
    return getattr(staff, 'role', "-") or "-"


def _resolve_patient_with_scoping(user, pk):
    """
    Resolves patient by pk and enforces strict scoping.
    - patient_family, accountant, and crm_executive get 403 Forbidden.
    - Clinicians (nurse, doctor, therapist) get 404 if not assigned.
    - Non-existent patient raises Http404.
    """
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentication credentials were not provided.")

    role = get_user_role(user)
    if role in ('patient_family', 'accountant', 'crm_executive'):
        raise PermissionDenied("Access to internal Patient File hubs and clinical records is restricted for this role.")

    try:
        patient = Patient.objects.select_related('assigned_care_manager__user').get(pk=pk)
    except Patient.DoesNotExist:
        raise Http404("Patient not found.")

    # Check clinician scoping (raises Http404 if unassigned)
    check_clinician_patient_access(user, patient)
    return patient


class PatientFileView(APIView):
    """
    GET /api/patients/{id}/patient-file/
    Unified patient hub endpoint delivering:
    - Patient identification (MR number, DOB, age, sex, location, diagnosis, photo)
    - Legal guardian contact visibility obeying A4 configuration
    - Treating consultant and assigned care manager
    - Staff on duty today with shift hours (Asia/Karachi)
    - Brief history and care plan with edit history
    - Active complaint banner and complaint history
    - Upcoming procedures, appointments, and blood tests
    - Role-specific permissions
    - AuditLog generation for compliance
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        # ── 1. Audit Log ─────────────────────────────────────────────────────
        log_chart_audit(request, patient, action='View Patient File', section='patient_file_hub')

        # ── 2. Timezone setup (Asia/Karachi) ──────────────────────────────────
        karachi_tz = ZoneInfo(getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi'))
        now_local = timezone.now().astimezone(karachi_tz)
        today_local = now_local.date()

        # ── 3. Legal Guardian Contact Visibility (A4 Rule) ───────────────────
        visibility = get_guardian_contact_visibility(user, patient)
        guardian_data = {
            'name': patient.emergency_contact_name or '-',
            'relation': patient.emergency_contact_relation or '-',
            'phone': patient.emergency_contact_phone if visibility == 'direct' else None,
            'phone_hidden': visibility != 'direct',
            'can_reveal_emergency': visibility == 'emergency_reveal',
            'visibility_mode': visibility,
        }

        # ── 4. Treating Consultant ───────────────────────────────────────────
        treating_doctor = None
        days = getattr(settings, 'CLINICIAN_PATIENT_ACCESS_DAYS_AFTER_VISIT', getattr(settings, 'NURSE_PATIENT_ACCESS_DAYS_AFTER_VISIT', 7))
        cutoff = timezone.now() - datetime.timedelta(days=days)

        doc_booking = (
            Booking.objects.filter(
                patient=patient,
                assigned_staff__role='doctor',
            )
            .exclude(status=BookingStatus.CANCELLED)
            .filter(
                Q(status__in=[BookingStatus.ASSIGNED, BookingStatus.EN_ROUTE, BookingStatus.IN_PROGRESS]) |
                Q(scheduled_time__gte=cutoff)
            )
            .order_by('-scheduled_time')
            .select_related('assigned_staff__user')
            .first()
        )
        if doc_booking and doc_booking.assigned_staff:
            s = doc_booking.assigned_staff
            is_valid = True
            if s.user:
                is_valid = is_treating_doctor_for_patient(s.user, patient)
            if is_valid:
                treating_doctor = {
                    'id': s.id,
                    'name': s.full_name,
                    'role_display': s.get_role_display(),
                    'employee_id': s.employee_id,
                    'phone': s.phone or '-',
                    'specialization': s.specialization or 'General Physician',
                }

        # ── 5. Assigned Care Manager ─────────────────────────────────────────
        care_manager_data = None
        if patient.assigned_care_manager:
            cm = patient.assigned_care_manager
            care_manager_data = {
                'id': cm.id,
                'name': cm.full_name,
                'role_display': 'Care Coordinator',
                'employee_id': cm.employee_id,
                'phone': cm.phone or '-',
                'email': cm.email or '-',
            }

        # ── 6. Staff on Duty Today (Asia/Karachi) ────────────────────────────
        today_start = timezone.make_aware(datetime.datetime.combine(today_local, datetime.time.min), karachi_tz)
        today_end = timezone.make_aware(datetime.datetime.combine(today_local, datetime.time.max), karachi_tz)

        today_bookings = (
            Booking.objects.filter(
                patient=patient,
                scheduled_time__range=[today_start, today_end]
            )
            .exclude(status=BookingStatus.CANCELLED)
            .select_related('assigned_staff', 'buddy', 'buddy_staff')
        )

        staff_on_duty = []
        seen_staff = set()

        # Collect roster assignments for today
        candidate_staff_ids = set()
        for b in today_bookings:
            if b.assigned_staff_id: candidate_staff_ids.add(b.assigned_staff_id)
            if b.buddy_id: candidate_staff_ids.add(b.buddy_id)
            if b.buddy_staff_id: candidate_staff_ids.add(b.buddy_staff_id)

        roster_map = {}
        if candidate_staff_ids:
            for ra in RosterAssignment.objects.filter(staff_id__in=candidate_staff_ids, date=today_local, is_published=True):
                roster_map[ra.staff_id] = ra

        for b in today_bookings:
            staff_candidates = [b.assigned_staff, getattr(b, 'buddy_staff', None) or b.buddy]
            for s in staff_candidates:
                if not s or s.id in seen_staff:
                    continue
                seen_staff.add(s.id)

                ra = roster_map.get(s.id)
                if ra and ra.is_off:
                    continue  # Staff is marked off duty on published roster

                if ra and ra.start_time and ra.end_time:
                    shift_name = ra.shift_name or 'Rostered Duty'
                    shift_hours = f"{ra.start_time.strftime('%H:%M')} - {ra.end_time.strftime('%H:%M')} (PKT)"
                elif b.scheduled_time:
                    st_local = b.scheduled_time.astimezone(karachi_tz)
                    st_str = st_local.strftime('%H:%M')
                    if b.shift_end_time:
                        en_local = b.shift_end_time.astimezone(karachi_tz)
                        en_str = en_local.strftime('%H:%M')
                    else:
                        en_local = (b.scheduled_time + datetime.timedelta(hours=2)).astimezone(karachi_tz)
                        en_str = en_local.strftime('%H:%M')
                    shift_name = getattr(b, 'service_type_display', None) or b.service_type or 'Clinical Visit'
                    shift_hours = f"{st_str} - {en_str} (PKT)"
                else:
                    shift_name = 'On Duty'
                    shift_hours = '-'

                staff_on_duty.append({
                    'id': s.id,
                    'name': s.full_name,
                    'role': s.role,
                    'role_display': s.get_role_display(),
                    'shift_name': shift_name,
                    'shift_hours': shift_hours,
                    'phone': s.phone or '-',
                    'designation': s.designation or s.get_role_display(),
                })

        # ── 7. Brief History & Care Plan ─────────────────────────────────────
        history_care_edits = getattr(patient, 'history_care_plan_edits', []) or []
        brief_history_edits = [e for e in history_care_edits if e.get('section') == 'brief_history']
        care_plan_edits = [e for e in history_care_edits if e.get('section') == 'care_plan']

        # ── 8. Active Complaint (Important Note) ──────────────────────────────
        active_complaint_obj = patient.active_complaints.filter(resolved_at__isnull=True).select_related('created_by').first()
        active_complaint = (
            PatientActiveComplaintSerializer(active_complaint_obj).data if active_complaint_obj else None
        )
        complaint_history = PatientActiveComplaintSerializer(
            patient.active_complaints.select_related('created_by', 'resolved_by').order_by('-created_at')[:10],
            many=True
        ).data

        # ── 9. Upcoming Procedures, Appointments & Blood Tests ────────────────
        scheduled_qs = (
            patient.scheduled_items.exclude(status=ScheduledItem.Status.CANCELLED)
            .select_related('created_by', 'done_by')
            .order_by('due_at')
        )
        scheduled_items = ScheduledItemSerializer(scheduled_qs, many=True).data

        # Merge upcoming Lab Orders as read-only rows
        cutoff_labs = timezone.now() - datetime.timedelta(hours=12)
        upcoming_labs = (
            LabOrder.objects.filter(
                patient=patient,
                status__in=[LabOrderStatus.REQUESTED, LabOrderStatus.COLLECTOR_ASSIGNED],
                scheduled_collection_time__gte=cutoff_labs
            )
            .prefetch_related('tests')
            .order_by('scheduled_collection_time')[:10]
        )
        for lab in upcoming_labs:
            due_local = lab.scheduled_collection_time.astimezone(karachi_tz)
            diff_days = (due_local.date() - today_local).days
            if diff_days < 0:
                rel = f"Overdue ({abs(diff_days)} days ago)"
            elif diff_days == 0:
                rel = "Today"
            elif diff_days == 1:
                rel = "Tomorrow"
            else:
                rel = f"In {diff_days} days"

            scheduled_items.append({
                'id': f"lab-{lab.id}",
                'kind': 'blood_test',
                'title': f"Blood Test Panel: {lab.tests_summary or 'Diagnostic Sampling'}",
                'due_at': lab.scheduled_collection_time.isoformat(),
                'due_relative': rel,
                'is_overdue': lab.scheduled_collection_time < timezone.now(),
                'notes': lab.notes or 'Specimen collection ordered',
                'status': 'scheduled',
                'is_readonly': True,
                'created_by_name': 'Lab Diagnostics Unit',
            })

        # Sort combined items by due_at
        scheduled_items.sort(key=lambda x: x.get('due_at') or '')

        # ── 10. Role Permissions for UI ──────────────────────────────────────
        is_super_or_admin = (role in ('super_admin', 'admin')) or getattr(user, 'is_superuser', False)
        is_assigned_doc = is_treating_doctor_for_patient(user, patient)
        is_assigned_cm = is_care_manager_for_patient(user, patient)

        can_edit_history_care = is_super_or_admin or is_assigned_doc or is_assigned_cm
        can_manage_complaints = is_super_or_admin or is_assigned_doc or is_assigned_cm
        can_create_scheduled = is_super_or_admin or is_assigned_doc or is_assigned_cm

        # Marking done: nurse for procedures & blood tests, therapists for therapy, doctors/cm/admins for all
        can_mark_done = (
            is_super_or_admin or is_assigned_doc or is_assigned_cm or
            role in ('nurse', 'physio', 'physiotherapist', 'speech', 'speech_therapist', 'psychologist', 'psychotherapist')
        )

        # Derived location display
        loc_str = patient.address
        if len(loc_str) > 60:
            loc_str = loc_str[:57] + '...'

        return Response({
            'patient': {
                'id': patient.id,
                'mr_number': patient.mr_number,
                'patient_code': patient.patient_code or f"PT-{patient.id}",
                'full_name': patient.full_name,
                'first_name': patient.first_name,
                'last_name': patient.last_name,
                'date_of_birth': patient.date_of_birth.isoformat() if patient.date_of_birth else None,
                'age': patient.age or '-',
                'gender': patient.gender,
                'gender_display': patient.get_gender_display(),
                'location': loc_str or 'Islamabad / Rawalpindi',
                'written_address': patient.address or '-',
                'primary_diagnosis': patient.primary_diagnosis or '-',
                'secondary_diagnoses': patient.secondary_diagnoses or '',
                'allergies': patient.allergies or 'No Known Drug Allergies (NKDA)',
                'blood_type': patient.blood_type or '-',
                'phone': patient.phone or '-',
                'photo': f"/api/patients/{patient.id}/photo/" if patient.photo else None,
                'is_active': patient.is_active,
            },
            'guardian': guardian_data,
            'treating_consultant': treating_doctor,
            'care_manager': care_manager_data,
            'staff_on_duty': staff_on_duty,
            'brief_history': patient.brief_history or '',
            'brief_history_edits': brief_history_edits,
            'care_plan': patient.care_plan or '',
            'care_plan_edits': care_plan_edits,
            'active_complaint': active_complaint,
            'active_complaint_history': complaint_history,
            'upcoming_items': scheduled_items,
            'permissions': {
                'can_edit_history_care': can_edit_history_care,
                'can_manage_complaints': can_manage_complaints,
                'can_create_scheduled': can_create_scheduled,
                'can_mark_done': can_mark_done,
                'user_role': role,
            }
        })


class PatientEmergencyContactRevealView(APIView):
    """
    POST /api/patients/{id}/reveal-emergency-contact/
    A4 Rule: Nurse presses 'Emergency contact' button to reveal legal guardian phone.
    Writes an immutable AuditLog entry (user, role, patient id, timestamp, NO phone number in log text).
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        visibility = get_guardian_contact_visibility(user, patient)
        if visibility not in ('direct', 'emergency_reveal'):
            raise PermissionDenied("You do not have permission to view emergency guardian contacts.")

        # Write security audit log without phone number
        staff = getattr(user, 'staffmember', None)
        emp_id = getattr(staff, 'employee_id', 'ADMIN' if user.is_staff or user.is_superuser else 'USER')
        actor_name = staff.full_name if staff else (user.get_full_name() or user.username)

        AuditLog.objects.create(
            actor=user,
            actor_name=actor_name,
            action='Emergency Contact Revealed',
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Role: {role} | Staff: {emp_id} | Emergency reveal of legal guardian contact for Patient ID {patient.id} (MR: {patient.mr_number})",
            timestamp=timezone.now()
        )

        return Response({
            'success': True,
            'name': patient.emergency_contact_name or '-',
            'relation': patient.emergency_contact_relation or '-',
            'phone': patient.emergency_contact_phone or '-',
        })


class PatientHistoryCarePlanUpdateView(APIView):
    """
    POST /api/patients/{id}/history-care-plan/
    B1: Update 'brief_history' or 'care_plan'.
    Editable by assigned doctor, patient's care manager, admin, super_admin.
    Appends an immutable edit entry to history_care_plan_edits audit trail.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        is_super_or_admin = (role in ('super_admin', 'admin')) or getattr(user, 'is_superuser', False)
        is_assigned_doc = is_treating_doctor_for_patient(user, patient)
        is_assigned_cm = is_care_manager_for_patient(user, patient)

        if not (is_super_or_admin or is_assigned_doc or is_assigned_cm):
            raise PermissionDenied("Only assigned doctors, the patient's care manager, or administrators may edit history and care plans.")

        section = request.data.get('section')
        text = (request.data.get('text') or '').strip()

        if section not in ('brief_history', 'care_plan'):
            return Response({'detail': "section must be 'brief_history' or 'care_plan'."}, status=status.HTTP_400_BAD_REQUEST)

        # Append edit audit trail
        actor_name = user.get_full_name() or user.username
        edit_entry = {
            'section': section,
            'text': text,
            'edited_by_id': user.id,
            'edited_by_name': actor_name,
            'edited_by_role': role,
            'edited_at': timezone.now().isoformat(),
        }

        current_edits = list(patient.history_care_plan_edits or [])
        current_edits.append(edit_entry)
        patient.history_care_plan_edits = current_edits

        if section == 'brief_history':
            patient.brief_history = text
        else:
            patient.care_plan = text

        patient.save(update_fields=[section, 'history_care_plan_edits', 'updated_at'])

        # Security Audit Log
        AuditLog.objects.create(
            actor=user,
            actor_name=actor_name,
            action=f"Patient {section.replace('_', ' ').title()} Updated",
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Role: {role} | Updated {section} for Patient ID {patient.id}",
            timestamp=timezone.now()
        )

        return Response({
            'success': True,
            'section': section,
            'text': text,
            'edits': [e for e in current_edits if e.get('section') == section],
        })


class PatientActiveComplaintView(APIView):
    """
    POST /api/patients/{id}/active-complaint/
    B2: Create or resolve active complaint banner.
    Permitted: assigned doctor, care manager, admin, super_admin.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        is_super_or_admin = (role in ('super_admin', 'admin')) or getattr(user, 'is_superuser', False)
        is_assigned_doc = is_treating_doctor_for_patient(user, patient)
        is_assigned_cm = is_care_manager_for_patient(user, patient)

        if not (is_super_or_admin or is_assigned_doc or is_assigned_cm):
            raise PermissionDenied("Only assigned doctors, the patient's care manager, or administrators may manage active complaints.")

        action = request.data.get('action', 'create')

        if action == 'resolve':
            unresolved = patient.active_complaints.filter(resolved_at__isnull=True)
            count = unresolved.update(resolved_at=timezone.now(), resolved_by=user)
            AuditLog.objects.create(
                actor=user,
                actor_name=user.get_full_name() or user.username,
                action='Patient Active Complaint Resolved',
                target_user=f"Patient {patient.patient_code or patient.id}",
                details=f"Resolved {count} active complaint(s) for Patient ID {patient.id}",
                timestamp=timezone.now()
            )
            return Response({'success': True, 'action': 'resolved', 'active_complaint': None})

        # Create new active complaint (superseding previous unresolved)
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'detail': 'text is required to record an active complaint.'}, status=status.HTTP_400_BAD_REQUEST)

        # Mark any previous unresolved entries resolved as superseded
        patient.active_complaints.filter(resolved_at__isnull=True).update(
            resolved_at=timezone.now(), resolved_by=user
        )

        new_complaint = PatientActiveComplaint.objects.create(
            patient=patient,
            text=text,
            created_by=user,
        )

        AuditLog.objects.create(
            actor=user,
            actor_name=user.get_full_name() or user.username,
            action='Patient Active Complaint Created',
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Recorded new active complaint #{new_complaint.id} for Patient ID {patient.id}",
            timestamp=timezone.now()
        )

        return Response({
            'success': True,
            'action': 'created',
            'active_complaint': PatientActiveComplaintSerializer(new_complaint).data,
            'history': PatientActiveComplaintSerializer(
                patient.active_complaints.select_related('created_by', 'resolved_by')[:10],
                many=True
            ).data
        }, status=status.HTTP_201_CREATED)


class PatientScheduledItemView(APIView):
    """
    GET / POST /api/patients/{id}/scheduled-items/
    PATCH /api/patients/{id}/scheduled-items/{item_id}/
    B3: Upcoming procedures, appointments and blood tests.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        patient = _resolve_patient_with_scoping(request.user, pk)
        items = patient.scheduled_items.select_related('created_by', 'done_by').order_by('due_at')
        return Response(ScheduledItemSerializer(items, many=True).data)

    def post(self, request, pk):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        is_super_or_admin = (role in ('super_admin', 'admin')) or getattr(user, 'is_superuser', False)
        is_assigned_doc = is_treating_doctor_for_patient(user, patient)
        is_assigned_cm = is_care_manager_for_patient(user, patient)

        if not (is_super_or_admin or is_assigned_doc or is_assigned_cm):
            raise PermissionDenied("Only assigned doctors, care managers, or administrators may schedule items.")

        data = request.data.copy()
        data['patient'] = patient.id
        serializer = ScheduledItemSerializer(data=data)
        if serializer.is_valid():
            item = serializer.save(created_by=user)
            AuditLog.objects.create(
                actor=user,
                actor_name=user.get_full_name() or user.username,
                action='Scheduled Item Created',
                target_user=f"Patient {patient.patient_code or patient.id}",
                details=f"Scheduled {item.kind}: '{item.title}' for Patient ID {patient.id}",
                timestamp=timezone.now()
            )
            return Response(ScheduledItemSerializer(item).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def patch(self, request, pk, item_id=None):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        target_id = item_id or request.data.get('id')
        if not target_id:
            return Response({'detail': 'Scheduled item id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            item = patient.scheduled_items.get(pk=target_id)
        except ScheduledItem.DoesNotExist:
            raise NotFound("Scheduled item not found.")

        new_status = request.data.get('status')
        if not new_status:
            return Response({'detail': 'status is required.'}, status=status.HTTP_400_BAD_REQUEST)

        is_super_or_admin = (role in ('super_admin', 'admin')) or getattr(user, 'is_superuser', False)
        is_assigned_doc = is_treating_doctor_for_patient(user, patient)
        is_assigned_cm = is_care_manager_for_patient(user, patient)

        if new_status == ScheduledItem.Status.CANCELLED:
            if not (is_super_or_admin or is_assigned_doc or is_assigned_cm):
                raise PermissionDenied("Only assigned doctors, care managers, or administrators may cancel scheduled items.")
            item.status = ScheduledItem.Status.CANCELLED
            item.save(update_fields=['status'])

        elif new_status == ScheduledItem.Status.DONE:
            # Check role permissions to mark done
            # Nurse can mark procedure and blood_test done
            # Therapist can mark appointment/therapy done
            can_mark = False
            if is_super_or_admin or is_assigned_doc or is_assigned_cm:
                can_mark = True
            elif role in ('nurse', 'nursing_assistant') and item.kind in (ScheduledItem.Kind.PROCEDURE, ScheduledItem.Kind.BLOOD_TEST):
                can_mark = True
            elif role in ('physio', 'physiotherapist', 'speech', 'speech_therapist', 'psychologist', 'psychotherapist') and item.kind == ScheduledItem.Kind.APPOINTMENT:
                can_mark = True

            if not can_mark:
                raise PermissionDenied("You do not have permission to mark this scheduled item as completed.")

            item.status = ScheduledItem.Status.DONE
            item.done_at = timezone.now()
            item.done_by = user
            item.save(update_fields=['status', 'done_at', 'done_by'])

        else:
            item.status = new_status
            item.save(update_fields=['status'])

        return Response(ScheduledItemSerializer(item).data)


class PatientRecordsTimelineView(APIView):
    """
    GET /api/patients/{id}/records/{type}/?from=&to=&q=&page=
    C2 & C3: Uniform timeline shape across all 11 Clinical Records tiles:
    1. medications
    2. vitals
    3. intake_output
    4. doctor_notes
    5. consents
    6. history_sheets
    7. lab_reports
    8. manager_checklist
    9. safety_checklist
    10. nursing_notes
    11. rehabilitation_notes (Physio & Speech; Psychotherapy strictly gated per Phase 1 rule)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, record_type=None):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        from_str = request.query_params.get('from')
        to_str = request.query_params.get('to')
        q_search = (request.query_params.get('q') or '').strip().lower()
        all_time = request.query_params.get('all_time', 'false').lower() == 'true'

        karachi_tz = ZoneInfo(getattr(settings, 'OFFICE_TIMEZONE', 'Asia/Karachi'))

        # Date window calculation
        start_dt = None
        end_dt = None
        if from_str:
            try:
                d = datetime.date.fromisoformat(from_str)
                start_dt = timezone.make_aware(datetime.datetime.combine(d, datetime.time.min), karachi_tz)
            except ValueError:
                pass
        if to_str:
            try:
                d = datetime.date.fromisoformat(to_str)
                end_dt = timezone.make_aware(datetime.datetime.combine(d, datetime.time.max), karachi_tz)
            except ValueError:
                pass

        if not start_dt and not end_dt and not all_time:
            # Default display window from settings (PATIENT_FILE_DEFAULT_RECORD_WINDOW_DAYS = 183)
            window_days = getattr(settings, 'PATIENT_FILE_DEFAULT_RECORD_WINDOW_DAYS', 183)
            start_dt = timezone.now() - datetime.timedelta(days=window_days)

        # Build raw items list based on tile record_type
        items = []

        if record_type in ('medications', 'medication_chart'):
            # Prescriptions
            p_qs = patient.prescriptions.select_related('uploaded_by').all()
            if start_dt: p_qs = p_qs.filter(created_at__gte=start_dt)
            if end_dt: p_qs = p_qs.filter(created_at__lte=end_dt)
            for p in p_qs:
                items.append({
                    'id': f"rx-{p.id}",
                    'record_id': p.id,
                    'type': 'medications',
                    'occurred_at': p.created_at.isoformat(),
                    'title': f"Prescription: {p.medication} ({p.dosage})",
                    'summary': f"Route: {p.route or 'Oral'} · Freq: {p.frequency} · Duration: {p.duration_days or '-'} days. {p.notes}",
                    'author_name': p.uploaded_by.full_name if p.uploaded_by else '-',
                    'author_role': _format_author_role(p.uploaded_by),
                    'is_signed': True,
                    'signed_at': p.created_at.isoformat(),
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'medication': p.medication,
                        'dosage': p.dosage,
                        'frequency': p.frequency,
                        'route': p.route,
                        'duration_days': p.duration_days,
                        'notes': p.notes,
                        'document_url': p.document.url if p.document else None,
                    }
                })

            # MAR Administrations
            m_qs = MARAdministration.objects.filter(prescription__patient=patient).select_related('administered_by', 'prescription')
            if start_dt: m_qs = m_qs.filter(administered_at__gte=start_dt)
            if end_dt: m_qs = m_qs.filter(administered_at__lte=end_dt)
            for m in m_qs:
                items.append({
                    'id': f"mar-{m.id}",
                    'record_id': m.id,
                    'type': 'medications',
                    'occurred_at': m.administered_at.isoformat(),
                    'title': f"MAR Dose Given: {m.prescription.medication}",
                    'summary': f"Administered dose on Day {m.day_number} at {m.administered_at.astimezone(karachi_tz).strftime('%H:%M PKT')}",
                    'author_name': m.administered_by.full_name if m.administered_by else '-',
                    'author_role': _format_author_role(m.administered_by),
                    'is_signed': True,
                    'signed_at': m.administered_at.isoformat(),
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'prescription_id': m.prescription_id,
                        'medication': m.prescription.medication,
                        'day_number': m.day_number,
                        'dose_time': m.administered_at.astimezone(karachi_tz).strftime('%H:%M PKT'),
                    }
                })

        elif record_type in ('vitals', 'vital_signs'):
            v_qs = patient.vitals.select_related('recorded_by').filter(
                Q(blood_pressure_systolic__isnull=False) | Q(heart_rate__isnull=False) | Q(temperature__isnull=False)
            )
            if start_dt: v_qs = v_qs.filter(recorded_at__gte=start_dt)
            if end_dt: v_qs = v_qs.filter(recorded_at__lte=end_dt)
            for v in v_qs:
                bp_str = f"{v.blood_pressure_systolic}/{v.blood_pressure_diastolic} mmHg" if v.blood_pressure_systolic else "-"
                summary_parts = [f"BP: {bp_str}"]
                if v.heart_rate: summary_parts.append(f"HR: {v.heart_rate} bpm")
                if v.temperature: summary_parts.append(f"Temp: {v.temperature}°C")
                if v.spo2: summary_parts.append(f"SpO2: {v.spo2}%")
                if v.blood_glucose: summary_parts.append(f"BS: {v.blood_glucose} mg/dL")

                items.append({
                    'id': f"vital-{v.id}",
                    'record_id': v.id,
                    'type': 'vitals',
                    'occurred_at': v.recorded_at.isoformat(),
                    'title': f"Vitals Observation: BP {bp_str}",
                    'summary': " · ".join(summary_parts) + (f" · {v.notes}" if v.notes else ""),
                    'author_name': v.recorded_by.full_name if v.recorded_by else '-',
                    'author_role': _format_author_role(v.recorded_by),
                    'is_signed': True,
                    'signed_at': v.recorded_at.isoformat(),
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'bp_systolic': v.blood_pressure_systolic,
                        'bp_diastolic': v.blood_pressure_diastolic,
                        'heart_rate': v.heart_rate,
                        'temperature': str(v.temperature) if v.temperature else None,
                        'spo2': v.spo2,
                        'respiratory_rate': v.respiratory_rate,
                        'weight_kg': str(v.weight_kg) if v.weight_kg else None,
                        'blood_glucose': str(v.blood_glucose) if v.blood_glucose else None,
                        'notes': v.notes,
                    }
                })

        elif record_type in ('intake_output', 'intake_output_chart'):
            io_qs = patient.vitals.select_related('recorded_by').filter(
                Q(intake_ml__isnull=False) | Q(output_ml__isnull=False)
            )
            if start_dt: io_qs = io_qs.filter(recorded_at__gte=start_dt)
            if end_dt: io_qs = io_qs.filter(recorded_at__lte=end_dt)
            for v in io_qs:
                items.append({
                    'id': f"io-{v.id}",
                    'record_id': v.id,
                    'type': 'intake_output',
                    'occurred_at': v.recorded_at.isoformat(),
                    'title': f"Fluid Balance: In {v.intake_ml or 0}ml / Out {v.output_ml or 0}ml",
                    'summary': f"Total Intake: {v.intake_ml or 0} ml · Total Output: {v.output_ml or 0} ml · Net: {(v.intake_ml or 0) - (v.output_ml or 0)} ml. {v.notes}",
                    'author_name': v.recorded_by.full_name if v.recorded_by else '-',
                    'author_role': _format_author_role(v.recorded_by),
                    'is_signed': True,
                    'signed_at': v.recorded_at.isoformat(),
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'intake_ml': v.intake_ml or 0,
                        'output_ml': v.output_ml or 0,
                        'net_balance_ml': (v.intake_ml or 0) - (v.output_ml or 0),
                        'notes': v.notes,
                    }
                })

        elif record_type in ('doctor_notes', 'consultations'):
            dn_qs = patient.doctor_notes.select_related('doctor', 'signed_by').all()
            if start_dt: dn_qs = dn_qs.filter(created_at__gte=start_dt)
            if end_dt: dn_qs = dn_qs.filter(created_at__lte=end_dt)
            for dn in dn_qs:
                note_text = getattr(dn, 'notes', '') or getattr(dn, 'clinical_notes', '')
                items.append({
                    'id': f"dn-{dn.id}",
                    'record_id': dn.id,
                    'type': 'doctor_notes',
                    'occurred_at': dn.created_at.isoformat(),
                    'title': f"Doctor Clinical Note — Dr. {dn.doctor.full_name if dn.doctor else 'Physician'}",
                    'summary': note_text[:180] + ('...' if len(note_text) > 180 else ''),
                    'author_name': dn.doctor.full_name if dn.doctor else '-',
                    'author_role': _format_author_role(dn.doctor),
                    'is_signed': dn.is_signed,
                    'signed_at': dn.signed_at.isoformat() if dn.signed_at else None,
                    'has_addenda': bool(dn.addenda),
                    'addenda': dn.addenda or [],
                    'details': {
                        'notes': note_text,
                        'clinical_notes': note_text,
                        'plan': dn.plan or '',
                    }
                })

        elif record_type in ('consents', 'consent_forms'):
            c_qs = patient.consents.select_related('signed_by').all()
            if start_dt: c_qs = c_qs.filter(created_at__gte=start_dt)
            if end_dt: c_qs = c_qs.filter(created_at__lte=end_dt)
            for c in c_qs:
                items.append({
                    'id': f"consent-{c.id}",
                    'record_id': c.id,
                    'type': 'consents',
                    'occurred_at': c.created_at.isoformat(),
                    'title': f"Consent: {c.title}",
                    'summary': f"Granted by {c.granted_by} ({c.relationship}) · Type: {c.consent_type}. {c.description[:120]}",
                    'author_name': c.signed_by.full_name if c.signed_by else (c.granted_by or '-'),
                    'author_role': _format_author_role(c.signed_by),
                    'is_signed': c.is_signed,
                    'signed_at': c.signed_at.isoformat() if c.signed_at else None,
                    'has_addenda': bool(c.addenda),
                    'addenda': c.addenda or [],
                    'details': {
                        'title': c.title,
                        'consent_type': c.consent_type,
                        'granted_by': c.granted_by,
                        'relationship': c.relationship,
                        'description': c.description,
                    }
                })

        elif record_type in ('history_sheets',):
            # Forms builder submissions with audience or title matching history/intake
            sub_qs = FormSubmission.objects.filter(patient=patient).select_related('template', 'submitted_by')
            if start_dt: sub_qs = sub_qs.filter(submitted_at__gte=start_dt)
            if end_dt: sub_qs = sub_qs.filter(submitted_at__lte=end_dt)
            for sub in sub_qs:
                items.append({
                    'id': f"form-{sub.id}",
                    'record_id': sub.id,
                    'type': 'history_sheets',
                    'occurred_at': sub.submitted_at.isoformat(),
                    'title': f"Form: {sub.template.title}",
                    'summary': f"Submission #{sub.id} · Status: {sub.get_status_display()} · v{sub.template_version}",
                    'author_name': sub.submitted_by.get_full_name() if sub.submitted_by else '-',
                    'author_role': _format_author_role(getattr(sub.submitted_by, 'staffmember', None) if sub.submitted_by else None),
                    'is_signed': True,
                    'signed_at': sub.submitted_at.isoformat(),
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'form_title': sub.template.title,
                        'form_data': sub.data,
                    }
                })

        elif record_type in ('lab_reports', 'labs'):
            # Lab Results
            lr_qs = patient.lab_results.all()
            if start_dt: lr_qs = lr_qs.filter(collected_at__gte=start_dt)
            if end_dt: lr_qs = lr_qs.filter(collected_at__lte=end_dt)
            for lr in lr_qs:
                abnormal_flag = " [ABNORMAL]" if lr.is_abnormal else ""
                items.append({
                    'id': f"lr-{lr.id}",
                    'record_id': lr.id,
                    'type': 'lab_reports',
                    'occurred_at': lr.collected_at.isoformat(),
                    'title': f"Lab: {lr.test_name}{abnormal_flag}",
                    'summary': f"Value: {lr.result_value} {lr.unit} · Ref Range: {lr.reference_range or '-'}",
                    'author_name': 'Pathology Laboratory',
                    'author_role': '-',
                    'is_signed': True,
                    'signed_at': lr.reported_at.isoformat() if lr.reported_at else None,
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'test_name': lr.test_name,
                        'result_value': lr.result_value,
                        'unit': lr.unit,
                        'reference_range': lr.reference_range,
                        'is_abnormal': lr.is_abnormal,
                        'document_url': lr.document.url if lr.document else None,
                    }
                })

            # Lab Reports from lab app
            rep_qs = LabReport.objects.filter(lab_order__patient=patient).select_related('lab_order', 'uploaded_by')
            if start_dt: rep_qs = rep_qs.filter(uploaded_at__gte=start_dt)
            if end_dt: rep_qs = rep_qs.filter(uploaded_at__lte=end_dt)
            for rep in rep_qs:
                items.append({
                    'id': f"labrep-{rep.id}",
                    'record_id': rep.id,
                    'type': 'lab_reports',
                    'occurred_at': rep.uploaded_at.isoformat(),
                    'title': f"Lab Report: Order #{rep.lab_order_id}",
                    'summary': f"{'Abnormal findings flagged. ' if rep.flagged_abnormal else 'Standard results. '}{rep.clinical_remarks or ''}",
                    'author_name': rep.uploaded_by.get_full_name() if rep.uploaded_by else '-',
                    'author_role': _format_author_role(getattr(rep.uploaded_by, 'staffmember', None) if rep.uploaded_by else None),
                    'is_signed': True,
                    'signed_at': rep.uploaded_at.isoformat(),
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'result_data': rep.result_data,
                        'clinical_remarks': rep.clinical_remarks,
                        'result_file_url': rep.result_file.url if rep.result_file else None,
                    }
                })

        elif record_type in ('manager_checklist', 'manager_visit_checklist'):
            chk_qs = ManagerVisitChecklist.objects.filter(patient=patient).select_related('manager')
            if start_dt: chk_qs = chk_qs.filter(visit_date__gte=start_dt.date())
            if end_dt: chk_qs = chk_qs.filter(visit_date__lte=end_dt.date())
            for chk in chk_qs:
                items.append({
                    'id': f"chk-{chk.id}",
                    'record_id': chk.id,
                    'type': 'manager_checklist',
                    'occurred_at': datetime.datetime.combine(chk.visit_date, datetime.time(12, 0), tzinfo=karachi_tz).isoformat(),
                    'title': f"Manager Clinical Audit & Visit Checklist",
                    'summary': f"Manager: {chk.manager.full_name if chk.manager else 'Care Coordinator'} · Score/Status: Completed",
                    'author_name': chk.manager.full_name if chk.manager else '-',
                    'author_role': _format_author_role(chk.manager),
                    'is_signed': True,
                    'signed_at': chk.created_at.isoformat(),
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'visit_date': chk.visit_date.isoformat(),
                        'notes': getattr(chk, 'notes', ''),
                    }
                })

        elif record_type in ('safety_checklist',):
            # Empty state if no safety checklist form submissions exist
            pass

        elif record_type in ('nursing_notes',):
            nn_qs = patient.nurse_notes.select_related('recorded_by').all()
            if start_dt: nn_qs = nn_qs.filter(recorded_at__gte=start_dt)
            if end_dt: nn_qs = nn_qs.filter(recorded_at__lte=end_dt)
            for nn in nn_qs:
                items.append({
                    'id': f"nn-{nn.id}",
                    'record_id': nn.id,
                    'type': 'nursing_notes',
                    'occurred_at': nn.recorded_at.isoformat(),
                    'title': f"Nursing Progress Note — {nn.recorded_by.full_name if nn.recorded_by else 'Staff Nurse'}",
                    'summary': nn.note[:180] + ('...' if len(nn.note) > 180 else ''),
                    'author_name': nn.recorded_by.full_name if nn.recorded_by else '-',
                    'author_role': _format_author_role(nn.recorded_by),
                    'is_signed': True,
                    'signed_at': nn.recorded_at.isoformat(),
                    'has_addenda': False,
                    'addenda': [],
                    'details': {
                        'note': nn.note,
                        'is_flagged': nn.is_flagged,
                    }
                })

        elif record_type in ('rehabilitation_notes', 'rehab_notes'):
            # Physio Notes
            pn_qs = patient.physio_notes.select_related('physio', 'signed_by').all()
            if start_dt: pn_qs = pn_qs.filter(created_at__gte=start_dt)
            if end_dt: pn_qs = pn_qs.filter(created_at__lte=end_dt)
            for pn in pn_qs:
                items.append({
                    'id': f"pn-{pn.id}",
                    'record_id': pn.id,
                    'type': 'rehabilitation_notes',
                    'occurred_at': pn.created_at.isoformat(),
                    'title': f"Physiotherapy Progress Note — {pn.physio.full_name if pn.physio else 'Physiotherapist'}",
                    'summary': pn.session_notes[:180] + ('...' if len(pn.session_notes) > 180 else ''),
                    'author_name': pn.physio.full_name if pn.physio else '-',
                    'author_role': _format_author_role(pn.physio),
                    'is_signed': pn.is_signed,
                    'signed_at': pn.signed_at.isoformat() if pn.signed_at else None,
                    'has_addenda': bool(pn.addenda),
                    'addenda': pn.addenda or [],
                    'details': {
                        'session_notes': pn.session_notes,
                        'mobility_status': pn.mobility_status,
                        'goals': pn.goals,
                        'exercises': pn.exercises,
                    }
                })

            # Therapy Notes (Physiotherapy, Speech Therapy, Psychotherapy)
            tn_qs = patient.therapy_notes.select_related('author', 'signed_by').all()
            if start_dt: tn_qs = tn_qs.filter(created_at__gte=start_dt)
            if end_dt: tn_qs = tn_qs.filter(created_at__lte=end_dt)
            for tn in tn_qs:
                # ── CRITICAL CONFIDENTIALITY CHECK FOR PSYCHOTHERAPY NOTES ──
                if tn.discipline == TherapyNote.Discipline.PSYCHOTHERAPY:
                    if not can_view_psychotherapy_note(user, tn):
                        continue  # EXCLUDE completely from unauthorized timeline!

                    # Audit non-author read per Phase 1 rule
                    author = tn.author or tn.signed_by
                    if not author or author.user_id != user.id:
                        log_chart_audit(request, patient, action='Read Psychotherapy Notes', section='rehabilitation_notes', record_id=tn.id)

                items.append({
                    'id': f"tn-{tn.id}",
                    'record_id': tn.id,
                    'type': 'rehabilitation_notes',
                    'occurred_at': tn.created_at.isoformat(),
                    'title': f"{tn.get_discipline_display()} — {tn.author.full_name if tn.author else 'Therapist'}",
                    'summary': tn.session_notes[:180] + ('...' if len(tn.session_notes) > 180 else ''),
                    'author_name': tn.author.full_name if tn.author else '-',
                    'author_role': _format_author_role(tn.author),
                    'is_signed': tn.is_signed,
                    'signed_at': tn.signed_at.isoformat() if tn.signed_at else None,
                    'has_addenda': bool(tn.addenda),
                    'addenda': tn.addenda or [],
                    'details': {
                        'discipline': tn.discipline,
                        'discipline_display': tn.get_discipline_display(),
                        'session_notes': tn.session_notes,
                        'plan': tn.plan,
                        'goals': tn.goals,
                        'exercises': tn.exercises,
                    }
                })

        # Search filter
        if q_search:
            filtered = []
            for item in items:
                text_corpus = (
                    f"{item.get('title', '')} {item.get('summary', '')} "
                    f"{item.get('author_name', '')} {str(item.get('details', ''))}"
                ).lower()
                if q_search in text_corpus:
                    filtered.append(item)
            items = filtered

        # Sort descending by occurred_at
        items.sort(key=lambda x: x.get('occurred_at') or '', reverse=True)

        # Pagination: 20 records per page
        page_size = 20
        total_items = len(items)
        try:
            page = int(request.query_params.get('page', 1))
        except (ValueError, TypeError):
            page = 1

        total_pages = max(1, (total_items + page_size - 1) // page_size)
        page = max(1, min(page, total_pages))

        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        paged_items = items[start_idx:end_idx]

        return Response({
            'count': total_items,
            'page': page,
            'total_pages': total_pages,
            'page_size': page_size,
            'results': paged_items,
        })


class PatientSingleRecordDetailView(APIView):
    """
    GET /api/patients/{id}/records/{type}/{record_id}/
    Returns complete chart or entry in a side drawer (full values, addenda trail, author, signed time).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk, record_type=None, record_id=None):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user

        # Support querying the timeline endpoint with exact record_id
        # Delegate to single lookup
        if record_type in ('doctor_notes', 'consultations'):
            try:
                dn = patient.doctor_notes.select_related('doctor', 'signed_by').get(pk=record_id)
            except DoctorNote.DoesNotExist:
                raise NotFound("Doctor note not found.")
            return Response({
                'id': dn.id,
                'type': 'doctor_notes',
                'title': f"Doctor Clinical Note — Dr. {dn.doctor.full_name if dn.doctor else 'Physician'}",
                'occurred_at': dn.created_at.isoformat(),
                'author_name': dn.doctor.full_name if dn.doctor else '-',
                'author_role': _format_author_role(dn.doctor),
                'is_signed': dn.is_signed,
                'signed_at': dn.signed_at.isoformat() if dn.signed_at else None,
                'addenda': dn.addenda or [],
                'details': {
                    'notes': getattr(dn, 'notes', '') or getattr(dn, 'clinical_notes', ''),
                    'clinical_notes': getattr(dn, 'notes', '') or getattr(dn, 'clinical_notes', ''),
                    'plan': dn.plan or '',
                }
            })

        elif record_type in ('rehabilitation_notes', 'rehab_notes'):
            # Try TherapyNote first, then PhysioNote
            tn = patient.therapy_notes.filter(pk=record_id).select_related('author', 'signed_by').first()
            if tn:
                if tn.discipline == TherapyNote.Discipline.PSYCHOTHERAPY:
                    if not can_view_psychotherapy_note(user, tn):
                        raise Http404("Therapy note not found.")
                    author = tn.author or tn.signed_by
                    if not author or author.user_id != user.id:
                        log_chart_audit(request, patient, action='Read Psychotherapy Note', section='rehabilitation_notes', record_id=tn.id)

                return Response({
                    'id': tn.id,
                    'type': 'rehabilitation_notes',
                    'title': f"{tn.get_discipline_display()} — {tn.author.full_name if tn.author else 'Therapist'}",
                    'occurred_at': tn.created_at.isoformat(),
                    'author_name': tn.author.full_name if tn.author else '-',
                    'author_role': _format_author_role(tn.author),
                    'is_signed': tn.is_signed,
                    'signed_at': tn.signed_at.isoformat() if tn.signed_at else None,
                    'addenda': tn.addenda or [],
                    'details': {
                        'discipline': tn.discipline,
                        'session_notes': tn.session_notes,
                        'plan': tn.plan,
                        'goals': tn.goals,
                        'exercises': tn.exercises,
                    }
                })

            pn = patient.physio_notes.filter(pk=record_id).select_related('physio', 'signed_by').first()
            if pn:
                return Response({
                    'id': pn.id,
                    'type': 'rehabilitation_notes',
                    'title': f"Physiotherapy Progress Note — {pn.physio.full_name if pn.physio else 'Physiotherapist'}",
                    'occurred_at': pn.created_at.isoformat(),
                    'author_name': pn.physio.full_name if pn.physio else '-',
                    'author_role': _format_author_role(pn.physio),
                    'is_signed': pn.is_signed,
                    'signed_at': pn.signed_at.isoformat() if pn.signed_at else None,
                    'addenda': pn.addenda or [],
                    'details': {
                        'session_notes': pn.session_notes,
                        'mobility_status': pn.mobility_status,
                        'goals': pn.goals,
                        'exercises': pn.exercises,
                    }
                })
            raise NotFound("Rehabilitation note not found.")

        elif record_type in ('consents', 'consent_forms'):
            try:
                c = patient.consents.select_related('signed_by').get(pk=record_id)
            except ClinicalConsent.DoesNotExist:
                raise NotFound("Consent record not found.")
            return Response({
                'id': c.id,
                'type': 'consents',
                'title': f"Consent: {c.title}",
                'occurred_at': c.created_at.isoformat(),
                'author_name': c.signed_by.full_name if c.signed_by else (c.granted_by or '-'),
                'author_role': _format_author_role(c.signed_by),
                'is_signed': c.is_signed,
                'signed_at': c.signed_at.isoformat() if c.signed_at else None,
                'addenda': c.addenda or [],
                'details': {
                    'title': c.title,
                    'consent_type': c.consent_type,
                    'granted_by': c.granted_by,
                    'relationship': c.relationship,
                    'description': c.description,
                }
            })

        elif record_type in ('vitals', 'vital_signs', 'intake_output'):
            try:
                v = patient.vitals.select_related('recorded_by').get(pk=record_id)
            except VitalSign.DoesNotExist:
                raise NotFound("Vital record not found.")
            return Response({
                'id': v.id,
                'type': record_type,
                'title': f"Vitals Observation",
                'occurred_at': v.recorded_at.isoformat(),
                'author_name': v.recorded_by.full_name if v.recorded_by else '-',
                'author_role': _format_author_role(v.recorded_by),
                'is_signed': True,
                'signed_at': v.recorded_at.isoformat(),
                'addenda': [],
                'details': {
                    'bp_systolic': v.blood_pressure_systolic,
                    'bp_diastolic': v.blood_pressure_diastolic,
                    'heart_rate': v.heart_rate,
                    'temperature': str(v.temperature) if v.temperature else None,
                    'spo2': v.spo2,
                    'respiratory_rate': v.respiratory_rate,
                    'weight_kg': str(v.weight_kg) if v.weight_kg else None,
                    'blood_glucose': str(v.blood_glucose) if v.blood_glucose else None,
                    'intake_ml': v.intake_ml,
                    'output_ml': v.output_ml,
                    'notes': v.notes,
                }
            })

        elif record_type in ('nursing_notes',):
            try:
                nn = patient.nurse_notes.select_related('recorded_by').get(pk=record_id)
            except NurseNote.DoesNotExist:
                raise NotFound("Nurse note not found.")
            return Response({
                'id': nn.id,
                'type': 'nursing_notes',
                'title': f"Nursing Progress Note",
                'occurred_at': nn.recorded_at.isoformat(),
                'author_name': nn.recorded_by.full_name if nn.recorded_by else '-',
                'author_role': _format_author_role(nn.recorded_by),
                'is_signed': True,
                'signed_at': nn.recorded_at.isoformat(),
                'addenda': [],
                'details': {
                    'note': nn.note,
                    'is_flagged': nn.is_flagged,
                }
            })

        raise NotFound(f"Detail view for record type '{record_type}' not found.")


class PatientPhotoView(APIView):
    """
    GET /api/patients/{id}/photo/
    POST /api/patients/{id}/photo/
    Scoped patient photo retrieval and upload endpoint.
    - GET: Enforces scoping; returns FileResponse with content_type.
    - POST: Restricted to admin, super_admin, care_manager. Max 5MB, jpeg/png/webp.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        patient = _resolve_patient_with_scoping(request.user, pk)
        if not patient.photo:
            raise Http404("Patient has no photo on file.")

        try:
            f = patient.photo.open('rb')
        except (FileNotFoundError, ValueError):
            raise Http404("Photo file not found on disk.")

        ct, _ = mimetypes.guess_type(patient.photo.name)
        return FileResponse(f, content_type=ct or 'image/jpeg')

    def post(self, request, pk):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        if not (role in ('super_admin', 'admin', 'care_manager') or getattr(user, 'is_superuser', False)):
            raise PermissionDenied("Only administrators and care managers may upload patient photos.")

        photo_file = request.FILES.get('photo')
        if not photo_file:
            return Response({'error': 'No photo file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        # 5 MB max
        if photo_file.size > 5 * 1024 * 1024:
            return Response({'error': 'File size exceeds maximum limit of 5 MB.'}, status=status.HTTP_400_BAD_REQUEST)

        # Content type check
        allowed_types = ['image/jpeg', 'image/png', 'image/webp']
        if photo_file.content_type not in allowed_types:
            return Response({'error': f'Unsupported image type: {photo_file.content_type}. Allowed: jpeg, png, webp.'}, status=status.HTTP_400_BAD_REQUEST)

        # Extension check
        ext = os.path.splitext(photo_file.name)[1].lower()
        if ext not in ['.jpg', '.jpeg', '.png', '.webp']:
            return Response({'error': 'Invalid file extension. Allowed: .jpg, .jpeg, .png, .webp.'}, status=status.HTTP_400_BAD_REQUEST)

        patient.photo = photo_file
        patient.save(update_fields=['photo'])

        AuditLog.objects.create(
            actor=user,
            actor_name=user.get_full_name() or user.username,
            action='Upload Patient Photo',
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Uploaded photo for Patient ID {patient.id}",
            timestamp=timezone.now()
        )

        return Response({
            'photo': f"/api/patients/{patient.id}/photo/",
            'message': 'Patient photo uploaded successfully.'
        }, status=status.HTTP_200_OK)


class PatientRecordAddendumView(APIView):
    """
    POST /api/patients/{id}/records/{record_type}/{record_id}/addendum/
    Appends an immutable clinical addendum entry with audit reason.
    Allowed for: Author of the note, treating doctor, assigned care manager, admin, super_admin.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk, record_type=None, record_id=None):
        patient = _resolve_patient_with_scoping(request.user, pk)
        user = request.user
        role = get_user_role(user)

        text = (request.data.get('text') or '').strip()
        reason = (request.data.get('reason') or '').strip()

        if not text or not reason:
            return Response(
                {'error': 'Both addendum clinical text and audit reason are required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Resolve note by record_type
        record = None
        if record_type in ('doctor_notes', 'consultations'):
            record = patient.doctor_notes.filter(pk=record_id).first()
        elif record_type in ('rehabilitation_notes', 'rehab_notes'):
            record = patient.therapy_notes.filter(pk=record_id).first() or patient.physio_notes.filter(pk=record_id).first()
        elif record_type in ('consents', 'consent_forms'):
            record = patient.consents.filter(pk=record_id).first()

        if not record:
            raise NotFound("Clinical record not found for addendum append.")

        # Permission check: author or authorized clinician
        is_admin = role in ('super_admin', 'admin') or getattr(user, 'is_superuser', False)
        is_author = False
        author = getattr(record, 'author', None) or getattr(record, 'doctor', None) or getattr(record, 'physio', None) or getattr(record, 'signed_by', None)
        if author and author.user_id == user.id:
            is_author = True

        is_doc = is_treating_doctor_for_patient(user, patient)
        is_cm = is_care_manager_for_patient(user, patient)

        if not (is_admin or is_author or is_doc or is_cm):
            raise PermissionDenied("You do not have permission to append an addendum to this clinical entry.")

        staff = getattr(user, 'staffmember', None)
        addendum_entry = {
            'text': text,
            'reason': reason,
            'added_at': timezone.now().isoformat(),
            'author_id': user.id,
            'author_name': user.get_full_name() or user.username,
            'author_role': _format_author_role(staff),
        }

        current_addenda = getattr(record, 'addenda', []) or []
        current_addenda.append(addendum_entry)
        record.addenda = current_addenda
        record.save(update_fields=['addenda'])

        AuditLog.objects.create(
            actor=user,
            actor_name=user.get_full_name() or user.username,
            action='Addendum Appended',
            target_user=f"Patient {patient.patient_code or patient.id}",
            details=f"Appended addendum to {record_type} #{record_id} (Reason: {reason})",
            timestamp=timezone.now()
        )

        return Response({
            'success': True,
            'addenda': record.addenda,
            'message': 'Addendum appended successfully.'
        }, status=status.HTTP_201_CREATED)
