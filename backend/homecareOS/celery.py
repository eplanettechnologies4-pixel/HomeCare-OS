import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'homecareOS.settings')

app = Celery('homecareOS')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f'Request: {self.request!r}')


# ── Periodic tasks ──────────────────────────────────────────────────────────
@app.on_after_configure.connect
def setup_periodic_tasks(sender, **kwargs):
    from celery.schedules import crontab
    # Check for late arrivals every 5 minutes
    sender.add_periodic_task(300.0, check_late_arrivals.s(), name='late-arrival-check')
    # Payroll calculation runs at midnight on the 1st of each month
    sender.add_periodic_task(
        crontab(hour=0, minute=0, day_of_month=1),
        calculate_monthly_payroll.s(),
        name='monthly-payroll',
    )


@app.task
def check_late_arrivals():
    """Flag bookings where staff has not checked in past the late-arrival threshold."""
    from django.utils import timezone
    from bookings.models import Booking
    from tracking.models import AlertRule

    now = timezone.now()
    rules = AlertRule.objects.first()
    threshold_minutes = rules.late_arrival_minutes if rules else 15

    late_bookings = Booking.objects.filter(
        status='assigned',
        scheduled_time__lt=now - timezone.timedelta(minutes=threshold_minutes),
    )
    for booking in late_bookings:
        booking.status = 'late'
        booking.save(update_fields=['status'])


@app.task
def calculate_monthly_payroll():
    """Stub: calculate salary + deductions from attendance records."""
    from staff.models import StaffMember, AttendanceRecord
    from django.utils import timezone

    now = timezone.now()
    last_month_start = now.replace(day=1) - timezone.timedelta(days=1)
    last_month_start = last_month_start.replace(day=1)

    for member in StaffMember.objects.filter(is_active=True):
        records = AttendanceRecord.objects.filter(
            staff=member,
            date__gte=last_month_start,
            date__lt=now.replace(day=1),
        )
        total_hours = sum(r.total_hours for r in records)
        overtime_hours = sum(r.overtime_hours for r in records)
        # Salary calculation logic would go here
        print(f'{member.full_name}: {total_hours}h worked, {overtime_hours}h overtime')
