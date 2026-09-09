from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FamilyPortalViewSet

router = DefaultRouter()
router.register(r'my', FamilyPortalViewSet, basename='family-portal')

urlpatterns = [path('', include(router.urls))]
