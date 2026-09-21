from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum
from homecareOS.permissions import IsFinancialStaff
from .models import Invoice, BillingPayment
from .serializers import InvoiceListSerializer, InvoiceDetailSerializer, BillingPaymentSerializer


class InvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsFinancialStaff]
    queryset = Invoice.objects.select_related('patient', 'booking').prefetch_related('line_items').all()

    def get_serializer_class(self):
        return InvoiceDetailSerializer if self.action != 'list' else InvoiceListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_filter = self.request.query_params.get('status')
        patient_id    = self.request.query_params.get('patient')
        date_from     = self.request.query_params.get('date_from')
        date_to       = self.request.query_params.get('date_to')
        if status_filter:
            qs = qs.filter(status=status_filter)
        if patient_id:
            qs = qs.filter(patient_id=patient_id)
        if date_from:
            qs = qs.filter(issued_date__gte=date_from)
        if date_to:
            qs = qs.filter(issued_date__lte=date_to)
        return qs

    @action(detail=True, methods=['post'])
    def record_payment(self, request, pk=None):
        from decimal import Decimal
        invoice = self.get_object()
        raw_amount = request.data.get('amount', 0)
        try:
            amount = Decimal(str(raw_amount or 0))
        except Exception:
            amount = Decimal('0')

        method  = request.data.get('method', 'cash')
        payment = BillingPayment.objects.create(
            invoice=invoice,
            patient=invoice.patient,
            amount=amount,
            method=method,
            received_at=timezone.now(),
            received_by=request.user if request.user.is_authenticated else None,
            reference=request.data.get('reference', ''),
            notes=request.data.get('notes', ''),
        )
        invoice.amount_paid += payment.amount
        invoice.save()
        return Response(InvoiceDetailSerializer(invoice).data)

    @action(detail=True, methods=['post'])
    def send_invoice(self, request, pk=None):
        """Notify patient/family portal of invoice availability."""
        invoice = self.get_object()
        patient = invoice.patient
        notified = False

        if hasattr(patient, 'portal_user') and patient.portal_user:
            from notifications.views import create_notification
            create_notification(
                recipient_user=patient.portal_user,
                message=f"📄 New Invoice {invoice.invoice_number}: Total PKR {int(invoice.total):,} is ready for review.",
                icon_key='dollar-sign',
                target_screen='Invoices',
                target_params={'invoice_id': invoice.pk},
            )
            notified = True

        return Response({
            'success': True,
            'invoice_number': invoice.invoice_number,
            'recipient': patient.full_name,
            'portal_notified': notified,
            'message': f"Invoice {invoice.invoice_number} sent to {patient.full_name}."
        })

    @action(detail=False, methods=['get'])
    def summary(self, request):
        qs = self.get_queryset()
        return Response({
            'total_invoiced': qs.aggregate(t=Sum('total'))['t'] or 0,
            'total_collected': qs.aggregate(t=Sum('amount_paid'))['t'] or 0,
            'pending_count': qs.filter(status__in=['pending', 'partial', 'overdue']).count(),
            'overdue_count': qs.filter(status='overdue').count(),
        })


class BillingPaymentViewSet(viewsets.ModelViewSet):
    queryset           = BillingPayment.objects.select_related('patient', 'invoice').all()
    serializer_class   = BillingPaymentSerializer
