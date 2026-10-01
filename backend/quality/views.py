"""
quality/views.py
────────────────
API endpoints for VisitFeedback and ManagerVisitChecklist.

URL layout (registered in patients/urls.py and staff/urls.py):
  POST   /api/patients/{id}/feedback/             → submit VisitFeedback
  GET    /api/patients/{id}/feedback/             → list feedback for patient
  PATCH  /api/feedback/{id}/manager_sign/         → manager adds their signature

  POST   /api/patients/{id}/manager-checklist/    → submit ManagerVisitChecklist
  GET    /api/patients/{id}/manager-checklist/    → list checklists for patient
  GET    /api/staff/{id}/feedback/                → list feedback received by staff
  GET    /api/staff/{id}/manager-checklist/       → list checklists for staff
"""
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import VisitFeedback, ManagerVisitChecklist
from .serializers import (
    VisitFeedbackListSerializer,
    VisitFeedbackCreateSerializer,
    ManagerSignSerializer,
    ManagerVisitChecklistSerializer,
)


def _get_staff_member(user):
    """Resolve a StaffMember from the JWT user.  Returns (staff, error_response)."""
    from staff.models import StaffMember
    try:
        return StaffMember.objects.get(user=user), None
    except StaffMember.DoesNotExist:
        return None, Response(
            {'error': 'No StaffMember profile linked to this account.'},
            status=status.HTTP_403_FORBIDDEN,
        )


# ── /api/patients/{patient_pk}/feedback/ ──────────────────────────────────────

class PatientFeedbackView(APIView):
    """
    POST — submit a new VisitFeedback for the given patient.
    GET  — list all feedback forms for the given patient.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, patient_pk=None):
        from patients.models import Patient
        try:
            patient = Patient.objects.get(pk=patient_pk)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = VisitFeedback.objects.filter(patient=patient).select_related('staff', 'patient')
        return Response(VisitFeedbackListSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request, patient_pk=None):
        from patients.models import Patient
        try:
            patient = Patient.objects.get(pk=patient_pk)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

        staff_member, err = _get_staff_member(request.user)
        if err:
            return err

        ser = VisitFeedbackCreateSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        feedback = ser.save(patient=patient, submitted_by=staff_member)

        return Response(
            VisitFeedbackListSerializer(feedback, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


# ── /api/feedback/{id}/manager_sign/ ─────────────────────────────────────────

class FeedbackManagerSignView(APIView):
    """
    PATCH — manager adds their quality signature to an existing VisitFeedback.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, pk=None):
        try:
            feedback = VisitFeedback.objects.get(pk=pk)
        except VisitFeedback.DoesNotExist:
            return Response({'error': 'Feedback not found.'}, status=status.HTTP_404_NOT_FOUND)

        staff_member, err = _get_staff_member(request.user)
        if err:
            return err

        ser = ManagerSignSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)

        feedback.manager_quality_signature = ser.validated_data['manager_quality_signature']
        feedback.manager_signed_by = staff_member
        feedback.manager_signed_at = timezone.now()
        feedback.save(update_fields=['manager_quality_signature', 'manager_signed_by', 'manager_signed_at'])

        return Response(
            VisitFeedbackListSerializer(feedback, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )


# ── /api/staff/{staff_pk}/feedback/ ──────────────────────────────────────────

class StaffFeedbackView(APIView):
    """
    GET — list all feedback forms where the given staff member was evaluated.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, staff_pk=None):
        from staff.models import StaffMember
        try:
            staff = StaffMember.objects.get(pk=staff_pk)
        except StaffMember.DoesNotExist:
            return Response({'error': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = VisitFeedback.objects.filter(staff=staff).select_related('patient', 'staff')
        return Response(VisitFeedbackListSerializer(qs, many=True, context={'request': request}).data)


# ── /api/patients/{patient_pk}/manager-checklist/ ────────────────────────────

class PatientManagerChecklistView(APIView):
    """
    POST — submit a new ManagerVisitChecklist.
    GET  — list all checklists for the given patient.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request, patient_pk=None):
        from patients.models import Patient
        try:
            patient = Patient.objects.get(pk=patient_pk)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = ManagerVisitChecklist.objects.filter(patient=patient).select_related('staff', 'manager')
        return Response(ManagerVisitChecklistSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request, patient_pk=None):
        from patients.models import Patient
        try:
            patient = Patient.objects.get(pk=patient_pk)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found.'}, status=status.HTTP_404_NOT_FOUND)

        manager_member, err = _get_staff_member(request.user)
        if err:
            return err

        ser = ManagerVisitChecklistSerializer(data=request.data, context={'request': request})
        ser.is_valid(raise_exception=True)
        checklist = ser.save(patient=patient, manager=manager_member)

        return Response(
            ManagerVisitChecklistSerializer(checklist, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


# ── /api/staff/{staff_pk}/manager-checklist/ ─────────────────────────────────

class StaffManagerChecklistView(APIView):
    """
    GET — list all checklists where the given staff member was evaluated.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, staff_pk=None):
        from staff.models import StaffMember
        try:
            staff = StaffMember.objects.get(pk=staff_pk)
        except StaffMember.DoesNotExist:
            return Response({'error': 'Staff member not found.'}, status=status.HTTP_404_NOT_FOUND)
        qs = ManagerVisitChecklist.objects.filter(staff=staff).select_related('patient', 'manager')
        return Response(ManagerVisitChecklistSerializer(qs, many=True, context={'request': request}).data)
