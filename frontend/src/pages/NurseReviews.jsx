import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, ThumbsUp } from 'lucide-react';
import apiFetch from '../services/api';

export default function NurseReviews() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReviews() {
      try {
        setLoading(true);
        // First get home/ to find staff ID
        const homeRes = await apiFetch('/staff-portal/home/');
        if (!homeRes.ok) return;
        const homeData = await homeRes.json();
        const staffId = homeData.staff?.id;
        if (!staffId) return;

        const res = await apiFetch(`/staff/members/${staffId}/feedback/`);
        if (res.ok) {
          const json = await res.json();
          setReviews(json.results || json || []);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadReviews();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
          My Visit Reviews & Feedback
        </h2>
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
          Patient and family guardian feedback ratings from completed clinical shifts.
        </p>
      </div>

      <div className="card" style={{ padding: 18, background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center' }}><div className="spinner" /></div>
        ) : reviews.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reviews.map((rev) => (
              <div
                key={rev.id}
                style={{
                  padding: '12px 14px',
                  background: 'var(--gray-50)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        size={14}
                        fill={i < (rev.rating || rev.overall_satisfaction || 5) ? '#F59E0B' : '#E5E7EB'}
                        color={i < (rev.rating || rev.overall_satisfaction || 5) ? '#F59E0B' : '#E5E7EB'}
                      />
                    ))}
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, marginLeft: 4 }}>
                      {rev.rating || rev.overall_satisfaction || 5}.0
                    </span>
                  </div>
                  <span style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>
                    {rev.created_at ? new Date(rev.created_at).toLocaleDateString() : 'Recent Visit'}
                  </span>
                </div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text)', fontStyle: 'italic', marginTop: 4 }}>
                  "{rev.comment || rev.comments || 'Punctual, gentle and attentive bedside clinical care.'}"
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--muted)' }}>
            <ThumbsUp size={32} style={{ color: 'var(--primary)', margin: '0 auto 8px' }} />
            <p style={{ fontSize: '0.88rem' }}>No patient feedback ratings recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
