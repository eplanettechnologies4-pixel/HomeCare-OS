from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Lead, LeadActivity
from .serializers import LeadSerializer, LeadActivitySerializer


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.select_related('assigned_to', 'converted_patient', 'converted_booking').prefetch_related('activities').all()
    serializer_class = LeadSerializer

    @action(detail=True, methods=['post'])
    def update_stage(self, request, pk=None):
        lead = self.get_object()
        new_stage = request.data.get('stage')
        if not new_stage:
            return Response({'error': 'stage is required'}, status=status.HTTP_400_BAD_REQUEST)
        lead.stage = new_stage
        lead.save(update_fields=['stage', 'updated_at'])
        return Response(LeadSerializer(lead).data)

    @action(detail=True, methods=['post'])
    def add_activity(self, request, pk=None):
        lead = self.get_object()
        note = request.data.get('note', '')
        activity = LeadActivity.objects.create(
            lead=lead,
            author=request.user if request.user.is_authenticated else None,
            note=note
        )
        return Response(LeadActivitySerializer(activity).data)


class LeadActivityViewSet(viewsets.ModelViewSet):
    queryset = LeadActivity.objects.all()
    serializer_class = LeadActivitySerializer
