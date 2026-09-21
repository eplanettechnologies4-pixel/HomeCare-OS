from datetime import timedelta
from django.utils import timezone
from .models import Invoice, InvoiceLineItem, BillingType, InvoiceStatus


def generate_invoice_for_booking(booking):
    """
    Creates an Invoice with line items for a booking if not already generated.
    """
    existing = Invoice.objects.filter(booking=booking).first()
    if existing:
        return existing

    due_date = timezone.now().date() + timedelta(days=7)
    amt = booking.amount if (booking.amount and booking.amount > 0) else 2500
    paid = booking.amount_paid or 0

    invoice = Invoice.objects.create(
        patient=booking.patient,
        booking=booking,
        billing_type=BillingType.VISIT,
        issued_date=timezone.now().date(),
        due_date=due_date,
        subtotal=amt,
        discount=0,
        tax=0,
        total=amt,
        amount_paid=paid,
        notes=f"Clinical visit invoice for {booking.reference_code or f'#{booking.pk}'}",
        created_by=booking.created_by,
    )

    desc = f"{booking.get_service_type_display()} ({booking.get_shift_duration_display()})"
    if booking.reference_code:
        desc += f" — Ref: {booking.reference_code}"

    InvoiceLineItem.objects.create(
        invoice=invoice,
        description=desc,
        quantity=1,
        unit_price=amt,
        amount=amt,
    )

    return invoice
