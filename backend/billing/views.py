from django.utils import timezone
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum
from homecareOS.permissions import IsFinancialStaff
from .models import Invoice, BillingPayment, InvoiceLineItem
from .serializers import InvoiceListSerializer, InvoiceDetailSerializer, BillingPaymentSerializer, InvoiceLineItemSerializer


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

    @action(detail=True, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        user = request.user
        # Allow staff or the specific patient family
        if not (user.is_staff or user.is_superuser or hasattr(user, 'staffmember')):
            patient_profile = getattr(user, 'patient_profile', None)
            if not patient_profile or invoice.patient_id != patient_profile.id:
                return Response({'detail': 'Not authorized to view this invoice.'}, status=status.HTTP_403_FORBIDDEN)

        from django.http import HttpResponse
        from io import BytesIO
        from reportlab.lib.pagesizes import letter
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
        story = []
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle('Title', parent=styles['Heading1'], fontSize=20, textColor=colors.HexColor('#0d9488'))
        story.append(Paragraph(f"INVOICE {invoice.invoice_number}", title_style))
        story.append(Spacer(1, 12))

        patient_name = invoice.patient.full_name if invoice.patient else 'N/A'
        data_info = [
            [Paragraph("<b>Patient:</b>", styles['Normal']), Paragraph(patient_name, styles['Normal']),
             Paragraph("<b>Issue Date:</b>", styles['Normal']), Paragraph(str(invoice.issued_date), styles['Normal'])],
            [Paragraph("<b>MR Number:</b>", styles['Normal']), Paragraph(invoice.patient.mr_number if invoice.patient else 'N/A', styles['Normal']),
             Paragraph("<b>Due Date:</b>", styles['Normal']), Paragraph(str(invoice.due_date), styles['Normal'])],
            [Paragraph("<b>Status:</b>", styles['Normal']), Paragraph(invoice.get_status_display(), styles['Normal']),
             Paragraph("<b>Billing Type:</b>", styles['Normal']), Paragraph(invoice.get_billing_type_display(), styles['Normal'])],
        ]
        info_table = Table(data_info, colWidths=[80, 180, 80, 180])
        info_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#f8fafc')),
            ('PADDING', (0,0), (-1,-1), 6),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ]))
        story.append(info_table)
        story.append(Spacer(1, 16))

        items_data = [["Item Description", "Qty", "Unit Price (PKR)", "Total (PKR)"]]
        for item in invoice.line_items.all():
            items_data.append([
                item.description,
                str(item.quantity),
                f"{float(item.unit_price):,.2f}",
                f"{float(item.amount):,.2f}"
            ])
        if len(items_data) == 1:
            items_data.append(["Standard Homecare Consultation / Care Package", "1.0", f"{float(invoice.total):,.2f}", f"{float(invoice.total):,.2f}"])

        items_table = Table(items_data, colWidths=[240, 60, 110, 110])
        items_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f766e')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
            ('PADDING', (0,0), (-1,-1), 6),
        ]))
        story.append(items_table)
        story.append(Spacer(1, 14))

        totals_data = [
            ["Subtotal:", f"PKR {float(invoice.subtotal or invoice.total):,.2f}"],
            ["Discount:", f"-PKR {float(invoice.discount):,.2f}"],
            ["Tax:", f"PKR {float(invoice.tax):,.2f}"],
            ["Total:", f"PKR {float(invoice.total):,.2f}"],
            ["Paid Amount:", f"PKR {float(invoice.amount_paid):,.2f}"],
            ["Balance Due:", f"PKR {float(invoice.balance_due):,.2f}"],
        ]
        totals_table = Table(totals_data, colWidths=[410, 110])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
            ('FONTNAME', (0,-3), (-1,-1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0,-1), (-1,-1), colors.HexColor('#b91c1c') if invoice.balance_due > 0 else colors.HexColor('#15803d')),
            ('PADDING', (0,0), (-1,-1), 4),
        ]))
        story.append(totals_table)

        doc.build(story)
        buffer.seek(0)
        response = HttpResponse(buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'inline; filename="{invoice.invoice_number}.pdf"'
        return response


class BillingPaymentViewSet(viewsets.ModelViewSet):
    queryset           = BillingPayment.objects.select_related('patient', 'invoice').all()
    serializer_class   = BillingPaymentSerializer


class InvoiceLineItemViewSet(viewsets.ModelViewSet):
    permission_classes = [IsFinancialStaff]
    queryset = InvoiceLineItem.objects.select_related('invoice').all()
    serializer_class = InvoiceLineItemSerializer

    def perform_create(self, serializer):
        item = serializer.save()
        invoice = item.invoice
        subtotal = sum(li.amount for li in invoice.line_items.all())
        invoice.subtotal = subtotal
        invoice.save()

    def perform_update(self, serializer):
        item = serializer.save()
        invoice = item.invoice
        subtotal = sum(li.amount for li in invoice.line_items.all())
        invoice.subtotal = subtotal
        invoice.save()

    def perform_destroy(self, instance):
        invoice = instance.invoice
        super().perform_destroy(instance)
        subtotal = sum(li.amount for li in invoice.line_items.all())
        invoice.subtotal = subtotal
        invoice.save()

