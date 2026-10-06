import logging
from celery import shared_task
from django.utils import timezone
from django.contrib.auth.models import User
from .models import EquipmentRental, EquipmentRentalStatus
from notifications.models import Notification

logger = logging.getLogger(__name__)


@shared_task
def check_expired_equipment_rentals():
    """
    Daily task: find equipment rentals where rental_end has passed and status is still 'active'.
    Transitions status to 'pickup_pending' and creates in-app notifications for Care Managers/Admins.
    """
    today = timezone.now().date()
    expired_rentals = EquipmentRental.objects.filter(
        status=EquipmentRentalStatus.ACTIVE,
        rental_end__lt=today
    ).select_related('patient', 'equipment')

    count = 0
    admins = User.objects.filter(is_staff=True)

    for rental in expired_rentals:
        rental.status = EquipmentRentalStatus.PICKUP_PENDING
        rental.save(update_fields=['status', 'updated_at'])
        count += 1

        # Notify Care Manager if assigned to patient
        if rental.patient.assigned_care_manager and rental.patient.assigned_care_manager.user:
            Notification.objects.create(
                recipient=rental.patient.assigned_care_manager.user,
                icon_key='alert',
                message=f"Equipment rental #{rental.id} for {rental.patient.full_name} ({rental.equipment.name}) ended on {rental.rental_end}. Pickup is pending.",
                target_screen='EquipmentRentals',
                target_params={'rental_id': rental.id}
            )

        # Also alert Admins
        for admin_user in admins[:3]:
            Notification.objects.create(
                recipient=admin_user,
                icon_key='calendar',
                message=f"Equipment Return Required: {rental.equipment.name} from {rental.patient.full_name}. Rental expired on {rental.rental_end}.",
                target_screen='EquipmentRentals',
                target_params={'rental_id': rental.id}
            )

    logger.info("Processed %d expired equipment rentals -> set to pickup_pending", count)
    return f"Processed {count} expired rentals."
