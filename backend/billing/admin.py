from django.contrib import admin
from .models import Invoice, InvoiceLineItem, BillingPayment


class InvoiceLineItemInline(admin.TabularInline):
    model = InvoiceLineItem
    extra = 1
    fields = ['description', 'quantity', 'unit_price', 'amount']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ['invoice_number', 'patient', 'billing_type', 'status', 'issued_date', 'due_date', 'total', 'amount_paid', 'balance_due']
    list_filter = ['status', 'billing_type', 'issued_date']
    search_fields = ['invoice_number', 'patient__first_name', 'patient__last_name', 'patient__mr_number']
    inlines = [InvoiceLineItemInline]


@admin.register(InvoiceLineItem)
class InvoiceLineItemAdmin(admin.ModelAdmin):
    list_display = ['id', 'invoice', 'description', 'quantity', 'unit_price', 'amount']
    search_fields = ['description', 'invoice__invoice_number']
    list_editable = ['description', 'quantity', 'unit_price']


@admin.register(BillingPayment)
class BillingPaymentAdmin(admin.ModelAdmin):
    list_display = ['id', 'invoice', 'patient', 'amount', 'method', 'received_at', 'reference']
    list_filter = ['method', 'received_at']
