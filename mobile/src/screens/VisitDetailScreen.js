import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, ScrollView, Animated, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FadeInView from '../components/FadeInView';
import api from '../services/api';
import { sendGPSPing, checkIn, checkOut, triggerSOS } from '../services/tracking';
import { locationService } from '../services/location';
import { mobileWS } from '../services/websocket';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';
import PulsingDot from '../components/PulsingDot';

const PURPLE = '#6D28D9', PURPLE_LIGHT = '#EDE9FE', WHITE = '#FFFFFF';

export default function VisitDetailScreen({ route, navigation }) {
  const { showToast } = useToast();
  const routeVisit = route.params?.visit || { id: route.params?.id || null, patient_name: 'Patient Visit', service_type: 'Home Care' };

  // A2: Remove local useState status management — status comes from the booking object
  const [booking, setBooking] = useState(routeVisit);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Normalized status from booking object
  const rawStatus = (booking.status || 'assigned').toLowerCase();
  const isAssigned = rawStatus === 'assigned' || rawStatus === 'pending';
  const isEnRoute = rawStatus === 'en_route';
  const isInProgress = rawStatus === 'in_progress';
  const isCompleted = rawStatus === 'completed';

  const statusLabel = isCompleted
    ? 'Completed'
    : isInProgress
    ? 'In Progress'
    : isEnRoute
    ? 'En Route'
    : 'Assigned';

  const bookingId = booking.id;

  // A2: Fetch real booking data from GET /api/bookings/{id}/ and subscribe to WS geofence events
  useEffect(() => {
    let isMounted = true;

    const fetchBooking = async () => {
      try {
        const res = await api.get(`/api/bookings/${bookingId}/`);
        if (res.data && isMounted) {
          setBooking((prev) => ({ ...prev, ...res.data }));
        }
      } catch (err) {
        console.warn('[VisitDetail] Error fetching booking detail:', err.message);
      }
    };

    fetchBooking();

    // Re-fetch booking every ~10s as a reliable fallback
    const pollInterval = setInterval(fetchBooking, 10000);

    // Connect to WebSocket and listen for server-side geofence_event arrival
    mobileWS.connect();
    const unsubWS = mobileWS.onMessage((msg) => {
      if (msg.type === 'geofence_event' && String(msg.booking_id) === String(bookingId)) {
        console.log('[VisitDetail] Received live geofence_event:', msg);
        if (msg.event_type === 'check_in') {
          setBooking((prev) => ({ ...prev, status: 'in_progress', actual_start_time: msg.timestamp || new Date().toISOString() }));
          showToast('Geofence auto-detected! Visit is now In Progress.', 'success');
        } else if (msg.event_type === 'check_out') {
          setBooking((prev) => ({ ...prev, status: 'completed' }));
        }
      }
    });

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
      unsubWS();
    };
  }, [bookingId]);

  // Pulse animation when en route
  useEffect(() => {
    if (isEnRoute) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }
  }, [isEnRoute]);

  // A2: 'Start Visit' button -> starts background location task A1 & WS
  const handleStartVisit = async () => {
    showToast('Visit Started. Automatic 30s GPS tracking active.', 'info');

    // Update status to en_route
    setBooking((prev) => ({ ...prev, status: 'en_route' }));

    // Start background location task from A1
    await locationService.startLocationTask(bookingId);
    mobileWS.connect();

    const coords = locationService.getCoords();
    mobileWS.sendLocationUpdate(booking.assigned_staff?.id || 1, coords.lat, coords.lng);
  };

  // A2: Manual Check-in fallback if geofence auto-detection hasn't triggered
  const handleManualCheckIn = async () => {
    try {
      const coords = locationService.getCoords();
      const res = await checkIn(bookingId, coords.lat, coords.lng, 'manual');
      if (res.data) {
        setBooking((prev) => ({ ...prev, status: 'in_progress', actual_start_time: res.data.checked_in_at || new Date().toISOString() }));
        showToast('Manual check-in recorded successfully!', 'success');
      }
    } catch (err) {
      console.error('[VisitDetail] Manual check-in error:', err);
      showToast('Check-in error: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  // A4: Emergency SOS button (REST + WebSocket)
  const handleTriggerSOS = () => {
    Alert.alert(
      'Trigger Emergency SOS?',
      'This will broadcast an immediate high-priority SOS alert to the web tracking dashboard and care manager.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'EMERGENCY SOS',
          style: 'destructive',
          onPress: async () => {
            const coords = locationService.getCoords();
            try {
              // 1. REST durable write
              await triggerSOS(bookingId, coords.lat, coords.lng);
              // 2. WebSocket zero-latency broadcast
              mobileWS.sendSOSAlert(bookingId, coords.lat, coords.lng, booking.assigned_staff?.id);
              showToast('EMERGENCY SOS broadcasted to live dashboard!', 'error');
            } catch (e) {
              console.warn('[VisitDetail] SOS broadcast warning:', e.message);
              mobileWS.sendSOSAlert(bookingId, coords.lat, coords.lng, booking.assigned_staff?.id);
              showToast('SOS broadcasted to dashboard.', 'error');
            }
          },
        },
      ]
    );
  };

  // A2: 'Check-out' button calls checkOut, stops location task, and passes REAL visit_duration_minutes
  const handleCheckOut = async () => {
    try {
      const coords = locationService.getCoords();
      const res = await checkOut(bookingId, coords.lat, coords.lng);

      // Stop location tracking immediately upon check-out (battery discipline)
      await locationService.stopLocationTask();
      mobileWS.disconnect();

      const realDuration = res.data?.visit_duration_minutes ?? (
        booking.actual_start_time
          ? Math.max(1, Math.round((Date.now() - new Date(booking.actual_start_time).getTime()) / 60000))
          : 30
      );

      showToast(`Checked out! Duration: ${realDuration} min.`, 'success');

      navigation.navigate('Checkout', {
        visit: {
          ...booking,
          patient: booking.patient_name || booking.patient?.full_name || booking.patient || 'Patient',
          visit_duration_minutes: realDuration,
        },
        visit_duration_minutes: realDuration,
      });
    } catch (err) {
      console.error('[VisitDetail] Check-out error:', err);
      showToast('Check-out failed: ' + (err.response?.data?.error || err.message), 'error');
    }
  };

  const patientDisplayName = booking.patient_name || booking.patient?.full_name || booking.patient || 'Patient';
  const serviceDisplayName = booking.service_type_display || booking.service_type || booking.service || 'Home Care Visit';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visit Details</Text>
        <TouchableOpacity style={styles.sosHeaderBtn} onPress={handleTriggerSOS}>
          <Text style={styles.sosHeaderText}>🚨 SOS</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <FadeInView delay={0}>
          <View style={styles.patientCard}>
            <Animated.View style={[styles.patientAvatar, isEnRoute && { transform: [{ scale: pulseAnim }] }]}>
              <Text style={styles.avatarText}>{(patientDisplayName[0] || 'P').toUpperCase()}</Text>
            </Animated.View>
            <Text style={styles.patientName}>{patientDisplayName}</Text>
            <Text style={styles.serviceText}>{serviceDisplayName}</Text>

            <View style={styles.statusBadge}>
              <PulsingDot size={6} color={isInProgress ? '#10B981' : isEnRoute ? '#F59E0B' : PURPLE} style={{ marginRight: 6 }} />
              <Text style={[styles.statusText, isInProgress && { color: '#10B981' }, isEnRoute && { color: '#D97706' }]}>
                {statusLabel}
              </Text>
            </View>
          </View>
        </FadeInView>

        <FadeInView delay={100}>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Scheduled Time</Text>
              <Text style={styles.infoValue}>{booking.scheduled_time ? new Date(booking.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (booking.time || '10:00 AM')}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Address</Text>
              <View style={styles.addressRow}>
                <Image source={require('../../assets/images/loactionpin.png')} style={styles.miniPinIcon} resizeMode="contain" />
                <Text style={[styles.infoValue, { flex: 1, marginLeft: 4 }]}>{booking.address || booking.patient?.address || 'Patient Address'}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Contact</Text>
              <Text style={styles.infoValue}>{booking.phone || booking.patient?.phone_number || booking.patient?.phone || '—'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Instructions</Text>
              <Text style={styles.infoValue}>{booking.instructions || booking.nurse_instructions || 'Standard clinical protocol'}</Text>
            </View>
          </View>
        </FadeInView>

        {/* Quick Actions */}
        <FadeInView delay={150}>
          <View style={styles.quickBar}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('TodaysMeds', { visit: booking })}>
              <Text style={styles.quickIcon}>💊</Text>
              <Text style={styles.quickText}>MAR Meds</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('NursesNote', { visit: booking })}>
              <Text style={styles.quickIcon}>📝</Text>
              <Text style={styles.quickText}>Nurse Note</Text>
            </TouchableOpacity>
          </View>
        </FadeInView>

        <FadeInView delay={200}>
          <Text style={styles.sectionTitle}>Visit Timeline</Text>
          <View style={styles.timelineCard}>
            <TimelineRow label="Assigned" active={true} />
            <TimelineRow label="En Route (30s GPS Ping Active)" active={!isAssigned} />
            <TimelineRow label="In Progress (Geofence Arrived)" active={isInProgress || isCompleted} />
            <TimelineRow label="Completed" active={isCompleted} last />
          </View>
        </FadeInView>
        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        {isAssigned && (
          <AnimatedButton style={styles.actionBtn} onPress={handleStartVisit}>
            <Text style={styles.actionBtnText}>Start Visit (Start Location Task)</Text>
          </AnimatedButton>
        )}
        {isEnRoute && (
          <AnimatedButton style={[styles.actionBtn, styles.fallbackBtn]} onPress={handleManualCheckIn}>
            <Text style={styles.fallbackBtnText}>Manual Fallback Check-in</Text>
          </AnimatedButton>
        )}
        {isInProgress && (
          <AnimatedButton style={[styles.actionBtn, { backgroundColor: '#10B981' }]} onPress={handleCheckOut}>
            <Text style={styles.actionBtnText}>Check-out & End Tracking</Text>
          </AnimatedButton>
        )}
        {isCompleted && (
          <View style={[styles.actionBtn, { backgroundColor: '#E5E7EB' }]}>
            <Text style={[styles.actionBtnText, { color: '#6B7280' }]}>Visit Completed</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

function TimelineRow({ label, active, last }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineDotCol}>
        <View style={[styles.timelineDot, active && styles.timelineDotActive]} />
        {!last && <View style={[styles.timelineLine, active && styles.timelineLineActive]} />}
      </View>
      <Text style={[styles.timelineLabel, active && styles.timelineLabelActive]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { width: 60 },
  backText: { color: WHITE, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: WHITE, fontSize: 17, fontWeight: '700' },
  sosHeaderBtn: { backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100 },
  sosHeaderText: { color: WHITE, fontSize: 12, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 20, marginTop: 16 },
  patientCard: { backgroundColor: PURPLE_LIGHT, borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 16 },
  patientAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: PURPLE, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText: { color: WHITE, fontSize: 24, fontWeight: '700' },
  patientName: { fontSize: 19, fontWeight: '700', color: '#111827' },
  serviceText: { fontSize: 13, color: '#6B7280', marginTop: 3 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: WHITE, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, marginTop: 12 },
  statusText: { fontSize: 12, fontWeight: '700', color: PURPLE },
  infoCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 16 },
  infoRow: { paddingVertical: 10 },
  infoLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 3 },
  infoValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  divider: { height: 1, backgroundColor: '#F3F0FB' },
  quickBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  quickBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F0FB', paddingVertical: 12, borderRadius: 14, marginHorizontal: 4 },
  quickIcon: { fontSize: 16, marginRight: 6 },
  quickText: { color: PURPLE, fontSize: 13, fontWeight: '700' },
  miniPinIcon: { width: 16, height: 16, marginTop: 2 },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  timelineCard: { backgroundColor: WHITE, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEE9FA' },
  timelineRow: { flexDirection: 'row', minHeight: 40 },
  timelineDotCol: { alignItems: 'center', width: 24 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#E5E0F5', borderWidth: 2, borderColor: '#E5E0F5' },
  timelineDotActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  timelineLine: { width: 2, flex: 1, backgroundColor: '#E5E0F5', marginTop: 2 },
  timelineLineActive: { backgroundColor: PURPLE },
  timelineLabel: { fontSize: 13, color: '#9CA3AF', marginLeft: 12, marginTop: -1 },
  timelineLabelActive: { color: '#111827', fontWeight: '600' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: WHITE, padding: 16, borderTopWidth: 1, borderTopColor: '#EEE9FA' },
  actionBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 16, alignItems: 'center' },
  actionBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
  fallbackBtn: { backgroundColor: '#F3F0FB', borderWidth: 1, borderColor: PURPLE },
  fallbackBtnText: { color: PURPLE, fontSize: 14, fontWeight: '700' },
});
