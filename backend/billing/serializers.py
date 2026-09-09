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
            'id', 'invoice_number', 'patient_name', 'patient_mr',
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
