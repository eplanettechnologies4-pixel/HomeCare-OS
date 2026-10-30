import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  GraduationCap, BookOpen, CheckCircle, Clock, AlertTriangle,
  Play, FileText, Download, ShieldCheck, ExternalLink,
  ChevronRight, ArrowLeft, RefreshCw, Award, Video, FileCheck, CheckCircle2
} from 'lucide-react';
import apiFetch, { API_BASE, getAuthToken } from '../services/api';
import useStore from '../store/useStore';

const CATEGORY_LABELS = {
  onboarding:  'New Staff Onboarding',
  clinical:    'Clinical Skills',
  compliance:  'Compliance & Safety',
  leadership:  'Leadership & Management',
  technology:  'Technology & Systems',
  soft_skills: 'Soft Skills',
  other:       'Other Training',
};

const STATUS_BADGES = {
  completed:   { label: 'Completed',   cls: 'badge-green', bg: '#DCFCE7', color: '#15803D' },
  in_progress: { label: 'In Progress', cls: 'badge-amber', bg: '#FEF3C7', color: '#B45309' },
  overdue:     { label: 'Overdue',     cls: 'badge-red',   bg: '#FEE2E2', color: '#B91C1C' },
  not_started: { label: 'Not Started', cls: 'badge-grey',  bg: '#F3F4F6', color: '#4B5563' },
};

