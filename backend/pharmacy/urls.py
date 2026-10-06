from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import MedicineViewSet, MedicineOrderViewSet

router = DefaultRouter()
router.register(r'medicines', MedicineViewSet, basename='medicine')
router.register(r'orders', MedicineOrderViewSet, basename='medicine-order')

urlpatterns = [
    path('', include(router.urls)),
]
