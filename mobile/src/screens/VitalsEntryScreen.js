import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, ScrollView, KeyboardAvoidingView, Platform, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SubmissionService } from '../services/api';
import AnimatedButton from '../components/AnimatedButton';
import { useToast } from '../components/Toast';

const PURPLE = '#6D28D9', PURPLE_LIGHT = '#EDE9FE', WHITE = '#FFFFFF';

export default function VitalsEntryScreen({ route, navigation }) {
  const { showToast } = useToast();
  const { visit } = route.params || { id: null, patient: 'Patient' };
  const [vitals, setVitals] = useState({
    bpSystolic: '', bpDiastolic: '', temp: '', pulse: '', resp: '', spo2: '',
    intakeNG: '', intakeIV: '', outputUrine: '', outputDrain: '', bsr: '',
  });

  const update = (key, value) => setVitals({ ...vitals, [key]: value });

  const handleNext = async () => {
    await SubmissionService.submitVitals(visit.id || 'bkg-101', vitals);
    showToast('Vitals Record submitted successfully', 'success');
    navigation.navigate('DailyReport', { visit, vitals });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Text style={styles.backText}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Enter Vitals</Text>
        <View style={{ width: 50 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
          <View style={styles.patientBanner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.patientLabel}>Recording vitals for</Text>
              <Text style={styles.patientName}>{visit.patient}</Text>
            </View>
            <Image
              source={require('../../assets/images/injection.png')}
              style={styles.injectionIcon}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.sectionTitle}>Vital Signs</Text>
          <View style={styles.card}>
            <View style={styles.row2}>
              <FieldBox label="BP Systolic" unit="mmHg" value={vitals.bpSystolic} onChangeText={(v) => update('bpSystolic', v)} />
              <FieldBox label="BP Diastolic" unit="mmHg" value={vitals.bpDiastolic} onChangeText={(v) => update('bpDiastolic', v)} />
            </View>
            <View style={styles.row2}>
              <FieldBox label="Temperature" unit="°F" value={vitals.temp} onChangeText={(v) => update('temp', v)} />
              <FieldBox label="Pulse" unit="bpm" value={vitals.pulse} onChangeText={(v) => update('pulse', v)} />
            </View>
            <View style={styles.row2}>
              <FieldBox label="Respiration" unit="/min" value={vitals.resp} onChangeText={(v) => update('resp', v)} />
              <FieldBox label="SPO2" unit="%" value={vitals.spo2} onChangeText={(v) => update('spo2', v)} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Intake</Text>
          <View style={styles.card}>
            <View style={styles.row2}>
              <FieldBox label="N/G" unit="ml" value={vitals.intakeNG} onChangeText={(v) => update('intakeNG', v)} />
              <FieldBox label="I/V" unit="ml" value={vitals.intakeIV} onChangeText={(v) => update('intakeIV', v)} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Output</Text>
          <View style={styles.card}>
            <View style={styles.row2}>
              <FieldBox label="Urine" unit="ml" value={vitals.outputUrine} onChangeText={(v) => update('outputUrine', v)} />
              <FieldBox label="Drain" unit="ml" value={vitals.outputDrain} onChangeText={(v) => update('outputDrain', v)} />
            </View>
          </View>

          <Text style={styles.sectionTitle}>BSR & Insulin</Text>
          <View style={styles.card}>
            <FieldBox label="Blood Sugar Reading" unit="mg/dL" value={vitals.bsr} onChangeText={(v) => update('bsr', v)} full />
          </View>
          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={styles.bottomBar}>
        <AnimatedButton style={styles.actionBtn} onPress={handleNext}>
          <Text style={styles.actionBtnText}>Continue to Care & Notes</Text>
        </AnimatedButton>
      </View>
    </SafeAreaView>
  );
}

function FieldBox({ label, unit, value, onChangeText, full }) {
  return (
    <View style={[styles.fieldBox, full && { width: '100%' }]}>
      <Text style={styles.fieldLabel}>{label} <Text style={styles.fieldUnit}>({unit})</Text></Text>
      <TextInput style={styles.fieldInput} keyboardType="numeric" placeholder="0" placeholderTextColor="#C4B8E8" value={value} onChangeText={onChangeText} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: { backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 },
  backBtn: { width: 50 },
  backText: { color: WHITE, fontSize: 15, fontWeight: '600' },
  headerTitle: { color: WHITE, fontSize: 18, fontWeight: '700' },
  body: { flex: 1, paddingHorizontal: 20, marginTop: 16 },
  patientBanner: { backgroundColor: PURPLE_LIGHT, borderRadius: 14, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center' },
  injectionIcon: { width: 36, height: 36, marginLeft: 10 },
  patientLabel: { fontSize: 12, color: '#6B7280' },
  patientName: { fontSize: 16, fontWeight: '700', color: '#111827', marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
  card: { backgroundColor: WHITE, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#EEE9FA', marginBottom: 18 },
  row2: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  fieldBox: { width: '48%' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#4B5563', marginBottom: 6 },
  fieldUnit: { fontSize: 11, fontWeight: '400', color: '#9CA3AF' },
  fieldInput: { borderWidth: 1, borderColor: '#DCE8DE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#FAFAF8' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: WHITE, padding: 20, borderTopWidth: 1, borderTopColor: '#EEE9FA' },
  actionBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 16, alignItems: 'center' },
  actionBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
