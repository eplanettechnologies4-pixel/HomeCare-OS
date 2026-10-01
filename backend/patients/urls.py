from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PatientViewSet, PrescriptionViewSet, VitalSignViewSet, NurseNoteViewSet, LabResultViewSet
from quality.views import PatientFeedbackView, PatientManagerChecklistView

router = DefaultRouter()
router.register(r'', PatientViewSet, basename='patient')
router.register(r'prescriptions', PrescriptionViewSet, basename='prescription')
router.register(r'vitals', VitalSignViewSet, basename='vital')
router.register(r'notes', NurseNoteViewSet, basename='nurse-note')
router.register(r'labs', LabResultViewSet, basename='lab')

urlpatterns = [
    path('', include(router.urls)),
    # Quality forms — nested under patient
    path('<int:patient_pk>/feedback/', PatientFeedbackView.as_view(), name='patient-feedback'),
    path('<int:patient_pk>/manager-checklist/', PatientManagerChecklistView.as_view(), name='patient-manager-checklist'),
]
