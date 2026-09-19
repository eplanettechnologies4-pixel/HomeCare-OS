from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from homecareOS.permissions import get_user_role

ROLE_WIDGET_CONFIG = {
    'super_admin': ['total_revenue', 'active_patients', 'nurses_on_visit', 'completed_today', 'revenue_chart', 'top_services', 'live_alerts', 'recent_activity'],
    'admin': ['total_revenue', 'active_patients', 'nurses_on_visit', 'completed_today', 'revenue_chart', 'top_services', 'live_alerts', 'recent_activity'],
    'branch_manager': ['branch_revenue', 'active_patients', 'nurses_on_visit', 'completed_today', 'live_alerts'],
    'care_manager': ['active_patients', 'nurses_on_visit', 'completed_today', 'care_alerts'],
    'nurse': ['my_visits_today', 'my_attendance', 'my_rating'],
    'accountant': ['total_revenue', 'invoices_due', 'payment_status', 'billing_alerts'],
    'crm_executive': ['leads_pipeline', 'conversion_rate', 'followups_due'],
    'patient_family': ['my_upcoming_visit', 'last_report_status', 'my_invoice_status']
}

class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        role = get_user_role(user) or 'nurse'

        allowed_widgets = ROLE_WIDGET_CONFIG.get(role, [])
        data = {'allowed_widgets': allowed_widgets}

        # Securely compute ONLY allowed widget payloads
        if 'total_revenue' in allowed_widgets or 'branch_revenue' in allowed_widgets:
            data['revenue'] = {'total': 1850000, 'growth': 12.5, 'monthly_series': [120, 150, 180, 220, 260]}
        if 'active_patients' in allowed_widgets:
            data['patients'] = {'active': 42, 'total': 58}
        if 'nurses_on_visit' in allowed_widgets:
            data['nurses'] = {'on_visit': 6, 'total_active': 12}
        if 'my_visits_today' in allowed_widgets:
            data['nurse_schedule'] = {'assigned_count': 3, 'completed': 1, 'rating': 4.9}
        if 'leads_pipeline' in allowed_widgets:
            data['leads'] = {'new': 14, 'converted': 8, 'conversion_rate': '57.1%'}

        return Response(data)