function fmtDuration(seconds) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function MyTrainings() {
  const [activeTab, setActiveTab] = useState('assigned'); // 'assigned' | 'certificates'
  const [trainings, setTrainings] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Detail view state
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [courseDetail, setCourseDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  // Player state
  const [activeLecture, setActiveLecture] = useState(null);
  const [markingProgress, setMarkingProgress] = useState(false);

  // Video ping interval
  const videoRef = useRef(null);
  const pingTimer = useRef(null);

  // Load trainings & certificates
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [tRes, cRes] = await Promise.all([
        apiFetch('/staff-portal/trainings/'),
        apiFetch('/staff-portal/certificates/'),
      ]);

      if (!tRes.ok) throw new Error('Failed to load assigned trainings.');
      if (!cRes.ok) throw new Error('Failed to load certificates.');

      const tData = await tRes.json();
      const cData = await cRes.json();

      setTrainings(Array.isArray(tData) ? tData : (tData.results || []));
      setCertificates(Array.isArray(cData) ? cData : (cData.results || []));
    } catch (err) {
      console.error('[MyTrainings] load error:', err);
      setError(err.message || 'Unable to connect to training system.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Open course details
  const openCourse = async (courseId) => {
    setSelectedCourseId(courseId);
    setLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await apiFetch(`/staff-portal/trainings/${courseId}/`);
      if (!res.ok) throw new Error('Failed to load course curriculum.');
      const data = await res.json();
      setCourseDetail(data);
    } catch (err) {
      setDetailError(err.message || 'Could not load course curriculum.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const backToList = () => {
    setSelectedCourseId(null);
    setCourseDetail(null);
    setActiveLecture(null);
    fetchData(); // refresh overview stats & badges
  };

  // Lecture progress ping/mark complete
  const markLectureProgress = async (lectureId, watchedSeconds, percentage, completed = false) => {
    if (!selectedCourseId) return;
    try {
      setMarkingProgress(true);
      const res = await apiFetch(`/staff-portal/trainings/${selectedCourseId}/lectures/${lectureId}/progress/`, {
        method: 'POST',
        body: JSON.stringify({
          watched_seconds: watchedSeconds,
          percentage: percentage,
          completed: completed,
        }),
      });

      if (res.ok) {
        const update = await res.json();
        // Update local course detail
        setCourseDetail((prev) => {
          if (!prev) return prev;
          const updatedLectures = prev.lectures.map((lec) => {
            if (lec.id === lectureId) {
              return {
                ...lec,
                completed: update.completed,
                percentage: update.percentage,
                watched_seconds: update.watched_seconds,
              };
            }
            return lec;
          });
          const compCount = updatedLectures.filter((l) => l.completed).length;
          return {
            ...prev,
            lectures: updatedLectures,
            completed_lectures: compCount,
            progress_pct: update.course_progress_pct,
            status: update.course_status,
            certificate: update.certificate || prev.certificate,
          };
        });

        // Also update in active lecture view
        setActiveLecture((prev) => (prev && prev.id === lectureId ? { ...prev, completed: update.completed } : prev));
      }
    } catch (err) {
      console.warn('Failed to record lecture progress:', err);
    } finally {
      setMarkingProgress(false);
    }
  };

  // Video player automatic 30s ping
  useEffect(() => {
    if (!activeLecture || activeLecture.type !== 'video') return;

    pingTimer.current = setInterval(() => {
      const v = videoRef.current;
      if (!v) return;
      const pct = v.duration ? (v.currentTime / v.duration) * 100 : 0;
      markLectureProgress(activeLecture.id, Math.floor(v.currentTime), pct, false);
    }, 15000);

    return () => {
      if (pingTimer.current) clearInterval(pingTimer.current);
    };
  }, [activeLecture, selectedCourseId]);

  const handleVideoEnded = () => {
    const v = videoRef.current;
    if (!activeLecture || !v) return;
    markLectureProgress(activeLecture.id, Math.floor(v.duration || 0), 100, true);
  };

  // Download certificate helper
  const handleDownloadCert = async (cert) => {
    try {
      const token = getAuthToken();
      const res = await fetch(`${API_BASE}/staff-portal/certificates/${cert.id}/download/`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cert.certificate_number || cert.certificate_id || 'certificate'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Could not download certificate: ' + err.message);
    }
  };

  // Computed summary metrics for HER data only
  const metrics = useMemo(() => {
    const assigned = trainings.length;
    const inProgress = trainings.filter((t) => t.status === 'in_progress').length;
    const completed = trainings.filter((t) => t.status === 'completed').length;
    const overdue = trainings.filter((t) => t.status === 'overdue').length;
    return { assigned, inProgress, completed, overdue };
  }, [trainings]);

  // ── Render Course Curriculum / Detail Page ──────────────────────────────────
  if (selectedCourseId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
        {/* Top Back Nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={backToList} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={16} /> Back to My Trainings
          </button>
        </div>

        {loadingDetail && (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>Loading course curriculum…</p>
          </div>
        )}

        {detailError && (
          <div className="card" style={{ padding: 24, textAlign: 'center', borderTop: '3px solid var(--status-red)' }}>
            <AlertTriangle size={32} color="var(--status-red)" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--text)', fontWeight: 600 }}>{detailError}</p>
            <button className="btn btn-primary btn-sm" onClick={() => openCourse(selectedCourseId)} style={{ marginTop: 10 }}>
              <RefreshCw size={14} /> Try Again
            </button>
          </div>
        )}

        {courseDetail && !loadingDetail && (
          <>
            {/* Course Header Banner */}
            <div
              className="card"
              style={{
                padding: '24px 28px',
                background: 'linear-gradient(135deg, #FAF5FF 0%, #FFFFFF 100%)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid #E9D5FF',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div style={{ flex: 1, minWidth: 280 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span className="badge" style={{ background: '#EDE9FE', color: '#6D28D9', fontWeight: 600 }}>
                      {CATEGORY_LABELS[courseDetail.category] || courseDetail.category_display}
                    </span>
                    {courseDetail.mandatory && (
                      <span className="badge" style={{ background: '#FEE2E2', color: '#DC2626', fontWeight: 700 }}>
                        MANDATORY
                      </span>
                    )}
                    <span className="badge" style={{ background: STATUS_BADGES[courseDetail.status]?.bg || '#F3F4F6', color: STATUS_BADGES[courseDetail.status]?.color || '#374151', fontWeight: 700 }}>
                      {courseDetail.status_display || courseDetail.status}
                    </span>
                  </div>
                  <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal-900)', margin: '0 0 8px 0' }}>
                    {courseDetail.title}
                  </h1>
                  <p style={{ fontSize: '0.88rem', color: 'var(--status-grey)', margin: 0, lineHeight: 1.5 }}>
                    {courseDetail.description || 'Comprehensive clinical training module assigned by healthcare administration.'}
                  </p>
                </div>

                {/* Due Date & Certificate Pill */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  {courseDetail.due_date && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: courseDetail.status === 'overdue' ? 'var(--status-red)' : 'var(--muted)', fontWeight: 600 }}>
                      <Clock size={15} />
                      Due Date: {courseDetail.due_date}
                    </div>
                  )}
                  {courseDetail.certificate && (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleDownloadCert(courseDetail.certificate)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#15803D', borderColor: '#BBF7D0' }}
                    >
                      <Award size={15} /> Download Certificate
                    </button>
                  )}
                </div>
              </div>

              {/* Course Overall Progress Bar */}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: 'var(--teal-800)', marginBottom: 6 }}>
                  <span>Overall Curriculum Progress ({courseDetail.completed_lectures} of {courseDetail.total_lectures} completed)</span>
                  <span>{courseDetail.progress_pct}%</span>
                </div>
                <div style={{ background: '#E5E7EB', borderRadius: 99, height: 10, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${courseDetail.progress_pct}%`,
                      height: '100%',
                      background: courseDetail.progress_pct === 100 ? '#10B981' : 'var(--primary)',
                      borderRadius: 99,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Curriculum Lecture List */}
            <div className="card" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
                  Curriculum & Lectures
                </h2>
                <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>
                  Click any lecture to launch the player
                </span>
              </div>

              {courseDetail.lectures?.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
                  No lectures have been added to this course yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {courseDetail.lectures.map((lec) => {
                    const isSelected = activeLecture?.id === lec.id;
                    return (
                      <div
                        key={lec.id}
                        onClick={() => setActiveLecture(lec)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '14px 18px',
                          borderRadius: 'var(--radius-md)',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                          background: lec.completed ? '#F0FDF4' : isSelected ? '#FAF5FF' : 'var(--surface)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div
                            style={{
                              width: 36,
                              height: 36,
                              borderRadius: 8,
                              background: lec.completed ? '#DCFCE7' : '#F3F4F6',
                              color: lec.completed ? '#16A34A' : '#6B7280',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {lec.completed ? (
                              <CheckCircle2 size={20} />
                            ) : lec.type === 'video' ? (
                              <Video size={18} />
                            ) : lec.type === 'pdf' ? (
                              <FileText size={18} />
                            ) : (
                              <BookOpen size={18} />
                            )}
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)' }}>
                                #{lec.order}
                              </span>
                              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text)' }}>
                                {lec.title}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.76rem', color: 'var(--muted)', marginTop: 2 }}>
                              <span style={{ textTransform: 'capitalize' }}>Type: {lec.type}</span>
                              {lec.duration && <span>• Duration: {lec.duration}</span>}
                              {lec.percentage > 0 && !lec.completed && (
                                <span style={{ color: '#D97706', fontWeight: 600 }}>
                                  • {Math.round(lec.percentage)}% watched
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {lec.completed ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#16A34A', fontSize: '0.82rem', fontWeight: 700 }}>
                              <CheckCircle size={16} /> Completed
                            </span>
                          ) : (
                            <button className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Play size={13} /> {lec.percentage > 0 ? 'Resume' : 'Start'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Lecture Player Modal / Viewer */}
            {activeLecture && (
              <div
                className="modal-backdrop"
                onClick={(e) => e.target === e.currentTarget && setActiveLecture(null)}
                style={{ zIndex: 1000 }}
              >
                <div className="modal" style={{ width: 720, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                  <div className="modal-header">
                    <div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600 }}>
                        {courseDetail.title} • Lecture #{activeLecture.order}
                      </div>
                      <h3 style={{ margin: '2px 0 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--teal-900)' }}>
                        {activeLecture.title}
                      </h3>
                    </div>
                    <button className="btn btn-ghost btn-icon" onClick={() => setActiveLecture(null)}>✕</button>
                  </div>

                  <div className="modal-body" style={{ padding: 0, overflowY: 'auto' }}>
                    {/* Video Player */}
                    {activeLecture.type === 'video' && (
                      activeLecture.video_url ? (
                        <div style={{ background: '#000' }}>
                          <video
                            ref={videoRef}
                            src={activeLecture.video_url}
                            controls
                            autoPlay
                            style={{ width: '100%', maxHeight: 420, display: 'block' }}
                            onEnded={handleVideoEnded}
                          />
                        </div>
                      ) : (
                        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
                          <Video size={40} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                          <p>Video stream processing. Please check back shortly.</p>
                        </div>
                      )
                    )}

                    {/* PDF Viewer */}
                    {activeLecture.type === 'pdf' && (
                      <div style={{ padding: 24, textAlign: 'center' }}>
                        <FileText size={48} color="var(--primary)" style={{ margin: '0 auto 12px' }} />
                        <h4 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700 }}>
                          Clinical Document / Protocol PDF
                        </h4>
                        <p style={{ fontSize: '0.84rem', color: 'var(--muted)', maxWidth: 440, margin: '0 auto 16px' }}>
                          Please review the document carefully in full before marking completion.
                        </p>
                        {activeLecture.file_url ? (
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                            <a
                              href={activeLecture.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                              <ExternalLink size={14} /> Open in Viewer
                            </a>
                            <a
                              href={activeLecture.file_url}
                              download
                              className="btn btn-secondary btn-sm"
                              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                              <Download size={14} /> Download PDF
                            </a>
                          </div>
                        ) : (
                          <p style={{ color: 'var(--status-red)', fontSize: '0.84rem' }}>No document file attached.</p>
                        )}
                      </div>
                    )}

                    {/* Text / Reading View */}
                    {activeLecture.type === 'text' && (
                      <div style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <BookOpen size={20} color="var(--primary)" />
                          <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700 }}>Curriculum Content & Instructions</h4>
                        </div>
                        <div
                          style={{
                            padding: 16,
                            background: '#F9FAFB',
                            borderRadius: 'var(--radius-md)',
                            lineHeight: 1.6,
                            fontSize: '0.9rem',
                            color: 'var(--text)',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {activeLecture.description || 'Please review standard operating procedures and clinical guidelines associated with this unit.'}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {activeLecture.completed ? (
                        <span style={{ color: '#16A34A', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={16} /> Marked as Complete
                        </span>
                      ) : (
                        <span>Duration: {activeLecture.duration || '—'}</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost" onClick={() => setActiveLecture(null)}>
                        Close
                      </button>
                      {!activeLecture.completed && (
                        <button
                          className="btn btn-primary"
                          disabled={markingProgress}
                          onClick={() => markLectureProgress(activeLecture.id, activeLecture.duration_seconds || 100, 100, true)}
                          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <CheckCircle size={15} /> {markingProgress ? 'Saving…' : 'Mark Complete'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // ── Main Page View: Overview Tiles + Tabs ────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: '0 var(--space-4) var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
            My Clinical Trainings & Certifications
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', marginTop: 2 }}>
            Mandatory continuous education, compliance modules, and verified credentials.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchData} title="Refresh records" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Top Stat Tiles: HER DATA ONLY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)' }}>
        <div className="card stat-card" style={{ padding: 18, borderLeft: '4px solid var(--primary)' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Assigned Courses
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>
            {metrics.assigned}
          </div>
        </div>

        <div className="card stat-card" style={{ padding: 18, borderLeft: '4px solid #F59E0B' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            In Progress
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {metrics.inProgress}
          </div>
        </div>

        <div className="card stat-card" style={{ padding: 18, borderLeft: '4px solid #10B981' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Completed
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10B981', marginTop: 4 }}>
            {metrics.completed}
          </div>
        </div>

        <div className="card stat-card" style={{ padding: 18, borderLeft: '4px solid #EF4444' }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Overdue
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: metrics.overdue > 0 ? '#EF4444' : 'var(--muted)', marginTop: 4 }}>
            {metrics.overdue}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        <button
          className={`btn ${activeTab === 'assigned' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('assigned')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <GraduationCap size={16} /> Assigned to Me
          <span className="badge" style={{ background: activeTab === 'assigned' ? 'rgba(255,255,255,0.25)' : '#E5E7EB', color: activeTab === 'assigned' ? '#fff' : '#374151', padding: '2px 6px', fontSize: '0.72rem' }}>
            {trainings.length}
          </span>
        </button>
        <button
          className={`btn ${activeTab === 'certificates' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('certificates')}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Award size={16} /> Certificates
          <span className="badge" style={{ background: activeTab === 'certificates' ? 'rgba(255,255,255,0.25)' : '#E5E7EB', color: activeTab === 'certificates' ? '#fff' : '#374151', padding: '2px 6px', fontSize: '0.72rem' }}>
            {certificates.length}
          </span>
        </button>
      </div>

      {/* Error state with retry */}
      {error && (
        <div className="card" style={{ padding: 24, textAlign: 'center', borderTop: '3px solid var(--status-red)' }}>
          <AlertTriangle size={32} color="var(--status-red)" style={{ margin: '0 auto 8px' }} />
          <p style={{ color: 'var(--text)', fontWeight: 600 }}>{error}</p>
          <button className="btn btn-primary btn-sm" onClick={fetchData} style={{ marginTop: 10 }}>
            <RefreshCw size={14} /> Retry Loading
          </button>
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-3)' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ padding: 20, height: 180, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ height: 16, width: '40%', background: '#E5E7EB', borderRadius: 4, marginBottom: 12 }} />
                <div style={{ height: 22, width: '80%', background: '#E5E7EB', borderRadius: 4, marginBottom: 8 }} />
                <div style={{ height: 14, width: '90%', background: '#F3F4F6', borderRadius: 4 }} />
              </div>
              <div style={{ height: 10, width: '100%', background: '#E5E7EB', borderRadius: 99 }} />
            </div>
          ))}
        </div>
      )}

      {/* ── Tab Content: Assigned to Me ───────────────────────────────────────── */}
      {!loading && !error && activeTab === 'assigned' && (
        trainings.length === 0 ? (
          /* Empty State */
          <div className="card" style={{ padding: 48, textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EDE9FE', color: '#6D28D9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <GraduationCap size={32} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--teal-900)', marginBottom: 6 }}>
              No trainings assigned yet
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--muted)', maxWidth: 440, margin: '0 auto' }}>
              Your HR team will assign courses to you. When assignments are published, they will appear here with your personalized progress tracking.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-3)' }}>
            {trainings.map((course) => {
              const badge = STATUS_BADGES[course.status] || STATUS_BADGES.not_started;
              return (
                <div
                  key={course.course_id}
                  className="card"
                  onClick={() => openCourse(course.course_id)}
                  style={{
                    padding: 20,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div>
                    {/* Top Badges */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 10 }}>
                      <span className="badge" style={{ background: '#EDE9FE', color: '#6D28D9', fontSize: '0.72rem', fontWeight: 600 }}>
                        {CATEGORY_LABELS[course.category] || course.category_display}
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {course.mandatory && (
                          <span className="badge" style={{ background: '#FEE2E2', color: '#DC2626', fontSize: '0.7rem', fontWeight: 700 }}>
                            MANDATORY
                          </span>
                        )}
                        <span className="badge" style={{ background: badge.bg, color: badge.color, fontSize: '0.72rem', fontWeight: 700 }}>
                          {course.status_display || badge.label}
                        </span>
                      </div>
                    </div>

                    {/* Title & Description */}
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text)', margin: '0 0 6px 0', lineHeight: 1.3 }}>
                      {course.title}
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 16px 0', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {course.description || 'Clinical curriculum module.'}
                    </p>
                  </div>

                  <div>
                    {/* Due Date */}
                    {course.due_date && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: course.status === 'overdue' ? '#DC2626' : 'var(--muted)', fontWeight: 600, marginBottom: 10 }}>
                        <Clock size={13} /> Due: {course.due_date}
                      </div>
                    )}

                    {/* Progress Bar */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', fontWeight: 600, color: 'var(--muted)', marginBottom: 4 }}>
                        <span>Progress ({course.completed_lectures}/{course.total_lectures})</span>
                        <span>{course.progress_pct}%</span>
                      </div>
                      <div style={{ background: '#E5E7EB', borderRadius: 99, height: 7, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${course.progress_pct}%`,
                            height: '100%',
                            background: course.progress_pct === 100 ? '#10B981' : 'var(--primary)',
                            borderRadius: 99,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </div>
                    </div>

                    {/* Open Button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, color: 'var(--primary)', fontWeight: 700, fontSize: '0.82rem' }}>
                      {course.progress_pct === 100 ? 'Review Course' : course.progress_pct > 0 ? 'Continue' : 'Start Course'}
                      <ChevronRight size={15} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Tab Content: Certificates ────────────────────────────────────────── */}
      {!loading && !error && activeTab === 'certificates' && (
        certificates.length === 0 ? (
          <div className="card" style={{ padding: 48, textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Award size={32} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--teal-900)', marginBottom: 6 }}>
              No certificates issued yet
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--muted)', maxWidth: 440, margin: '0 auto' }}>
              Complete all required curriculum lectures in an assigned training course to automatically earn and verify your official certification.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 'var(--space-3)' }}>
            {certificates.map((cert) => (
              <div
                key={cert.id}
                className="card"
                style={{
                  padding: 22,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid #BBF7D0',
                  background: 'linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 100%)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span className="badge" style={{ background: '#DCFCE7', color: '#15803D', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={13} /> Official Certificate
                    </span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--muted)', fontWeight: 600 }}>
                      ID: {cert.certificate_number || cert.certificate_id}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--teal-900)', margin: '0 0 6px 0' }}>
                    {cert.title}
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                    {cert.description || 'Verified course completion and clinical adherence.'}
                  </p>

                  <div style={{ fontSize: '0.78rem', color: 'var(--text)', background: 'rgba(255,255,255,0.7)', padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>
                    <div>Awarded to: <strong>{cert.recipient_name}</strong></div>
                    <div style={{ marginTop: 2 }}>Issue Date: <strong>{cert.issue_date}</strong></div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid #E5E7EB' }}>
                  <a
                    href={cert.verification_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--primary)' }}
                  >
                    <ExternalLink size={13} /> QR Verification
                  </a>

                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleDownloadCert(cert)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Download size={14} /> Download PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
