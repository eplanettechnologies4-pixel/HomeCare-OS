import django_filters
from .models import Booking


class BookingFilter(django_filters.FilterSet):
    status = django_filters.CharFilter(field_name='status')
    service_type = django_filters.CharFilter(field_name='service_type')
    staff = django_filters.NumberFilter(field_name='assigned_staff__id')
    date_from = django_filters.DateFilter(field_name='scheduled_time', lookup_expr='date__gte')
    date_to = django_filters.DateFilter(field_name='scheduled_time', lookup_expr='date__lte')
    payment_status = django_filters.CharFilter(field_name='payment_status')

    class Meta:
        model = Booking
        fields = ['status', 'service_type', 'payment_status']
