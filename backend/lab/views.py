import json
from django.utils import timezone
from django.db import transaction
from django.db.models import Q
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser

from .models import LabTest, LabOrder, LabReport, LabOrderStatus
from .serializers import (
    LabTestSerializer,
    LabOrderListSerializer,
    LabOrderDetailSerializer,
    LabReportSerializer,
)
from patients.models import Patient, LabResult
from staff.models import StaffMember
from notifications.models import Notification


class LabTestViewSet(viewsets.ModelViewSet):
    """
    Searchable Lab Test Catalog
    GET  /api/lab/tests/
    POST /api/lab/tests/
    """
    queryset = LabTest.objects.filter(is_active=True)
    serializer_class = LabTestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = LabTest.objects.filter(is_active=True)
        search = self.request.query_params.get('search', '').strip()
        sample_type = self.request.query_params.get('sample_type', '').strip()

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(description__icontains=search))
        if sample_type:
            qs = qs.filter(sample_type__iexact=sample_type)
        return qs


class LabOrderViewSet(viewsets.ModelViewSet):
    """
    Lab Orders & Report Delivery Management
    POST  /api/lab/orders/
    GET   /api/lab/orders/
    PATCH /api/lab/orders/{id}/assign-collector/
    POST  /api/lab/orders/{id}/collect-sample/
    POST  /api/lab/orders/{id}/upload-report/
    GET   /api/lab/orders/{id}/report/
    """
    queryset = LabOrder.objects.select_related('patient', 'collection_staff').prefetch_related('tests', 'reports').all()
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return LabOrderListSerializer
        return LabOrderDetailSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        if hasattr(user, 'patient_profile') and user.patient_profile:
            qs = qs.filter(patient=user.patient_profile)
        elif hasattr(user, 'staffmember') and user.staffmember:
            staff = user.staffmember
            # If lab technician or phlebotomist, filter assigned orders
            if staff.role in ('nurse', 'doctor') and getattr(staff, 'specialization', '') == 'Lab Technician':
                qs = qs.filter(collection_staff=staff)

        status_param = self.request.query_params.get('status')
        patient_id = self.request.query_params.get('patient_id')
        if status_param:
            qs = qs.filter(status=status_param)
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """
        POST /api/lab/orders/
        Patient, Family, or Admin requests lab tests.
        Body:
          - patient_id: int
          - test_ids: list of ints [1, 2, ...]
          - scheduled_collection_time: datetime string
          - collection_address: str (optional)
          - fasting_required: bool (optional)
          - notes: str (optional)
        """
        data = request.data
        patient_id = data.get('patient_id')
        if not patient_id:
            if hasattr(request.user, 'patient_profile') and request.user.patient_profile:
                patient_id = request.user.patient_profile.id
            else:
                return Response({'error': 'patient_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            patient = Patient.objects.get(pk=patient_id)
        except Patient.DoesNotExist:
            return Response({'error': 'Patient not found'}, status=status.HTTP_404_NOT_FOUND)

        test_ids = data.get('test_ids', [])
        if isinstance(test_ids, str):
            try:
                test_ids = json.loads(test_ids)
            except Exception:
                test_ids = [int(x.strip()) for x in test_ids.split(',') if x.strip()]

        if not test_ids:
            return Response({'error': 'At least one lab test must be selected'}, status=status.HTTP_400_BAD_REQUEST)

        tests = LabTest.objects.filter(id__in=test_ids)
        if not tests.exists():
            return Response({'error': 'No valid lab tests found'}, status=status.HTTP_400_BAD_REQUEST)

        sched_time = data.get('scheduled_collection_time')
        if not sched_time:
            sched_time = timezone.now() + timezone.timedelta(hours=2)

        order = LabOrder.objects.create(
            patient=patient,
            scheduled_collection_time=sched_time,
            collection_address=data.get('collection_address') or getattr(patient, 'address', ''),
            fasting_required=bool(data.get('fasting_required', False)),
            notes=data.get('notes', ''),
            status=LabOrderStatus.REQUESTED,
        )
        order.tests.set(tests)
        order.calculate_total()

        serializer = LabOrderDetailSerializer(order)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch', 'post'], url_path='assign-collector')
    def assign_collector(self, request, pk=None):
        """
        PATCH /api/lab/orders/{id}/assign-collector/
        Body: {"staff_id": <int>}
        """
        order = self.get_object()
        staff_id = request.data.get('staff_id') or request.data.get('collection_staff')
        if not staff_id:
            return Response({'error': 'staff_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            staff = StaffMember.objects.get(pk=staff_id)
        except StaffMember.DoesNotExist:
            return Response({'error': 'Staff member not found'}, status=status.HTTP_404_NOT_FOUND)

        order.collection_staff = staff
        order.status = LabOrderStatus.COLLECTOR_ASSIGNED
        order.save(update_fields=['collection_staff', 'status', 'updated_at'])

        # Notify collection staff
        if staff.user:
            Notification.objects.create(
                recipient=staff.user,
                icon_key='calendar',
                message=f"Lab sample collection assigned for patient {order.patient.full_name} on {order.scheduled_collection_time:%d %b, %H:%M}.",
                target_screen='TodaySchedule',
                target_params={'order_id': order.id, 'service_type': 'lab_collection'}
            )

        return Response(LabOrderDetailSerializer(order).data)

    @action(detail=True, methods=['post'], url_path='collect-sample')
    def collect_sample(self, request, pk=None):
        """
        POST /api/lab/orders/{id}/collect-sample/
        Staff marks sample as collected, reusing GPS check-in pattern.
        SERVER IMMUTABILITY: collected_at is stamped with timezone.now() directly on server.
        Body:
          - lat: float
          - lng: float
          - notes: str (optional)
        """
        order = self.get_object()
        lat = request.data.get('lat') or request.data.get('latitude')
        lng = request.data.get('lng') or request.data.get('longitude')
        notes = request.data.get('notes', '')

        # Server-enforced immutable timestamp
        now = timezone.now()
        order.collected_at = now
        order.status = LabOrderStatus.SAMPLE_COLLECTED
        if lat is not None:
            order.collection_latitude = lat
        if lng is not None:
            order.collection_longitude = lng
        if notes:
            order.collection_notes = notes

        order.save(update_fields=[
            'collected_at', 'status', 'collection_latitude',
            'collection_longitude', 'collection_notes', 'updated_at'
        ])

        return Response({
            'detail': 'Sample marked as collected with GPS proof and verified server timestamp.',
            'order': LabOrderDetailSerializer(order).data
        })

    @action(detail=True, methods=['post'], url_path='upload-report')
    @transaction.atomic
    def upload_report(self, request, pk=None):
        """
        POST /api/lab/orders/{id}/upload-report/
        Lab technician or admin uploads the result PDF and structured values.
        Body (Multipart):
          - result_file: PDF file
          - result_data: JSON string or object (e.g. {"Hemoglobin": "13.2 g/dL", "Platelets": "240,000 /mcL"})
          - flagged_abnormal: bool (optional)
          - clinical_remarks: str (optional)
        """
        order = self.get_object()
        result_file = request.FILES.get('result_file')
        raw_result_data = request.data.get('result_data', {})
        if isinstance(raw_result_data, str):
            try:
                result_data = json.loads(raw_result_data)
            except Exception:
                result_data = {'raw_output': raw_result_data}
        else:
            result_data = raw_result_data

        flagged_abnormal = str(request.data.get('flagged_abnormal', '')).lower() in ('true', '1', 'yes')
        clinical_remarks = request.data.get('clinical_remarks', '')

        report = LabReport.objects.create(
            lab_order=order,
            result_file=result_file,
            result_data=result_data,
            uploaded_by=request.user if request.user.is_authenticated else None,
            flagged_abnormal=flagged_abnormal,
            clinical_remarks=clinical_remarks
        )

        order.status = LabOrderStatus.REPORT_READY
        order.save(update_fields=['status', 'updated_at'])

        # 1. Sync with patients.models.LabResult so it automatically surfaces in Patient 360 labs tab
        for test in order.tests.all():
            val = str(result_data.get(test.name, result_data.get(test.name.split()[0], 'Complete')))
            LabResult.objects.create(
                patient=order.patient,
                test_name=test.name,
                result_value=val,
                unit='',
                reference_range='',
                is_abnormal=flagged_abnormal,
                collected_at=order.collected_at or order.scheduled_collection_time,
                reported_at=timezone.now(),
                document=result_file
            )

        # 2. Trigger notification to patient/family
        if order.patient.portal_user:
            Notification.objects.create(
                recipient=order.patient.portal_user,
                icon_key='file-text',
                message=f"Your diagnostic lab report for {order.tests_summary} is now ready for review.",
                target_screen='LabReports',
                target_params={'order_id': order.id, 'report_id': report.id}
            )

        # 3. Trigger notification to assigned Care Manager
        if order.patient.assigned_care_manager and order.patient.assigned_care_manager.user:
            Notification.objects.create(
                recipient=order.patient.assigned_care_manager.user,
                icon_key='alert' if flagged_abnormal else 'file-text',
                message=f"Lab report uploaded for patient {order.patient.full_name}: {order.tests_summary}.{' [ABNORMAL VALUE FLAGGED]' if flagged_abnormal else ''}",
                target_screen='Patient360',
                target_params={'patient_id': order.patient.id, 'tab': 'labs'}
            )

        return Response({
            'detail': 'Lab report uploaded successfully and notifications dispatched.',
            'report': LabReportSerializer(report).data,
            'order': LabOrderDetailSerializer(order).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['get'], url_path='report')
    def get_report(self, request, pk=None):
        """
        GET /api/lab/orders/{id}/report/
        Role-gated view: patient/family sees own, staff/doctor/admin sees assigned or all.
        """
        order = self.get_object()
        report = order.reports.first()
        if not report:
            return Response({'error': 'Report not yet available for this order.'}, status=status.HTTP_404_NOT_FOUND)

        return Response(LabReportSerializer(report).data)
