"""
quality/urls.py  — standalone routes for the quality app
"""
from django.urls import path
from .views import FeedbackManagerSignView

urlpatterns = [
    # PATCH  /api/feedback/{id}/manager_sign/
    path('<int:pk>/manager_sign/', FeedbackManagerSignView.as_view(), name='feedback-manager-sign'),
]
