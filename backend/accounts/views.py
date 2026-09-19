from django.db.models import Sum, Count
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from homecareOS.permissions import IsFinancialStaff
from .models import Payment, Invoice
from .serializers import PaymentSerializer, InvoiceSerializer
from bookings.models import Booking


class PaymentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsFinancialStaff]
    queryset = Payment.objects.select_related('patient', 'booking').all()
    serializer_class = PaymentSerializer

    @action(detail=False, methods=['get'])
    def revenue_by_service(self, request):
        """Revenue breakdown by service type."""
        data = (
            Booking.objects
            .filter(status='completed')
            .values('service_type')
            .annotate(total=Sum('amount_paid'), count=Count('id'))
        )
        return Response(list(data))

    @action(detail=False, methods=['get'])
    def daily_revenue(self, request):
        """Revenue per day for the last 30 days."""
        from django.utils import timezone
        from django.db.models.functions import TruncDate
        thirty_days_ago = timezone.now() - timezone.timedelta(days=30)
        data = (
            Payment.objects
            .filter(received_at__gte=thirty_days_ago)
            .annotate(date=TruncDate('received_at'))
            .values('date')
            .annotate(total=Sum('amount'))
            .order_by('date')
        )
        return Response(list(data))


class InvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsFinancialStaff]
    queryset = Invoice.objects.select_related('patient', 'booking').all()
    serializer_class = InvoiceSerializer
