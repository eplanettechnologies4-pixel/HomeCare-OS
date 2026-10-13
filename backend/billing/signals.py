from django.db.models.signals import post_save
from django.dispatch import receiver
from django.db import transaction
from .models import Invoice, InvoiceStatus
from homecareOS.event_broadcaster import broadcast_event


def serialize_invoice_payload(invoice):
    items = []
    try:
        for item in invoice.line_items.all():
            items.append({
                'id': item.id,
                'description': item.description,
                'quantity': float(item.quantity),
                'unit_price': float(item.unit_price),
                'amount': float(item.amount),
            })
    except Exception:
        pass

    patient = getattr(invoice, 'patient', None)
    return {
        'id': invoice.id,
        'invoice_number': invoice.invoice_number,
        'patient_id': invoice.patient_id,
        'patient_name': patient.full_name if patient else '',
        'patient_mr': patient.mr_number if patient else '',
        'billing_type': invoice.billing_type,
        'billing_type_display': invoice.get_billing_type_display(),
        'status': invoice.status,
        'status_display': invoice.get_status_display(),
        'issued_date': str(invoice.issued_date),
        'issue_date': str(invoice.issued_date),
        'due_date': str(invoice.due_date),
        'total': float(invoice.total),
        'amount_paid': float(invoice.amount_paid),
        'paid_amount': float(invoice.amount_paid),
        'balance': float(invoice.balance_due),
        'balance_due': float(invoice.balance_due),
        'pdf_url': f'/api/billing/invoices/{invoice.id}/pdf/',
        'items': items,
    }


@receiver(post_save, sender=Invoice)
def invoice_post_save_signal(sender, instance, created, **kwargs):
    if created:
        event_type = 'invoice.created'
    elif instance.status == InvoiceStatus.PAID:
        event_type = 'invoice.paid'
    else:
        event_type = 'invoice.updated'

    data = serialize_invoice_payload(instance)
    groups = ['role_admin']
    if instance.patient_id:
        groups.append(f'patient_{instance.patient_id}')

    def _broadcast():
        broadcast_event(event_type, data, groups)

    transaction.on_commit(_broadcast)
