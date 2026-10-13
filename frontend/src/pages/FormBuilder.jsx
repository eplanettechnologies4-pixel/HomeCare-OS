import React, { useState, useEffect } from 'react';
import {
  FileText, Plus, Trash2, Edit3, ArrowUp, ArrowDown, Eye, CheckCircle2,
  Copy, Download, Filter, RefreshCw, AlertCircle, Sparkles, Send, Check
} from 'lucide-react';
import { apiFetch } from '../services/api';
import useStore from '../store/useStore';

const AUDIENCE_BADGE = {
  all: 'badge-teal',
  family: 'badge-blue',
  staff: 'badge-purple',
  patient: 'badge-green',
};

const FIELD_TYPES = [
  { value: 'text', label: 'Short Text' },
  { value: 'textarea', label: 'Long Text / Notes' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date Picker' },
  { value: 'select', label: 'Dropdown (Select)' },
  { value: 'radio', label: 'Radio Choice' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'file', label: 'Document / Image Upload' },
  { value: 'signature', label: 'Digital Signature' },
  { value: 'rating', label: 'Rating (1-5 Stars)' },
];

export default function FormBuilder() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('templates'); // 'templates' | 'editor' | 'preview' | 'submissions'

  // Selected Template
  const [currentTemplate, setCurrentTemplate] = useState(null);
  const [fields, setFields] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [submissionFilter, setSubmissionFilter] = useState('');

  // Editor Form State
  const [templateForm, setTemplateForm] = useState({
    title: '',
    description: '',
    audience: 'all',
    is_active: true,
  });

  // Field Edit Modal
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState(null);
  const [fieldForm, setFieldForm] = useState({
    label: '',
    key: '',
    type: 'text',
    required: false,
    help_text: '',
    options: '',
  });

  // Live Preview test state
  const [previewValues, setPreviewValues] = useState({});
  const [previewSuccess, setPreviewSuccess] = useState(false);
  const [previewErrors, setPreviewErrors] = useState({});

  // Toast
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/forms/templates/');
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (e) {
      console.warn('Failed to fetch templates:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const openNewForm = () => {
    setCurrentTemplate(null);
    setTemplateForm({
      title: '',
      description: '',
      audience: 'all',
      is_active: true,
    });
    setFields([]);
    setActiveTab('editor');
  };

  const openEditForm = (tmpl) => {
    setCurrentTemplate(tmpl);
    setTemplateForm({
      title: tmpl.title,
      description: tmpl.description || '',
      audience: tmpl.audience || 'all',
      is_active: tmpl.is_active,
    });
    setFields((tmpl.fields || []).map((f, i) => ({
      ...f,
      options: typeof f.options === 'string' ? f.options : JSON.stringify(f.options || []),
      order: f.order ?? i,
    })));
    setActiveTab('editor');
  };

  const openPreview = (tmpl) => {
    setCurrentTemplate(tmpl);
    setFields(tmpl.fields || []);
    setPreviewValues({});
    setPreviewErrors({});
    setPreviewSuccess(false);
    setActiveTab('preview');
  };

  const openSubmissions = async (tmpl) => {
    setCurrentTemplate(tmpl);
    setActiveTab('submissions');
    try {
      const res = await apiFetch(`/forms/templates/${tmpl.id}/submissions/`);
      if (res.ok) {
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (e) {
      console.warn('Failed to fetch submissions:', e);
    }
  };

  const handleTogglePublish = async (tmpl) => {
    try {
      const res = await apiFetch(`/forms/templates/${tmpl.id}/publish/`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        showToast(`Form "${tmpl.title}" is now ${data.is_active ? 'Published' : 'Draft'}`);
        fetchTemplates();
      }
    } catch (e) {
      showToast('Error toggling publish status');
    }
  };

  const handleDuplicate = async (tmpl) => {
    try {
      const res = await apiFetch(`/forms/templates/${tmpl.id}/duplicate/`, {
        method: 'POST',
      });
      if (res.ok) {
        showToast(`Duplicated form "${tmpl.title}"`);
        fetchTemplates();
      }
    } catch (e) {
      showToast('Error duplicating form');
    }
  };

  const handleSaveField = () => {
    if (!fieldForm.label.trim()) return;
    const key = fieldForm.key.trim() || fieldForm.label.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    let parsedOptions = [];
    if (['select', 'radio', 'checkbox'].includes(fieldForm.type)) {
      if (typeof fieldForm.options === 'string') {
        parsedOptions = fieldForm.options.split(',').map(s => s.trim()).filter(Boolean);
      } else {
        parsedOptions = fieldForm.options;
      }
    }

    const fieldData = {
      label: fieldForm.label,
      key,
      type: fieldForm.type,
      required: fieldForm.required,
      help_text: fieldForm.help_text,
      options: parsedOptions,
      order: editingFieldIndex !== null ? fields[editingFieldIndex].order : fields.length,
    };

    if (editingFieldIndex !== null) {
      const updated = [...fields];
      updated[editingFieldIndex] = fieldData;
      setFields(updated);
    } else {
      setFields([...fields, fieldData]);
    }

    setShowFieldModal(false);
    setEditingFieldIndex(null);
    setFieldForm({ label: '', key: '', type: 'text', required: false, help_text: '', options: '' });
  };

  const moveField = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    const reordered = [...fields];
    const temp = reordered[idx];
    reordered[idx] = reordered[targetIdx];
    reordered[targetIdx] = temp;
    setFields(reordered.map((f, i) => ({ ...f, order: i })));
  };

  const deleteField = (idx) => {
    setFields(fields.filter((_, i) => i !== idx).map((f, i) => ({ ...f, order: i })));
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.title.trim()) {
      showToast('Form title is required');
      return;
    }

    const payload = {
      ...templateForm,
      fields: fields.map((f, i) => ({
        ...f,
        order: i,
        options: Array.isArray(f.options) ? f.options : (typeof f.options === 'string' && f.options ? f.options.split(',').map(s=>s.trim()) : []),
      })),
    };

    try {
      const url = currentTemplate ? `/forms/templates/${currentTemplate.id}/` : '/forms/templates/';
      const method = currentTemplate ? 'PUT' : 'POST';
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        showToast(currentTemplate ? `Saved version ${data.version}` : 'Form template created!');
        await fetchTemplates();
        setActiveTab('templates');
      } else {
        const err = await res.json();
        showToast(err.detail || 'Failed to save form template');
      }
    } catch (e) {
      showToast('Error saving template');
    }
  };

  const handlePreviewSubmit = async (e) => {
    e.preventDefault();
    if (!currentTemplate) return;

    try {
      const res = await apiFetch(`/forms/${currentTemplate.id}/submit/`, {
        method: 'POST',
        body: JSON.stringify({
          data: previewValues,
        }),
      });

      if (res.ok) {
        setPreviewSuccess(true);
        setPreviewErrors({});
        showToast('Form submitted successfully!');
      } else {
        const err = await res.json();
        setPreviewErrors(err.errors || { general: err.detail || 'Validation error' });
      }
    } catch (err) {
      setPreviewErrors({ general: 'Server connection error during form submission' });
    }
  };

  const exportSubmissionsCSV = () => {
    if (!submissions.length) return;
    const keys = fields.map(f => f.key);
    const headers = ['Submission ID', 'Submitted By', 'Status', 'Submitted At', ...fields.map(f => f.label)];
    const rows = submissions.map(s => [
      s.id,
      s.submitted_by_name || 'Anonymous',
      s.status,
      s.submitted_at,
      ...keys.map(k => JSON.stringify(s.data?.[k] ?? ''))
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${currentTemplate?.title || 'submissions'}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Dynamic Form Builder</h1>
          <p className="page-subtitle">Design patient intake forms, clinical assessments, staff surveys & family consents</p>
        </div>
        {activeTab === 'templates' && (
          <button className="btn btn-primary" onClick={openNewForm}>
            <Plus size={15} /> Create New Form
          </button>
        )}
      </div>

      {toast && (
        <div className="alert alert-info" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} /> {toast}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        <button
          className={`tab-item${activeTab === 'templates' ? ' active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Form Templates ({templates.length})
        </button>
        {activeTab === 'editor' && (
          <button className="tab-item active">
            {currentTemplate ? `Editing: ${currentTemplate.title} (v${currentTemplate.version})` : 'New Form Editor'}
          </button>
        )}
        {activeTab === 'preview' && (
          <button className="tab-item active">
            Live Preview: {currentTemplate?.title}
          </button>
        )}
        {activeTab === 'submissions' && (
          <button className="tab-item active">
            Submissions: {currentTemplate?.title} ({submissions.length})
          </button>
        )}
      </div>

      {/* ── 1. TEMPLATES LIST ──────────────────────────────────────────────── */}
      {activeTab === 'templates' && (
        <div className="card">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Form Title & Description</th>
                  <th>Target Audience</th>
                  <th>Version</th>
                  <th>Submissions</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(tmpl => (
                  <tr key={tmpl.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--teal-900)' }}>{tmpl.title}</div>
                      <div className="ts" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tmpl.description || 'No description provided'}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${AUDIENCE_BADGE[tmpl.audience] || 'badge-teal'}`}>
                        {tmpl.audience_display || tmpl.audience}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-grey" style={{ fontWeight: 700 }}>
                        v{tmpl.version}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontWeight: 600 }}
                        onClick={() => openSubmissions(tmpl)}
                      >
                        {tmpl.submissions_count || 0} submissions
                      </button>
                    </td>
                    <td>
                      <button
                        className={`badge ${tmpl.is_active ? 'badge-green' : 'badge-amber'}`}
                        style={{ border: 'none', cursor: 'pointer' }}
                        onClick={() => handleTogglePublish(tmpl)}
                      >
                        {tmpl.is_active ? 'Published' : 'Draft'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Live Preview & Test"
                          onClick={() => openPreview(tmpl)}
                        >
                          <Eye size={13} /> Preview
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Edit Structure"
                          onClick={() => openEditForm(tmpl)}
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Duplicate Form"
                          onClick={() => handleDuplicate(tmpl)}
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 2. FORM BUILDER EDITOR ────────────────────────────────────────── */}
      {activeTab === 'editor' && (
        <div>
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--teal-800)', marginBottom: 14 }}>
              Form Properties
            </h3>
            <div className="grid-3" style={{ gap: 16 }}>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label className="form-label">Form Title</label>
                <input
                  className="form-input"
                  placeholder="e.g. Clinical Wound Healing Assessment"
                  value={templateForm.title}
                  onChange={e => setTemplateForm({ ...templateForm, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Target Audience</label>
                <select
                  className="form-select"
                  value={templateForm.audience}
                  onChange={e => setTemplateForm({ ...templateForm, audience: e.target.value })}
                >
                  <option value="all">All Users & Public</option>
                  <option value="family">Family & Guardians</option>
                  <option value="staff">Clinical & Field Staff</option>
                  <option value="patient">Patients (Self-Report)</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description / Instructions</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Explain the purpose of this form for the respondent..."
                value={templateForm.description}
                onChange={e => setTemplateForm({ ...templateForm, description: e.target.value })}
              />
            </div>
          </div>

          {/* Fields Designer */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--teal-800)', margin: 0 }}>
                  Form Fields ({fields.length})
                </h3>
                <p className="ts">Reorder, configure questions, input types & validation rules</p>
              </div>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setEditingFieldIndex(null);
                  setFieldForm({ label: '', key: '', type: 'text', required: false, help_text: '', options: '' });
                  setShowFieldModal(true);
                }}
              >
                <Plus size={14} /> Add Field
              </button>
            </div>

            {fields.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--status-grey)' }}>
                <FileText size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <p>No questions added yet. Click <strong>Add Field</strong> to start building your form.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {fields.map((field, idx) => (
                  <div
                    key={idx}
                    style={{
                      border: '1px solid #e5e7eb',
                      borderRadius: 8,
                      padding: '12px 16px',
                      background: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--teal-600)', width: 20 }}>
                        #{idx + 1}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--teal-900)' }}>
                            {field.label}
                          </span>
                          {field.required && (
                            <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>Required</span>
                          )}
                          <span className="badge badge-teal" style={{ fontSize: '0.65rem' }}>
                            {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                          </span>
                        </div>
                        <div className="ts" style={{ marginTop: 2 }}>
                          Key: <code>{field.key}</code> {field.help_text ? `· ${field.help_text}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={idx === 0}
                        onClick={() => moveField(idx, -1)}
                        title="Move Up"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={idx === fields.length - 1}
                        onClick={() => moveField(idx, 1)}
                        title="Move Down"
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditingFieldIndex(idx);
                          setFieldForm({
                            label: field.label,
                            key: field.key,
                            type: field.type,
                            required: !!field.required,
                            help_text: field.help_text || '',
                            options: Array.isArray(field.options) ? field.options.join(', ') : (field.options || ''),
                          });
                          setShowFieldModal(true);
                        }}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--status-red)' }}
                        onClick={() => deleteField(idx)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-ghost" onClick={() => setActiveTab('templates')}>
              Cancel
            </button>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  openPreview({ ...templateForm, id: currentTemplate?.id, fields });
                }}
              >
                <Eye size={14} /> Test in Preview
              </button>
              <button className="btn btn-primary" onClick={handleSaveTemplate}>
                <Check size={14} /> Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. FIELD CONFIGURATION MODAL ──────────────────────────────────── */}
      {showFieldModal && (
        <div className="drawer-backdrop" style={{ zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: 540, maxWidth: '90vw', padding: 24 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--teal-900)', marginBottom: 16 }}>
              {editingFieldIndex !== null ? 'Edit Field' : 'Add New Field'}
            </h3>

            <div className="form-group">
              <label className="form-label">Question Label</label>
              <input
                className="form-input"
                placeholder="e.g. Current Pain Level"
                value={fieldForm.label}
                onChange={e => setFieldForm({ ...fieldForm, label: e.target.value })}
              />
            </div>

            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Field Type</label>
                <select
                  className="form-select"
                  value={fieldForm.type}
                  onChange={e => setFieldForm({ ...fieldForm, type: e.target.value })}
                >
                  {FIELD_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">JSON Key (Machine Identifier)</label>
                <input
                  className="form-input"
                  placeholder="e.g. pain_level"
                  value={fieldForm.key}
                  onChange={e => setFieldForm({ ...fieldForm, key: e.target.value })}
                />
              </div>
            </div>

            {['select', 'radio', 'checkbox'].includes(fieldForm.type) && (
              <div className="form-group">
                <label className="form-label">Choices / Options (comma-separated)</label>
                <input
                  className="form-input"
                  placeholder="Option 1, Option 2, Option 3"
                  value={fieldForm.options}
                  onChange={e => setFieldForm({ ...fieldForm, options: e.target.value })}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Help Text / Instruction</label>
              <input
                className="form-input"
                placeholder="Clarifying note displayed below the input"
                value={fieldForm.help_text}
                onChange={e => setFieldForm({ ...fieldForm, help_text: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 20px' }}>
              <input
                type="checkbox"
                id="fieldRequired"
                checked={fieldForm.required}
                onChange={e => setFieldForm({ ...fieldForm, required: e.target.checked })}
              />
              <label htmlFor="fieldRequired" style={{ fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                Required field (Respondent cannot leave blank)
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setShowFieldModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSaveField}>
                Apply Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. LIVE PREVIEW & INTERACTIVE TEST ────────────────────────────── */}
      {activeTab === 'preview' && (
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div className="card" style={{ padding: 28 }}>
            <div style={{ borderBottom: '1px solid #e5e7eb', paddingBottom: 16, marginBottom: 20 }}>
              <span className="badge badge-teal" style={{ marginBottom: 6 }}>
                Live Form Preview
              </span>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal-900)', margin: '4px 0' }}>
                {currentTemplate?.title}
              </h2>
              {currentTemplate?.description && (
                <p style={{ color: '#4b5563', fontSize: '0.9rem', lineHeight: 1.5, margin: 0 }}>
                  {currentTemplate.description}
                </p>
              )}
            </div>

            {previewSuccess && (
              <div className="alert alert-success" style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} /> Response recorded successfully! Form logic validated.
              </div>
            )}

            {previewErrors.general && (
              <div className="alert alert-danger" style={{ marginBottom: 20 }}>
                {previewErrors.general}
              </div>
            )}

            <form onSubmit={handlePreviewSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {fields.map((f, idx) => (
                  <div key={idx} className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      {f.label} {f.required && <span style={{ color: 'var(--status-red)' }}>*</span>}
                    </label>

                    {f.type === 'text' && (
                      <input
                        className="form-input"
                        placeholder="Type answer here..."
                        value={previewValues[f.key] || ''}
                        onChange={e => setPreviewValues({ ...previewValues, [f.key]: e.target.value })}
                        required={f.required}
                      />
                    )}

                    {f.type === 'textarea' && (
                      <textarea
                        className="form-textarea"
                        rows={3}
                        placeholder="Enter details..."
                        value={previewValues[f.key] || ''}
                        onChange={e => setPreviewValues({ ...previewValues, [f.key]: e.target.value })}
                        required={f.required}
                      />
                    )}

                    {f.type === 'number' && (
                      <input
                        type="number"
                        className="form-input"
                        value={previewValues[f.key] || ''}
                        onChange={e => setPreviewValues({ ...previewValues, [f.key]: e.target.value })}
                        required={f.required}
                      />
                    )}

                    {f.type === 'date' && (
                      <input
                        type="date"
                        className="form-input"
                        value={previewValues[f.key] || ''}
                        onChange={e => setPreviewValues({ ...previewValues, [f.key]: e.target.value })}
                        required={f.required}
                      />
                    )}

                    {f.type === 'select' && (
                      <select
                        className="form-select"
                        value={previewValues[f.key] || ''}
                        onChange={e => setPreviewValues({ ...previewValues, [f.key]: e.target.value })}
                        required={f.required}
                      >
                        <option value="">Select option...</option>
                        {(Array.isArray(f.options) ? f.options : (typeof f.options === 'string' ? f.options.split(',') : [])).map((opt, i) => (
                          <option key={i} value={opt.trim()}>{opt.trim()}</option>
                        ))}
                      </select>
                    )}

                    {f.type === 'radio' && (
                      <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                        {(Array.isArray(f.options) ? f.options : (typeof f.options === 'string' ? f.options.split(',') : [])).map((opt, i) => (
                          <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name={f.key}
                              value={opt.trim()}
                              checked={previewValues[f.key] === opt.trim()}
                              onChange={e => setPreviewValues({ ...previewValues, [f.key]: e.target.value })}
                              required={f.required}
                            />
                            {opt.trim()}
                          </label>
                        ))}
                      </div>
                    )}

                    {f.type === 'rating' && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {[1, 2, 3, 4, 5].map(star => (
                          <button
                            key={star}
                            type="button"
                            className="btn btn-ghost"
                            style={{
                              padding: '6px 12px',
                              background: previewValues[f.key] >= star ? 'var(--amber-100)' : '#f3f4f6',
                              color: previewValues[f.key] >= star ? 'var(--amber-600)' : '#6b7280',
                              fontWeight: 700,
                            }}
                            onClick={() => setPreviewValues({ ...previewValues, [f.key]: star })}
                          >
                            ★ {star}
                          </button>
                        ))}
                      </div>
                    )}

                    {f.help_text && (
                      <div className="ts" style={{ marginTop: 4 }}>{f.help_text}</div>
                    )}
                    {previewErrors[f.key] && (
                      <div style={{ color: 'var(--status-red)', fontSize: '0.78rem', marginTop: 4 }}>
                        {previewErrors[f.key]}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setActiveTab('templates')}>
                  Back to Forms
                </button>
                <button type="submit" className="btn btn-primary">
                  <Send size={14} /> Test Submit Response
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 5. SUBMISSIONS LIST & CSV EXPORT ──────────────────────────────── */}
      {activeTab === 'submissions' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--teal-900)', margin: 0 }}>
                Submissions for: {currentTemplate?.title}
              </h3>
              <p className="ts">{submissions.length} completed responses recorded</p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={exportSubmissionsCSV} disabled={!submissions.length}>
                <Download size={14} /> Export CSV
              </button>
              <button className="btn btn-primary" onClick={() => setActiveTab('templates')}>
                Back to Templates
              </button>
            </div>
          </div>

          <div className="card">
            {submissions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--status-grey)' }}>
                <FileText size={36} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                <p>No submissions recorded for this form yet.</p>
              </div>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Submission ID</th>
                      <th>Submitted By</th>
                      <th>Version</th>
                      <th>Submitted At</th>
                      <th>Status</th>
                      <th>Answers Payload</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map(sub => (
                      <tr key={sub.id}>
                        <td className="ts" style={{ fontWeight: 700 }}>#{sub.id}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{sub.submitted_by_name || 'Respondent'}</div>
                        </td>
                        <td><span className="badge badge-grey">v{sub.template_version}</span></td>
                        <td className="ts">{sub.submitted_at}</td>
                        <td><span className="badge badge-green">{sub.status}</span></td>
                        <td>
                          <pre style={{ margin: 0, fontSize: '0.75rem', maxHeight: 80, overflow: 'auto', background: '#f8fafc', padding: 6, borderRadius: 4 }}>
                            {JSON.stringify(sub.data, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
