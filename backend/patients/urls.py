from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PatientViewSet, PrescriptionViewSet, VitalSignViewSet,
    NurseNoteViewSet, LabResultViewSet, PatientPrescriptionDetailView
)
from quality.views import PatientFeedbackView, PatientManagerChecklistView
from .patient_file_views import (
    PatientFileView,
    PatientEmergencyContactRevealView,
    PatientHistoryCarePlanUpdateView,
    PatientActiveComplaintView,
    PatientScheduledItemView,
    PatientRecordsTimelineView,
    PatientSingleRecordDetailView,
    PatientPhotoView,
    PatientRecordAddendumView,
)

router = DefaultRouter()
router.register(r'prescriptions', PrescriptionViewSet, basename='prescription')
router.register(r'vitals', VitalSignViewSet, basename='vital')
router.register(r'notes', NurseNoteViewSet, basename='nurse-note')
router.register(r'labs', LabResultViewSet, basename='lab')
router.register(r'', PatientViewSet, basename='patient')

urlpatterns = [
    # Patient File Hub & Timeline Endpoints
    path('<int:pk>/patient-file/', PatientFileView.as_view(), name='patient-file-hub'),
    path('<int:pk>/photo/', PatientPhotoView.as_view(), name='patient-photo'),
    path('<int:pk>/reveal-emergency-contact/', PatientEmergencyContactRevealView.as_view(), name='patient-emergency-contact-reveal'),
    path('<int:pk>/history-care-plan/', PatientHistoryCarePlanUpdateView.as_view(), name='patient-history-care-plan'),
    path('<int:pk>/active-complaint/', PatientActiveComplaintView.as_view(), name='patient-active-complaint'),
    path('<int:pk>/scheduled-items/', PatientScheduledItemView.as_view(), name='patient-scheduled-items'),
    path('<int:pk>/scheduled-items/<int:item_id>/', PatientScheduledItemView.as_view(), name='patient-scheduled-items-detail'),
    path('<int:pk>/records/<str:record_type>/', PatientRecordsTimelineView.as_view(), name='patient-records-timeline'),
    path('<int:pk>/records/<str:record_type>/<int:record_id>/', PatientSingleRecordDetailView.as_view(), name='patient-record-detail'),
    path('<int:pk>/records/<str:record_type>/<int:record_id>/addendum/', PatientRecordAddendumView.as_view(), name='patient-record-addendum'),

    # Nested prescription detail: /api/patients/{id}/prescriptions/{prescription_id}/
    path('<int:patient_pk>/prescriptions/<int:prescription_pk>/', PatientPrescriptionDetailView.as_view(), name='patient-prescription-detail'),
    path('', include(router.urls)),
    # Quality forms — nested under patient
    path('<int:patient_pk>/feedback/', PatientFeedbackView.as_view(), name='patient-feedback'),
    path('<int:patient_pk>/manager-checklist/', PatientManagerChecklistView.as_view(), name='patient-manager-checklist'),
]

