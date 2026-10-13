from rest_framework import serializers
from .models import Invoice, InvoiceLineItem, BillingPayment


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model  = InvoiceLineItem
        fields = '__all__'


class BillingPaymentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.full_name', read_only=True)
    method_display = serializers.CharField(source='get_method_display', read_only=True)

    class Meta:
        model  = BillingPayment
        fields = '__all__'


class InvoiceListSerializer(serializers.ModelSerializer):
    patient_name    = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mr      = serializers.CharField(source='patient.mr_number', read_only=True)
    status_display  = serializers.CharField(source='get_status_display', read_only=True)
    billing_type_display = serializers.CharField(source='get_billing_type_display', read_only=True)
    balance_due     = serializers.ReadOnlyField()

    class Meta:
        model  = Invoice
        fields = [
            'id', 'invoice_number', 'patient', 'patient_name', 'patient_mr',
            'billing_type', 'billing_type_display', 'status', 'status_display',
            'issued_date', 'due_date', 'total', 'amount_paid', 'balance_due',
        ]


class InvoiceDetailSerializer(serializers.ModelSerializer):
    patient_name    = serializers.CharField(source='patient.full_name', read_only=True)
    patient_mr      = serializers.CharField(source='patient.mr_number', read_only=True)
    patient_address = serializers.CharField(source='patient.address', read_only=True)
    status_display  = serializers.CharField(source='get_status_display', read_only=True)
    billing_type_display = serializers.CharField(source='get_billing_type_display', read_only=True)
    balance_due     = serializers.ReadOnlyField()
    line_items      = InvoiceLineItemSerializer(many=True, read_only=True)
    payments        = BillingPaymentSerializer(source='billing_payments', many=True, read_only=True)

    class Meta:
        model  = Invoice
        fields = '__all__'


class PortalInvoiceLineItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceLineItem
        fields = ['id', 'description', 'quantity', 'unit_price', 'amount']


class PortalInvoiceSerializer(serializers.ModelSerializer):
    """
    Family/Patient Portal Invoice Serializer.
    Returns: id, invoice_number, issue_date, due_date, total, paid_amount, balance,
             status, status_display, items[], pdf_url.
    """
    issue_date     = serializers.DateField(source='issued_date')
    paid_amount    = serializers.DecimalField(source='amount_paid', max_digits=12, decimal_places=2)
    balance        = serializers.DecimalField(source='balance_due', max_digits=12, decimal_places=2)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    items          = PortalInvoiceLineItemSerializer(source='line_items', many=True, read_only=True)
    pdf_url        = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'invoice_number', 'issue_date', 'due_date',
            'total', 'paid_amount', 'balance', 'status', 'status_display',
            'items', 'pdf_url'
        ]

    def get_pdf_url(self, obj):
        request = self.context.get('request')
        url = f"/api/billing/invoices/{obj.id}/pdf/"
        if request:
            return request.build_absolute_uri(url)
        return url
