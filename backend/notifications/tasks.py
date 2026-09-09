"""
Celery tasks for the notifications app.

Registered periodic tasks (wired in homecareOS/celery.py):
  - check_overdue_medications: runs every 15 minutes, fires a Notification
    for any medication dose that is due but not yet administered for today.
"""
from celery import shared_task


@shared_task
def check_overdue_medications():
    """
    For every active patient, find prescriptions whose scheduled administration
    time for today has passed without a recorded MARAdministration entry.
    Creates a Notification for the assigned staff member's linked auth.User.
    """
    from django.utils import timezone
    from patients.models import Patient, Prescription, MARAdministration
    from .views import create_notification

    now = timezone.now()
    today_day_number = now.weekday()  # 0=Mon … 6=Sun; matches day_number in MARAdministration

    overdue_count = 0

    for patient in Patient.objects.filter(is_active=True).select_related('assigned_care_manager__user'):
        care_manager = patient.assigned_care_manager
        if not care_manager or not care_manager.user:
            continue

        for prescription in patient.prescriptions.all():
            # Check if today's dose has already been administered
            already_given = MARAdministration.objects.filter(
                prescription=prescription,
                day_number=today_day_number,
                administered_at__date=now.date(),
            ).exists()

            if not already_given:
                # Only fire once per hour to avoid spam — skip if a recent notification exists
                from .models import Notification
                recently_notified = Notification.objects.filter(
                    recipient=care_manager.user,
                    target_params__prescription_id=prescription.id,
                    created_at__gte=now - timezone.timedelta(hours=1),
                ).exists()

                if not recently_notified:
                    create_notification(
                        recipient_user=care_manager.user,
                        message=f'⚠ Overdue medication: {prescription.medication} '
                                f'({prescription.dosage}) for {patient.full_name} has not been administered today.',
                        icon_key='pill',
                        target_screen='TodaysMeds',
                        target_params={
                            'patient_id': patient.id,
                            'prescription_id': prescription.id,
                        },
                    )
                    overdue_count += 1

    return f'{overdue_count} overdue medication notifications created'
