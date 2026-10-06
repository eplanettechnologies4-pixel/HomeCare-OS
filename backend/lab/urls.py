from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LabTestViewSet, LabOrderViewSet

router = DefaultRouter()
router.register(r'tests', LabTestViewSet, basename='lab-test')
router.register(r'orders', LabOrderViewSet, basename='lab-order')

urlpatterns = [
    path('', include(router.urls)),
]
