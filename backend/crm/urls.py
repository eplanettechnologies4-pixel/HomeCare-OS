from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import LeadViewSet, LeadActivityViewSet

router = DefaultRouter()
router.register(r'leads', LeadViewSet, basename='lead')
router.register(r'activities', LeadActivityViewSet, basename='lead-activity')

urlpatterns = [path('', include(router.urls))]
