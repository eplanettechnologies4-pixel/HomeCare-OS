from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ServiceCatalogViewSet

router = DefaultRouter()
router.register(r'catalog', ServiceCatalogViewSet, basename='service-catalog')

urlpatterns = [
    path('catalog/public/', ServiceCatalogViewSet.as_view({'get': 'public'}), name='service-catalog-public'),
    path('', include(router.urls)),
]
