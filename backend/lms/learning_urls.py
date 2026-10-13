from django.urls import path
from .learning_views import (
    MyCoursesView,
    CourseDetailLearningView,
    LectureStreamView,
    LectureProgressUpdateView,
    ServeHLSPlaylistView,
)

urlpatterns = [
    path('my-courses/',                     MyCoursesView.as_view(),            name='learning-my-courses'),
    path('courses/<int:pk>/',               CourseDetailLearningView.as_view(), name='learning-course-detail'),
    path('lectures/<int:pk>/stream/',       LectureStreamView.as_view(),        name='learning-lecture-stream'),
    path('lectures/<int:pk>/progress/',     LectureProgressUpdateView.as_view(),name='learning-lecture-progress'),
    path('lectures/<int:lecture_id>/hls/<path:filepath>', ServeHLSPlaylistView.as_view(), name='learning-hls-serve'),
]
