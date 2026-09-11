import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SubmissionService } from '../services/api';
import AnimatedCheckbox from '../components/AnimatedCheckbox';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';

const PURPLE = '#6D28D9', PURPLE_LIGHT = '#EDE9FE', WHITE = '#FFFFFF';
const CARE_ITEMS = ['Medication Given', 'BP Check', 'Injection', 'Dressing', 'Physiotherapy', 'SpO2 Check'];

export default function DailyReportScreen({ route, navigation }) {
  const { showToast } = useToast();
  const { visit, vitals } = route.params || {};
  const [checked, setChecked] = useState({});
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const toggleItem = (item) => setChecked({ ...checked, [item]: !checked[item] });

  const handleAddPhoto = () => {
    setPhotos([...photos, 'photo_' + (photos.length + 1)]);
    showToast('Visit photo attached to daily report', 'info');
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    const visitId = visit?.id || 'bkg-101';

    // 1. Submit Daily Report (DailyVisitReport, NursesNote, VisitPhoto)
    await SubmissionService.submitDailyReport(visitId, {
      checked,
      notes,
      photos,
    });

    // 2. Submit Visit Checkout (VisitCheckOut)
    await SubmissionService.submitCheckOut(visitId, {
      duration_minutes: 45,
    });

    setSubmitting(false);
    showToast('Daily Report & Checkout Submitted!', 'success');
    navigation.navigate('Checkout', { visit, vitals, checked, notes });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Text style={styles.backText}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Daily Report</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Care & Services Provided</Text>
          <View style={styles.card}>
            {CARE_ITEMS.map((item) => (
              <AnimatedCheckbox
                key={item}
                checked={!!checked[item]}
                label={item}
                onPress={() => toggleItem(item)}
              />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Clinical Observations & Notes</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.notesInput}
              placeholder="Patient condition is stable, medication given on time..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={5}
              value={notes}
              onChangeText={setNotes}
            />
          </View>

          <Text style={styles.sectionTitle}>Photos / Documents Attachment</Text>
          <View style={styles.photoRow}>
            {photos.map((p, i) => (
              <View key={i} style={styles.photoThumb}>
                <Text style={styles.photoText}>📷 {i + 1}</Text>
              </View>
            ))}
            <TouchableOpacity style={styles.addPhotoBtn} onPress={handleAddPhoto}>
              <Text style={styles.addPhotoIcon}>+</Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.bottomBar}>
        <AnimatedButton style={styles.actionBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>Submit Report & Check Out</Text>}
        </AnimatedButton>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  backBtn: { width: 50 },
  backText: { color: WHITE, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: WHITE, fontSize: 18, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 20, marginTop: 16 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
  card: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 18 },
  notesInput: { fontSize: 14, color: '#111827', textAlignVertical: 'top', minHeight: 100 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap' },
  photoThumb: { width: 70, height: 70, borderRadius: 12, backgroundColor: PURPLE_LIGHT, marginRight: 10, marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
  photoText: { fontSize: 12, fontWeight: '700', color: PURPLE },
  addPhotoBtn: { width: 70, height: 70, borderRadius: 12, borderWidth: 2, borderColor: '#D9CFF0', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  addPhotoIcon: { fontSize: 28, color: PURPLE, fontWeight: '300' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: WHITE, padding: 20, borderTopWidth: 1, borderTopColor: '#EEE9FA' },
  actionBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 16, alignItems: 'center' },
  actionBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
