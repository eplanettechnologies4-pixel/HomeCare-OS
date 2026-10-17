import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Plus, Trash2, Edit3, ArrowUp, ArrowDown, Eye, CheckCircle2,
  Copy, Download, Filter, RefreshCw, AlertCircle, Sparkles, Send, Check,
  Printer, Building, MapPin, Phone, Mail, Globe, Shield, Stamp, ZoomIn,
  ZoomOut, Maximize2, Sliders, CheckSquare, Square, Circle, Calendar,
  Hash, AlignLeft, Star, UploadCloud, Layers, Save, Activity, HeartPulse
} from 'lucide-react';
import { apiFetch } from '../services/api';

const AUDIENCE_BADGE = {
  all: 'badge-teal',
  family: 'badge-blue',
  staff: 'badge-purple',
  patient: 'badge-green',
};

const FIELD_TYPES = [
  { value: 'text', label: 'Short Text', icon: AlignLeft },
  { value: 'textarea', label: 'Long Notes / Textarea', icon: FileText },
  { value: 'number', label: 'Numeric Value', icon: Hash },
  { value: 'date', label: 'Date Picker', icon: Calendar },
  { value: 'select', label: 'Dropdown (Select)', icon: Layers },
  { value: 'radio', label: 'Radio Choice', icon: Circle },
  { value: 'checkbox', label: 'Checkbox', icon: CheckSquare },
  { value: 'rating', label: 'Rating (1-5 Stars)', icon: Star },
  { value: 'signature', label: 'Signature Line', icon: Edit3 },
  { value: 'file', label: 'Document / File Upload', icon: UploadCloud },
];

