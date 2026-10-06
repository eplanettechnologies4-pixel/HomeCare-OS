/**
 * ManagerChecklistScreen.js
 * ─────────────────────────
 * Manager Home Visit Checklist — quality-assurance spot-check.
 * Replaces the "use the web dashboard" placeholder in ManagerViewScreen.
 *
 * Navigation params expected:
 *   { patient_id, staff_id (optional), booking_id (optional) }
 * Or it can be opened standalone from ManagerViewScreen with a patient search.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Alert, ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QualityService, AuthService } from '../services/api';

// Try to import WebView for signature pads; fall back gracefully
let WebView = null;
try { WebView = require('react-native-webview').WebView; } catch (_) {}

const PURPLE = '#6D28D9';
const WHITE = '#FFFFFF';
const GREY = '#6B7280';
const BORDER = '#E5E7EB';
const SCREEN_W = Dimensions.get('window').width;

// ── Signature pad (same canvas approach as FeedbackScreen) ───────────────────
const SIG_HTML = (label) => `
<!DOCTYPE html><html>
<head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif}
#lbl{font-size:11px;color:#9ca3af;margin-bottom:5px}canvas{border:1.5px dashed #6D28D9;border-radius:8px;touch-action:none}
.btns{display:flex;gap:8px;margin-top:6px}button{padding:5px 14px;border-radius:20px;border:none;cursor:pointer;font-size:11px;font-weight:700}
#clr{background:#f3f4f6;color:#374151}#sav{background:#6D28D9;color:#fff}</style></head>
<body><div id="lbl">${label}</div>
<canvas id="c" width="${Math.floor(SCREEN_W * 0.82)}" height="120"></canvas>
<div class="btns"><button id="clr" onclick="cl()">Clear</button><button id="sav" onclick="sv()">Confirm</button></div>
<script>
const cv=document.getElementById('c'),cx=cv.getContext('2d');let d=false;
cx.strokeStyle='#1f2937';cx.lineWidth=2;cx.lineCap='round';cx.lineJoin='round';
function p(e){const r=cv.getBoundingClientRect(),t=e.touches?e.touches[0]:e;return{x:(t.clientX-r.left)*(cv.width/r.width),y:(t.clientY-r.top)*(cv.height/r.height)};}
cv.addEventListener('mousedown',e=>{d=true;const q=p(e);cx.beginPath();cx.moveTo(q.x,q.y);});
cv.addEventListener('mousemove',e=>{if(!d)return;const q=p(e);cx.lineTo(q.x,q.y);cx.stroke();});
cv.addEventListener('mouseup',()=>d=false);
cv.addEventListener('touchstart',e=>{e.preventDefault();d=true;const q=p(e);cx.beginPath();cx.moveTo(q.x,q.y);},{passive:false});
cv.addEventListener('touchmove',e=>{e.preventDefault();if(!d)return;const q=p(e);cx.lineTo(q.x,q.y);cx.stroke();},{passive:false});
cv.addEventListener('touchend',()=>d=false);
function cl(){cx.clearRect(0,0,cv.width,cv.height);}
function sv(){window.ReactNativeWebView.postMessage(JSON.stringify({type:'sig',data:cv.toDataURL('image/png')}));}
</script></body></html>`;

function SignaturePad({ label, onSigned }) {
  const [signed, setSigned] = useState(false);
  const [show, setShow] = useState(false);
  const handle = useCallback((e) => {
    try {
      const { type, data } = JSON.parse(e.nativeEvent.data);
      if (type === 'sig' && data?.length > 100) { setSigned(true); onSigned(data); setShow(false); }
    } catch (_) {}
  }, [onSigned]);

  if (!WebView) {
    return (
      <TouchableOpacity style={sig.box} onPress={() => { setSigned(true); onSigned('acknowledged'); }}>
        <Text style={sig.label}>{label}</Text>
        <Text style={signed ? sig.done : sig.tap}>{signed ? '✔ Signed' : 'Tap to acknowledge'}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View style={sig.box}>
      <Text style={sig.label}>{label}</Text>
      {signed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={sig.done}>✔ Signed</Text>
          <TouchableOpacity onPress={() => { setSigned(false); setShow(true); }}>
            <Text style={{ color: GREY, fontSize: 11, textDecorationLine: 'underline' }}>Re-sign</Text>
          </TouchableOpacity>
        </View>
      ) : show ? (
        <WebView style={{ width: '100%', height: 200 }} source={{ html: SIG_HTML(label) }}
          onMessage={handle} scrollEnabled={false} javaScriptEnabled domStorageEnabled />
      ) : (
        <TouchableOpacity style={sig.tapBtn} onPress={() => setShow(true)}>
          <Text style={sig.tap}>Tap to sign</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const sig = StyleSheet.create({
  box: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 10, marginBottom: 10 },
  label: { fontSize: 11, fontWeight: '700', color: GREY, marginBottom: 4 },
  tapBtn: { borderWidth: 1.5, borderColor: PURPLE, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 22, alignItems: 'center' },
  tap: { color: PURPLE, fontSize: 12, fontWeight: '600' },
  done: { color: '#10B981', fontWeight: '800', fontSize: 13 },
});

// ── Remarks Row ───────────────────────────────────────────────────────────────
function RemarksField({ label, value, onChange }) {
  return (
    <View style={rf.wrap}>
      <Text style={rf.label}>{label}</Text>
      <TextInput
        style={rf.input}
        value={value}
        onChangeText={onChange}
        placeholder="Remarks..."
        placeholderTextColor={GREY}
        multiline
        numberOfLines={2}
      />
    </View>
  );
}
const rf = StyleSheet.create({
  wrap: { marginBottom: 8 },
  label: { fontSize: 12, color: '#374151', fontWeight: '600', marginBottom: 3 },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 9,
    fontSize: 12, color: '#111827', backgroundColor: WHITE,
    textAlignVertical: 'top', minHeight: 52,
  },
});

// ── Section Header ────────────────────────────────────────────────────────────
function SectionHeader({ title, color = PURPLE }) {
  return (
    <View style={{ backgroundColor: color + '15', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, marginTop: 16, marginBottom: 8 }}>
      <Text style={{ color, fontSize: 13, fontWeight: '800' }}>{title}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ManagerChecklistScreen({ route, navigation }) {
  const { patient_id, staff_id, booking_id, patient_name = 'Patient', staff_name = 'Staff' } = route.params || {};
  const currentUser = AuthService.getCurrentUser() || {};

  const [staffInitial, setStaffInitial] = useState('');

  // Patient Quality Care
  const [pc, setPc] = useState({
    hygienic_measures: '', mobility: '', diet: '', bedsores: '',
    grooming: '', dressings: '', catheter: '', peripheral_central_line: '', bed_bath: '',
  });

  // Staff Appearance
  const [sa, setSa] = useState({
    dress_code: '', uniform: '', shoes: '', card: '', hygiene: '', grooming: '',
  });

  // Staff Performance
  const [sp, setSp] = useState({
    with_family: '', with_patient: '', with_colleagues: '', punctuality: '',
    infection_control: '', care_plan_adherence: '', burnout_signs: '', emergency_protocols: '',
  });

  // Documentation
  const [doc, setDoc] = useState({
    care_plan_update: '', daily_records: '', mar_event_records: '',
  });

  // Manager section
  const [comments, setComments] = useState('');
  const [familyConcerns, setFamilyConcerns] = useState('');
  const [staffConcerns, setStaffConcerns] = useState('');

  // Signatures
  const [managerSig, setManagerSig] = useState(null);
  const [guardianSig, setGuardianSig] = useState(null);
  const [staffSig, setStaffSig] = useState(null);

  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitTime, setVisitTime] = useState(new Date().toTimeString().slice(0, 5));

  const [submitting, setSubmitting] = useState(false);

  const setPcField = (k) => (v) => setPc(prev => ({ ...prev, [k]: v }));
  const setSaField = (k) => (v) => setSa(prev => ({ ...prev, [k]: v }));
  const setSpField = (k) => (v) => setSp(prev => ({ ...prev, [k]: v }));
  const setDocField = (k) => (v) => setDoc(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!patient_id) {
      Alert.alert('Missing Patient', 'Please select a patient before submitting.');
      return;
    }
    if (!managerSig) {
      Alert.alert('Missing Signature', 'Manager signature is required.');
      return;
    }

    setSubmitting(true);
    const payload = {
      patient: patient_id,
      staff: staff_id || null,
      booking: booking_id || null,
      staff_initial: staffInitial,
      // Patient care
      pc_hygienic_measures: pc.hygienic_measures,
      pc_mobility: pc.mobility,
      pc_diet: pc.diet,
      pc_bedsores: pc.bedsores,
      pc_grooming: pc.grooming,
      pc_dressings: pc.dressings,
      pc_catheter: pc.catheter,
      pc_peripheral_central_line: pc.peripheral_central_line,
      pc_bed_bath: pc.bed_bath,
      // Staff appearance
      sa_dress_code: sa.dress_code,
      sa_uniform: sa.uniform,
      sa_shoes: sa.shoes,
      sa_card: sa.card,
      sa_hygiene: sa.hygiene,
      sa_grooming: sa.grooming,
      // Staff performance
      sp_with_family: sp.with_family,
      sp_with_patient: sp.with_patient,
      sp_with_colleagues: sp.with_colleagues,
      sp_punctuality: sp.punctuality,
      sp_infection_control: sp.infection_control,
      sp_care_plan_adherence: sp.care_plan_adherence,
      sp_burnout_signs: sp.burnout_signs,
      sp_emergency_protocols: sp.emergency_protocols,
      // Documentation
      doc_care_plan_update: doc.care_plan_update,
      doc_daily_records: doc.daily_records,
      doc_mar_event_records: doc.mar_event_records,
      // Manager section
      comments,
      family_concerns: familyConcerns,
      staff_concerns: staffConcerns,
      // Signatures
      manager_signature: managerSig,
      guardian_signature: guardianSig || null,
      staff_signature: staffSig || null,
      visit_date: visitDate,
      visit_time: visitTime,
    };

    const result = await QualityService.submitManagerChecklist(patient_id, payload);
    setSubmitting(false);

    if (result.success) {
      Alert.alert(
        'Checklist Submitted ✓',
        'Manager visit checklist saved. It will appear in the patient and staff profiles on the dashboard.',
        [{ text: 'Done', onPress: () => navigation.goBack() }],
      );
    } else {
      Alert.alert('Submission Error', result.error || 'Failed to submit. Please try again.');
    }
  };

  return (
    <SafeAreaView style={m.container} edges={['top', 'left', 'right', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={PURPLE} />

      {/* Header */}
      <View style={m.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12 }}>
          <Text style={{ color: WHITE, fontSize: 20 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={m.headerTitle}>Manager Home Visit Checklist</Text>
          <Text style={m.headerSub}>{patient_name} {staff_name ? `· ${staff_name}` : ''}</Text>
        </View>
      </View>

      <ScrollView style={m.body} keyboardShouldPersistTaps="handled">

        {/* Date / Time / Staff Initial */}
        <View style={m.row}>
          <View style={{ flex: 1 }}>
            <Text style={m.label}>Visit Date</Text>
            <TextInput style={m.input} value={visitDate} onChangeText={setVisitDate} placeholder="YYYY-MM-DD" placeholderTextColor={GREY} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={m.label}>Visit Time</Text>
            <TextInput style={m.input} value={visitTime} onChangeText={setVisitTime} placeholder="HH:MM" placeholderTextColor={GREY} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={m.label}>Staff Initial</Text>
            <TextInput style={m.input} value={staffInitial} onChangeText={setStaffInitial} placeholder="e.g. S.A." placeholderTextColor={GREY} />
          </View>
        </View>

        {/* ── Patient Quality Care ────────────────────────────────────────── */}
        <SectionHeader title="Patient Section — Quality Care" color="#0D9488" />
        <RemarksField label="Hygienic Measures" value={pc.hygienic_measures} onChange={setPcField('hygienic_measures')} />
        <RemarksField label="Mobility" value={pc.mobility} onChange={setPcField('mobility')} />
        <RemarksField label="Diet" value={pc.diet} onChange={setPcField('diet')} />
        <RemarksField label="Bedsores" value={pc.bedsores} onChange={setPcField('bedsores')} />
        <RemarksField label="Grooming" value={pc.grooming} onChange={setPcField('grooming')} />
        <RemarksField label="Dressings (peg / trach / wound)" value={pc.dressings} onChange={setPcField('dressings')} />
        <RemarksField label="NG / Foley's Catheter" value={pc.catheter} onChange={setPcField('catheter')} />
        <RemarksField label="Peripheral and Central Line" value={pc.peripheral_central_line} onChange={setPcField('peripheral_central_line')} />
        <RemarksField label="Bed Bath" value={pc.bed_bath} onChange={setPcField('bed_bath')} />

        {/* ── Staff Appearance ───────────────────────────────────────────── */}
        <SectionHeader title="Staff Section — Appearance" color="#7C3AED" />
        <RemarksField label="Dress Code" value={sa.dress_code} onChange={setSaField('dress_code')} />
        <RemarksField label="Uniform" value={sa.uniform} onChange={setSaField('uniform')} />
        <RemarksField label="Shoes" value={sa.shoes} onChange={setSaField('shoes')} />
        <RemarksField label="ID Card" value={sa.card} onChange={setSaField('card')} />
        <RemarksField label="Hygiene" value={sa.hygiene} onChange={setSaField('hygiene')} />
        <RemarksField label="Grooming" value={sa.grooming} onChange={setSaField('grooming')} />

        {/* ── Staff Performance ──────────────────────────────────────────── */}
        <SectionHeader title="Staff Performance" color="#D97706" />
        <RemarksField label="With Family" value={sp.with_family} onChange={setSpField('with_family')} />
        <RemarksField label="With Patient" value={sp.with_patient} onChange={setSpField('with_patient')} />
        <RemarksField label="With Senior & Junior" value={sp.with_colleagues} onChange={setSpField('with_colleagues')} />
        <RemarksField label="Punctuality & Attendance" value={sp.punctuality} onChange={setSpField('punctuality')} />
        <RemarksField label="Infection Control Practices" value={sp.infection_control} onChange={setSpField('infection_control')} />
        <RemarksField label="Adherence to Care Plan" value={sp.care_plan_adherence} onChange={setSpField('care_plan_adherence')} />
        <RemarksField label="Any Sign of Burnout" value={sp.burnout_signs} onChange={setSpField('burnout_signs')} />
        <RemarksField label="Emergency Protocols" value={sp.emergency_protocols} onChange={setSpField('emergency_protocols')} />

        {/* ── Documentation ──────────────────────────────────────────────── */}
        <SectionHeader title="Documentation" color="#059669" />
        <RemarksField label="Care Plan Update" value={doc.care_plan_update} onChange={setDocField('care_plan_update')} />
        <RemarksField label="Daily Records Accuracy" value={doc.daily_records} onChange={setDocField('daily_records')} />
        <RemarksField label="MAR / Event Records" value={doc.mar_event_records} onChange={setDocField('mar_event_records')} />

        {/* ── Manager's Section ──────────────────────────────────────────── */}
        <SectionHeader title="Manager's Section" color="#1E40AF" />
        <Text style={m.label}>Comments (if any)</Text>
        <TextInput style={[m.input, m.textarea]} value={comments} onChangeText={setComments} placeholder="Overall observations..." placeholderTextColor={GREY} multiline numberOfLines={3} />

        <Text style={m.label}>Family's Concerns</Text>
        <TextInput style={[m.input, m.textarea]} value={familyConcerns} onChangeText={setFamilyConcerns} placeholder="Concerns raised by family..." placeholderTextColor={GREY} multiline numberOfLines={3} />

        <Text style={m.label}>Staff's Concerns</Text>
        <TextInput style={[m.input, m.textarea]} value={staffConcerns} onChangeText={setStaffConcerns} placeholder="Concerns raised by staff..." placeholderTextColor={GREY} multiline numberOfLines={3} />

        {/* ── Signatures ─────────────────────────────────────────────────── */}
        <SectionHeader title="Signatures" color="#6D28D9" />
        <SignaturePad label="Manager's Signature" onSigned={setManagerSig} />
        <SignaturePad label="Guardian's Signature (optional)" onSigned={setGuardianSig} />
        <SignaturePad label="Staff Signature (optional)" onSigned={setStaffSig} />

        {/* Submit */}
        <TouchableOpacity
          style={[m.submitBtn, submitting && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting
            ? <ActivityIndicator color={WHITE} size="small" />
            : <Text style={m.submitText}>Submit Manager Checklist ✓</Text>}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const m = StyleSheet.create({
  container: { flex: 1, backgroundColor: WHITE },
  header: {
    backgroundColor: PURPLE, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20,
  },
  headerTitle: { color: WHITE, fontSize: 15, fontWeight: '800' },
  headerSub: { color: '#E0D4FB', fontSize: 11, marginTop: 1 },
  body: { flex: 1, padding: 16 },
  row: { flexDirection: 'row', marginBottom: 6 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 3, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 10,
    fontSize: 12, color: '#111827', backgroundColor: WHITE,
  },
  textarea: { height: 70, textAlignVertical: 'top' },
  submitBtn: { backgroundColor: PURPLE, borderRadius: 100, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  submitText: { color: WHITE, fontSize: 15, fontWeight: '800' },
});
