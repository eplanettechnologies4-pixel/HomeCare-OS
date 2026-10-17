from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FormTemplateViewSet, FormSubmissionViewSet

router = DefaultRouter()
router.register(r'templates',   FormTemplateViewSet,   basename='form-template-alias')
router.register(r'submissions', FormSubmissionViewSet, basename='form-submission')
router.register(r'',            FormTemplateViewSet,   basename='form-template')

urlpatterns = [
    path('', include(router.urls)),
]
