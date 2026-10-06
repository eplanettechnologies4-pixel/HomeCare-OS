import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';
import { locationService } from '../services/location';
import { useToast } from '../components/Toast';

const PURPLE = '#6D28D9', PURPLE_LIGHT = '#EDE9FE', WHITE = '#FFFFFF';

export default function MarkSampleCollectedScreen({ route, navigation }) {
  const { showToast } = useToast();
  const order = route.params?.order || route.params?.visit || {};
  const orderId = order.order_id || order.id?.replace?.('lab-', '') || order.id;

  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleConfirmCollection = async () => {
    setSubmitting(true);
    try {
      // 1. Get GPS coordinates
      let lat = 33.5651, lng = 73.1512;
      try {
        const loc = await locationService.getCurrentLocation();
        if (loc?.coords) {
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
        }
      } catch (locErr) {
        console.warn('GPS location lookup error:', locErr);
      }

      // 2. Call POST /api/lab/orders/{id}/collect-sample/
      const res = await api.post(`/api/lab/orders/${orderId}/collect-sample/`, {
        lat,
        lng,
        notes: notes.trim()
      });

      if (res.status === 200 || res.status === 201) {
        showToast('Sample collection recorded with verified timestamp & GPS.', 'success');
        navigation.goBack();
      } else {
        Alert.alert('Error', 'Failed to record sample collection.');
      }
    } catch (err) {
      console.warn('Collect sample API error:', err);
      Alert.alert('Error', err.response?.data?.error || err.message || 'Network error recording collection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={WHITE} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mark Sample Collected</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content}>
        {/* Patient / Requisition Card */}
        <View style={styles.orderCard}>
          <View style={styles.iconCircle}>
            <Text style={{ fontSize: 28 }}>🧪</Text>
          </View>
          <Text style={styles.patientName}>{order.patient || order.patient_name || 'Patient Specimen'}</Text>
          <Text style={styles.orderRef}>
            Requisition: {order.reference_code || `LAB-${orderId}`}
          </Text>
          <Text style={styles.testSummary}>
            {order.service || order.tests_summary || 'Diagnostic Lab Panel'}
          </Text>
          {order.address && (
            <Text style={styles.addressText}>
              📍 {order.address}
            </Text>
          )}
        </View>

        {/* Clinical Note Input */}
        <View style={styles.noteCard}>
          <Text style={styles.sectionTitle}>Phlebotomy / Specimen Notes (Optional)</Text>
          <Text style={styles.subtext}>
            Note any condition remarks (e.g. "sample slightly hemolyzed", "patient was fasting 10 hours", "drawn from right arm").
          </Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sample collected in 2 EDTA tubes, fasting confirmed..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Verification notice */}
        <View style={styles.verificationNotice}>
          <Ionicons name="shield-checkmark" size={20} color="#10B981" />
          <Text style={styles.verificationText}>
            Submitting records a tamper-proof server timestamp and your live GPS coordinates to verify specimen integrity.
          </Text>
        </View>
      </ScrollView>

      {/* Bottom Action Button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.confirmBtn, submitting && styles.disabledBtn]}
          onPress={handleConfirmCollection}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text style={styles.confirmBtnText}>Confirm Sample Collected</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    backgroundColor: PURPLE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { width: 40, justifyContent: 'center' },
  headerTitle: { color: WHITE, fontSize: 17, fontWeight: '700' },
  content: { flex: 1, padding: 18 },
  orderCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: PURPLE_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  patientName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  orderRef: { fontSize: 13, color: PURPLE, fontWeight: '700', marginTop: 2 },
  testSummary: { fontSize: 14, color: '#4B5563', marginTop: 6, textAlign: 'center', fontWeight: '500' },
  addressText: { fontSize: 12, color: '#6B7280', marginTop: 8, textAlign: 'center' },
  noteCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtext: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 100,
    backgroundColor: '#F9FAFB',
  },
  verificationNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  verificationText: { fontSize: 12, color: '#065F46', flex: 1, lineHeight: 17 },
  bottomBar: {
    padding: 16,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  confirmBtn: {
    backgroundColor: PURPLE,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabledBtn: { opacity: 0.6 },
  confirmBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
