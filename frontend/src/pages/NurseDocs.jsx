import React, { useState, useEffect } from 'react';
import { FileText, Download, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import apiFetch from '../services/api';
import useStore from '../store/useStore';

export default function NurseDocs() {
  const [docs, setDocs] = useState([]);
  const [cardData, setCardData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        // Load employee card
        const cardRes = await apiFetch('/staff-portal/employee-card/');
        if (cardRes.ok) {
          setCardData(await cardRes.json());
        }

        // Load documents
        const docRes = await apiFetch('/documents/');
        if (docRes.ok) {
          const json = await docRes.json();
          setDocs(json.results || json || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          My Documents & Credentials
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
          Official clinical staff documentation, employment verification, and certifications.
        </p>
      </div>

      {/* Digital ID Verification Card */}
      {cardData && (
        <div
          className="card"
          style={{
            padding: 20,
            background: 'linear-gradient(135deg, #FAF5FF 0%, #FFFFFF 100%)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid #E9D5FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)' }}>
                Digital Staff Identity Card
              </h3>
            </div>
            <div style={{ fontSize: '0.84rem', color: 'var(--muted)', marginTop: 4 }}>
              Name: <strong>{cardData.name}</strong> • Role: <strong>{cardData.role}</strong> • ID: <strong>{cardData.employee_id}</strong>
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--primary)', marginTop: 4 }}>
              Public Verification Link: <code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 4 }}>{cardData.verify_url}</code>
            </div>
          </div>
          <a
            href={cardData.verify_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
          >
            Verify Online
          </a>
        </div>
      )}

      {/* Documents List */}
      <div className="card" style={{ padding: 18, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '0.94rem', fontWeight: 700, margin: '0 0 14px 0' }}>Clinical Documents & Policies</h3>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center' }}><div className="spinner" /></div>
        ) : docs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {docs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  padding: '12px 14px',
                  background: 'var(--gray-50)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileText size={18} style={{ color: 'var(--primary)' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{doc.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                      Category: {doc.category} • Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {doc.file && (
                  <a href={doc.file} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                    <Download size={13} /> Download
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
            <FileText size={28} style={{ color: 'var(--muted)', margin: '0 auto 8px' }} />
            <p>No official staff documents uploaded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
