import os
import re
from decimal import Decimal
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from homecareOS.permissions import is_family_user, IsPatientOrFamilyOwner
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter
from django.contrib.auth.models import User
from patients.models import Patient
from crm.models import Lead, LeadStage
from notifications.views import create_notification
from .models import Booking, ServiceCatalogItem
from .serializers import (
    BookingListSerializer,
    BookingDetailSerializer,
    ServiceCatalogItemSerializer,
    PublicServiceCatalogItemSerializer,
)
from .filters import BookingFilter


def is_valid_file_signature(file_obj):
    """
    Validates uploaded file content using magic byte signatures:
    - JPEG: \\xff\\xd8\\xff
    - PNG:  \\x89PNG\\r\\n\\x1a\\n
    - PDF:  %PDF-
    - WEBP: RIFF + 4 bytes + WEBP
    """
    try:
        pos = file_obj.tell() if hasattr(file_obj, 'tell') else 0
        file_obj.seek(0)
        header = file_obj.read(16)
        file_obj.seek(pos)
    except Exception:
        return False

    if not header or len(header) < 4:
        return False

    if header.startswith(b'\xff\xd8\xff'):
        return True
    if header.startswith(b'\x89PNG\r\n\x1a\n'):
        return True
    if header.startswith(b'%PDF-'):
        return True
    if len(header) >= 12 and header.startswith(b'RIFF') and header[8:12] == b'WEBP':
        return True

    return False


class PublicBookingRateThrottle(AnonRateThrottle):
    """
    Limits public booking submissions per IP.
    Defaults to 10/hour, configurable via PUBLIC_BOOKING_THROTTLE_RATE env var.
    Applies to both web and mobile intake endpoints.
    """
    scope = 'public_booking'

    def get_rate(self):
        env_rate = os.environ.get('PUBLIC_BOOKING_THROTTLE_RATE') or getattr(settings, 'PUBLIC_BOOKING_THROTTLE_RATE', '10/hour')
        return (env_rate or '10/hour').strip()


class PublicCatalogRateThrottle(AnonRateThrottle):
    """
    Limits public service catalogue reads per IP.
    """
    scope = 'public_catalog'

    def get_rate(self):
        env_rate = os.environ.get('PUBLIC_CATALOG_THROTTLE_RATE') or getattr(settings, 'PUBLIC_CATALOG_THROTTLE_RATE', '60/minute')
        return (env_rate or '60/minute').strip()


def compute_catalog_price(service_type, requested_item='', service_mode='', provider_level='', shift_role='', rental_period='', shift_duration=''):
    """
    Computes estimated_price server-side from ServiceCatalogItem.
    Returns Decimal or None. Client-sent prices are never used.
    Unknown or ambiguous unresolvable names return None (never guess).
    """
    item = None

    # If requested_item is provided, resolve via ServiceCatalogItem.resolve_alias
    if requested_item and str(requested_item).strip():
        clean_req = str(requested_item).strip()
        item = ServiceCatalogItem.resolve_alias(clean_req, service_type=service_type)
        if not item:
            # Explicit requested item could not be resolved -> never guess!
            return None
        return item.price_min

    # If requested_item was NOT provided, attempt unambiguous category-based resolution
    st = (service_type or '').strip().lower()

    # Doctors resolution
    if st in ('doctors', 'doctor_consultation'):
        target_name = None
        if service_mode == 'online':
            target_name = 'Online Specialist' if provider_level == 'specialist' else ('Online Medical Officer' if provider_level == 'medical_officer' else None)
        elif service_mode == 'home':
            target_name = 'Home visit Specialist' if provider_level == 'specialist' else ('Home visit Medical Officer' if provider_level == 'medical_officer' else None)
        if target_name:
            item = ServiceCatalogItem.objects.filter(is_active=True, category='doctors', name__iexact=target_name).first()

    # Nursing Long Term resolution
    elif st in ('long_term', 'nursing_long_term'):
        shift_prefix = '8h' if '8' in str(shift_duration) else ('12h' if '12' in str(shift_duration) else ('24h' if '24' in str(shift_duration) else ''))
        role_kw = 'RN' if shift_role == 'rn' else ('Assistant' if shift_role == 'assistant' else ('Attendant' if shift_role == 'attendant' else ''))
        if shift_prefix == '8h' and role_kw == 'Attendant':
            return None  # 8h attendant is n.a.
        if shift_prefix == '24h' and role_kw == 'RN':
            return None  # 24h RN is no longer offered
        pkg_prefix = 'Per shift' if (rental_period == 'per_shift' or service_mode == 'per_shift') else 'Per month'
        if shift_prefix and role_kw:
            item = ServiceCatalogItem.objects.filter(
                is_active=True,
                category='long_term',
                name__startswith=pkg_prefix,
                name__icontains=shift_prefix,
            ).filter(name__icontains=role_kw).first()

    # Nutrition resolution
    elif st in ('nutrition', 'dietician'):
        if service_mode == 'online':
            item = ServiceCatalogItem.objects.filter(is_active=True, category='nutrition', name__iexact='online').first()
        elif service_mode == 'home':
            item = ServiceCatalogItem.objects.filter(is_active=True, category='nutrition', name__iexact='home').first()

    # Psychology resolution
    elif st in ('psychology', 'psychotherapy'):
        if service_mode == 'online':
            item = ServiceCatalogItem.objects.filter(is_active=True, category='psychology', name__iexact='online').first()
        elif service_mode == 'home':
            item = ServiceCatalogItem.objects.filter(is_active=True, category='psychology', name__iexact='in-person or home').first()

    # Baby Sitter resolution
    elif st in ('baby_sitter',):
        if '12' in str(shift_duration):
            item = ServiceCatalogItem.objects.filter(is_active=True, category='baby_sitter', name__iexact='12h').first()
        elif '24' in str(shift_duration):
            item = ServiceCatalogItem.objects.filter(is_active=True, category='baby_sitter', name__iexact='24h').first()

    if item and item.price_min is not None:
        return item.price_min

    return None


class ServiceCatalogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Service Catalogue endpoints:
    - GET /api/services/catalog/ (authenticated)
    - GET /api/services/catalog/public/ (AllowAny, throttled, no internal fields)
    """
    permission_classes = [IsAuthenticated]
    queryset = ServiceCatalogItem.objects.filter(is_active=True)
    serializer_class = ServiceCatalogItemSerializer

    def get_permissions(self):
        if self.action == 'public':
            return [AllowAny()]
        return super().get_permissions()

    def get_throttles(self):
        if self.action == 'public':
            return [PublicCatalogRateThrottle()]
        return super().get_throttles()

    def get_queryset(self):
        qs = ServiceCatalogItem.objects.filter(is_active=True)
        cat = self.request.query_params.get('category')
        if cat:
            qs = qs.filter(category=cat)
        return qs

    @action(
        detail=False,
        methods=['get'],
        permission_classes=[AllowAny],
        throttle_classes=[PublicCatalogRateThrottle],
        url_path='public'
    )
    def public(self, request):
        qs = self.get_queryset()
        serializer = PublicServiceCatalogItemSerializer(qs, many=True)
        return Response(serializer.data)



class BookingViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsPatientOrFamilyOwner]
    queryset = Booking.objects.select_related('patient', 'assigned_staff').all()
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_class = BookingFilter
    search_fields = ['patient__first_name', 'patient__last_name', 'patient__mr_number']
    ordering_fields = ['scheduled_time', 'created_at', 'status', 'amount']
    ordering = ['-scheduled_time']

    def get_queryset(self):
        qs = Booking.objects.select_related('patient', 'assigned_staff').all()
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
                target = Booking.objects.filter(**{self.lookup_field: lookup_val}).first()
                if target and (not target.patient or target.patient.portal_user_id != user.id):
                    from rest_framework.exceptions import PermissionDenied
                    raise PermissionDenied("You do not have permission to access this booking.")
        return super().get_object()

    def get_serializer_class(self):
        if self.action in ['list']:
            return BookingListSerializer
        return BookingDetailSerializer

    def get_permissions(self):
        if self.action in ['public_booking']:
            return [AllowAny()]
        return super().get_permissions()

    def get_throttles(self):
        if self.action in ['public_booking']:
            return [PublicBookingRateThrottle()]
        return super().get_throttles()

    @action(detail=False, methods=['get'])
    def today(self, request):
        """Return all bookings, deliveries, pickups, and lab collections scheduled for today."""
        today = timezone.now().date()
        qs = self.get_queryset().filter(scheduled_time__date=today)
        staff_id = request.query_params.get('staff_id') or request.query_params.get('staff')
        
        target_staff_id = None
        if staff_id:
            try:
                target_staff_id = int(staff_id)
                qs = qs.filter(assigned_staff_id=target_staff_id)
            except ValueError:
                pass
        elif hasattr(request.user, 'staffmember'):
            target_staff_id = request.user.staffmember.id
            qs = qs.filter(assigned_staff_id=target_staff_id)

        items = list(BookingListSerializer(qs, many=True).data)

        # Include Short Services (Medicine Delivery, Equipment Rental Delivery/Pickup, Lab Sample Collection)
        from pharmacy.models import MedicineOrder
        from equipment.models import EquipmentRental
        from lab.models import LabOrder
        from django.db.models import Q

        # 1. Medicine Deliveries
        med_qs = MedicineOrder.objects.filter(status__in=['confirmed', 'out_for_delivery'])
        if is_family_user(request.user):
            med_qs = med_qs.filter(patient__portal_user=request.user)
        elif target_staff_id:
            med_qs = med_qs.filter(delivery_staff_id=target_staff_id)
        for order in med_qs:
            items.append({
                'id': f"pharmacy-{order.id}",
                'order_id': order.id,
                'reference_code': f"MED-{order.id:04d}",
                'patient': order.patient.full_name,
                'patient_name': order.patient.full_name,
                'patient_mr': order.patient.mr_number,
                'patient_phone': str(order.patient.phone or ''),
                'service': 'Medicine Delivery',
                'service_type': 'medicine_delivery',
                'service_type_display': 'Medicine Delivery',
                'service_category': 'pharmacy',
                'status': order.status,
                'status_display': order.get_status_display(),
                'scheduled_time': order.created_at.isoformat(),
                'time': f"Today · {order.created_at:%H:%M}",
                'address': order.delivery_address,
                'latitude': float(order.delivery_latitude) if order.delivery_latitude else float(order.patient.latitude or 0),
                'longitude': float(order.delivery_longitude) if order.delivery_longitude else float(order.patient.longitude or 0),
                'staff_name': order.delivery_staff.full_name if order.delivery_staff else '',
                'amount': float(order.total_amount),
                'notes': f"Items: {order.items.count()} medications. Address: {order.delivery_address}",
            })

        # 2. Equipment Deliveries & Pickups
        eq_qs = EquipmentRental.objects.filter(status__in=['requested', 'active', 'pickup_pending'])
        if is_family_user(request.user):
            eq_qs = eq_qs.filter(patient__portal_user=request.user)
        elif target_staff_id:
            eq_qs = eq_qs.filter(Q(delivery_staff_id=target_staff_id) | Q(pickup_staff_id=target_staff_id))
        for rental in eq_qs:
            is_pickup = rental.status in ('active', 'pickup_pending')
            items.append({
                'id': f"equipment-{rental.id}",
                'order_id': rental.id,
                'reference_code': f"EQ-{'RET' if is_pickup else 'DEL'}-{rental.id:04d}",
                'patient': rental.patient.full_name,
                'patient_name': rental.patient.full_name,
                'patient_mr': rental.patient.mr_number,
                'patient_phone': str(rental.patient.phone or ''),
                'service': f"Equipment {'Pickup' if is_pickup else 'Delivery'}: {rental.equipment.name}",
                'service_type': 'equipment_pickup' if is_pickup else 'equipment_delivery',
                'service_type_display': f"Equipment {'Pickup' if is_pickup else 'Delivery'}",
                'service_category': 'equipment',
                'status': rental.status,
                'status_display': rental.get_status_display(),
                'scheduled_time': rental.rental_end.isoformat() if is_pickup else rental.rental_start.isoformat(),
                'time': f"Today · {'Return Collection' if is_pickup else 'Deployment'}",
                'address': rental.delivery_address or str(rental.patient.address or ''),
                'latitude': float(rental.delivery_latitude or rental.patient.latitude or 0),
                'longitude': float(rental.delivery_longitude or rental.patient.longitude or 0),
                'staff_name': (rental.pickup_staff.full_name if is_pickup and rental.pickup_staff else (rental.delivery_staff.full_name if rental.delivery_staff else '')),
                'amount': float(rental.total_rental_fee),
                'notes': f"{rental.equipment.name} (Deposit: PKR {rental.deposit_amount})",
            })

        # 3. Lab Collections
        lab_qs = LabOrder.objects.filter(status__in=['collector_assigned', 'sample_collected'])
        if is_family_user(request.user):
            lab_qs = lab_qs.filter(patient__portal_user=request.user)
        elif target_staff_id:
            lab_qs = lab_qs.filter(collection_staff_id=target_staff_id)
        for lab in lab_qs:
            items.append({
                'id': f"lab-{lab.id}",
                'order_id': lab.id,
                'reference_code': f"LAB-{lab.id:04d}",
                'patient': lab.patient.full_name,
                'patient_name': lab.patient.full_name,
                'patient_mr': lab.patient.mr_number,
                'patient_phone': str(lab.patient.phone or ''),
                'service': f"Lab Sample Collection: {lab.tests_summary or 'Diagnostic Panel'}",
                'service_type': 'lab_collection',
                'service_type_display': 'Lab Sample Collection',
                'service_category': 'lab',
                'status': lab.status,
                'status_display': lab.get_status_display(),
                'scheduled_time': lab.scheduled_collection_time.isoformat(),
                'time': f"Today · {lab.scheduled_collection_time:%H:%M}",
                'address': lab.collection_address or str(lab.patient.address or ''),
                'latitude': float(lab.collection_latitude or lab.patient.latitude or 0),
                'longitude': float(lab.collection_longitude or lab.patient.longitude or 0),
                'staff_name': lab.collection_staff.full_name if lab.collection_staff else '',
                'amount': float(lab.total_price),
                'notes': f"{'Fasting required. ' if lab.fasting_required else ''}Tests: {lab.tests_summary}",
            })

        return Response(items)

    @action(detail=False, methods=['get'])
    def active(self, request):
        """Return bookings currently in progress."""
        qs = self.get_queryset().filter(status__in=['en_route', 'in_progress'])
        serializer = BookingListSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def assign_staff(self, request, pk=None):
        """Assign or reassign a primary and backup staff member to this booking."""
        booking = self.get_object()
        staff_id = request.data.get('staff_id')
        if not staff_id:
            return Response({'error': 'staff_id required'}, status=status.HTTP_400_BAD_REQUEST)
        from staff.models import StaffMember
        try:
            staff = StaffMember.objects.get(pk=staff_id)
        except StaffMember.DoesNotExist:
            return Response({'error': 'Primary staff not found'}, status=status.HTTP_404_NOT_FOUND)
        
        booking.assigned_staff = staff
        booking.status = request.data.get('status', 'assigned')
        booking.assigned_on = timezone.now()

        # Optional backup staff member
        backup_staff_id = request.data.get('backup_staff_id')
        if backup_staff_id:
            try:
                booking.backup_staff = StaffMember.objects.get(pk=backup_staff_id)
            except StaffMember.DoesNotExist:
                booking.backup_staff = None
        else:
            booking.backup_staff = None
        
        if request.data.get('care_manager_name'):
            booking.care_manager_name = request.data.get('care_manager_name')
        if request.data.get('clinical_requirements'):
            booking.clinical_requirements = request.data.get('clinical_requirements')
        if request.data.get('instructions'):
            booking.notes = request.data.get('instructions')
        if 'recurring_days' in request.data:
            booking.recurring_days = request.data.get('recurring_days') or []
        if 'recurrence_end_date' in request.data:
            booking.recurrence_end_date = request.data.get('recurrence_end_date') or None

        booking.save()

        # Generate recurring bookings if recurrence specified
        from .services import generate_recurring_bookings
        should_recur = request.data.get('generate_recurring', True)
        if should_recur and (booking.recurring_days or booking.shift_frequency != 'once'):
            generate_recurring_bookings(
                booking,
                recurring_days=booking.recurring_days,
                end_date=booking.recurrence_end_date,
                occurrences=request.data.get('occurrences', 30)
            )

        # Fire a notification to the assigned nurse/doctor's linked auth.User
        if staff.user:
            from notifications.views import create_notification
            create_notification(
                recipient_user=staff.user,
                message=(
                    f'📋 New booking assigned ({booking.reference_code or f"#{booking.pk}"}): {booking.patient.full_name} — '
                    f'{booking.get_service_type_display()} ({booking.get_shift_duration_display()}) on '
                    f'{booking.scheduled_time.strftime("%d %b %Y at %H:%M")}'
                ),
                icon_key='calendar',
                target_screen='Schedule',
                target_params={'booking_id': booking.pk},
            )

        if booking.backup_staff and booking.backup_staff.user:
            from notifications.views import create_notification
            create_notification(
                recipient_user=booking.backup_staff.user,
                message=(
                    f'🛡️ Clinical Backup Assigned ({booking.reference_code or f"#{booking.pk}"}): {booking.patient.full_name} — '
                    f'{booking.get_service_type_display()} on '
                    f'{booking.scheduled_time.strftime("%d %b %Y at %H:%M")}'
                ),
                icon_key='shield',
                target_screen='Schedule',
                target_params={'booking_id': booking.pk},
            )

        return Response(BookingDetailSerializer(booking).data)

    @action(detail=True, methods=['post'])
    def generate_recurring(self, request, pk=None):
        """Explicitly generate recurring visit bookings for a booking."""
        booking = self.get_object()
        from .services import generate_recurring_bookings
        recurring_days = request.data.get('recurring_days', booking.recurring_days)
        end_date = request.data.get('end_date', booking.recurrence_end_date)
        occurrences = request.data.get('occurrences', 30)

        if recurring_days:
            booking.recurring_days = recurring_days
        if end_date:
            booking.recurrence_end_date = end_date
        booking.save(update_fields=['recurring_days', 'recurrence_end_date'])

        created = generate_recurring_bookings(
            booking,
            recurring_days=recurring_days,
            end_date=end_date,
            occurrences=occurrences
        )
        return Response({
            'success': True,
            'parent_booking_id': booking.pk,
            'generated_count': len(created),
            'bookings': BookingListSerializer(created, many=True).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def generate_invoice(self, request, pk=None):
        """Generate a formal billing invoice for this booking."""
        booking = self.get_object()
        from billing.services import generate_invoice_for_booking
        from billing.serializers import InvoiceDetailSerializer
        invoice = generate_invoice_for_booking(booking)
        return Response(InvoiceDetailSerializer(invoice).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Dashboard stat card data."""
        today = timezone.now().date()
        qs = Booking.objects.all()
        return Response({
            'active_visits': qs.filter(status='in_progress').count(),
            'today_bookings': qs.filter(scheduled_time__date=today).count(),
            'pending_assignments': qs.filter(status='pending').count(),
            'today_revenue': sum(
                b.amount_paid for b in qs.filter(
                    scheduled_time__date=today, status='completed'
                )
            ),
        })

    @action(
        detail=False,
        methods=['post'],
        permission_classes=[AllowAny],
        throttle_classes=[PublicBookingRateThrottle],
        parser_classes=[MultiPartParser, FormParser, JSONParser],
        url_path='public'
    )
    def public_booking(self, request):
        """
        Public self-service booking intake endpoint for mobile app and client website.
        Unauthenticated: executes inside a single transaction.atomic() block:
          1. Checks hidden honeypot field — silently returns fake success if triggered
          2. Validates source ('public_website' or 'public_mobile_app', default 'public_mobile_app')
          3. Validates shared X-Public-Key header if PUBLIC_BOOKING_API_KEY is configured
          4. Validates uploaded prescription files (images and PDF only, max 5 MB)
          5. Creates Patient with the validated source
          6. Creates Booking with status='pending', payment_status='pending'
          7. Creates CRM Lead (stage='new_lead') with corresponding source
          8. Creates in-app Notification for super_admin, admin, and crm_executive users
          9. Returns { booking_reference, patient_mr_number, status, patient_id, booking_id }
        """
        data = request.data

        # ── 0. Anti-Bot Honeypot Field ───────────────────────────────────────
        honeypot = (data.get('honeypot') or data.get('hp_field') or data.get('website_url') or '').strip()
        if honeypot:
            return Response(
                {
                    "booking_reference": "BK-2026-0000",
                    "patient_mr_number": "MR-2026-0000",
                    "status": "pending",
                    "patient_id": 0,
                    "booking_id": 0,
                    "message": "Booking request received successfully."
                },
                status=status.HTTP_201_CREATED
            )

        # ── 1. Resolve and Validate Source ───────────────────────────────────
        raw_source = data.get('source')
        if raw_source:
            source = str(raw_source).strip().lower()
            if source not in [Patient.Source.PUBLIC_WEBSITE, Patient.Source.PUBLIC_MOBILE_APP]:
                return Response(
                    {'error': f'Invalid source "{raw_source}". Allowed values: public_website, public_mobile_app.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        else:
            source = Patient.Source.PUBLIC_MOBILE_APP

        # ── 2. Shared API Key Check (source-specific) ────────────────────────
        if source == Patient.Source.PUBLIC_WEBSITE:
            expected_key = os.environ.get('PUBLIC_BOOKING_API_KEY') or getattr(settings, 'PUBLIC_BOOKING_API_KEY', '')
        elif source == Patient.Source.PUBLIC_MOBILE_APP:
            expected_key = os.environ.get('MOBILE_PUBLIC_API_KEY') or getattr(settings, 'MOBILE_PUBLIC_API_KEY', '')
        else:
            expected_key = ''

        if expected_key and expected_key.strip():
            client_key = request.headers.get('X-Public-Key') or request.META.get('HTTP_X_PUBLIC_KEY', '')
            if not client_key or client_key.strip() != expected_key.strip():
                return Response(
                    {'error': 'Forbidden: Invalid or missing API key in X-Public-Key header.'},
                    status=status.HTTP_403_FORBIDDEN
                )

        # ── 3. Validate File Uploads (Images and PDF only, max 5 MB) ─────────
        prescription_file = request.FILES.get('prescription_file') or request.FILES.get('prescription_attachment')
        if prescription_file:
            # 5 MB = 5 * 1024 * 1024 bytes
            if prescription_file.size > 5 * 1024 * 1024:
                return Response(
                    {'error': 'Uploaded file exceeds the maximum allowed size of 5 MB.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            name_lower = prescription_file.name.lower()
            allowed_extensions = ('.pdf', '.jpg', '.jpeg', '.png', '.webp')
            if not name_lower.endswith(allowed_extensions):
                return Response(
                    {'error': 'Invalid file format. Uploads are strictly limited to images (JPG, PNG, WEBP) and PDF files.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            if not is_valid_file_signature(prescription_file):
                return Response(
                    {'error': 'Invalid file content. File header does not match a valid JPEG, PNG, WEBP, or PDF signature.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        # ── 4. Validate Core Inputs ──────────────────────────────────────────
        raw_name = (data.get('patient_name') or data.get('name') or '').strip()
        first_name = (data.get('first_name') or '').strip()
        last_name = (data.get('last_name') or '').strip()

        if not first_name and raw_name:
            parts = raw_name.split(None, 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else '.'
        elif not first_name:
            first_name = 'Unknown'
            last_name = last_name or '.'

        phone = (data.get('phone') or data.get('patient_phone') or '').strip()
        if not phone:
            return Response(
                {'error': 'Patient contact phone number is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        with transaction.atomic():
            # ── 5. Resolve Demographics ──────────────────────────────────────
            dob_str = data.get('date_of_birth') or data.get('patient_dob')
            raw_age = data.get('patient_age') or data.get('age')
            current_year = timezone.now().year

            if dob_str:
                patient_dob = dob_str
                try:
                    birth_year = int(str(dob_str).split('-')[0])
                    patient_age = max(0, current_year - birth_year)
                except (ValueError, IndexError):
                    patient_age = int(raw_age) if raw_age else 60
            elif raw_age:
                try:
                    patient_age = int(raw_age)
                    patient_dob = f"{current_year - patient_age}-01-01"
                except ValueError:
                    patient_age = 60
                    patient_dob = f"{current_year - 60}-01-01"
            else:
                patient_age = 60
                patient_dob = f"{current_year - 60}-01-01"

            gender = (data.get('gender') or 'M').upper()
            if gender not in ['M', 'F', 'O']:
                gender = 'M'

            address = (data.get('address') or 'Islamabad, Pakistan').strip()

            location_link = (data.get('location_link') or data.get('google_maps_link') or '').strip()
            raw_lat = data.get('latitude') or data.get('lat')
            raw_lng = data.get('longitude') or data.get('lng')

            if location_link and (raw_lat is None or raw_lng is None):
                try:
                    from homecareOS.location_resolver import resolve_location_link
                    resolved = resolve_location_link(location_link)
                    lat = resolved['latitude']
                    lng = resolved['longitude']
                except Exception:
                    lat, lng = 33.5700, 73.1500
            else:
                try:
                    lat = float(raw_lat) if raw_lat is not None else 33.5700
                except (ValueError, TypeError):
                    lat = 33.5700

                try:
                    lng = float(raw_lng) if raw_lng is not None else 73.1500
                except (ValueError, TypeError):
                    lng = 73.1500

            ec_name = (data.get('emergency_contact_name') or 'Family').strip()
            ec_phone = (data.get('emergency_contact_phone') or phone).strip()
            diagnosis = (data.get('diagnosis') or data.get('primary_diagnosis') or 'General Home Health Care').strip()
            allergies = (data.get('allergies') or 'NKDA').strip()
            blood_type = (data.get('blood_type') or 'O+').strip()
            email = (data.get('email') or '').strip()

            # Generate unique MR number: MR-YYYY-XXXX
            count = Patient.objects.count() + 1
            candidate_mr = f"MR-{current_year}-{count:04d}"
            while Patient.objects.filter(mr_number=candidate_mr).exists():
                count += 1
                candidate_mr = f"MR-{current_year}-{count:04d}"

            # ── 6. Create Patient Record (source dynamically set) ────────────
            patient = Patient.objects.create(
                mr_number=candidate_mr,
                first_name=first_name,
                last_name=last_name,
                date_of_birth=patient_dob,
                gender=gender,
                phone=phone,
                address=address,
                latitude=lat,
                longitude=lng,
                primary_diagnosis=diagnosis,
                allergies=allergies,
                blood_type=blood_type,
                emergency_contact_name=ec_name,
                emergency_contact_phone=ec_phone,
                emergency_contact_relation=data.get('emergency_contact_relation') or 'Emergency Contact',
                source=source,
                is_active=True,
            )

            # ── 7. Resolve Booking Scheduling & Options ──────────────────────
            raw_service = data.get('service_type') or data.get('service_id')
            valid_services = [c[0] for c in Booking.service_type.field.choices]
            if raw_service:
                if raw_service not in valid_services:
                    return Response(
                        {'error': f'Invalid service_type "{raw_service}".'},
                        status=status.HTTP_400_BAD_REQUEST
                    )
                service_type = raw_service
            else:
                service_type = 'short_service'

            # Parse requested_item from payload or notes ("Requested service: <name>")
            notes = (data.get('notes') or '').strip()
            requested_item = (data.get('requested_item') or '').strip()
            if not requested_item and notes:
                match = re.search(r'Requested service:\s*([^\r\n;]+)', notes, re.IGNORECASE)
                if match:
                    requested_item = match.group(1).strip()

            raw_mode = (data.get('service_mode') or '').strip().lower()
            valid_modes = [c[0] for c in Booking.service_mode.field.choices]
            service_mode = raw_mode if raw_mode in valid_modes else ''

            raw_level = (data.get('provider_level') or '').strip().lower()
            valid_levels = [c[0] for c in Booking.provider_level.field.choices]
            provider_level = raw_level if raw_level in valid_levels else ''

            raw_role = (data.get('shift_role') or '').strip().lower()
            valid_roles = [c[0] for c in Booking.shift_role.field.choices]
            shift_role = raw_role if raw_role in valid_roles else ''

            raw_period = (data.get('rental_period') or '').strip().lower()
            valid_periods = [c[0] for c in Booking.rental_period.field.choices]
            rental_period = raw_period if raw_period in valid_periods else ''

            scheduled_time = None
            sched_str = data.get('scheduled_time')
            if sched_str:
                try:
                    from dateutil.parser import parse as parse_date
                    scheduled_time = parse_date(sched_str)
                    if timezone.is_naive(scheduled_time):
                        scheduled_time = timezone.make_aware(scheduled_time)
                except Exception:
                    pass

            if not scheduled_time:
                pref_date = data.get('preferred_date')
                pref_slot = data.get('preferred_slot', 'morning')
                start_time_str = data.get('start_time', '09:00' if pref_slot == 'morning' else '15:00')
                if pref_date:
                    try:
                        from datetime import datetime
                        dt = datetime.strptime(f"{pref_date} {start_time_str}", "%Y-%m-%d %H:%M")
                        scheduled_time = timezone.make_aware(dt)
                    except Exception:
                        scheduled_time = timezone.now() + timezone.timedelta(days=1)
                else:
                    scheduled_time = timezone.now() + timezone.timedelta(days=1)

            shift_duration = data.get('shift_duration') or '4_hours'
            valid_durations = [c[0] for c in Booking.shift_duration.field.choices]
            if shift_duration not in valid_durations:
                shift_duration = '4_hours'

            shift_frequency = data.get('shift_frequency') or 'once'
            valid_frequencies = [c[0] for c in Booking.shift_frequency.field.choices]
            if shift_frequency not in valid_frequencies:
                shift_frequency = 'once'

            payment_method = data.get('payment_method') or 'cash_on_delivery'

            # Server-side pricing: NEVER trust client price!
            estimated_price = compute_catalog_price(
                service_type=service_type,
                requested_item=requested_item,
                service_mode=service_mode,
                provider_level=provider_level,
                shift_role=shift_role,
                rental_period=rental_period,
                shift_duration=shift_duration,
            )
            amount = estimated_price if estimated_price is not None else Decimal('0.00')

            # Prescription handling: if true but no file sent, don't fail, save has_prescription=True
            raw_has_rx = data.get('has_prescription')
            if isinstance(raw_has_rx, str):
                has_prescription = raw_has_rx.lower() in ('true', '1', 'yes')
            else:
                has_prescription = bool(raw_has_rx)

            raw_consult = data.get('consult_doctor_needed')
            if isinstance(raw_consult, str):
                consult_doctor_needed = raw_consult.lower() in ('true', '1', 'yes')
            else:
                consult_doctor_needed = bool(raw_consult)

            # ── 8. Create Booking Record (status='pending', payment_status='pending')
            booking = Booking(
                patient=patient,
                service_type=service_type,
                requested_item=requested_item,
                service_mode=service_mode,
                provider_level=provider_level,
                shift_role=shift_role,
                rental_period=rental_period,
                estimated_price=estimated_price,
                status='pending',
                payment_status='pending',
                payment_method=payment_method,
                scheduled_time=scheduled_time,
                shift_duration=shift_duration,
                shift_frequency=shift_frequency,
                address=address,
                latitude=lat,
                longitude=lng,
                patient_dob=patient.date_of_birth,
                patient_age=patient_age,
                emergency_contact_name=ec_name,
                emergency_contact_phone=ec_phone,
                email=email,
                diagnosis=diagnosis,
                allergies=allergies,
                has_prescription=has_prescription,
                consult_doctor_needed=consult_doctor_needed,
                gender_preference=data.get('gender_preference') or 'any',
                consultant_name=data.get('consultant_name') or '',
                consultant_details=data.get('consultant_details') or '',
                notes=notes,
                amount=amount,
                amount_paid=Decimal('0.00'),
                care_manager_name='Hina Malik (Care Coordinator)',
            )
            if prescription_file:
                booking.prescription_attachment = prescription_file
            booking.save()

            if not booking.reference_code:
                booking.refresh_from_db(fields=['reference_code'])

            # ── 9. Create CRM Lead (stage='new_lead') ────────────────────────
            source_title = 'Public Website' if source == Patient.Source.PUBLIC_WEBSITE else 'Public Mobile App'
            Lead.objects.create(
                name=f"{patient.first_name} {patient.last_name}".strip(),
                phone=patient.phone,
                email=email,
                source=source,
                stage=LeadStage.NEW_LEAD,
                notes=f"Received via {source_title}. Ref: {booking.reference_code}. Notes: {booking.notes}".strip(),
                service_needed=booking.requested_item or booking.get_service_type_display(),
                requested_item=booking.requested_item,
                service_mode=booking.service_mode,
                estimated_price=booking.estimated_price,
                converted_patient=patient,
                converted_booking=booking,
            )

            # ── 10. Create Notification for admin, super_admin, crm_executive 
            target_users = set(User.objects.filter(is_superuser=True))
            target_users.update(User.objects.filter(is_staff=True))
            target_users.update(User.objects.filter(profile__role__in=['super_admin', 'admin', 'crm_executive']))
            target_users.update(User.objects.filter(staffmember__role__in=['super_admin', 'admin', 'crm_executive']))

            extra_info = []
            if booking.requested_item:
                extra_info.append(f"Item: {booking.requested_item}")
            if booking.service_mode:
                extra_info.append(f"Mode: {booking.service_mode}")
            if booking.estimated_price is not None:
                extra_info.append(f"Est: PKR {int(booking.estimated_price):,}")

            extra_str = f" [{', '.join(extra_info)}]" if extra_info else ""

            notification_msg = (
                f"New Public Booking Received: {patient.first_name} {patient.last_name} "
                f"for {booking.get_service_type_display()}{extra_str} "
                f"(Ref: {booking.reference_code}, Source: {source_title})"
            )
            for u in target_users:
                create_notification(
                    recipient_user=u,
                    message=notification_msg,
                    icon_key='calendar',
                    target_screen='bookings',
                    target_params={
                        'booking_id': booking.id,
                        'reference_code': booking.reference_code,
                        'requested_item': booking.requested_item,
                        'service_mode': booking.service_mode,
                        'estimated_price': str(booking.estimated_price) if booking.estimated_price is not None else None,
                    }
                )

        # ── 11. Return Confirmation Response ─────────────────────────────────
        return Response({
            "booking_reference": booking.reference_code,
            "patient_mr_number": patient.mr_number,
            "status": booking.status,
            "patient_id": patient.id,
            "booking_id": booking.id,
        }, status=status.HTTP_201_CREATED)
