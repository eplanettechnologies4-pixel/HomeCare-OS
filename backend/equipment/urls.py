from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import EquipmentCatalogViewSet, EquipmentRentalViewSet

router = DefaultRouter()
router.register(r'catalog', EquipmentCatalogViewSet, basename='equipment-catalog')
router.register(r'rentals', EquipmentRentalViewSet, basename='equipment-rental')

urlpatterns = [
    path('', include(router.urls)),
]
