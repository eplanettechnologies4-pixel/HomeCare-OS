/**
 * FeedbackScreen.js
 * ─────────────────
 * Quality Feedback Form — filled at end of visit.
 * Flow: Nurse fills timestamps + vitals ref → hands phone to patient/family
 *       for 7-criteria ratings + signature → nurse signs → submit.
 *
 * Reached from CheckoutScreen after a successful check-out.
 * Navigation params expected:
 *   { visit, patient_id, booking_id, staff_id, vital_sign_id }
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Alert, ActivityIndicator,
  Platform, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { QualityService } from '../services/api';

const PURPLE = '#6D28D9';
const PURPLE_LIGHT = '#EDE9FE';
const WHITE = '#FFFFFF';
const GREY = '#6B7280';
const BORDER = '#E5E7EB';
const SCREEN_W = Dimensions.get('window').width;

// ── Signature pad HTML (canvas-based, no library dependency) ─────────────────
const SIGNATURE_PAD_HTML = (label = 'Sign here') => `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; }
  #label { font-size:12px; color:#9ca3af; margin-bottom:6px; }
  canvas { border:1.5px dashed #6D28D9; border-radius:8px; cursor:crosshair; touch-action:none; }
  .btns { display:flex; gap:10px; margin-top:8px; }
  button { padding:6px 18px; border-radius:20px; border:none; cursor:pointer; font-size:12px; font-weight:700; }
  #clear { background:#f3f4f6; color:#374151; }
  #save  { background:#6D28D9; color:#fff; }
</style>
</head>
<body>
<div id="label">${label}</div>
<canvas id="c" width="${Math.floor(SCREEN_W * 0.85)}" height="140"></canvas>
<div class="btns">
  <button id="clear" onclick="clearPad()">Clear</button>
  <button id="save"  onclick="savePad()">Confirm</button>
</div>
<script>
const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let drawing = false;
ctx.strokeStyle='#1f2937'; ctx.lineWidth=2; ctx.lineCap='round'; ctx.lineJoin='round';

function pos(e) {
  const r = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
}
canvas.addEventListener('mousedown', e => { drawing=true; const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); });
canvas.addEventListener('mousemove', e => { if(!drawing) return; const p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); });
canvas.addEventListener('mouseup', () => drawing=false);
canvas.addEventListener('touchstart', e => { e.preventDefault(); drawing=true; const p=pos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); }, {passive:false});
canvas.addEventListener('touchmove', e => { e.preventDefault(); if(!drawing) return; const p=pos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); }, {passive:false});
canvas.addEventListener('touchend', () => drawing=false);

function clearPad() { ctx.clearRect(0,0,canvas.width,canvas.height); }
function savePad() {
  const dataUri = canvas.toDataURL('image/png');
  window.ReactNativeWebView.postMessage(JSON.stringify({ type:'signature', data: dataUri }));
}
</script>
</body>
</html>
`;

// ── Sub-component: Signature Pad ─────────────────────────────────────────────
function SignaturePad({ label, onSigned }) {
  const [signed, setSigned] = useState(null);
  const [showPad, setShowPad] = useState(false);

  const handleMessage = useCallback((event) => {
    try {
      const { type, data } = JSON.parse(event.nativeEvent.data);
      if (type === 'signature' && data && data.length > 100) {
        setSigned(data);
        onSigned(data);
        setShowPad(false);
      }
    } catch (_) {}
  }, [onSigned]);

  if (!WebView) {
    // Fallback: plain text acknowledge (no react-native-webview installed)
    return (
      <View style={sp.box}>
        <Text style={sp.label}>{label}</Text>
        <TouchableOpacity style={sp.tapBtn} onPress={() => onSigned('text-acknowledged')}>
          <Text style={sp.tapText}>Tap to acknowledge signature</Text>
        </TouchableOpacity>
        {signed && <Text style={{ color: '#10B981', fontSize: 11, marginTop: 4 }}>✔ Signed</Text>}
      </View>
    );
  }

  return (
    <View style={sp.box}>
      <Text style={sp.label}>{label}</Text>
      {signed ? (
        <View style={sp.signedRow}>
          <Text style={sp.signedText}>✔ Signed</Text>
          <TouchableOpacity onPress={() => { setSigned(null); setShowPad(true); }}>
            <Text style={sp.redo}>Re-sign</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {showPad ? (
            <WebView
              style={{ width: '100%', height: 220 }}
              source={{ html: SIGNATURE_PAD_HTML(label) }}
              onMessage={handleMessage}
              scrollEnabled={false}
              javaScriptEnabled
              domStorageEnabled
            />
          ) : (
            <TouchableOpacity style={sp.tapBtn} onPress={() => setShowPad(true)}>
              <Text style={sp.tapText}>Tap to sign</Text>
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

const sp = StyleSheet.create({
  box: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, marginBottom: 12, backgroundColor: '#FAFAFA' },
  label: { fontSize: 12, fontWeight: '700', color: GREY, marginBottom: 6 },
  tapBtn: { borderWidth: 1.5, borderColor: PURPLE, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 28, alignItems: 'center' },
  tapText: { color: PURPLE, fontSize: 12, fontWeight: '600' },
  signedRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  signedText: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  redo: { color: GREY, fontSize: 11, textDecorationLine: 'underline' },
});

// ── Sub-component: Rating Row ─────────────────────────────────────────────────
const RATINGS = ['Excellent', 'Good', 'Fair', 'Poor'];

function RatingRow({ label, value, onChange }) {
  return (
    <View style={rr.row}>
      <Text style={rr.label}>{label}</Text>
      <View style={rr.options}>
        {RATINGS.map(r => (
          <TouchableOpacity
            key={r}
            style={[rr.chip, value === r.toLowerCase() && rr.chipActive]}
            onPress={() => onChange(r.toLowerCase())}
          >
            <Text style={[rr.chipText, value === r.toLowerCase() && rr.chipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const rr = StyleSheet.create({
  row: { marginBottom: 10 },
  label: { fontSize: 13, color: '#374151', fontWeight: '600', marginBottom: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: BORDER, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  chipActive: { backgroundColor: PURPLE, borderColor: PURPLE },
  chipText: { fontSize: 11, color: GREY, fontWeight: '600' },
  chipTextActive: { color: WHITE },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function FeedbackScreen({ route, navigation }) {
  const {
    visit = {},
    patient_id,
    booking_id,
    staff_id,
    vital_sign_id,
  } = route.params || {};

  const patientName = visit?.patient_name || visit?.patient || 'Patient';
  const staffName = visit?.assigned_staff_name || 'Attending Staff';

  const now = new Date();
  const nowStr = now.toISOString();

  // ── Form state ────────────────────────────────────────────────────────────
  const [callTime, setCallTime] = useState('');
  const [attendingTime, setAttendingTime] = useState(visit?.actual_start_time || '');
  const [leavingTime, setLeavingTime] = useState(nowStr.slice(0, 16));
  const [prescriptionBy, setPrescriptionBy] = useState('');
  const [signOfReaction, setSignOfReaction] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [patientContact, setPatientContact] = useState('');

  const [ratings, setRatings] = useState({
    professionalism: '', punctuality: '', communication: '',
    hygiene: '', privacy: '', clinical_skills: '', overall: '',
  });

  const [patientSig, setPatientSig] = useState(null);
  const [staffSig, setStaffSig] = useState(null);
  const [step, setStep] = useState(1); // 1=nurse fills, 2=patient rates+signs, 3=staff signs
  const [submitting, setSubmitting] = useState(false);

  const setRating = useCallback((key, val) => {
    setRatings(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleSubmit = async () => {
    if (!patientSig) {
      Alert.alert('Missing Signature', 'Patient/family signature is required.');
      return;
    }
    if (!staffSig) {
      Alert.alert('Missing Signature', 'Attending staff signature is required.');
      return;
    }

    setSubmitting(true);
    const payload = {
      booking: booking_id,
      patient: patient_id,
      staff: staff_id,
      vital_sign: vital_sign_id || null,
      call_time: callTime || null,
      attending_time: attendingTime || null,
      leaving_time: leavingTime || null,
      prescription_by: prescriptionBy,
      sign_of_reaction: signOfReaction,
      rating_professionalism: ratings.professionalism,
      rating_punctuality: ratings.punctuality,
      rating_communication: ratings.communication,
      rating_hygiene: ratings.hygiene,
      rating_privacy: ratings.privacy,
      rating_clinical_skills: ratings.clinical_skills,
      rating_overall: ratings.overall,
      suggestions,
      patient_signature: patientSig,
      patient_contact_number: patientContact,
      staff_signature: staffSig,
    };

    const result = await QualityService.submitVisitFeedback(patient_id, payload);
    setSubmitting(false);

    if (result.success) {
      Alert.alert(
        'Feedback Submitted ✓',
        'Quality feedback has been saved and will appear in the patient and staff profiles on the dashboard.',
        [{ text: 'Done', onPress: () => navigation.navigate('Home') }],
      );
    } else {
      Alert.alert('Submission Error', result.error || 'Failed to submit feedback. Please try again.');
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <Text style={{ color: WHITE, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Quality Feedback Form</Text>
          <Text style={s.headerSub}>{patientName} · {staffName}</Text>
        </View>
        <View style={s.stepBadge}>
          <Text style={s.stepBadgeText}>Step {step}/3</Text>
        </View>
      </View>

      <ScrollView style={s.body} keyboardShouldPersistTaps="handled">

        {/* ── STEP 1: Nurse fills visit details ─────────────────────────── */}
        {step === 1 && (
          <View>
            <Text style={s.sectionTitle}>Visit Information</Text>
            <Text style={s.hint}>Fill in the visit timestamps and clinical notes, then hand the phone to the patient/family.</Text>

            <Text style={s.fieldLabel}>Call Time (ISO or HH:MM)</Text>
            <TextInput style={s.input} value={callTime} onChangeText={setCallTime} placeholder="e.g. 2026-10-01T09:00" placeholderTextColor={GREY} />

            <Text style={s.fieldLabel}>Attending Time</Text>
            <TextInput style={s.input} value={attendingTime} onChangeText={setAttendingTime} placeholder="e.g. 2026-10-01T09:30" placeholderTextColor={GREY} />

            <Text style={s.fieldLabel}>Leaving Time</Text>
            <TextInput style={s.input} value={leavingTime} onChangeText={setLeavingTime} placeholder="e.g. 2026-10-01T11:00" placeholderTextColor={GREY} />

            {vital_sign_id ? (
              <View style={s.infoBox}>
                <Text style={s.infoText}>📋 Vitals linked: record #{vital_sign_id} (from VitalsEntryScreen — no re-entry needed)</Text>
              </View>
            ) : (
              <View style={[s.infoBox, { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }]}>
                <Text style={[s.infoText, { color: '#92400E' }]}>⚠️ No vitals record linked. Go back and submit vitals first for a complete record.</Text>
              </View>
            )}

            <Text style={s.fieldLabel}>Prescription By</Text>
            <TextInput style={s.input} value={prescriptionBy} onChangeText={setPrescriptionBy} placeholder="Doctor / prescribing clinician" placeholderTextColor={GREY} />

            <Text style={s.fieldLabel}>Sign of Reaction (if any)</Text>
            <TextInput style={[s.input, s.textarea]} value={signOfReaction} onChangeText={setSignOfReaction} placeholder="Any adverse reactions observed during visit" placeholderTextColor={GREY} multiline numberOfLines={3} />

            <TouchableOpacity style={s.nextBtn} onPress={() => setStep(2)}>
              <Text style={s.nextBtnText}>Next: Patient Rating →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: Patient/family rates + signs ──────────────────────── */}
        {step === 2 && (
          <View>
            <Text style={s.sectionTitle}>Patient / Family Rating</Text>
            <Text style={s.hint}>Please rate the care received during this visit.</Text>

            <View style={s.card}>
              {[
                { key: 'professionalism', label: '1. Professionalism' },
                { key: 'punctuality',     label: '2. Punctuality' },
                { key: 'communication',   label: '3. Communication & Behaviour' },
                { key: 'hygiene',         label: '4. Hygiene Maintenance' },
                { key: 'privacy',         label: '5. Respect for Privacy' },
                { key: 'clinical_skills', label: '6. Clinical Skills' },
                { key: 'overall',         label: '7. Overall Satisfaction' },
              ].map(item => (
                <RatingRow
                  key={item.key}
                  label={item.label}
                  value={ratings[item.key]}
                  onChange={val => setRating(item.key, val)}
                />
              ))}
            </View>

            <Text style={s.fieldLabel}>Suggestions (optional)</Text>
            <TextInput
              style={[s.input, s.textarea]}
              value={suggestions}
              onChangeText={setSuggestions}
              placeholder="Any suggestions for improvement"
              placeholderTextColor={GREY}
              multiline
              numberOfLines={3}
            />

            <Text style={s.fieldLabel}>Patient / Family Contact Number</Text>
            <TextInput
              style={s.input}
              value={patientContact}
              onChangeText={setPatientContact}
              placeholder="+92-XXX-XXXXXXX"
              placeholderTextColor={GREY}
              keyboardType="phone-pad"
            />

            <Text style={s.sectionTitle}>Patient / Guardian Signature</Text>
            <SignaturePad label="Patient / Guardian — sign here" onSigned={setPatientSig} />

            <View style={s.navRow}>
              <TouchableOpacity style={s.backBtn} onPress={() => setStep(1)}>
                <Text style={s.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.nextBtn} onPress={() => setStep(3)}>
                <Text style={s.nextBtnText}>Next: Staff Sign →</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── STEP 3: Staff signs ───────────────────────────────────────── */}
        {step === 3 && (
          <View>
            <Text style={s.sectionTitle}>Attending Staff Signature</Text>
            <Text style={s.hint}>Nurse/staff: please sign to confirm this feedback form.</Text>

            <SignaturePad label="Attending Staff — sign here" onSigned={setStaffSig} />

            <View style={s.summaryCard}>
              <Text style={s.summaryTitle}>Form Summary</Text>
              {Object.entries(ratings).map(([k, v]) => v ? (
                <View key={k} style={s.summaryRow}>
                  <Text style={s.summaryKey}>{k.replace(/_/g, ' ')}</Text>
                  <Text style={[s.summaryVal, { color: v === 'excellent' ? '#059669' : v === 'poor' ? '#DC2626' : '#374151' }]}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </Text>
                </View>
              ) : null)}
              <View style={s.summaryRow}>
                <Text style={s.summaryKey}>Patient sig</Text>
                <Text style={[s.summaryVal, { color: patientSig ? '#059669' : '#DC2626' }]}>{patientSig ? '✔ Captured' : '✗ Missing'}</Text>
              </View>
              <View style={s.summaryRow}>
                <Text style={s.summaryKey}>Staff sig</Text>
                <Text style={[s.summaryVal, { color: staffSig ? '#059669' : '#DC2626' }]}>{staffSig ? '✔ Captured' : '✗ Missing'}</Text>
              </View>
            </View>

            <View style={s.navRow}>
              <TouchableOpacity style={s.backBtn} onPress={() => setStep(2)}>
                <Text style={s.backBtnText}>← Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.nextBtn, submitting && s.btnDisabled]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color={WHITE} size="small" />
                  : <Text style={s.nextBtnText}>Submit Feedback ✓</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: {
    backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerTitle: { color: WHITE, fontSize: 16, fontWeight: '800' },
  headerSub: { color: '#E0D4FB', fontSize: 11, marginTop: 2 },
  stepBadge: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
  stepBadgeText: { color: WHITE, fontSize: 11, fontWeight: '800' },
  body: { flex: 1, padding: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 6, marginTop: 10 },
  hint: { fontSize: 12, color: GREY, marginBottom: 14, lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 4, marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12,
    fontSize: 13, color: '#111827', backgroundColor: WHITE,
  },
  textarea: { height: 80, textAlignVertical: 'top' },
  infoBox: { borderWidth: 1, borderColor: '#E9D5FF', backgroundColor: '#F5F3FF', borderRadius: 10, padding: 10, marginVertical: 8 },
  infoText: { fontSize: 11, color: PURPLE, lineHeight: 16 },
  card: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginBottom: 12, backgroundColor: '#FAFAFA' },
  nextBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 14, alignItems: 'center', marginTop: 14, flex: 1 },
  nextBtnText: { color: WHITE, fontSize: 14, fontWeight: '800' },
  backBtn: { borderWidth: 1, borderColor: BORDER, borderRadius: 100, paddingVertical: 14, paddingHorizontal: 22, alignItems: 'center', marginRight: 10 },
  backBtnText: { color: '#374151', fontSize: 14, fontWeight: '700' },
  btnDisabled: { opacity: 0.6 },
  navRow: { flexDirection: 'row', marginTop: 6 },
  summaryCard: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginVertical: 12, backgroundColor: '#F9FAFB' },
  summaryTitle: { fontSize: 13, fontWeight: '800', color: PURPLE, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  summaryKey: { fontSize: 12, color: GREY, textTransform: 'capitalize' },
  summaryVal: { fontSize: 12, fontWeight: '700' },
});
