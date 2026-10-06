import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PulsingDot from '../../components/PulsingDot';
import { colors, spacing, typography } from '../../theme';
import { locationTracker } from '../../services/locationService';

export default function FamilyLiveTrackingScreen({ navigation }) {
  const [trackingInfo, setTrackingInfo] = useState({
    distanceMeters: 280,
    eta: '4 min ETA',
    nurseName: 'Nurse Ayesha K.',
    status: 'En Route',
  });

  useEffect(() => {
    const unsub = locationTracker.onUpdate((data) => {
      setTrackingInfo((prev) => ({
        ...prev,
        distanceMeters: data.distanceMeters,
        eta: data.eta,
      }));
    });
    return () => unsub();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Live Nurse Tracking</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* Simulated Live Map View */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapGridIcon}>🗺️</Text>
          <Text style={styles.mapLabel}>Live Interactive Map (DHA Phase 5, Lahore)</Text>

          {/* Animated Nurse Pin */}
          <View style={styles.nursePinBox}>
            <PulsingDot size={12} color="#10B981" />
            <Image source={require('../../../assets/images/nurse.png')} style={styles.pinImage} resizeMode="contain" />
            <View style={styles.pinCallout}>
              <Text style={styles.calloutText}>{trackingInfo.nurseName} ({trackingInfo.eta})</Text>
            </View>
          </View>

          {/* Patient Destination Pin */}
          <View style={styles.patientPinBox}>
            <Image source={require('../../../assets/images/loactionpin.png')} style={styles.destPin} resizeMode="contain" />
            <Text style={styles.destText}>Patient Home (House 123)</Text>
          </View>
        </View>
      </View>

      {/* Bottom Live Tracking Status Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <PulsingDot size={8} color="#10B981" />
          <Text style={styles.cardTitle}>Nurse Status: {trackingInfo.status}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Distance to Patient Home:</Text>
          <Text style={styles.value}>{trackingInfo.distanceMeters} meters</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Estimated Arrival:</Text>
          <Text style={styles.value}>{trackingInfo.eta}</Text>
        </View>

        <Text style={styles.note}>
          ℹ️ Real-time GPS stream filtered exclusively for your active care visit.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.screenPadding, paddingVertical: spacing.lg },
  backBtn: { width: 50 },
  backText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: colors.white, fontSize: 18, fontWeight: '700' },
  mapContainer: { flex: 1, backgroundColor: '#E5E7EB' },
  mapPlaceholder: { flex: 1, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  mapGridIcon: { fontSize: 48, marginBottom: 8 },
  mapLabel: { ...typography.bodyMuted, color: colors.textMuted },
  nursePinBox: { position: 'absolute', top: '35%', left: '38%', alignItems: 'center' },
  pinImage: { width: 44, height: 44, marginTop: 4 },
  pinCallout: { backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100, marginTop: 4 },
  calloutText: { color: colors.white, fontSize: 11, fontWeight: '800' },
  patientPinBox: { position: 'absolute', bottom: '28%', right: '25%', alignItems: 'center' },
  destPin: { width: 32, height: 32 },
  destText: { ...typography.mono, color: colors.textDark, marginTop: 2, backgroundColor: colors.white, paddingHorizontal: 6, borderRadius: 4 },
  card: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.xl, borderWidth: 1, borderColor: colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  cardTitle: { ...typography.h3, color: colors.textDark, marginLeft: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  label: { ...typography.bodyMuted },
  value: { ...typography.mono, color: colors.primary, fontWeight: '800' },
  note: { ...typography.caption, color: colors.textFaint, marginTop: spacing.md, fontStyle: 'italic' },
});
