from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InvoiceViewSet, BillingPaymentViewSet

router = DefaultRouter()
router.register(r'invoices', InvoiceViewSet,        basename='invoice')
router.register(r'payments', BillingPaymentViewSet, basename='billing-payment')

urlpatterns = [path('', include(router.urls))]
