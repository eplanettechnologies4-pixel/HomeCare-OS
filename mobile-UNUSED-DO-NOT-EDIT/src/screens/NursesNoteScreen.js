import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService, PatientsService } from '../services/api';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';

const PURPLE = '#6D28D9', WHITE = '#FFFFFF';

const initialPastNotes = [
  {
    id: 'n-1',
    author: 'Nurse Ayesha K. (Nurse)',
    timestamp: 'Sep 2, 2026, 10:15 AM',
    noteText: 'Patient vitals stable. BP 120/80 mmHg. Medication given as prescribed. Patient resting comfortably.',
  },
  {
    id: 'n-2',
    author: 'Dr. Ali Raza (Doctor)',
    timestamp: 'Sep 1, 2026, 04:30 PM',
    noteText: 'Reviewed EMR vitals log. Respiration normal. Continued current medication regimen.',
  },
];

export default function NursesNoteScreen({ route, navigation }) {
  const { visit, patientId = '1', patientName = 'Patient' } = route.params || {};
  const resolvedPatientId = visit?.patient?.id || visit?.patient_id || patientId;
  const { showToast } = useToast();

  const currentUser = AuthService.getCurrentUser() || { name: 'Nurse Ayesha K.', role: 'Nurse' };
  const currentTimestamp = new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  const [noteText, setNoteText] = useState('');
  const [pastNotes, setPastNotes] = useState(initialPastNotes);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fetchNotes = async () => {
      const res = await PatientsService.getNurseNotes(resolvedPatientId);
      if (mounted && res.success && Array.isArray(res.data) && res.data.length > 0) {
        setPastNotes(res.data.map(n => ({
          id: n.id,
          author: `${n.recorded_by_name || 'Staff Nurse'} (${n.recorded_by_role || 'Nurse'})`,
          timestamp: n.recorded_at ? new Date(n.recorded_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Recent',
          noteText: n.note,
        })));
      }
    };
    fetchNotes();
    return () => { mounted = false; };
  }, [resolvedPatientId]);

  const handleSaveNote = async () => {
    if (!noteText.trim()) {
      showToast('Please enter note text before saving', 'error');
      return;
    }

    setSubmitting(true);
    // POST /api/patients/{id}/nurses-notes/
    const res = await PatientsService.submitDailyReport(patientId, visit?.id || 'bkg-101', {
      notes: noteText,
    });
    setSubmitting(false);

    if (res.success) {
      const newNote = {
        id: Date.now().toString(),
        author: `${currentUser.name} (${currentUser.role})`,
        timestamp: currentTimestamp,
        noteText: noteText,
      };

      setPastNotes([newNote, ...pastNotes]); // Appends to list (newest first)
      setNoteText('');
      showToast('Nurse Note saved & auto-signed successfully!', 'success');
    } else {
      showToast(res.error || 'Failed to save nurse note', 'error');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Clinical Nurse Note</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          {/* Auto Signature & Audit Header */}
          <View style={styles.auditCard}>
            <Text style={styles.auditLabel}>PATIENT & AUDIT SIGNATURE</Text>
            <Text style={styles.patientName}>{patientName}</Text>

            <View style={styles.signatureRow}>
              <View style={styles.signatureCol}>
                <Text style={styles.sigLabel}>Recorded By</Text>
                <Text style={styles.sigValue}>{currentUser.name} ({currentUser.role})</Text>
              </View>
              <View style={styles.signatureCol}>
                <Text style={styles.sigLabel}>Timestamp</Text>
                <Text style={styles.sigValue}>{currentTimestamp}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>New Observation Note</Text>
          <View style={styles.noteCard}>
            <TextInput
              style={styles.noteInput}
              multiline
              numberOfLines={6}
              placeholder="Write detailed patient observations, clinical signs, response to medication, and care notes..."
              placeholderTextColor="#9CA3AF"
              value={noteText}
              onChangeText={setNoteText}
            />
            <AnimatedButton style={styles.saveBtn} onPress={handleSaveNote} disabled={submitting}>
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save & Sign Note</Text>}
            </AnimatedButton>
          </View>

          {/* L3: List of Patient's Past Notes (Newest First, Read-Only / Immutable) */}
          <Text style={styles.sectionTitle}>Patient EMR Notes History</Text>
          {pastNotes.map((item) => (
            <View key={item.id} style={styles.pastNoteCard}>
              <View style={styles.pastNoteHeader}>
                <Text style={styles.authorText}>{item.author}</Text>
                <Text style={styles.timeText}>{item.timestamp}</Text>
              </View>
              <Text style={styles.pastNoteContent}>{item.noteText}</Text>
              <View style={styles.lockedBadge}>
                <Text style={styles.lockedText}>🔒 Immutable EMR Entry</Text>
              </View>
            </View>
          ))}
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
  auditCard: { backgroundColor: '#EDE9FE', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#DDD3F7' },
  auditLabel: { fontSize: 11, fontWeight: '800', color: PURPLE, letterSpacing: 1, marginBottom: 4 },
  patientName: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#DDD3F7', paddingTop: 10 },
  signatureCol: { flex: 1 },
  sigLabel: { fontSize: 11, color: '#6B7280' },
  sigValue: { fontSize: 13, fontWeight: '700', color: '#1F2937', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  noteCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 24 },
  noteInput: { fontSize: 15, color: '#111827', minHeight: 120, textAlignVertical: 'top', marginBottom: 14 },
  saveBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
  pastNoteCard: { backgroundColor: '#F9FAFB', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 12 },
  pastNoteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  authorText: { fontSize: 13, fontWeight: '700', color: PURPLE },
  timeText: { fontSize: 11, color: '#6B7280' },
  pastNoteContent: { fontSize: 14, color: '#1F2937', lineHeight: 20, marginBottom: 8 },
  lockedBadge: { alignSelf: 'flex-start', backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100 },
  lockedText: { color: '#166534', fontSize: 10, fontWeight: '700' },
});
