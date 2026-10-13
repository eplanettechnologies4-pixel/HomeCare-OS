from django.utils import timezone
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from bookings.models import Booking
from staff.models import StaffMember
from patients.models import Patient
import logging

logger = logging.getLogger(__name__)


class ReportsOverviewView(APIView):
    """
    GET /api/reports/overview/
    Returns high-level statistics and operational metrics for the mobile app
    and admin dashboard.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        now = timezone.now()
        today = now.date()
        start_of_week = today - timedelta(days=today.weekday())

        # Bookings today
        todays_bookings = Booking.objects.filter(scheduled_time__date=today)
        today_total = todays_bookings.count()
        completed_today = todays_bookings.filter(status='completed').count()
        pending_today = todays_bookings.filter(status__in=['pending', 'assigned', 'en_route', 'in_progress']).count()

        # Weekly visits completed
        weekly_completed = Booking.objects.filter(
            status='completed',
            scheduled_time__date__gte=start_of_week
        ).count()

        # Estimated weekly field hours (assume average 2 hours per completed visit)
        weekly_field_hours = round(weekly_completed * 2.0, 1)

        # Average rating from staff members
        staff_ratings = [s.rating for s in StaffMember.objects.filter(rating__isnull=False)]
        avg_rating = round(sum(staff_ratings) / len(staff_ratings), 1) if staff_ratings else 4.9

        # Active counts
        active_staff = StaffMember.objects.filter(status='active').count()
        active_patients = Patient.objects.filter(status='active').count()

        data = {
            'todays_visits': today_total,
            'todaysVisits': today_total,
            'completed_visits': completed_today,
            'completedVisits': completed_today,
            'pending_visits': pending_today,
            'pendingVisits': pending_today,
            'weekly_visits_completed': weekly_completed,
            'weeklyVisitsCompleted': weekly_completed,
            'weekly_field_hours': weekly_field_hours,
            'weeklyFieldHours': weekly_field_hours,
            'rating': avg_rating,
            'active_staff': active_staff,
            'active_patients': active_patients,
        }

        return Response(data)
