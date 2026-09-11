import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StaffService } from '../services/api';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';
import EmptyState from '../components/EmptyState';

const PURPLE = '#6D28D9', WHITE = '#FFFFFF';

const statusBadges = {
  Pending: { bg: '#F6E3C2', text: '#8A5A12' },
  Approved: { bg: '#DCFCE7', text: '#166534' },
  Rejected: { bg: '#FEE2E2', text: '#991B1B' },
};

export default function LeaveRequestScreen({ navigation }) {
  const { showToast } = useToast();
  const [leaveType, setLeaveType] = useState('Casual');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([
    { id: '1', type: 'Casual', startDate: '2026-08-30', endDate: '2026-08-30', reason: 'Personal family matter', status: 'Approved' },
    { id: '2', type: 'Sick', startDate: '2026-07-12', endDate: '2026-07-13', reason: 'Fever and rest', status: 'Approved' },
    { id: '3', type: 'Annual', startDate: '2026-06-01', endDate: '2026-06-05', reason: 'Summer vacation', status: 'Rejected' },
  ]);

  const setQuickDate = (type) => {
    const today = new Date();
    if (type === 'today') {
      const formatted = today.toISOString().split('T')[0];
      setStartDate(formatted);
      setEndDate(formatted);
    } else if (type === 'tomorrow') {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const formatted = tomorrow.toISOString().split('T')[0];
      setStartDate(formatted);
      setEndDate(formatted);
    } else if (type === 'next_week') {
      const nextMon = new Date(today);
      nextMon.setDate(nextMon.getDate() + ((1 + 7 - nextMon.getDay()) % 7 || 7));
      const formatted = nextMon.toISOString().split('T')[0];
      setStartDate(formatted);
      setEndDate(formatted);
    }
  };

  const handleSubmit = async () => {
    if (!startDate || !reason) {
      showToast('Please specify the start date and reason', 'error');
      return;
    }

    setSubmitting(true);
    const res = await StaffService.submitLeaveRequest({
      type: leaveType,
      startDate,
      endDate: endDate || startDate,
      reason,
    });
    setSubmitting(false);

    if (res.success) {
      const newRequest = {
        id: Date.now().toString(),
        type: leaveType,
        startDate,
        endDate: endDate || startDate,
        reason,
        status: 'Pending',
      };
      setHistory([newRequest, ...history]);
      setStartDate('');
      setEndDate('');
      setReason('');
      showToast('Leave request submitted successfully!', 'success');
    } else {
      showToast(res.error || 'Failed to submit leave request', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Apply Leave</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>New Request Form</Text>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.label, { marginTop: 0, flex: 1 }]}>Leave Type</Text>
              {/* Swapped emoji with downloaded appoinmtment.png icon asset */}
              <Image
                source={require('../../assets/images/appoinmtment.png')}
                style={styles.calIcon}
                resizeMode="contain"
              />
            </View>

            <View style={styles.chipRow}>
              {['Casual', 'Sick', 'Annual'].map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, leaveType === t && styles.typeChipActive]}
                  onPress={() => setLeaveType(t)}
                >
                  <Text style={[styles.typeChipText, leaveType === t && styles.typeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Quick Date Selection</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity style={styles.quickDateBtn} onPress={() => setQuickDate('today')}>
                <Text style={styles.quickDateText}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickDateBtn} onPress={() => setQuickDate('tomorrow')}>
                <Text style={styles.quickDateText}>Tomorrow</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickDateBtn} onPress={() => setQuickDate('next_week')}>
                <Text style={styles.quickDateText}>Next Week</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.row2}>
              <View style={styles.flex1}>
                <Text style={styles.label}>Start Date</Text>
                <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={startDate} onChangeText={setStartDate} />
              </View>
              <View style={{ width: 12 }} />
              <View style={styles.flex1}>
                <Text style={styles.label}>End Date</Text>
                <TextInput style={styles.input} placeholder="YYYY-MM-DD" value={endDate} onChangeText={setEndDate} />
              </View>
            </View>

            <Text style={styles.label}>Reason for Leave</Text>
            <TextInput
              style={[styles.input, styles.reasonInput]}
              multiline
              numberOfLines={4}
              placeholder="State clear reason for your leave request..."
              value={reason}
              onChangeText={setReason}
            />

            <AnimatedButton
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Leave Request</Text>}
            </AnimatedButton>
          </View>

          <Text style={styles.sectionTitle}>My Past Requests</Text>
          {history.length === 0 ? (
            <EmptyState icon="📅" title="No Leave History" message="You haven't submitted any leave requests yet." />
          ) : (
            history.map((item) => {
              const badge = statusBadges[item.status] || statusBadges.Pending;
              return (
                <View key={item.id} style={styles.historyCard}>
                  <View style={styles.historyTop}>
                    <Text style={styles.historyDates}>{item.startDate} {item.endDate !== item.startDate ? `to ${item.endDate}` : ''}</Text>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.text }]}>{item.status}</Text>
                    </View>
                  </View>
                  <Text style={styles.historyType}>{item.type} Leave</Text>
                  <Text style={styles.historyReason}>{item.reason}</Text>
                </View>
              );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  backBtn: { width: 50 },
  backText: { color: WHITE, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: WHITE, fontSize: 18, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12, marginTop: 4 },
  card: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 24, shadowColor: '#6D28D9', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  calIcon: { width: 28, height: 28 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 10 },
  chipRow: { flexDirection: 'row', marginBottom: 6 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, backgroundColor: '#F3F0FB', marginRight: 8 },
  typeChipActive: { backgroundColor: PURPLE },
  typeChipText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  typeChipTextActive: { color: WHITE },
  quickDateBtn: { backgroundColor: '#EDE9FE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, marginRight: 8 },
  quickDateText: { fontSize: 11, fontWeight: '700', color: PURPLE },
  row2: { flexDirection: 'row', marginTop: 4 },
  flex1: { flex: 1 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827', backgroundColor: '#FAFAF8' },
  reasonInput: { height: 80, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
  historyCard: { backgroundColor: WHITE, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 12 },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDates: { fontSize: 14, fontWeight: '700', color: '#111827' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  historyType: { fontSize: 12, color: PURPLE, fontWeight: '600', marginTop: 4 },
  historyReason: { fontSize: 13, color: '#6B7280', marginTop: 6, lineHeight: 18 },
});
