import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Animated, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PURPLE = '#6D28D9', WHITE = '#FFFFFF', GREEN = '#10B981';

export default function CheckoutScreen({ route, navigation }) {
  // Accept visit_duration_minutes directly from route.params (from check-out API response)
  const { visit, visit_duration_minutes } = route.params || {};
  const checkoutTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Use the REAL visit_duration_minutes from checkOut API response
  const rawDuration = visit_duration_minutes ?? visit?.visit_duration_minutes;
  const realDuration = rawDuration !== undefined && rawDuration !== null ? `${rawDuration} min` : '—';
  const patientName = visit?.patient_name || visit?.patient || 'Patient';

  // Scale + Fade spring animation combo for success trust emblem
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 5 }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleDone = () => navigation.navigate('Home');

  const handleFeedback = () => {
    navigation.navigate('Feedback', {
      visit,
      patient_id: visit?.patient_id || visit?.patient,
      booking_id: visit?.id || visit?.booking_id,
      staff_id: visit?.assigned_staff_id || visit?.staff_id,
      vital_sign_id: visit?.latest_vital_sign_id || null,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />
      <View style={styles.body}>
        <Animated.View style={[styles.successCircle, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Image
            source={require('../../assets/images/trsut.png')}
            style={styles.successImage}
            resizeMode="contain"
          />
        </Animated.View>

        <Text style={styles.title}>Visit Completed</Text>
        <Text style={styles.subtitle}>{patientName}'s visit has been checked out successfully</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Patient</Text>
            <Text style={styles.summaryValue}>{patientName}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Check-out Time</Text>
            <Text style={styles.summaryValue}>{checkoutTime}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Visit Duration</Text>
            <Text style={[styles.summaryValue, { color: PURPLE, fontWeight: '800' }]}>{realDuration}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tracking Status</Text>
            <Text style={[styles.summaryValue, { color: GREEN }]}>Stopped (Battery Saved)</Text>
          </View>
        </View>

        {/* Quality Feedback CTA */}
        <TouchableOpacity style={styles.feedbackBtn} onPress={handleFeedback} activeOpacity={0.85}>
          <Text style={styles.feedbackBtnText}>📋 Fill Quality Feedback Form</Text>
          <Text style={styles.feedbackBtnSub}>Patient rates the visit · Required for quality records</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.88}>
          <Text style={styles.doneBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  body: { flex: 1, paddingHorizontal: 30, alignItems: 'center', justifyContent: 'center' },
  successCircle: { width: 96, height: 90, borderRadius: 48, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successImage: { width: 60, height: 60 },
  title: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 30, lineHeight: 20 },
  summaryCard: { width: '100%', backgroundColor: WHITE, borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 18 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  summaryLabel: { fontSize: 13, color: '#6B7280' },
  summaryValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  divider: { height: 1, backgroundColor: '#F3F0FB' },
  feedbackBtn: {
    width: '100%', backgroundColor: '#F5F3FF', borderWidth: 1.5, borderColor: PURPLE,
    borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', marginBottom: 12,
  },
  feedbackBtnText: { color: PURPLE, fontSize: 14, fontWeight: '800', marginBottom: 2 },
  feedbackBtnSub: { color: '#7C3AED', fontSize: 11 },
  doneBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 16, paddingHorizontal: 60, alignItems: 'center' },
  doneBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