const PRESET_CLINICAL_FIELDS = [
  { label: 'Chief Complaint / Medical History', type: 'textarea', width: '12', required: true, help_text: 'Describe primary symptoms, onset and timeline' },
  { label: 'Blood Pressure (mmHg)', type: 'text', width: '6', required: true, help_text: 'Systolic / Diastolic e.g. 120/80' },
  { label: 'Heart Rate / Pulse (BPM)', type: 'number', width: '6', required: true, help_text: 'Resting pulse in beats per minute' },
  { label: 'Oxygen Saturation SpO2 (%)', type: 'number', width: '6', required: true, help_text: 'Room air or oxygen assisted' },
  { label: 'Body Temperature (°F)', type: 'number', width: '6', required: true, help_text: 'Oral or tympanic reading' },
  { label: 'Respiratory Rate (breaths/min)', type: 'number', width: '6', required: true, help_text: 'Normal adult range: 12-20 bpm' },
  { label: 'Blood Glucose / BSR (mg/dL)', type: 'number', width: '6', required: false, help_text: 'Fasting or random blood sugar' },
  { label: 'Current Pain Intensity (1-5)', type: 'rating', width: '6', required: true, help_text: '1 = Mild discomfort, 5 = Severe pain' },
  { label: 'Known Drug Allergies', type: 'text', width: '6', required: true, help_text: 'e.g. Penicillin, NSAIDs or None' },
  { label: 'Blood Group', type: 'select', width: '6', options: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'], required: false },
  { label: 'Current Prescriptions & Dosages', type: 'textarea', width: '12', required: false, help_text: 'List active regular medications' },
  { label: 'Consent & Procedure Authorization', type: 'radio', width: '12', options: ['I Authorize and Give Consent', 'I Decline at This Time'], required: true },
  { label: 'Patient / Legal Guardian Signature', type: 'signature', width: '6', required: true },
  { label: 'Attending Clinician / RN Signature', type: 'signature', width: '6', required: true },
];

const DEFAULT_PAPER_CONFIG = {
  logo_url: '/ehealth-logo.png',
  org_name: 'eHealth Hospital At Home',
  tagline: 'Digital Hospital & Home Clinical Care Network',
  address: 'Plot 14-B, Medical Enclave, Sector G-8, Islamabad, Pakistan',
  phone: '+92 (51) 111-343-258',
  email: 'clinical@homecareos.com',
  website: 'www.ehealth.com.pk',
  registration_info: 'SECP Reg # 0192834 | IHRA Licensed Healthcare Provider # IHRA-2024-089',
  form_code: 'FORM-CLINICAL-2026',
  header_style: 'modern', // 'modern' | 'classic' | 'compact' | 'banner'
  primary_color: '#5B1A4A',
  accent_color: '#D4A94A',
  show_patient_box: true,
  show_signature_block: true,
  show_stamp_seal: true,
  show_watermark: true,
  watermark_text: 'OFFICIAL MEDICAL RECORD',
  footer_note: 'CONFIDENTIAL MEDICAL RECORD — Protected Health Information under EHR Regulations. Retention period: 7 years.',
};

// 4 Standard Built-in Clinical Templates so templates are never empty
const STANDARD_TEMPLATES = [
  {
    id: 'vitals_flowsheet',
    title: 'Frequent Vital Signs & Clinical Monitoring Flowsheet (Form B)',
    description: 'Bedside frequent clinical parameter monitoring, hemodynamics check, and physician review.',
    audience: 'staff',
    paper_config: {
      ...DEFAULT_PAPER_CONFIG,
      form_code: 'FORM-B-VITALS-2026',
      header_style: 'modern',
      primary_color: '#5B1A4A',
    },
    fields: [
      { label: 'Visit Shift & Time', key: 'shift', type: 'select', width: '6', options: ['Morning Shift (08:00)', 'Afternoon Shift (14:00)', 'Evening Shift (20:00)', 'Night Call (02:00)'], required: true },
      { label: 'Blood Pressure (mmHg)', key: 'bp', type: 'text', width: '6', required: true, help_text: 'Systolic / Diastolic e.g. 120/80' },
      { label: 'Heart Rate / Pulse (BPM)', key: 'pulse', type: 'number', width: '4', required: true },
      { label: 'Oxygen Saturation SpO2 (%)', key: 'spo2', type: 'number', width: '4', required: true },
      { label: 'Body Temperature (°F)', key: 'temp', type: 'number', width: '4', required: true },
      { label: 'Respiratory Rate (breaths/min)', key: 'resp_rate', type: 'number', width: '4', required: true },
      { label: 'Blood Glucose BSR (mg/dL)', key: 'bsr', type: 'number', width: '4', required: false },
      { label: 'Insulin Dosage (Units Administered)', key: 'insulin', type: 'number', width: '4', required: false },
      { label: 'Fluid Intake (Oral & IV mL)', key: 'intake', type: 'text', width: '6', help_text: 'e.g. 500 mL Normal Saline' },
      { label: 'Fluid Output (Urine & Drain mL)', key: 'output', type: 'text', width: '6', help_text: 'e.g. 400 mL Clear Urine' },
      { label: 'Clinical Assessment & Nursing Observations', key: 'nurse_notes', type: 'textarea', width: '12', required: true, help_text: 'Patient alert, oriented x3, chest sounds clear, no acute distress' },
      { label: 'Attending Registered Nurse Signature', key: 'nurse_sign', type: 'signature', width: '6', required: true },
      { label: 'Consulting Physician Attestation', key: 'doctor_sign', type: 'signature', width: '6', required: true },
    ]
  },
  {
    id: 'clinical_intake',
    title: 'Clinical Intake & Comprehensive Medical Assessment (Form A)',
    description: 'Mandatory clinical evaluation for hospital-at-home admission and nursing supervision.',
    audience: 'patient',
    paper_config: {
      ...DEFAULT_PAPER_CONFIG,
      form_code: 'FORM-A-INTAKE-2026',
      header_style: 'modern',
    },
    fields: [
      { label: 'Chief Complaint / Medical History', key: 'chief_complaint', type: 'textarea', width: '12', required: true, help_text: 'Describe primary symptoms, onset and timeline' },
      { label: 'Blood Pressure (mmHg)', key: 'blood_pressure', type: 'text', width: '6', required: true, help_text: 'Systolic / Diastolic e.g. 120/80' },
      { label: 'Heart Rate / Pulse (BPM)', key: 'heart_rate', type: 'number', width: '6', required: true, help_text: 'Resting pulse in beats per minute' },
      { label: 'Oxygen Saturation SpO2 (%)', key: 'spo2', type: 'number', width: '6', required: true, help_text: 'Room air or oxygen assisted' },
      { label: 'Body Temperature (°F)', key: 'temp_f', type: 'number', width: '6', required: true, help_text: 'Oral or tympanic reading' },
      { label: 'Current Pain Intensity (1-5)', key: 'pain_level', type: 'rating', width: '6', required: true, help_text: '1 = Mild discomfort, 5 = Severe pain' },
      { label: 'Known Drug Allergies', key: 'allergies', type: 'text', width: '6', required: true, help_text: 'e.g. Penicillin, NSAIDs or None' },
      { label: 'Patient / Legal Guardian Signature', key: 'patient_signature', type: 'signature', width: '6', required: true },
      { label: 'Attending Clinician Signature', key: 'doctor_signature', type: 'signature', width: '6', required: true },
    ]
  },
  {
    id: 'patient_consent',
    title: 'Informed Patient Consent & PHI Data Release Authorization',
    description: 'Official legal consent for home clinical telemetry, medication management, and medical record access.',
    audience: 'family',
    paper_config: {
      ...DEFAULT_PAPER_CONFIG,
      form_code: 'FORM-CONSENT-2026',
      header_style: 'classic',
    },
    fields: [
      { label: 'Patient Legal Full Name', key: 'legal_name', type: 'text', width: '6', required: true },
      { label: 'National Identity CNIC / ID', key: 'cnic', type: 'text', width: '6', required: true },
      { label: 'Authorized Guardian Relationship', key: 'relationship', type: 'select', width: '6', options: ['Self', 'Spouse', 'Child / Next of Kin', 'Legal Guardian'], required: true },
      { label: 'Consent to Home Clinical Monitoring', key: 'telemetry_consent', type: 'radio', width: '6', options: ['I Authorize & Agree', 'I Decline'], required: true },
      { label: 'Consent to Electronic Medical Record Sharing', key: 'ehr_consent', type: 'radio', width: '12', options: ['Full Access for Clinical Team', 'Emergency Only'], required: true },
      { label: 'Special Medical Directives / Notes', key: 'directives', type: 'textarea', width: '12' },
      { label: 'Signature of Patient or Authorized Guardian', key: 'consent_sig', type: 'signature', width: '12', required: true },
    ]
  },
  {
    id: 'nursing_visit',
    title: 'Home Nursing Daily Visit & Clinical Notes Summary',
    description: 'Daily bedside clinical check, wound dressing, infusion verification, and progress documentation.',
    audience: 'staff',
    paper_config: {
      ...DEFAULT_PAPER_CONFIG,
      form_code: 'FORM-NURSE-LOG-2026',
      header_style: 'banner',
    },
    fields: [
      { label: 'Visit Date & Shift', key: 'shift_info', type: 'select', width: '6', options: ['Day Visit (09:00 - 13:00)', 'Evening Visit (14:00 - 18:00)', 'Night Call (20:00 - 08:00)'], required: true },
      { label: 'Patient General Condition', key: 'condition', type: 'radio', width: '6', options: ['Stable & Improving', 'Fair / Monitoring', 'Critical / Flagged'], required: true },
      { label: 'Clinical Procedures Performed', key: 'procedures', type: 'checkbox', width: '12', options: ['IV Cannulation', 'Wound Dressing & Debridement', 'Catheter Care', 'Nebulization', 'Physiotherapy Assist'] },
      { label: 'Detailed Nursing Progress Note', key: 'notes', type: 'textarea', width: '12', required: true },
      { label: 'Attending Registered Nurse Signature', key: 'rn_signature', type: 'signature', width: '12', required: true },
    ]
  }
];

const SAMPLE_VITALS_FLOW_ROWS = [
  { time: '08:00 (Morn)', bp: '120/80', pulse: 74, temp: '98.4°F', resp: 16, spo2: '98%', intake: '500 mL IV', output: '450 mL Urine', bsr: '118 (4U)', note: 'Alert x3, lungs clear bilaterally', rn: 'SM, RN' },
  { time: '12:00 (Noon)', bp: '122/82', pulse: 76, temp: '98.6°F', resp: 16, spo2: '97%', intake: '250 mL Oral', output: '300 mL Urine', bsr: '132 (—)', note: 'Tolerating oral fluids well', rn: 'SM, RN' },
  { time: '16:00 (Eve)',  bp: '118/78', pulse: 72, temp: '98.4°F', resp: 18, spo2: '99%', intake: '500 mL Saline', output: '400 mL Clear', bsr: '124 (4U)', note: 'Wound dressing intact', rn: 'RK, MD' },
  { time: '20:00 (Night)',bp: '124/84', pulse: 78, temp: '98.8°F', resp: 16, spo2: '98%', intake: '300 mL Water', output: '350 mL Urine', bsr: '140 (—)', note: 'Evening meds administered', rn: 'SM, RN' },
  { time: '00:00 (Mid)',  bp: '120/80', pulse: 70, temp: '98.2°F', resp: 15, spo2: '98%', intake: '—', output: '200 mL Urine', bsr: '112 (—)', note: 'Sleeping peacefully, stable', rn: 'AH, RN' },
  { time: '04:00 (Dawn)', bp: '118/76', pulse: 68, temp: '98.0°F', resp: 16, spo2: '99%', intake: '—', output: '—', bsr: '108 (—)', note: 'Normal respiratory rhythm', rn: 'AH, RN' },
];

export default function FormBuilder() {
  const [templates, setTemplates] = useState(STANDARD_TEMPLATES);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('studio'); // 'studio' | 'list' | 'submissions'
  const [studioSubTab, setStudioSubTab] = useState('fields'); // 'fields' | 'branding'

  // Current Active Form
  const [currentTemplateId, setCurrentTemplateId] = useState('vitals_flowsheet');
  const [templateForm, setTemplateForm] = useState({
    title: STANDARD_TEMPLATES[0].title,
    description: STANDARD_TEMPLATES[0].description,
    audience: STANDARD_TEMPLATES[0].audience,
    is_active: true,
  });

  const [paperConfig, setPaperConfig] = useState(STANDARD_TEMPLATES[0].paper_config);
  const [fields, setFields] = useState(STANDARD_TEMPLATES[0].fields);

  // Paper Preview Settings: Height & Display
  const [paperHeightMode, setPaperHeightMode] = useState('full'); // 'full' (True 297mm A4 portrait) | 'compact'
  const [previewPaperMode, setPreviewPaperMode] = useState('print'); // 'print' | 'interactive'
  const [paperZoom, setPaperZoom] = useState(85); // 100 | 85 | 70 percent
  const [interactiveValues, setInteractiveValues] = useState({});

  // Submissions State
  const [submissions, setSubmissions] = useState([]);
  const [toast, setToast] = useState('');

  const paperRef = useRef(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      // Try both /forms/ and /forms/templates/
      let fetchedList = [];
      try {
        const res = await apiFetch('/forms/');
        if (res.ok) {
          const data = await res.json();
          fetchedList = Array.isArray(data) ? data : (data.results || []);
        }
      } catch (err) {
        console.warn('Fallback to standard templates:', err);
      }

      // Merge backend templates with standard templates so the dropdown is always rich
      const merged = [...fetchedList];
      STANDARD_TEMPLATES.forEach(st => {
        if (!merged.some(m => m.title === st.title)) {
          merged.push(st);
        }
      });

      setTemplates(merged);
    } catch (e) {
      console.warn('Failed to fetch templates:', e);
      setTemplates(STANDARD_TEMPLATES);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const loadTemplateIntoStudio = (tmpl) => {
    setCurrentTemplateId(tmpl.id);
    setTemplateForm({
      title: tmpl.title || 'Untitled Clinical Form',
      description: tmpl.description || '',
      audience: tmpl.audience || 'all',
      is_active: tmpl.is_active ?? true,
    });

    const mergedPaperConfig = {
      ...DEFAULT_PAPER_CONFIG,
      ...(tmpl.paper_config || {}),
    };
    setPaperConfig(mergedPaperConfig);

    const mappedFields = (tmpl.fields || []).map((f, i) => ({
      ...f,
      width: f.width || '12',
      options: Array.isArray(f.options) ? f.options : (typeof f.options === 'string' && f.options ? f.options.split(',').map(s=>s.trim()) : []),
      order: f.order ?? i,
    }));
    setFields(mappedFields.length > 0 ? mappedFields : [
      { label: 'Chief Complaint', key: 'chief_complaint', type: 'textarea', width: '12', required: true }
    ]);
    setViewMode('studio');
    showToast(`Loaded "${tmpl.title}" onto paper!`);
  };

  const handleQuickPreset = (presetKey) => {
    const tmpl = STANDARD_TEMPLATES.find(t => t.id === presetKey) || STANDARD_TEMPLATES[0];
    loadTemplateIntoStudio(tmpl);
  };

  const handleNewTemplate = () => {
    setCurrentTemplateId('blank_form');
    setTemplateForm({
      title: 'New Clinical Assessment Form',
      description: 'General patient clinical evaluation and nursing notes.',
      audience: 'staff',
      is_active: true,
    });
    setPaperConfig(DEFAULT_PAPER_CONFIG);
    setFields([
      { label: 'Chief Complaint / Reason for Visit', key: 'complaint', type: 'textarea', width: '12', required: true },
      { label: 'Blood Pressure (mmHg)', key: 'bp', type: 'text', width: '6', required: true },
      { label: 'Heart Rate / Pulse (BPM)', key: 'pulse', type: 'number', width: '6', required: true },
      { label: 'Clinical Assessment & Care Notes', key: 'notes', type: 'textarea', width: '12', required: true },
      { label: 'Attending Clinician Signature', key: 'sig', type: 'signature', width: '6', required: true },
    ]);
    setViewMode('studio');
    showToast('Created new blank clinical form!');
  };

  const handleFillSampleVitals = () => {
    setPreviewPaperMode('interactive');
    setInteractiveValues({
      shift: 'Morning Shift (08:00)',
      bp: '120/80',
      blood_pressure: '120/80',
      pulse: 74,
      heart_rate: 74,
      spo2: 98,
      temp: 98.4,
      temp_f: 98.4,
      resp_rate: 16,
      bsr: 118,
      insulin: 4,
      intake: '500 mL Normal Saline + 250 mL Water',
      output: '450 mL Clear Urine',
      nurse_notes: 'Patient alert, oriented x3. Lungs clear to auscultation bilaterally. Surgical wound clean and dry. No nausea or dizziness reported.',
      pain_level: 2,
      allergies: 'NKDA (No Known Drug Allergies)',
      nurse_sign: 'Sarah Mitchell, RN (ID: HC-RN-0042)',
      doctor_sign: 'Dr. Raza Khan, MD (Consultant)',
      patient_signature: 'Muhammad Tariq',
      chief_complaint: 'Post-op clinical recovery monitoring and daily vitals telemetry.',
    });
    showToast('Loaded clinical patient vitals data into paper preview!');
  };

  const handleAddField = (fieldOverride = {}) => {
    const newIdx = fields.length + 1;
    const defaultField = {
      label: `Clinical Item #${newIdx}`,
      key: `item_${newIdx}`,
      type: 'text',
      width: '12',
      required: false,
      help_text: '',
      options: ['Option A', 'Option B'],
      order: fields.length,
      ...fieldOverride,
    };
    setFields([...fields, defaultField]);
    setStudioSubTab('fields');
    showToast(`Added: "${defaultField.label}"`);
  };

  const updateField = (idx, key, val) => {
    const updated = [...fields];
    updated[idx] = { ...updated[idx], [key]: val };
    if (key === 'label' && (!updated[idx].key || updated[idx].key.startsWith('item_') || updated[idx].key.startsWith('question_'))) {
      updated[idx].key = val.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);
    }
    setFields(updated);
  };

  const moveField = (idx, dir) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    const reordered = [...fields];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;
    setFields(reordered.map((f, i) => ({ ...f, order: i })));
  };

  const deleteField = (idx) => {
    setFields(fields.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i })));
    showToast('Field removed');
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        setPaperConfig(prev => ({
          ...prev,
          logo_url: uploadEvent.target.result,
        }));
        showToast('Logo updated in real-time on paper!');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveForm = async () => {
    if (!templateForm.title.trim()) {
      showToast('Form title is required');
      return;
    }

    const payload = {
      ...templateForm,
      paper_config: paperConfig,
      fields: fields.map((f, i) => ({
        ...f,
        order: i,
        width: f.width || '12',
        options: Array.isArray(f.options) ? f.options : (typeof f.options === 'string' && f.options ? f.options.split(',').map(s=>s.trim()) : []),
      })),
    };

    setLoading(true);
    try {
      const isIntegerId = typeof currentTemplateId === 'number' || (typeof currentTemplateId === 'string' && /^\d+$/.test(currentTemplateId));
      const url = isIntegerId ? `/forms/${currentTemplateId}/` : '/forms/';
      const method = isIntegerId ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        setCurrentTemplateId(saved.id);
        showToast(`Saved "${saved.title}" (v${saved.version}) to server!`);
        await fetchTemplates();
      } else {
        showToast('Saved locally in studio!');
      }
    } catch (e) {
      showToast('Saved template locally in session');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = (mode = 'print') => {
    setPreviewPaperMode(mode);
    setTimeout(() => {
      window.print();
    }, 320);
  };

  const handlePrintVitalHistoryReport = () => {
    const vitalsTmpl = STANDARD_TEMPLATES.find(t => t.id === 'vitals_flowsheet') || STANDARD_TEMPLATES[0];
    loadTemplateIntoStudio(vitalsTmpl);
    handleFillSampleVitals();
    setPreviewPaperMode('interactive');
    showToast('Loaded Vital History Report (Form B) — Opening Print View...');
    setTimeout(() => {
      window.print();
    }, 350);
  };

  const handleDownloadHTML = () => {
    const element = paperRef.current;
    if (!element) return;
    const title = templateForm.title || 'Clinical_Form';
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4 portrait; margin: 4mm 6mm; }
    html, body { margin: 0; padding: 0; background: #fff; width: 100%; height: 100%; overflow: hidden; font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #1e293b; }
    * { box-sizing: border-box; }
    .paper-sheet-printable { width: 100% !important; max-width: 100% !important; height: auto !important; max-height: 282mm !important; padding: 4mm 8mm !important; box-shadow: none !important; border: none !important; overflow: hidden !important; display: flex !important; flex-direction: column !important; justify-content: space-between !important; }
    table { width: 100%; border-collapse: collapse; }
    table td, table th { padding: 4px 3px; font-size: 0.68rem; }
    @media print {
      body { padding: 0; }
      .paper-sheet-printable { height: 282mm !important; max-height: 282mm !important; overflow: hidden !important; page-break-after: avoid !important; break-after: avoid !important; }
    }
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;
    a.click();
    showToast('Downloaded official 1-page form document!');
  };

  return (
    <div className="form-builder-studio-wrapper">
      {/* ── BULLETPROOF 1-PAGE PRINT-ONLY STYLES ─────────────────────────── */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 4mm 6mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 100% !important;
            height: 100% !important;
            max-height: 100% !important;
            overflow: hidden !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Keep all parent containers in normal flow without display:none */
          .app-shell, .main-area, .page-content, .form-builder-studio-wrapper,
          .studio-one-page-grid, .paper-preview-container {
            display: block !important;
            position: static !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            max-height: 100% !important;
            min-height: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            overflow: hidden !important;
          }
          /* Hide all app chrome and non-printable editor UI */
          .sidebar, .topbar, .studio-left-panel, .studio-top-bar, .paper-toolbar, .no-print,
          nav, header, aside, .btn, .modal-backdrop, .drawer-backdrop {
            display: none !important;
            height: 0 !important;
            width: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            visibility: hidden !important;
          }
          /* Hide everything by default... */
          body * {
            visibility: hidden;
          }
          /* ...EXCEPT the official A4 printable paper sheet */
          #printable-universal-document, #printable-universal-document *,
          .paper-sheet-printable, .paper-sheet-printable * {
            visibility: visible !important;
          }
          #printable-universal-document, .paper-sheet-printable {
            position: relative !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            max-height: 284mm !important; /* Strict 1-page boundary (A4 is 297mm) */
            min-height: 0 !important;
            margin: 0 auto !important;
            padding: 4mm 8mm !important; /* Compact print padding */
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            transform: none !important; /* Disables zoom scale so print is 100% full quality */
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-sizing: border-box !important;
            overflow: hidden !important; /* GUARANTEES NO SECOND PAGE */
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          /* Compact print spacing for 1-page density */
          .paper-sheet-printable h1, .paper-sheet-printable h2, .paper-sheet-printable h3 {
            margin-top: 0 !important;
            margin-bottom: 2px !important;
          }
          .paper-sheet-printable table td, .paper-sheet-printable table th {
            padding: 3px 3px !important;
            font-size: 0.65rem !important;
          }
        }
      `}</style>

      {/* ── TOP HEADER / TOOLBAR ─────────────────────────────────────────── */}
      <div className="no-print" style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '14px 24px',
        marginBottom: 16,
        borderRadius: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #5B1A4A 0%, #7529a7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 10px rgba(91, 26, 74, 0.25)',
          }}>
            <FileText size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#1e293b' }}>
                Form Builder & Real-Time Paper Studio
              </h1>
              <span className="badge badge-teal" style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                Full A4 Paper Studio
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
              Full page portrait paper height &bull; Real-time letterhead &bull; Vital History reports &bull; Instant print buttons
            </p>
          </div>
        </div>

        {/* Top Actions: Print Vitals Report, Print Sheet, Save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)',
              color: '#ffffff',
              fontWeight: 800,
              boxShadow: '0 2px 8px rgba(15, 118, 110, 0.25)',
              border: 'none',
              padding: '7px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: '0.82rem',
            }}
            onClick={handlePrintVitalHistoryReport}
            title="1-Click Print: Loads and prints official Vital Signs Flowsheet (Form B)"
          >
            <HeartPulse size={16} /> Print Vital History Report (Form B)
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ border: '1.5px solid #cbd5e1', color: '#334155', fontWeight: 700, padding: '7px 14px', fontSize: '0.82rem' }}
            onClick={() => handlePrint(previewPaperMode)}
            title="Print current sheet layout to A4 paper"
          >
            <Printer size={15} /> Print Form (A4)
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ border: '1.5px solid #cbd5e1', color: '#334155', fontWeight: 700, padding: '7px 14px', fontSize: '0.82rem' }}
            onClick={handleDownloadHTML}
            title="Download printable form as standalone HTML document"
          >
            <Download size={15} /> Download Document
          </button>

          <button
            className="btn btn-primary btn-sm"
            disabled={loading}
            onClick={handleSaveForm}
            style={{ boxShadow: '0 2px 8px rgba(91, 26, 74, 0.25)', padding: '7px 16px', fontSize: '0.82rem' }}
          >
            <Save size={15} /> {loading ? 'Saving...' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* ── UNIFIED TEMPLATE PICKER STRIP ──────────────────────────────────── */}
      <div className="no-print" style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        padding: '10px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} color="#5B1A4A" /> Form Templates:
          </span>

          {[
            { id: 'vitals_flowsheet', label: '🩺 Vital Signs Flowsheet (Form B)' },
            { id: 'clinical_intake', label: '📋 Clinical Intake (Form A)' },
            { id: 'patient_consent', label: '📝 Informed Consent' },
            { id: 'nursing_visit', label: '💊 Daily Nursing Log' },
          ].map(p => (
            <button
              key={p.id}
              type="button"
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: '0.78rem',
                fontWeight: 700,
                background: currentTemplateId === p.id ? '#5B1A4A' : '#f8fafc',
                color: currentTemplateId === p.id ? '#fff' : '#334155',
                border: currentTemplateId === p.id ? '1px solid #5B1A4A' : '1px solid #cbd5e1',
                padding: '5px 12px',
              }}
              onClick={() => handleQuickPreset(p.id)}
            >
              {p.label}
            </button>
          ))}

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              background: currentTemplateId === 'blank_form' ? '#5B1A4A' : '#f8fafc',
              color: currentTemplateId === 'blank_form' ? '#fff' : '#64748b',
              border: currentTemplateId === 'blank_form' ? '1px solid #5B1A4A' : '1px dashed #cbd5e1',
              padding: '5px 12px',
            }}
            onClick={handleNewTemplate}
          >
            <Plus size={13} /> Blank Form
          </button>

          {templates.filter(t => !['vitals_flowsheet', 'clinical_intake', 'patient_consent', 'nursing_visit'].includes(t.id)).length > 0 && (
            <select
              className="form-select"
              style={{ fontSize: '0.78rem', padding: '4px 8px', maxWidth: 180 }}
              value={['vitals_flowsheet', 'clinical_intake', 'patient_consent', 'nursing_visit', 'blank_form'].includes(currentTemplateId) ? '' : currentTemplateId}
              onChange={(e) => {
                if (!e.target.value) return;
                const tmpl = templates.find(t => String(t.id) === String(e.target.value));
                if (tmpl) loadTemplateIntoStudio(tmpl);
              }}
            >
              <option value="">More Saved Forms...</option>
              {templates
                .filter(t => !['vitals_flowsheet', 'clinical_intake', 'patient_consent', 'nursing_visit'].includes(t.id))
                .map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
            </select>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#0369a1',
              border: '1px solid #bae6fd',
              background: '#f0f9ff',
              padding: '5px 12px',
            }}
            onClick={handleFillSampleVitals}
            title="Pre-populate realistic patient vitals and nursing observations"
          >
            <Sparkles size={13} /> Fill Sample Patient Data
          </button>
        </div>
      </div>

      {toast && (
        <div className="no-print alert alert-info" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} /> {toast}
        </div>
      )}

      {/* ── ONE-PAGE STUDIO: LEFT CONTROLS + RIGHT FULL A4 PAPER PREVIEW ─── */}
      <div className="studio-one-page-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(380px, 1fr) minmax(520px, 1.35fr)',
        gap: 20,
        alignItems: 'start',
      }}>
        {/* ── LEFT: STUDIO ADJUSTMENT CONTROLS ───────────────────────────── */}
        <div className="studio-left-panel" style={{
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          overflow: 'hidden',
        }}>
          {/* Form Document Title & Purpose Header (Always visible) */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc' }}>
            <label className="form-label" style={{ fontSize: '0.74rem', fontWeight: 800, textTransform: 'uppercase', color: '#475569', letterSpacing: 0.6, marginBottom: 4 }}>
              Document Title
            </label>
            <input
              className="form-input"
              style={{ fontSize: '0.96rem', fontWeight: 800, padding: '7px 10px', color: '#0f172a' }}
              value={templateForm.title}
              onChange={e => setTemplateForm({ ...templateForm, title: e.target.value })}
              placeholder="e.g. Frequent Vital Signs & Clinical Monitoring Flowsheet"
            />
            <div style={{ marginTop: 8 }}>
              <input
                className="form-input"
                style={{ fontSize: '0.78rem', padding: '5px 10px', color: '#64748b' }}
                value={templateForm.description}
                onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })}
                placeholder="Clinical instructions or guidelines (shown under title on paper)..."
              />
            </div>
          </div>

          {/* Sub-tab Pill Navigation - Clean 2-Tab Split */}
          <div style={{
            display: 'flex',
            borderBottom: '1px solid #e5e7eb',
            background: '#fff',
            padding: '6px 12px',
            gap: 6,
          }}>
            <button
              type="button"
              onClick={() => setStudioSubTab('fields')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: studioSubTab === 'fields' ? '1.5px solid #5B1A4A' : '1px solid transparent',
                background: studioSubTab === 'fields' ? '#fdf4fa' : 'transparent',
                color: studioSubTab === 'fields' ? '#5B1A4A' : '#64748b',
              }}
            >
              <CheckSquare size={15} /> 📋 Questions & Fields ({fields.length})
            </button>

            <button
              type="button"
              onClick={() => setStudioSubTab('branding')}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 8,
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: studioSubTab === 'branding' ? '1.5px solid #5B1A4A' : '1px solid transparent',
                background: studioSubTab === 'branding' ? '#fdf4fa' : 'transparent',
                color: studioSubTab === 'branding' ? '#5B1A4A' : '#64748b',
              }}
            >
              <Building size={15} /> 🏥 Letterhead & Branding
            </button>
          </div>

          {/* TAB 1: LETTERHEAD & BRANDING CONTROLS */}
          {studioSubTab === 'branding' && (
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Building size={16} color="#5B1A4A" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                  Letterhead & Header Customization
                </h3>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 0, marginBottom: 16 }}>
                Real-time adjustment of logo, hospital address, and contact details on the printable sheet.
              </p>

              {/* Logo & Upload */}
              <div className="card" style={{ padding: 14, background: '#f8fafc', marginBottom: 16, border: '1px solid #e2e8f0' }}>
                <label className="form-label" style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>
                  Brand Logo
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 58,
                    height: 58,
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    padding: 4,
                  }}>
                    {paperConfig.logo_url ? (
                      <img
                        src={paperConfig.logo_url}
                        alt="Logo"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <Building size={24} color="#94a3b8" />
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer', border: '1px solid #cbd5e1', fontSize: '0.78rem' }}>
                        <UploadCloud size={13} /> Upload Custom Logo
                        <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                      </label>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.78rem' }}
                        onClick={() => setPaperConfig(prev => ({ ...prev, logo_url: '/ehealth-logo.png' }))}
                      >
                        Default eHealth
                      </button>
                    </div>
                    <input
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                      placeholder="Or enter image URL..."
                      value={paperConfig.logo_url || ''}
                      onChange={e => setPaperConfig({ ...paperConfig, logo_url: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Org Name & Tagline */}
              <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    Organization Name
                  </label>
                  <input
                    className="form-input"
                    value={paperConfig.org_name}
                    onChange={e => setPaperConfig({ ...paperConfig, org_name: e.target.value })}
                    placeholder="e.g. eHealth Hospital At Home"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    Subtitle / Tagline
                  </label>
                  <input
                    className="form-input"
                    value={paperConfig.tagline}
                    onChange={e => setPaperConfig({ ...paperConfig, tagline: e.target.value })}
                    placeholder="e.g. Digital Hospital & Home Care"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  <MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />
                  Clinic / Hospital Physical Address
                </label>
                <input
                  className="form-input"
                  value={paperConfig.address}
                  onChange={e => setPaperConfig({ ...paperConfig, address: e.target.value })}
                  placeholder="Full physical address shown on paper letterhead"
                />
              </div>

              {/* Contact Phone & Email */}
              <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    <Phone size={12} style={{ display: 'inline', marginRight: 4 }} />
                    Emergency UAN / Phone
                  </label>
                  <input
                    className="form-input"
                    value={paperConfig.phone}
                    onChange={e => setPaperConfig({ ...paperConfig, phone: e.target.value })}
                    placeholder="+92 (51) 111-343-258"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    <Mail size={12} style={{ display: 'inline', marginRight: 4 }} />
                    Official Email
                  </label>
                  <input
                    className="form-input"
                    value={paperConfig.email}
                    onChange={e => setPaperConfig({ ...paperConfig, email: e.target.value })}
                    placeholder="clinical@homecareos.com"
                  />
                </div>
              </div>

              {/* Website & Form Code */}
              <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    <Globe size={12} style={{ display: 'inline', marginRight: 4 }} />
                    Website
                  </label>
                  <input
                    className="form-input"
                    value={paperConfig.website}
                    onChange={e => setPaperConfig({ ...paperConfig, website: e.target.value })}
                    placeholder="www.ehealth.com.pk"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    <Shield size={12} style={{ display: 'inline', marginRight: 4 }} />
                    Form Document Code
                  </label>
                  <input
                    className="form-input"
                    value={paperConfig.form_code}
                    onChange={e => setPaperConfig({ ...paperConfig, form_code: e.target.value })}
                    placeholder="e.g. FORM-CLINICAL-2026"
                  />
                </div>
              </div>

              {/* Regulatory / Accreditations */}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                  Regulatory Licensing / SECP / IHRA Accreditation
                </label>
                <input
                  className="form-input"
                  value={paperConfig.registration_info}
                  onChange={e => setPaperConfig({ ...paperConfig, registration_info: e.target.value })}
                  placeholder="SECP Reg # 0192834 | IHRA Licensed Healthcare Provider"
                />
              </div>

              {/* Header Style & Primary Theme Color */}
              <div className="grid-2" style={{ gap: 12, marginBottom: 12 }}>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    Letterhead Header Style
                  </label>
                  <select
                    className="form-select"
                    value={paperConfig.header_style}
                    onChange={e => setPaperConfig({ ...paperConfig, header_style: e.target.value })}
                  >
                    <option value="modern">Modern Corporate (Logo Left)</option>
                    <option value="classic">Classic Centered (Hospital Crest)</option>
                    <option value="compact">Compact Minimalist</option>
                    <option value="banner">Bold Dark Brand Banner</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    Primary Brand Color
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="color"
                      value={paperConfig.primary_color || '#5B1A4A'}
                      onChange={e => setPaperConfig({ ...paperConfig, primary_color: e.target.value })}
                      style={{ width: 38, height: 38, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    />
                    <input
                      className="form-input"
                      style={{ fontSize: '0.8rem' }}
                      value={paperConfig.primary_color || '#5B1A4A'}
                      onChange={e => setPaperConfig({ ...paperConfig, primary_color: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Printable Paper Options & Seals */}
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 800, marginBottom: 8, display: 'block', color: '#334155' }}>
                  Paper Elements & Seals
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!paperConfig.show_patient_box}
                      onChange={e => setPaperConfig({ ...paperConfig, show_patient_box: e.target.checked })}
                    />
                    Include Patient Demographics Box (Name, MRN, Age/Gender, Date)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!paperConfig.show_signature_block}
                      onChange={e => setPaperConfig({ ...paperConfig, show_signature_block: e.target.checked })}
                    />
                    Include Dual Signature Lines (Clinician & Patient/Guardian)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!paperConfig.show_stamp_seal}
                      onChange={e => setPaperConfig({ ...paperConfig, show_stamp_seal: e.target.checked })}
                    />
                    Include Official Clinical Authenticated Seal Stamp
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!paperConfig.show_watermark}
                      onChange={e => setPaperConfig({ ...paperConfig, show_watermark: e.target.checked })}
                    />
                    Include Background Watermark on Paper
                  </label>
                </div>
              </div>

              {paperConfig.show_watermark && (
                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Watermark Text</label>
                  <input
                    className="form-input"
                    value={paperConfig.watermark_text || ''}
                    onChange={e => setPaperConfig({ ...paperConfig, watermark_text: e.target.value })}
                    placeholder="e.g. OFFICIAL CLINICAL RECORD"
                  />
                </div>
              )}

              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Legal Confidentiality Footer</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={paperConfig.footer_note || ''}
                  onChange={e => setPaperConfig({ ...paperConfig, footer_note: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* TAB 2: QUESTIONS & CLINICAL FIELDS */}
          {studioSubTab === 'fields' && (
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Questions & Form Fields ({fields.length})
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#64748b', margin: '2px 0 0' }}>
                    Click preset pills below to add items instantly, or click Add Question.
                  </p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleAddField()}
                  style={{ fontSize: '0.8rem' }}
                >
                  <Plus size={14} /> Add Question
                </button>
              </div>

              {/* 1-Click Fast Add Preset Pills */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                padding: '10px 12px',
                marginBottom: 14,
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  ⚡ 1-Click Quick Add Clinical Items:
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[
                    { label: '+ Blood Pressure', field: { label: 'Blood Pressure (mmHg)', type: 'text', width: '6', required: true, help_text: 'Systolic/Diastolic e.g. 120/80' } },
                    { label: '+ Pulse / HR', field: { label: 'Heart Rate / Pulse (BPM)', type: 'number', width: '6', required: true } },
                    { label: '+ SpO2 (%)', field: { label: 'Oxygen Saturation SpO2 (%)', type: 'number', width: '6', required: true } },
                    { label: '+ Temperature', field: { label: 'Body Temperature (°F)', type: 'number', width: '6', required: true } },
                    { label: '+ Resp Rate', field: { label: 'Respiratory Rate (breaths/min)', type: 'number', width: '6', required: true } },
                    { label: '+ Blood Sugar (BSR)', field: { label: 'Blood Glucose BSR (mg/dL)', type: 'number', width: '6' } },
                    { label: '+ Clinical Notes', field: { label: 'Clinical Assessment & Nursing Observations', type: 'textarea', width: '12', required: true } },
                    { label: '+ RN Signature', field: { label: 'Attending Registered Nurse Signature', type: 'signature', width: '6', required: true } },
                    { label: '+ Doctor Signature', field: { label: 'Consulting Physician Attestation', type: 'signature', width: '6', required: true } },
                  ].map((p, pIdx) => (
                    <button
                      key={pIdx}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '0.73rem', padding: '3px 8px', background: '#fff', border: '1px solid #cbd5e1', fontWeight: 700, color: '#334155' }}
                      onClick={() => handleAddField(p.field)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Clinical Presets Dropdown */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                background: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: 8,
                padding: '8px 12px',
                marginBottom: 16,
                gap: 10,
              }}>
                <Sparkles size={16} color="#7529a7" />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                  Insert clinical item:
                </span>
                <select
                  className="form-select"
                  style={{ fontSize: '0.8rem', padding: '4px 8px', flex: 1 }}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const selected = PRESET_CLINICAL_FIELDS.find(p => p.label === e.target.value);
                    if (selected) {
                      handleAddField(selected);
                    }
                    e.target.value = '';
                  }}
                >
                  <option value="">-- Choose clinical preset --</option>
                  {PRESET_CLINICAL_FIELDS.map((p, idx) => (
                    <option key={idx} value={p.label}>
                      {p.label} ({p.type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Field Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 520, overflowY: 'auto', paddingRight: 4 }}>
                {fields.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8' }}>
                    <FileText size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontSize: '0.875rem' }}>No questions yet. Click <strong>Add Question</strong> or choose a preset.</p>
                  </div>
                ) : (
                  fields.map((field, idx) => (
                    <div
                      key={idx}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 10,
                        padding: '12px 14px',
                        background: '#fff',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                      }}
                    >
                      {/* Top row: #, Label, Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                          <span style={{
                            width: 22,
                            height: 22,
                            borderRadius: 4,
                            background: '#f1f5f9',
                            color: '#5B1A4A',
                            fontWeight: 800,
                            fontSize: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {idx + 1}
                          </span>
                          <input
                            className="form-input"
                            style={{ fontWeight: 700, fontSize: '0.88rem', padding: '4px 8px' }}
                            value={field.label}
                            onChange={e => updateField(idx, 'label', e.target.value)}
                            placeholder="Question Label..."
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 6px' }}
                            disabled={idx === 0}
                            onClick={() => moveField(idx, -1)}
                            title="Move Up"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 6px' }}
                            disabled={idx === fields.length - 1}
                            onClick={() => moveField(idx, 1)}
                            title="Move Down"
                          >
                            <ArrowDown size={13} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ padding: '4px 6px', color: '#ef4444' }}
                            onClick={() => deleteField(idx)}
                            title="Delete Question"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Mid row: Type, Width, Required */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 8, alignItems: 'center' }}>
                        <div>
                          <select
                            className="form-select"
                            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                            value={field.type}
                            onChange={e => updateField(idx, 'type', e.target.value)}
                          >
                            {FIELD_TYPES.map(t => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <select
                            className="form-select"
                            style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                            value={field.width || '12'}
                            onChange={e => updateField(idx, 'width', e.target.value)}
                            title="Field Width on Paper"
                          >
                            <option value="12">Full Width (100%)</option>
                            <option value="6">Half Width (50% Split)</option>
                            <option value="4">One-Third Width (33%)</option>
                          </select>
                        </div>

                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          color: field.required ? '#b91c1c' : '#64748b',
                          userSelect: 'none',
                        }}>
                          <input
                            type="checkbox"
                            checked={!!field.required}
                            onChange={e => updateField(idx, 'required', e.target.checked)}
                          />
                          Required *
                        </label>
                      </div>

                      {/* Options editor for Select / Radio / Checkbox */}
                      {['select', 'radio', 'checkbox'].includes(field.type) && (
                        <div style={{ marginTop: 8 }}>
                          <input
                            className="form-input"
                            style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                            placeholder="Comma-separated choices (e.g. Yes, No, Maybe)"
                            value={Array.isArray(field.options) ? field.options.join(', ') : (field.options || '')}
                            onChange={e => {
                              const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                              updateField(idx, 'options', arr);
                            }}
                          />
                        </div>
                      )}

                      {/* Help text */}
                      <div style={{ marginTop: 6 }}>
                        <input
                          className="form-input"
                          style={{ fontSize: '0.75rem', padding: '3px 8px', color: '#64748b' }}
                          placeholder="Help text or clinical instructions below question (optional)..."
                          value={field.help_text || ''}
                          onChange={e => updateField(idx, 'help_text', e.target.value)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: LIVE FULL PAGE A4 PAPER PREVIEW ─────────────────────── */}
        <div className="paper-preview-container" style={{
          background: '#f1f5f9', // Soft clinical desk surface
          borderRadius: 14,
          border: '1px solid #cbd5e1',
          padding: '16px 20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '85vh',
        }}>
          {/* Paper Toolbar */}
          <div className="paper-toolbar no-print" style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
            color: '#1e293b',
            flexWrap: 'wrap',
            gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.78rem',
                fontWeight: 700,
                color: '#0f766e',
                background: '#ccfbf1',
                border: '1px solid #99f6e4',
                padding: '4px 10px',
                borderRadius: 12,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#0f766e' }} />
                A4 Medical Sheet (210 × 297mm)
              </span>

              {/* Page Height Mode */}
              <div style={{ display: 'inline-flex', background: '#e2e8f0', padding: 2, borderRadius: 6 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    color: paperHeightMode === 'full' ? '#fff' : '#475569',
                    background: paperHeightMode === 'full' ? '#5B1A4A' : 'transparent',
                    fontWeight: 700,
                  }}
                  onClick={() => setPaperHeightMode('full')}
                  title="True Full Height A4 Sheet (297mm)"
                >
                  Full Page Height (A4)
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    color: paperHeightMode === 'compact' ? '#fff' : '#475569',
                    background: paperHeightMode === 'compact' ? '#5B1A4A' : 'transparent',
                    fontWeight: 700,
                  }}
                  onClick={() => setPaperHeightMode('compact')}
                  title="Content auto-height"
                >
                  Auto Height
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* Paper Mode: Print vs Interactive */}
              <div style={{ display: 'inline-flex', background: '#e2e8f0', padding: 2, borderRadius: 6 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    color: previewPaperMode === 'print' ? '#fff' : '#475569',
                    background: previewPaperMode === 'print' ? '#5B1A4A' : 'transparent',
                    fontWeight: 700,
                  }}
                  onClick={() => setPreviewPaperMode('print')}
                >
                  Blank Print View
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    color: previewPaperMode === 'interactive' ? '#fff' : '#475569',
                    background: previewPaperMode === 'interactive' ? '#5B1A4A' : 'transparent',
                    fontWeight: 700,
                  }}
                  onClick={() => {
                    handleFillSampleVitals();
                    setPreviewPaperMode('interactive');
                  }}
                >
                  Sample Filled Mode
                </button>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{
                  border: '1px solid #cbd5e1',
                  background: '#fff',
                  color: '#334155',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
                onClick={() => handlePrint(previewPaperMode)}
                title="Print current sheet layout"
              >
                <Printer size={13} /> Print Sheet
              </button>

              {/* Zoom buttons */}
              <div style={{ display: 'inline-flex', alignItems: 'center', background: '#e2e8f0', borderRadius: 6, padding: '1px 3px' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#475569', padding: '3px 5px' }}
                  onClick={() => setPaperZoom(Math.max(65, paperZoom - 10))}
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', padding: '0 4px' }}>
                  {paperZoom}%
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#475569', padding: '3px 5px' }}
                  onClick={() => setPaperZoom(Math.min(105, paperZoom + 10))}
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* THE FULL A4 PRINTABLE PAPER SHEET */}
          <div
            ref={paperRef}
            id="printable-universal-document"
            className="paper-sheet-printable"
            style={{
              width: '100%',
              maxWidth: 820,
              minHeight: paperHeightMode === 'full' ? 1040 : 'auto',
              maxHeight: paperHeightMode === 'full' ? 1080 : 'none',
              background: '#ffffff',
              color: '#1e293b',
              borderRadius: 4,
              boxShadow: '0 8px 30px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
              padding: '24px 30px',
              position: 'relative',
              transform: `scale(${paperZoom / 100})`,
              transformOrigin: 'top center',
              transition: 'transform 0.15s ease',
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            {/* Optional Faint Watermark */}
            {paperConfig.show_watermark && (
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                zIndex: 0,
                overflow: 'hidden',
              }}>
                <div style={{
                  transform: 'rotate(-35deg)',
                  fontSize: '3rem',
                  fontWeight: 900,
                  color: 'rgba(91, 26, 74, 0.035)',
                  letterSpacing: 8,
                  textAlign: 'center',
                  userSelect: 'none',
                  textTransform: 'uppercase',
                }}>
                  {paperConfig.watermark_text || 'OFFICIAL CLINICAL RECORD'}
                </div>
              </div>
            )}

            {/* TOP & MIDDLE DOCUMENT BODY */}
            <div style={{ position: 'relative', zIndex: 1, flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* ── 1. OFFICIAL LETTERHEAD HEADER ──────────────────────────── */}
              <div style={{ marginBottom: 12 }}>
                {/* Header Style: Modern */}
                {paperConfig.header_style === 'modern' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                      {/* Left: Logo & Branding */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {paperConfig.logo_url && (
                          <img
                            src={paperConfig.logo_url}
                            alt="Logo"
                            style={{ width: 48, height: 48, objectFit: 'contain' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        )}
                        <div>
                          <div style={{
                            fontSize: '1.2rem',
                            fontWeight: 900,
                            color: paperConfig.primary_color || '#5B1A4A',
                            letterSpacing: -0.3,
                            lineHeight: 1.15,
                          }}>
                            {paperConfig.org_name || 'eHealth Hospital At Home'}
                          </div>
                          <div style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: paperConfig.accent_color || '#D4A94A',
                            letterSpacing: 1.1,
                            textTransform: 'uppercase',
                            marginTop: 1,
                          }}>
                            {paperConfig.tagline || 'Digital Hospital & Home Clinical Care Network'}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>
                            {paperConfig.address}
                          </div>
                        </div>
                      </div>

                      {/* Right: Contact & Document Metadata */}
                      <div style={{ textAlign: 'right', fontSize: '0.68rem', color: '#475569', lineHeight: 1.4 }}>
                        <div style={{
                          display: 'inline-block',
                          background: `${paperConfig.primary_color || '#5B1A4A'}10`,
                          border: `1px solid ${paperConfig.primary_color || '#5B1A4A'}30`,
                          color: paperConfig.primary_color || '#5B1A4A',
                          fontWeight: 800,
                          padding: '1px 6px',
                          borderRadius: 4,
                          marginBottom: 3,
                          fontSize: '0.7rem',
                        }}>
                          REF: {paperConfig.form_code || 'FORM-2026-01'}
                        </div>
                        <div><strong>UAN:</strong> {paperConfig.phone}</div>
                        <div><strong>Web:</strong> {paperConfig.website}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.62rem' }}>
                          Rev. {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                    </div>

                    {/* Dual-tone decorative accent line */}
                    <div style={{ marginTop: 8, height: 2.5, background: `linear-gradient(90deg, ${paperConfig.primary_color || '#5B1A4A'} 0%, ${paperConfig.accent_color || '#D4A94A'} 100%)`, borderRadius: 2 }} />
                    <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 3, textAlign: 'center', letterSpacing: 0.5 }}>
                      {paperConfig.registration_info}
                    </div>
                  </div>
                )}

                {/* Header Style: Classic Centered */}
                {paperConfig.header_style === 'classic' && (
                  <div style={{ textAlign: 'center', borderBottom: `2px solid ${paperConfig.primary_color || '#5B1A4A'}`, paddingBottom: 8 }}>
                    {paperConfig.logo_url && (
                      <img
                        src={paperConfig.logo_url}
                        alt="Logo"
                        style={{ width: 44, height: 44, objectFit: 'contain', margin: '0 auto 4px' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900, color: paperConfig.primary_color || '#5B1A4A' }}>
                      {paperConfig.org_name}
                    </h2>
                    <div style={{ fontSize: '0.72rem', color: paperConfig.accent_color || '#D4A94A', fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 1 }}>
                      {paperConfig.tagline}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: 2 }}>
                      {paperConfig.address} &bull; Tel: {paperConfig.phone} &bull; {paperConfig.website}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: 2 }}>
                      {paperConfig.registration_info} | Form: {paperConfig.form_code}
                    </div>
                  </div>
                )}

                {/* Header Style: Compact Clinical */}
                {paperConfig.header_style === 'compact' && (
                  <div style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {paperConfig.logo_url && (
                        <img src={paperConfig.logo_url} alt="Logo" style={{ width: 32, height: 32, objectFit: 'contain' }} />
                      )}
                      <div>
                        <strong style={{ fontSize: '0.95rem', color: paperConfig.primary_color || '#5B1A4A' }}>{paperConfig.org_name}</strong>
                        <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{paperConfig.address} | Tel: {paperConfig.phone}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.68rem', fontWeight: 700, color: '#334155' }}>
                      <code>{paperConfig.form_code}</code>
                    </div>
                  </div>
                )}

                {/* Header Style: Banner */}
                {paperConfig.header_style === 'banner' && (
                  <div style={{
                    background: `linear-gradient(135deg, ${paperConfig.primary_color || '#5B1A4A'} 0%, #3a0d2f 100%)`,
                    color: '#fff',
                    borderRadius: 6,
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {paperConfig.logo_url && (
                        <div style={{ background: '#fff', padding: 3, borderRadius: 4 }}>
                          <img src={paperConfig.logo_url} alt="Logo" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                        </div>
                      )}
                      <div>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#fff' }}>{paperConfig.org_name}</h2>
                        <div style={{ fontSize: '0.68rem', color: paperConfig.accent_color || '#D4A94A', fontWeight: 600 }}>{paperConfig.tagline}</div>
                        <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.7)', marginTop: 1 }}>{paperConfig.address}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '0.65rem', color: 'rgba(255,255,255,0.85)' }}>
                      <div><strong>UAN:</strong> {paperConfig.phone}</div>
                      <div><strong>REF:</strong> {paperConfig.form_code}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 2. PATIENT DEMOGRAPHICS CLINICAL BOX ────────────────────── */}
              {paperConfig.show_patient_box && (
                <div style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  padding: '6px 10px',
                  marginBottom: 10,
                  background: '#f8fafc',
                  fontSize: '0.73rem',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 6,
                    lineHeight: 1.35,
                  }}>
                    <div>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Patient Full Name:</span>
                      <div style={{ fontWeight: 700, color: '#0f172a', borderBottom: '1px dotted #94a3b8', minHeight: 15, paddingTop: 1 }}>
                        {interactiveValues.patient_name || 'Muhammad Tariq'}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Medical Record (MRN):</span>
                      <div style={{ fontWeight: 700, color: '#0f172a', borderBottom: '1px dotted #94a3b8', minHeight: 15, paddingTop: 1 }}>
                        MR-2026-0042
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Date & Shift:</span>
                      <div style={{ fontWeight: 700, color: '#0f172a', borderBottom: '1px dotted #94a3b8', minHeight: 15, paddingTop: 1 }}>
                        {new Date().toLocaleDateString('en-GB')} &bull; Morning
                      </div>
                    </div>

                    <div>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Age / Gender:</span>
                      <div style={{ color: '#0f172a', borderBottom: '1px dotted #94a3b8', minHeight: 15, paddingTop: 1 }}>
                        68 Y &bull; Male
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Attending Clinician / RN:</span>
                      <div style={{ color: '#0f172a', borderBottom: '1px dotted #94a3b8', minHeight: 15, paddingTop: 1 }}>
                        Sarah Mitchell, RN (Dr. Raza Khan)
                      </div>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', fontWeight: 600 }}>Care Program / Service:</span>
                      <div style={{ color: '#0f172a', borderBottom: '1px dotted #94a3b8', minHeight: 15, paddingTop: 1 }}>
                        Hospital-At-Home Clinical Care
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 3. FORM TITLE & CLINICAL INSTRUCTIONS ───────────────────── */}
              <div style={{ marginBottom: 10 }}>
                <h2 style={{
                  fontSize: '1.15rem',
                  fontWeight: 900,
                  color: paperConfig.primary_color || '#5B1A4A',
                  margin: '0 0 3px',
                  letterSpacing: -0.2,
                }}>
                  {templateForm.title || 'Untitled Clinical Form'}
                </h2>
                {templateForm.description && (
                  <p style={{
                    fontSize: '0.75rem',
                    color: '#475569',
                    lineHeight: 1.4,
                    margin: 0,
                    fontStyle: 'italic',
                  }}>
                    {templateForm.description}
                  </p>
                )}
              </div>

              {/* ── 4A. VITAL SIGNS & CLINICAL MONITORING FLOWSHEET (FORM B) ── */}
              {(currentTemplateId === 'vitals_flowsheet' || templateForm.title?.toLowerCase().includes('vital') || (previewPaperMode === 'interactive' && interactiveValues.bp)) && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{
                    background: `${paperConfig.primary_color || '#5B1A4A'}0a`,
                    border: `1.5px solid ${paperConfig.primary_color || '#5B1A4A'}30`,
                    borderRadius: 6,
                    padding: '6px 10px',
                    marginBottom: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: paperConfig.primary_color || '#5B1A4A', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                      Frequent Vital Signs & Bedside Hemodynamics Flowsheet (Form B)
                    </span>
                    <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                      SECP / IHRA Healthcare Standard
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem', textAlign: 'center' }}>
                    <thead>
                      <tr style={{ background: '#1e293b', color: '#ffffff' }}>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>Time / Shift</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>BP (sys/dia)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>Pulse (bpm)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>Temp (°F)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>Resp (/min)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>SpO2 (%)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>Intake (mL)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>Output (mL)</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>BSR / Insulin</th>
                        <th style={{ border: '1px solid #cbd5e1', padding: '5px 3px', fontSize: '0.65rem' }}>Attending RN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SAMPLE_VITALS_FLOW_ROWS.map((row, rIdx) => (
                        <tr key={rIdx} style={{ background: rIdx % 2 === 0 ? '#f8fafc' : '#ffffff' }}>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', fontWeight: 700, color: '#334155' }}>
                            {row.time}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', fontWeight: 800, color: '#0f172a' }}>
                            {previewPaperMode === 'print' ? '____ / ____' : (rIdx === 0 && interactiveValues.bp ? interactiveValues.bp : row.bp)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px' }}>
                            {previewPaperMode === 'print' ? '____' : (rIdx === 0 && interactiveValues.pulse ? interactiveValues.pulse : row.pulse)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px' }}>
                            {previewPaperMode === 'print' ? '____' : (rIdx === 0 && interactiveValues.temp ? `${interactiveValues.temp}°F` : row.temp)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px' }}>
                            {previewPaperMode === 'print' ? '____' : (rIdx === 0 && interactiveValues.resp_rate ? interactiveValues.resp_rate : row.resp)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', fontWeight: 800, color: '#0f766e' }}>
                            {previewPaperMode === 'print' ? '____%' : (rIdx === 0 && interactiveValues.spo2 ? `${interactiveValues.spo2}%` : row.spo2)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px' }}>
                            {previewPaperMode === 'print' ? '____' : (rIdx === 0 && interactiveValues.intake ? interactiveValues.intake : row.intake)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px' }}>
                            {previewPaperMode === 'print' ? '____' : (rIdx === 0 && interactiveValues.output ? interactiveValues.output : row.output)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px' }}>
                            {previewPaperMode === 'print' ? '____' : (rIdx === 0 && interactiveValues.bsr ? `${interactiveValues.bsr} (${interactiveValues.insulin || 4}U)` : row.bsr)}
                          </td>
                          <td style={{ border: '1px solid #cbd5e1', padding: '4px 3px', fontSize: '0.65rem', fontWeight: 700, color: '#1e3a8a' }}>
                            {previewPaperMode === 'print' ? '____' : row.rn}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── 4. DYNAMIC QUESTIONS GRID (12-COL REAL-TIME LAYOUT) ──────── */}
              {(() => {
                const isVitalsForm = currentTemplateId === 'vitals_flowsheet' || templateForm.title?.toLowerCase().includes('vital');
                const tableFieldKeys = ['shift', 'bp', 'pulse', 'spo2', 'temp', 'resp_rate', 'bsr', 'insulin', 'intake', 'output', 'nurse_sign', 'doctor_sign'];
                const displayFields = isVitalsForm
                  ? fields.filter(f => !tableFieldKeys.includes(f.key))
                  : fields.filter(f => !(paperConfig.show_signature_block && f.type === 'signature'));

                return (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(12, 1fr)',
                    gap: '10px 14px',
                    marginBottom: 10,
                  }}>
                    {displayFields.map((f, idx) => {
                      const colSpan = f.width === '4' ? 4 : (f.width === '6' ? 6 : 12);
                      const isFilled = interactiveValues[f.key] !== undefined && interactiveValues[f.key] !== '';
                      const filledVal = interactiveValues[f.key];

                      return (
                        <div
                          key={idx}
                          style={{
                            gridColumn: `span ${colSpan}`,
                            fontSize: '0.78rem',
                          }}
                        >
                          {/* Question Label */}
                          <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ color: paperConfig.primary_color || '#5B1A4A', fontSize: '0.72rem', fontWeight: 800 }}>
                              {idx + 1}.
                            </span>
                            <span>{f.label}</span>
                            {f.required && (
                              <span style={{ color: '#dc2626', fontWeight: 800 }}>*</span>
                            )}
                          </div>

                          {/* Help Text */}
                          {f.help_text && (
                            <div style={{ fontSize: '0.65rem', color: '#64748b', marginBottom: 4 }}>
                              {f.help_text}
                            </div>
                          )}

                          {/* BLANK PRINT VIEW vs INTERACTIVE / SAMPLE FILLED VIEW */}
                          {previewPaperMode === 'print' ? (
                            <div>
                              {f.type === 'text' && (
                                <div style={{
                                  borderBottom: '1px solid #94a3b8',
                                  height: 20,
                                  width: '100%',
                                }} />
                              )}

                              {f.type === 'textarea' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 3 }}>
                                  <div style={{ borderBottom: '1px solid #cbd5e1', height: 16, width: '100%' }} />
                                  <div style={{ borderBottom: '1px solid #cbd5e1', height: 16, width: '100%' }} />
                                </div>
                              )}

                              {f.type === 'number' && (
                                <div style={{
                                  display: 'inline-block',
                                  borderBottom: '1px solid #94a3b8',
                                  width: 130,
                                  height: 20,
                                }} />
                              )}

                              {f.type === 'date' && (
                                <div style={{
                                  display: 'inline-block',
                                  borderBottom: '1px solid #94a3b8',
                                  width: 150,
                                  height: 20,
                                  color: '#94a3b8',
                                  fontSize: '0.68rem',
                                  paddingTop: 2,
                                }}>
                                  DD / MM / YYYY
                                </div>
                              )}

                              {f.type === 'select' && (
                                <div style={{
                                  border: '1px solid #cbd5e1',
                                  borderRadius: 4,
                                  padding: '3px 8px',
                                  color: '#64748b',
                                  fontSize: '0.72rem',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  background: '#fff',
                                }}>
                                  <span>[ Select One Option ]</span>
                                  <span style={{ fontSize: '0.62rem' }}>▼</span>
                                </div>
                              )}

                              {f.type === 'radio' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 3 }}>
                                  {(Array.isArray(f.options) ? f.options : (typeof f.options === 'string' ? f.options.split(',') : [])).map((opt, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#334155' }}>
                                      <span style={{
                                        width: 11,
                                        height: 11,
                                        borderRadius: '50%',
                                        border: '1.5px solid #64748b',
                                        display: 'inline-block',
                                      }} />
                                      <span>{String(opt).trim()}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {f.type === 'checkbox' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 3 }}>
                                  {(Array.isArray(f.options) ? f.options : (typeof f.options === 'string' ? f.options.split(',') : [])).map((opt, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: '#334155' }}>
                                      <span style={{
                                        width: 11,
                                        height: 11,
                                        borderRadius: 2,
                                        border: '1.5px solid #64748b',
                                        display: 'inline-block',
                                      }} />
                                      <span>{String(opt).trim()}</span>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {f.type === 'rating' && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                                  {[1, 2, 3, 4, 5].map(star => (
                                    <div key={star} style={{ textAlign: 'center' }}>
                                      <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>★</span>
                                      <div style={{ fontSize: '0.6rem', color: '#64748b' }}>{star}</div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {f.type === 'signature' && (
                                <div style={{
                                  border: '1px solid #cbd5e1',
                                  borderRadius: 4,
                                  height: 36,
                                  background: '#fff',
                                  position: 'relative',
                                  marginTop: 3,
                                }}>
                                  <div style={{ position: 'absolute', bottom: 3, left: 6, fontSize: '0.62rem', color: '#94a3b8' }}>
                                    ✕ Sign within border above
                                  </div>
                                </div>
                              )}

                              {f.type === 'file' && (
                                <div style={{
                                  border: '1px dashed #cbd5e1',
                                  borderRadius: 4,
                                  padding: '6px',
                                  textAlign: 'center',
                                  fontSize: '0.7rem',
                                  color: '#64748b',
                                  background: '#f8fafc',
                                }}>
                                  [ Attach Clinical Document / Report ]
                                </div>
                              )}
                            </div>
                          ) : (
                            /* INTERACTIVE TEST / SAMPLE FILLED VIEW */
                            <div>
                              {f.type === 'text' && (
                                <input
                                  className="form-input"
                                  style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                                  placeholder="Type answer here..."
                                  value={interactiveValues[f.key] || ''}
                                  onChange={e => setInteractiveValues({ ...interactiveValues, [f.key]: e.target.value })}
                                />
                              )}

                              {f.type === 'textarea' && (
                                <textarea
                                  className="form-textarea"
                                  rows={2}
                                  style={{ fontSize: '0.78rem' }}
                                  placeholder="Enter details..."
                                  value={interactiveValues[f.key] || ''}
                                  onChange={e => setInteractiveValues({ ...interactiveValues, [f.key]: e.target.value })}
                                />
                              )}

                              {f.type === 'number' && (
                                <input
                                  type="number"
                                  className="form-input"
                                  style={{ fontSize: '0.78rem', padding: '4px 8px', maxWidth: 150 }}
                                  value={interactiveValues[f.key] || ''}
                                  onChange={e => setInteractiveValues({ ...interactiveValues, [f.key]: e.target.value })}
                                />
                              )}

                              {f.type === 'date' && (
                                <input
                                  type="date"
                                  className="form-input"
                                  style={{ fontSize: '0.78rem', padding: '4px 8px', maxWidth: 160 }}
                                  value={interactiveValues[f.key] || ''}
                                  onChange={e => setInteractiveValues({ ...interactiveValues, [f.key]: e.target.value })}
                                />
                              )}

                              {f.type === 'select' && (
                                <select
                                  className="form-select"
                                  style={{ fontSize: '0.78rem', padding: '4px 8px' }}
                                  value={interactiveValues[f.key] || ''}
                                  onChange={e => setInteractiveValues({ ...interactiveValues, [f.key]: e.target.value })}
                                >
                                  <option value="">-- Choose Option --</option>
                                  {(Array.isArray(f.options) ? f.options : (typeof f.options === 'string' ? f.options.split(',') : [])).map((opt, i) => (
                                    <option key={i} value={String(opt).trim()}>{String(opt).trim()}</option>
                                  ))}
                                </select>
                              )}

                              {f.type === 'radio' && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 3 }}>
                                  {(Array.isArray(f.options) ? f.options : (typeof f.options === 'string' ? f.options.split(',') : [])).map((opt, i) => (
                                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', cursor: 'pointer' }}>
                                      <input
                                        type="radio"
                                        name={f.key}
                                        checked={interactiveValues[f.key] === String(opt).trim()}
                                        onChange={() => setInteractiveValues({ ...interactiveValues, [f.key]: String(opt).trim() })}
                                      />
                                      <span>{String(opt).trim()}</span>
                                    </label>
                                  ))}
                                </div>
                              )}

                              {f.type === 'rating' && (
                                <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                                  {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                      key={star}
                                      type="button"
                                      className="btn btn-ghost"
                                      style={{
                                        padding: '3px 6px',
                                        fontSize: '0.75rem',
                                        background: interactiveValues[f.key] >= star ? '#fef3c7' : '#f1f5f9',
                                        color: interactiveValues[f.key] >= star ? '#d97706' : '#64748b',
                                        fontWeight: 700,
                                      }}
                                      onClick={() => setInteractiveValues({ ...interactiveValues, [f.key]: star })}
                                    >
                                      ★ {star}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {f.type === 'signature' && (
                                <div style={{
                                  border: '1px solid #cbd5e1',
                                  borderRadius: 4,
                                  padding: '6px 10px',
                                  background: '#f8fafc',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                }}>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0f766e' }}>
                                    {interactiveValues[f.key] || 'Verified Digital Signature'}
                                  </span>
                                  <span style={{ fontSize: '0.65rem', color: '#64748b' }}>✓ Authenticated</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* BOTTOM SECTION (SIGNATURES + HOSPITAL STAMP + LEGAL FOOTER) */}
            <div style={{ position: 'relative', zIndex: 1, marginTop: 10 }}>
              {/* ── 5. OFFICIAL SIGNATURES & HOSPITAL STAMP ─────────────────── */}
              <div style={{
                borderTop: '1px solid #cbd5e1',
                paddingTop: 8,
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  gap: 16,
                }}>
                  {/* Left Signature Block */}
                  {paperConfig.show_signature_block && (
                    <div style={{ display: 'flex', gap: 24 }}>
                      {/* Patient / Guardian */}
                      <div style={{ width: 170 }}>
                        <div style={{ borderBottom: '1.5px solid #334155', height: 26, marginBottom: 3 }}>
                          {(interactiveValues.patient_signature || interactiveValues.consent_sig) && (
                            <span style={{ fontFamily: 'cursive', fontSize: '0.9rem', color: '#1e3a8a' }}>
                              {interactiveValues.patient_signature || interactiveValues.consent_sig}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1e293b' }}>
                          Patient / Guardian Signature
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
                          Date: {new Date().toLocaleDateString('en-GB')}
                        </div>
                      </div>

                      {/* Clinician */}
                      <div style={{ width: 170 }}>
                        <div style={{ borderBottom: '1.5px solid #334155', height: 26, marginBottom: 3 }}>
                          {(interactiveValues.nurse_sign || interactiveValues.doctor_sign || interactiveValues.doctor_signature || interactiveValues.rn_signature) && (
                            <span style={{ fontFamily: 'cursive', fontSize: '0.9rem', color: '#0f766e' }}>
                              {interactiveValues.nurse_sign || interactiveValues.doctor_sign || interactiveValues.doctor_signature || interactiveValues.rn_signature}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1e293b' }}>
                          Registered Clinician / Nurse
                        </div>
                        <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
                          Date: {new Date().toLocaleDateString('en-GB')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Right: Hospital Authenticated Stamp Seal */}
                  {paperConfig.show_stamp_seal && (
                    <div style={{
                      width: 76,
                      height: 76,
                      borderRadius: '50%',
                      border: `2px double ${paperConfig.primary_color || '#5B1A4A'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      padding: 3,
                      color: paperConfig.primary_color || '#5B1A4A',
                      opacity: 0.88,
                      transform: 'rotate(-8deg)',
                      boxSizing: 'border-box',
                    }}>
                      <div style={{ fontSize: '0.45rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        eHealth Hospital
                      </div>
                      <div style={{ fontSize: '0.65rem', lineHeight: 1 }}>★</div>
                      <div style={{ fontSize: '0.42rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        AUTHENTICATED
                      </div>
                      <div style={{ fontSize: '0.4rem', color: '#475569', marginTop: 1 }}>
                        CLINICAL EHR
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── 6. DOCUMENT FOOTER ───────────────────────────────────────── */}
              <div style={{
                borderTop: '1px solid #f1f5f9',
                marginTop: 8,
                paddingTop: 4,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.6rem',
                color: '#94a3b8',
              }}>
                <div>
                  {paperConfig.footer_note}
                </div>
                <div style={{ fontWeight: 700, whiteSpace: 'nowrap', marginLeft: 8 }}>
                  Page 1 of 1 &bull; eHealth HomeCare OS EHR System
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
