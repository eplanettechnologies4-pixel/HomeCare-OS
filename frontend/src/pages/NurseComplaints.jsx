import React, { useState, useEffect } from 'react';
import { AlertCircle, PlusCircle, CheckCircle2, ShieldCheck, FileText, Info } from 'lucide-react';
import apiFetch from '../services/api';
import { Modal, Input, Textarea, ChipGroup, Button, Badge, EmptyState, Card } from '../components/ui';

const CATEGORY_OPTIONS = [
  { value: 'workplace', label: 'Workplace' },
  { value: 'transport', label: 'Transport' },
  { value: 'equipment', label: 'Supplies & Equipment' },
  { value: 'coordination', label: 'Scheduling & Roster' },
  { value: 'other', label: 'Other Grievance' },
];

export default function NurseComplaints() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('workplace');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [toast, setToast] = useState(null);

  const loadComplaints = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/staff-portal/complaints/');
      if (res.ok) {
        const json = await res.json();
        setComplaints(json.results || json || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const isFormValid = subject.trim().length > 0 && description.trim().length > 0;
  const isDirty = subject.length > 0 || description.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await apiFetch('/staff-portal/complaints/', {
        method: 'POST',
        body: JSON.stringify({ subject, category, description }),
      });
      if (res.ok) {
        const data = await res.json();
        const refCode = data.id ? `CMP-${String(data.id).padStart(4, '0')}` : 'CMP-SUBMITTED';
        setToast({ type: 'success', text: `Complaint logged confidentially. Reference: ${refCode}` });
        loadComplaints();
        setShowModal(false);
        setSubject('');
        setDescription('');
        setCategory('workplace');
        setTimeout(() => setToast(null), 6000);
      } else {
        const err = await res.json();
        setFeedback({ type: 'error', text: err.detail || 'Could not log complaint. Please review your submission.' });
      }
    } catch (err) {
      setFeedback({ type: 'error', text: 'Network connection error. Your draft has been preserved.' });
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'resolved' || s === 'closed') return <Badge variant="green">{status}</Badge>;
    if (s === 'in_review' || s === 'investigating') return <Badge variant="blue">{status || 'In Review'}</Badge>;
    if (s === 'rejected') return <Badge variant="red">{status}</Badge>;
    return <Badge variant="amber">{status || 'Pending'}</Badge>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            My Complaints & Grievances
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            Submit confidential complaints regarding workplace conditions, transport, safety, or clinical coordination.
          </p>
        </div>
        <Button variant="primary" isPill icon={PlusCircle} onClick={() => setShowModal(true)}>
          Log Complaint
        </Button>
      </div>

      {/* ── Toast confirmation notification ── */}
      {toast && (
        <div className={`alert-callout alert-callout-${toast.type === 'error' ? 'danger' : 'success'}`}>
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{toast.text}</span>
        </div>
      )}

      {/* ── Complaints List Card ── */}
      <Card style={{ padding: 'var(--space-4)', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
            <div className="skeleton-line" style={{ width: '40%' }} />
            <div className="skeleton-line" style={{ width: '90%' }} />
            <div className="skeleton-line" style={{ width: '70%' }} />
          </div>
        ) : complaints.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {complaints.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '14px 16px',
                  background: 'var(--gray-50)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text)' }}>
                      {c.subject}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', background: '#FFFFFF', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--border)' }}>
                      CMP-{String(c.id).padStart(4, '0')}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 3 }}>
                    Category: <strong>{c.category}</strong> • Logged on: {new Date(c.created_at).toLocaleDateString()}
                  </div>
                  <div style={{ fontSize: '0.84rem', color: 'var(--text)', marginTop: 8, lineHeight: 1.45 }}>
                    {c.description}
                  </div>
                  {c.resolution_note && (
                    <div style={{ fontSize: '0.78rem', color: 'var(--success)', marginTop: 8, background: 'var(--success-soft)', padding: '8px 12px', borderRadius: 6, border: '1px solid #A7F3D0' }}>
                      <strong>Resolution ({c.resolved_by_name || 'Human Resources'}):</strong> {c.resolution_note}
                    </div>
                  )}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {getStatusBadge(c.status)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={AlertCircle}
            title="No complaints submitted"
            description="You have not submitted any workplace or operational grievances on your account."
            action={
              <Button variant="primary" isPill icon={PlusCircle} onClick={() => setShowModal(true)}>
                Log Complaint
              </Button>
            }
          />
        )}
      </Card>

      {/* ── Log Confidential Complaint Modal ── */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Log Confidential Complaint"
        subtitle="Confidential grievance reporting sent to HR and Care Operations"
        size="md"
        isDirty={isDirty}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isPill
              disabled={!isFormValid || submitting}
              isLoading={submitting}
              onClick={handleSubmit}
            >
              Submit Complaint
            </Button>
          </>
        }
      >
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* HR & Manager Privacy Callout */}
          <div className="alert-callout alert-callout-info">
            <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--primary)' }} />
            <div>
              <strong>Confidential Submission:</strong> This report is transmitted directly to Human Resources and the Senior Care Coordinator. Your privacy is safeguarded under hospital employee grievance policy.
            </div>
          </div>

          <Input
            label="Subject"
            required
            placeholder="e.g. Transport van arrival delay / Defective BP cuff"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />

          <ChipGroup
            label="Category"
            required
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={setCategory}
          />

          <Textarea
            label="Description & Details"
            required
            showCount
            maxLength={1000}
            rows={4}
            placeholder="Provide specific details: dates, patient/shift context, equipment serial if relevant, and impact on clinical care..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {feedback && (
            <div className={`alert-callout alert-callout-${feedback.type === 'error' ? 'danger' : 'success'}`}>
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{feedback.text}</span>
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
