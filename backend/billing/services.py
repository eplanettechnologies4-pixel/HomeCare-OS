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

    from decimal import Decimal
    from bookings.models import ServiceCatalogItem

    catalog_item = None
    if getattr(booking, 'requested_item', None):
        catalog_item = ServiceCatalogItem.objects.filter(is_active=True, name__iexact=booking.requested_item).first()
        if not catalog_item:
            catalog_item = ServiceCatalogItem.objects.filter(is_active=True, name__icontains=booking.requested_item).first()
    if not catalog_item and getattr(booking, 'service_type', None):
        catalog_item = ServiceCatalogItem.objects.filter(is_active=True, category=booking.service_type).first()

    unit_price = (
        getattr(booking, 'estimated_price', None)
        or (catalog_item.price_min if catalog_item and catalog_item.price_min else None)
        or (booking.amount if (booking.amount and booking.amount > 0) else Decimal('2500.00'))
    )

    item_name = getattr(booking, 'requested_item', '') or (catalog_item.name if catalog_item else booking.get_service_type_display())
    desc = f"{item_name} ({booking.get_service_type_display()})"
    if booking.reference_code:
        desc += f" — Ref: {booking.reference_code}"

    amt = unit_price

    InvoiceLineItem.objects.create(
        invoice=invoice,
        description=desc,
        quantity=Decimal('1.00'),
        unit_price=amt,
        amount=amt,
    )

    return invoice
