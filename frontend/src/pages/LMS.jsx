import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  BookOpen, Plus, Trash2, Edit3, Video, Users, ChevronDown, ChevronRight,
  Award, Clock, CheckCircle, AlertCircle, Upload, Link as LinkIcon,
  Play, X, Download, GraduationCap, BarChart2, Calendar, Filter,
  Search, FileCheck, ShieldCheck
} from "lucide-react";
import useStore from "../store/useStore";

const CATEGORY_OPTIONS = [
  { value: "onboarding",  label: "New Staff Onboarding" },
  { value: "clinical",    label: "Clinical Skills" },
  { value: "compliance",  label: "Compliance & Safety" },
  { value: "leadership",  label: "Leadership & Management" },
  { value: "technology",  label: "Technology & Systems" },
  { value: "soft_skills", label: "Soft Skills" },
  { value: "other",       label: "Other" },
];

const STATUS_CONFIG = {
  not_started: { label: "Not Started", cls: "badge-grey" },
  in_progress: { label: "In Progress", cls: "badge-amber" },
  completed:   { label: "Completed",   cls: "badge-green" },
};

function fmtDuration(seconds) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Progress Bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, color = "var(--teal-600)" }) {
  return (
    <div style={{ background: "var(--sage-100)", borderRadius: 99, height: 8, overflow: "hidden", minWidth: 80 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.5s" }} />
    </div>
  );
}
import VideoPlayerModal from "../components/VideoPlayerModal";
import CertificateHistoryTable from "../components/CertificateHistoryTable";

// ── New Course Modal ──────────────────────────────────────────────────────────
function NewCourseModal({ onClose, onCreated }) {
  const createCourse = useStore((s) => s.createCourse);
  const [form, setForm] = useState({ title: "", description: "", category: "onboarding" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!form.title.trim()) { setErr("Title is required."); return; }
    setSaving(true);
    const result = await createCourse(form);
    setSaving(false);
    if (result.success) { onCreated(result.data); onClose(); }
    else setErr(result.error || "Failed to create course.");
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--teal-800)" }}>New Training Course</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          {err && <div className="form-error" style={{ marginBottom: 12, color: "var(--status-red)", fontSize: "0.82rem" }}>{err}</div>}
          <div className="form-group">
            <label className="form-label">Course Title *</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. New Nurse Onboarding" />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORY_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional overview of what this course covers…" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Create Course"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Lecture Modal ─────────────────────────────────────────────────────────
function AddLectureModal({ courseId, nextOrder, onClose, onAdded }) {
  const createLecture = useStore((s) => s.createLecture);
  const [form, setForm] = useState({ title: "", video_url: "", duration_seconds: "", order: nextOrder, description: "" });
  const [videoFile, setVideoFile] = useState(null);
  const [useFile, setUseFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async () => {
    if (!form.title.trim()) { setErr("Title is required."); return; }
    if (!useFile && !form.video_url.trim()) { setErr("Provide either a video URL or upload a file."); return; }
    setSaving(true);
    let result;
    if (useFile && videoFile) {
      const fd = new FormData();
      fd.append("course", courseId);
      fd.append("title", form.title);
      fd.append("video_file", videoFile);
      fd.append("duration_seconds", form.duration_seconds || 0);
      fd.append("order", form.order);
      fd.append("description", form.description);
      result = await createLecture(fd);
    } else {
      result = await createLecture({ ...form, course: courseId, duration_seconds: Number(form.duration_seconds) || 0 });
    }
    setSaving(false);
    if (result.success) { onAdded(result.data); onClose(); }
    else setErr(result.error || "Failed to add lecture.");
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 500 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--teal-800)" }}>Add Lecture</h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          {err && <div style={{ color: "var(--status-red)", fontSize: "0.82rem", marginBottom: 10 }}>{err}</div>}
          <div className="form-group">
            <label className="form-label">Lecture Title *</label>
            <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Introduction to Patient Safety" />
          </div>
          <div className="form-group">
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button className={`btn ${!useFile ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: "0.8rem" }} onClick={() => setUseFile(false)}>
                <LinkIcon size={13} /> Video URL
              </button>
              <button className={`btn ${useFile ? "btn-primary" : "btn-ghost"}`} style={{ fontSize: "0.8rem" }} onClick={() => setUseFile(true)}>
                <Upload size={13} /> Upload File
              </button>
            </div>
            {!useFile ? (
              <input className="form-input" value={form.video_url} onChange={(e) => setForm({ ...form, video_url: e.target.value })} placeholder="https://example.com/lecture.mp4" />
            ) : (
              <input type="file" accept="video/*" className="form-input" onChange={(e) => setVideoFile(e.target.files[0])} />
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Duration (seconds)</label>
              <input type="number" className="form-input" value={form.duration_seconds} onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })} placeholder="e.g. 1800" />
            </div>
            <div className="form-group">
              <label className="form-label">Order / Sequence</label>
              <input type="number" className="form-input" value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description (optional)</label>
            <input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this lecture cover?" />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Add Lecture"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Assign Course Modal ───────────────────────────────────────────────────────
function AssignCourseModal({ course, onClose }) {
  const staff = useStore((s) => s.staff);
  const assignCourse = useStore((s) => s.assignCourse);
  const [selected, setSelected] = useState([]);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  const toggle = (id) => setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleAssign = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    const res = await assignCourse(course.id, selected, dueDate || null);
    setSaving(false);
    setResult(res);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 500 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "var(--teal-800)" }}>
            Assign: {course.title}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="modal-body">
          {result ? (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <CheckCircle size={20} color="var(--status-green)" />
                <span style={{ fontWeight: 600 }}>Assignment complete</span>
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--status-grey)" }}>
                Newly assigned: {result.data?.assigned?.length ?? 0} staff ·
                Already assigned: {result.data?.already_assigned?.length ?? 0} staff
              </div>
            </div>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Select Staff Members ({selected.length} selected)</label>
                <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--sage-200)", borderRadius: 8 }}>
                  {staff.map((s) => (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid var(--sage-100)", background: selected.includes(s.id) ? "var(--sage-50)" : "white" }}>
                      <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{s.full_name}</div>
                        <div style={{ fontSize: "0.72rem", color: "var(--status-grey)" }}>{s.role_display} · {s.employee_id}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Due Date (optional)</label>
                <input type="date" className="form-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{result ? "Close" : "Cancel"}</button>
          {!result && (
            <button className="btn btn-primary" onClick={handleAssign} disabled={saving || selected.length === 0}>
              {saving ? "Assigning…" : `Assign to ${selected.length} Staff`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Course Card ───────────────────────────────────────────────────────────────
function CourseCard({ course, onAssign, onDeleteCourse }) {
  const [expanded, setExpanded] = useState(false);
  const [showAddLecture, setShowAddLecture] = useState(false);
  const deleteLecture = useStore((s) => s.deleteLecture);
  const fetchCourses = useStore((s) => s.fetchCourses);
  const cat = CATEGORY_OPTIONS.find((c) => c.value === course.category);

  return (
    <div className="lms-course-card">
      <div className="lms-course-header" onClick={() => setExpanded(!expanded)}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
          <div className="lms-course-icon">
            <BookOpen size={20} color="var(--teal-600)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--teal-800)", marginBottom: 2 }}>{course.title}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="badge badge-teal" style={{ fontSize: "0.65rem" }}>{cat?.label || course.category}</span>
              <span style={{ fontSize: "0.75rem", color: "var(--status-grey)" }}>
                <Video size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />{course.lecture_count} lecture{course.lecture_count !== 1 ? "s" : ""}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--status-grey)" }}>
                <Users size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />{course.enrolled_count} enrolled
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
          <button className="btn btn-ghost" style={{ fontSize: "0.75rem", padding: "4px 10px" }} onClick={(e) => { e.stopPropagation(); onAssign(course); }}>
            <Users size={12} /> Assign
          </button>
          <button className="btn btn-ghost btn-icon" onClick={(e) => { e.stopPropagation(); onDeleteCourse(course.id); }}>
            <Trash2 size={13} color="var(--status-grey)" />
          </button>
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="lms-lectures-list">
          {course.description && (
            <div style={{ fontSize: "0.82rem", color: "var(--status-grey)", padding: "8px 0 12px", borderBottom: "1px solid var(--sage-100)", marginBottom: 8 }}>
              {course.description}
            </div>
          )}
          {(course.lectures || []).map((lec) => (
            <div key={lec.id} className="lms-lecture-row">
              <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <span className="lms-lecture-num">{lec.order}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{lec.title}</div>
                  <div style={{ fontSize: "0.72rem", color: "var(--status-grey)" }}>
                    <Clock size={10} style={{ verticalAlign: "middle", marginRight: 3 }} />{fmtDuration(lec.duration_seconds)}
                    {lec.video_source && <span style={{ marginLeft: 8 }}>· {lec.video_file ? "Uploaded file" : "External URL"}</span>}
                  </div>
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => { if (window.confirm("Delete this lecture?")) deleteLecture(lec.id).then(() => fetchCourses()); }}>
                <Trash2 size={12} color="var(--status-grey)" />
              </button>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ marginTop: 8, fontSize: "0.8rem", width: "100%" }} onClick={() => setShowAddLecture(true)}>
            <Plus size={13} /> Add Lecture
          </button>
          {showAddLecture && (
            <AddLectureModal
              courseId={course.id}
              nextOrder={(course.lectures?.length || 0) + 1}
              onClose={() => setShowAddLecture(false)}
              onAdded={() => { setShowAddLecture(false); fetchCourses(); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Assignments Table ─────────────────────────────────────────────────────────
function AssignmentsTab() {
  const lmsAssignments = useStore((s) => s.lmsAssignments);
  const fetchLmsAssignments = useStore((s) => s.fetchLmsAssignments);
  const downloadCertificate = useStore((s) => s.downloadCertificate);
  const [statusFilter, setStatusFilter] = useState("");
  const [playingLecture, setPlayingLecture] = useState(null);
  const [playingAssignment, setPlayingAssignment] = useState(null);

  useEffect(() => { fetchLmsAssignments(); }, [fetchLmsAssignments]);

  const filtered = statusFilter ? lmsAssignments.filter((a) => a.status === statusFilter) : lmsAssignments;

  return (
    <div>
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <Filter size={14} color="var(--status-grey)" />
        <select className="form-select" style={{ width: 180 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
        </select>
        <span style={{ fontSize: "0.8rem", color: "var(--status-grey)", marginLeft: "auto" }}>{filtered.length} assignments</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center", color: "var(--status-grey)" }}>
          <GraduationCap size={36} style={{ margin: "0 auto 12px", opacity: 0.4, color: "var(--teal-600)" }} />
          <div style={{ fontWeight: 600 }}>No assignments yet</div>
          <p style={{ fontSize: "0.85rem" }}>Assign a course to a staff member from the Courses tab.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Staff Member</th>
                <th>Course</th>
                <th>Status</th>
                <th style={{ minWidth: 140 }}>Progress</th>
                <th>Assigned</th>
                <th>Due</th>
                <th>Certificate</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => {
                const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.not_started;
                const cert = a.certificate;
                return (
                  <tr key={a.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{a.staff_name}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--status-grey)" }}>{a.staff_role}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{a.course_title}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--status-grey)" }}>{a.course_category}</div>
                    </td>
                    <td><span className={`badge ${sc.cls}`}>{sc.label}</span></td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <ProgressBar pct={a.progress_pct} />
                        <span style={{ fontSize: "0.72rem", color: "var(--status-grey)" }}>{a.progress_pct}%</span>
                      </div>
                    </td>
                    <td className="ts" style={{ fontSize: "0.75rem" }}>
                      {a.assigned_date ? new Date(a.assigned_date).toLocaleDateString() : "—"}
                    </td>
                    <td className="ts" style={{ fontSize: "0.75rem", color: a.due_date && new Date(a.due_date) < new Date() && a.status !== "completed" ? "var(--status-red)" : "inherit" }}>
                      {a.due_date || "—"}
                    </td>
                    <td>
                      {cert ? (
                        <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                          onClick={() => downloadCertificate(a.id, cert.certificate_number)}>
                          <Download size={11} /> {cert.certificate_number}
                        </button>
                      ) : (
                        <span style={{ fontSize: "0.72rem", color: "var(--status-grey)" }}>—</span>
                      )}
                    </td>
                    <td>
                      {a.lecture_progresses?.length > 0 && (
                        <button className="btn btn-ghost btn-icon" title="Watch first lecture"
                          onClick={() => { setPlayingLecture(a.lecture_progresses[0]?.lecture || null); setPlayingAssignment(a); }}>
                          <Play size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {playingLecture && (
        <VideoPlayerModal lecture={playingLecture} assignment={playingAssignment} onClose={() => { setPlayingLecture(null); setPlayingAssignment(null); }} />
      )}
    </div>
  );
}

// ── Certificate Presets & Generator Modal ──────────────────────────────────────
const CERT_PRESETS = [
  {
    title: "Employee of the Month",
    desc: "In recognition of outstanding dedication to patient safety, compassionate in-home critical care nursing, and steadfast adherence to medical protocols throughout the month.",
  },
  {
    title: "Course Completion",
    desc: "For successfully completing all requirements and demonstrating professional clinical competency in the specialized home healthcare program.",
  },
  {
    title: "Special Recognition",
    desc: "In grateful appreciation of exceptional service, unwavering reliability, and superior contributions to the advancement of in-home healthcare delivery.",
  },
  {
    title: "Clinical Excellence Award",
    desc: "Awarded for exemplary mastery of patient-centered clinical protocols, rapid critical response, and outstanding delivery of home care nursing.",
  },
  {
    title: "Outstanding Caregiver Award",
    desc: "Recognizing heartfelt compassion, dignity in elder care, and tremendous empathy demonstrated towards patients and their families.",
  },
  {
    title: "Custom Title",
    desc: "For demonstrating professional clinical excellence and adherence to healthcare standards.",
  },
];

// ── Helper: Format API Errors into Clean Human-Readable Text ───────────────
function formatCertificateApiError(err) {
  if (!err) return "An unexpected error occurred while generating the certificate.";
  if (typeof err === "object") {
    if (err.error && typeof err.error === "string") return err.error;
    if (err.detail && typeof err.detail === "string") return err.detail;
    if (err.assignment) {
      const msg = Array.isArray(err.assignment) ? err.assignment[0] : err.assignment;
      if (typeof msg === "string" && msg.toLowerCase().includes("already exists")) {
        return "A certificate has already been issued for this course assignment.";
      }
      return `Course Assignment: ${msg}`;
    }
    const msgs = [];
    for (const [k, v] of Object.entries(err)) {
      const val = Array.isArray(v) ? v.join(", ") : String(v);
      const field = k.replace(/_/g, " ");
      msgs.push(`${field.charAt(0).toUpperCase() + field.slice(1)}: ${val}`);
    }
    return msgs.length > 0 ? msgs.join("; ") : "Failed to generate certificate.";
  }
  if (typeof err === "string") {
    const trimmed = err.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        return formatCertificateApiError(parsed);
      } catch (e) {
        // Not valid JSON, continue with string handling
      }
    }
    if (trimmed.toLowerCase().includes("already exists") && trimmed.toLowerCase().includes("assignment")) {
      return "A certificate has already been issued for this course assignment.";
    }
    return trimmed;
  }
  return String(err);
}

// ── Live Certificate Preview Component ───────────────────────────────────────
function CertificatePreview({ recipientName, title, description, issueDate }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        borderRadius: 8,
        border: "1.5px solid #5B1A4A",
        padding: "16px 18px",
        position: "relative",
        boxShadow: "0 4px 18px rgba(91, 26, 74, 0.09)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 330,
        aspectRatio: "1.414 / 1",
      }}
    >
      {/* Outer Double Gold Borders */}
      <div
        style={{
          position: "absolute",
          inset: 6,
          border: "1px solid #D4A94A",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 8,
          border: "0.5px dashed rgba(212, 169, 74, 0.55)",
          pointerEvents: "none",
        }}
      />

      {/* Decorative Corner: Top-Left Angular Triangles */}
      <svg
        style={{ position: "absolute", top: 0, left: 0, width: 84, height: 84, pointerEvents: "none" }}
        viewBox="0 0 100 100"
      >
        <polygon points="0,0 100,0 0,100" fill="#5B1A4A" />
        <polygon points="0,0 60,0 0,60" fill="#441337" />
        <line x1="0" y1="100" x2="100" y2="0" stroke="#D4A94A" strokeWidth="2.5" />
        <line x1="0" y1="105" x2="105" y2="0" stroke="#D4A94A" strokeWidth="1" opacity="0.6" />
      </svg>

      {/* Decorative Corner: Bottom-Right Angular Triangles */}
      <svg
        style={{ position: "absolute", bottom: 0, right: 0, width: 84, height: 84, pointerEvents: "none" }}
        viewBox="0 0 100 100"
      >
        <polygon points="100,100 0,100 100,0" fill="#5B1A4A" />
        <polygon points="100,100 40,100 100,40" fill="#441337" />
        <line x1="100" y1="0" x2="0" y2="100" stroke="#D4A94A" strokeWidth="2.5" />
        <line x1="100" y1="-5" x2="-5" y2="100" stroke="#D4A94A" strokeWidth="1" opacity="0.6" />
      </svg>

      {/* Top Header: Seals & eHealth Branding */}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", paddingTop: 4 }}>
        {/* Top-Right IHRA Seal Stamp */}
        <div
          style={{
            position: "absolute",
            top: 2,
            right: 6,
            width: 50,
            height: 50,
            borderRadius: "50%",
            border: "1.5px solid #D4A94A",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(253, 251, 247, 0.95)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <div style={{ fontSize: "0.45rem", fontWeight: 800, color: "#5B1A4A", letterSpacing: "0.05em" }}>IHRA</div>
          <div style={{ fontSize: "0.34rem", color: "#D4A94A", fontWeight: 700 }}>REGISTERED</div>
        </div>

        {/* eHealth Branding */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#5B1A4A", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Award size={10} color="#D4A94A" />
          </div>
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, color: "#D4A94A", fontSize: "0.95rem", letterSpacing: "0.12em" }}>
            eHealth
          </span>
        </div>
        <div style={{ fontSize: "0.48rem", color: "#5B1A4A", letterSpacing: "0.18em", fontWeight: 700, marginTop: -2 }}>
          HOSPITAL AT HOME
        </div>

        {/* Elegant Script 'Certificate for' */}
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", color: "#5B1A4A", fontSize: "0.85rem", marginTop: 4 }}>
          Certificate for
        </div>

        {/* Dynamic Title */}
        <div style={{ fontWeight: 900, color: "#D4A94A", fontSize: "0.88rem", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 2, padding: "0 40px" }}>
          {title || "CERTIFICATE TITLE"}
        </div>
      </div>

      {/* Middle Section: Recipient & Citation */}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "4px 18px" }}>
        <div style={{ fontFamily: "Georgia, serif", fontStyle: "italic", color: "#6B7280", fontSize: "0.62rem" }}>
          This is to certify that
        </div>

        {/* Recipient Full Name */}
        <div style={{ marginTop: 2, marginBottom: 3 }}>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontWeight: 800,
              fontSize: "1.05rem",
              color: "#5B1A4A",
              borderBottom: "1.5px solid #D4A94A",
              paddingBottom: 1,
              display: "inline-block",
            }}
          >
            {recipientName || "Recipient Full Name"}
          </span>
        </div>

        {/* Achievement Citation */}
        <div
          style={{
            fontSize: "0.62rem",
            color: "#4B5563",
            lineHeight: 1.35,
            maxWidth: 340,
            margin: "4px auto 0",
            fontFamily: "Georgia, serif",
          }}
        >
          {description || "For demonstrating professional clinical excellence and adherence to healthcare standards."}
        </div>
      </div>

      {/* Bottom Footer: Date, QR Mockup & Signature */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          padding: "0 8px",
        }}
      >
        {/* Date Line */}
        <div style={{ fontSize: "0.55rem", color: "#5B1A4A", textAlign: "left" }}>
          <div style={{ fontWeight: 600 }}>Date of Issue</div>
          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "#4B5563" }}>{issueDate || "YYYY-MM-DD"}</div>
        </div>

        {/* QR Code Mockup */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div
            style={{
              width: 36,
              height: 36,
              border: "1px solid #5B1A4A",
              background: "#FDFCF7",
              padding: 2,
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 1,
            }}
          >
            {[1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1].map((b, i) => (
              <div key={i} style={{ background: b ? "#5B1A4A" : "transparent" }} />
            ))}
          </div>
          <span style={{ fontSize: "0.42rem", fontFamily: "var(--font-mono)", color: "#5B1A4A", fontWeight: 700 }}>
            CERT-2026-PREVIEW
          </span>
        </div>

        {/* Authorized Signatory */}
        <div style={{ textAlign: "right", fontSize: "0.55rem", color: "#5B1A4A" }}>
          <div style={{ borderBottom: "1px solid #D4A94A", width: 75, marginLeft: "auto", marginBottom: 2 }} />
          <div style={{ fontWeight: 700 }}>Authorized Signatory</div>
          <div style={{ fontSize: "0.48rem", color: "#6B7280" }}>eHealth Hospital At Home</div>
        </div>
      </div>
    </div>
  );
}

function CertificateGeneratorModal({ onClose, onGenerated, prefilledStaff = null, prefilledAssignment = null }) {
  const staff = useStore((s) => s.staff);
  const fetchStaff = useStore((s) => s.fetchStaff);
  const lmsAssignments = useStore((s) => s.lmsAssignments);
  const fetchLmsAssignments = useStore((s) => s.fetchLmsAssignments);
  const lmsCertificates = useStore((s) => s.lmsCertificates);
  const fetchCertificates = useStore((s) => s.fetchCertificates);
  const fetchStaffCertificates = useStore((s) => s.fetchStaffCertificates);
  const generateCertificate = useStore((s) => s.generateCertificate);
  const downloadCertificateById = useStore((s) => s.downloadCertificateById);

  useEffect(() => {
    if (!staff || staff.length === 0) fetchStaff();
    if (!lmsAssignments || lmsAssignments.length === 0) fetchLmsAssignments();
    if (!lmsCertificates || lmsCertificates.length === 0) fetchCertificates();
  }, [fetchStaff, fetchLmsAssignments, fetchCertificates, staff, lmsAssignments, lmsCertificates]);

  const [recipientType, setRecipientType] = useState(prefilledStaff ? "staff" : "staff");
  const [selectedStaffId, setSelectedStaffId] = useState(
    prefilledStaff
      ? String(prefilledStaff.id)
      : prefilledAssignment
      ? String(prefilledAssignment.staff || prefilledAssignment.staff_id || "")
      : ""
  );
  const [customName, setCustomName] = useState("");

  const [presetIndex, setPresetIndex] = useState(0);
  const [title, setTitle] = useState(CERT_PRESETS[0].title);
  const [description, setDescription] = useState(CERT_PRESETS[0].desc);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [assignmentId, setAssignmentId] = useState(prefilledAssignment ? String(prefilledAssignment.id) : "");
  const [autoFilledFromCourse, setAutoFilledFromCourse] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [generatedCert, setGeneratedCert] = useState(null);

  // Set of all assignment IDs that already have a certificate issued
  const certifiedAssignmentIds = useMemo(() => {
    const ids = new Set();
    (lmsAssignments || []).forEach((a) => {
      if (a.certificate) ids.add(String(a.id));
    });
    (lmsCertificates || []).forEach((c) => {
      if (c.assignment) ids.add(String(c.assignment));
    });
    return ids;
  }, [lmsAssignments, lmsCertificates]);

  // Assignments belonging ONLY to currently selected staff recipient
  const recipientAssignments = useMemo(() => {
    if (recipientType !== "staff" || !selectedStaffId) return [];
    return (lmsAssignments || []).filter(
      (a) => String(a.staff ?? a.staff_id) === String(selectedStaffId)
    );
  }, [lmsAssignments, recipientType, selectedStaffId]);

  // Live preview recipient name
  const previewRecipientName = useMemo(() => {
    if (recipientType === "staff") {
      if (!selectedStaffId) return "Recipient Full Name";
      const st = staff.find((s) => String(s.id) === String(selectedStaffId));
      return st ? st.full_name : "Recipient Full Name";
    }
    return customName.trim() || "Recipient Full Name";
  }, [recipientType, selectedStaffId, customName, staff]);

  const handlePresetChange = (idx) => {
    setPresetIndex(idx);
    setAutoFilledFromCourse(false);
    const p = CERT_PRESETS[idx];
    if (p.title === "Custom Title") {
      setTitle("");
    } else {
      setTitle(p.title);
    }
    setDescription(p.desc);
  };

  // Auto-fill sensible defaults from selected course assignment
  const handleAssignmentChange = (newAsgnId) => {
    setAssignmentId(newAsgnId);
    setError("");
    if (!newAsgnId) {
      setAutoFilledFromCourse(false);
      return;
    }
    const asgn = recipientAssignments.find((a) => String(a.id) === String(newAsgnId));
    if (asgn && asgn.course_title) {
      setTitle(`Course Completion — ${asgn.course_title}`);
      setDescription(
        `For successfully completing all requirements and demonstrating professional clinical competency in the ${asgn.course_title} specialized training program.`
      );
      setAutoFilledFromCourse(true);
      const customIdx = CERT_PRESETS.findIndex((p) => p.title === "Custom Title");
      if (customIdx !== -1) setPresetIndex(customIdx);
    }
  };

  const handleSubmit = async () => {
    setError("");
    let finalRecipientName = "";
    let staffFk = null;

    if (recipientType === "staff") {
      if (!selectedStaffId) {
        setError("Please select a staff member.");
        return;
      }
      const st = staff.find((s) => String(s.id) === String(selectedStaffId));
      if (!st) {
        setError("Selected staff member not found.");
        return;
      }
      staffFk = st.id;
      finalRecipientName = st.full_name;

      if (assignmentId) {
        // Validate assignment belongs to selected staff
        const selectedAsgn = recipientAssignments.find((a) => String(a.id) === String(assignmentId));
        if (!selectedAsgn) {
          setError("The selected course assignment does not belong to this staff member.");
          return;
        }
        // Validate assignment doesn't already have a certificate issued
        if (certifiedAssignmentIds.has(String(assignmentId))) {
          setError("A certificate has already been issued for this course assignment.");
          return;
        }
      }
    } else {
      if (!customName.trim()) {
        setError("Please enter recipient full name.");
        return;
      }
      finalRecipientName = customName.trim();
    }

    if (!title.trim()) {
      setError("Certificate title / achievement name is required.");
      return;
    }

    setSubmitting(true);
    const payload = {
      recipient_name: finalRecipientName,
      title: title.trim(),
      description: description.trim(),
      issue_date: issueDate,
      staff: staffFk,
      assignment: (recipientType === "staff" && assignmentId) ? parseInt(assignmentId, 10) : null,
    };

    const res = await generateCertificate(payload);
    setSubmitting(false);

    if (res.success) {
      setGeneratedCert(res.data);
      // Immediately refetch so history table has the new certificate without manual refresh
      await fetchCertificates();
      if (staffFk) await fetchStaffCertificates(staffFk);
      if (onGenerated) onGenerated(res.data);
    } else {
      setError(formatCertificateApiError(res.error || "Failed to generate certificate."));
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 1040, maxWidth: "96vw", maxHeight: "92vh", display: "flex", flexDirection: "column" }}>
        {/* Modal Header */}
        <div className="modal-header" style={{ borderBottom: "1px solid var(--sage-200)", paddingBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "#5B1A4A", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Award size={20} color="#D4A94A" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontFamily: "var(--font-heading)", color: "#5B1A4A", fontSize: "1.15rem" }}>
                {generatedCert ? "Certificate Generated Successfully" : "Generate Official Certificate"}
              </h3>
              <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--status-grey)" }}>
                eHealth official printed template · Live side-by-side preview · Print-ready A4 vector PDF
              </p>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={15} /></button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: 20, overflowY: "auto" }}>
          {generatedCert ? (
            /* ── Generation Success View ── */
            <div>
              <div
                style={{
                  background: "#FDFBF7",
                  border: "1.5px solid #D4A94A",
                  borderRadius: 10,
                  padding: "16px 18px",
                  marginBottom: 20,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#5B1A4A", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <CheckCircle size={24} color="#D4A94A" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#5B1A4A", fontSize: "1.05rem" }}>
                    {generatedCert.title}
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--teal-800)", marginTop: 2 }}>
                    Issued to <strong>{generatedCert.recipient_name}</strong>
                  </div>
                </div>
              </div>

              <div style={{ background: "var(--sage-50)", padding: 16, borderRadius: 8, border: "1px solid var(--sage-200)", marginBottom: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: "0.84rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--status-grey)" }}>Certificate ID:</span>
                  <strong style={{ fontFamily: "var(--font-mono)", color: "#5B1A4A" }}>{generatedCert.certificate_id}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--status-grey)" }}>Issue Date:</span>
                  <span>{generatedCert.issue_date}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--status-grey)" }}>Page Sizing &amp; Design:</span>
                  <span className="badge badge-teal">A4 Landscape · Print-Ready Vector</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--status-grey)" }}>Registrations:</span>
                  <span style={{ color: "#5B1A4A", fontWeight: 600 }}>IHRA &amp; SECP Registered</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--status-grey)" }}>Live Verification URL:</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.74rem", color: "var(--teal-800)" }}>
                    /verify-certificate/{generatedCert.certificate_id}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: "#5B1A4A", borderColor: "#5B1A4A", justifyContent: "center", padding: "10px 16px" }}
                  onClick={() => downloadCertificateById(generatedCert.id, generatedCert.certificate_id)}
                >
                  <Download size={15} /> Download PDF (Print-Ready A4)
                </button>

                <div style={{ display: "flex", gap: 10 }}>
                  <a
                    href={generatedCert.pdf_url || `/api/lms/certificates/${generatedCert.id}/download/`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-outline"
                    style={{ flex: 1, justifyContent: "center" }}
                  >
                    <FileCheck size={14} /> View PDF Inline
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ flex: 1, justifyContent: "center" }}
                    onClick={() => window.open(`/verify-certificate/${generatedCert.certificate_id}`, "_blank")}
                  >
                    <ShieldCheck size={14} color="var(--status-green)" /> Test Public Verification
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Two-Column Guided Flow: Form on Left, Live Preview on Right ── */
            <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.15fr) minmax(320px, 1fr)", gap: 20, alignItems: "start" }}>
              {/* Left Column: Grouped Guided Form */}
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {error && (
                  <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#991B1B", padding: "10px 14px", borderRadius: 8, fontSize: "0.84rem", display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Section 1: Recipient Selection */}
                <div style={{ background: "var(--sage-50)", border: "1px solid var(--sage-200)", borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#5B1A4A", color: "#D4A94A", fontSize: "0.72rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>1</div>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#5B1A4A" }}>Recipient Information</span>
                  </div>

                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${recipientType === "staff" ? "btn-teal" : "btn-ghost"}`}
                      style={{ fontSize: "0.8rem", padding: "5px 12px" }}
                      onClick={() => {
                        setRecipientType("staff");
                        setAssignmentId("");
                        setAutoFilledFromCourse(false);
                        setError("");
                      }}
                    >
                      <Users size={13} /> Existing Staff Member
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${recipientType === "custom" ? "btn-teal" : "btn-ghost"}`}
                      style={{ fontSize: "0.8rem", padding: "5px 12px" }}
                      onClick={() => {
                        setRecipientType("custom");
                        setAssignmentId("");
                        setAutoFilledFromCourse(false);
                        setError("");
                      }}
                    >
                      <Edit3 size={13} /> Custom Recipient Name
                    </button>
                  </div>

                  {recipientType === "staff" ? (
                    <select
                      className="form-select"
                      value={selectedStaffId}
                      onChange={(e) => {
                        setSelectedStaffId(e.target.value);
                        setAssignmentId("");
                        setAutoFilledFromCourse(false);
                        setError("");
                      }}
                    >
                      <option value="">-- Choose a staff member --</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.role_display} · {s.employee_id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Dr. Ayesha Siddiqui or Nurse Fatima Zahra"
                      value={customName}
                      onChange={(e) => {
                        setCustomName(e.target.value);
                        setError("");
                      }}
                    />
                  )}
                </div>

                {/* Section 2: Course Assignment Link (Optional) */}
                <div style={{ background: "var(--sage-50)", border: "1px solid var(--sage-200)", borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#5B1A4A", color: "#D4A94A", fontSize: "0.72rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>2</div>
                      <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#5B1A4A" }}>Link to Course (optional)</span>
                    </div>
                    {autoFilledFromCourse && (
                      <span className="badge badge-green" style={{ fontSize: "0.68rem", padding: "2px 8px" }}>
                        ✨ Auto-filled Details
                      </span>
                    )}
                  </div>

                  <select
                    className="form-select"
                    value={assignmentId}
                    onChange={(e) => handleAssignmentChange(e.target.value)}
                    disabled={recipientType !== "staff" || !selectedStaffId}
                  >
                    {recipientType !== "staff" ? (
                      <option value="">-- Not applicable for external recipient --</option>
                    ) : !selectedStaffId ? (
                      <option value="">-- Select a recipient above first --</option>
                    ) : (
                      <>
                        <option value="">-- Standalone (No Course Link) --</option>
                        {recipientAssignments.map((a) => {
                          const isCertified = certifiedAssignmentIds.has(String(a.id));
                          const statusLabel = a.status === "completed" ? "Completed" : "In Progress";
                          return (
                            <option key={a.id} value={a.id} disabled={isCertified}>
                              {a.course_title} {isCertified ? "— (Already Certified)" : `(${statusLabel})`}
                            </option>
                          );
                        })}
                      </>
                    )}
                  </select>

                  {recipientType === "staff" && selectedStaffId && recipientAssignments.length === 0 && (
                    <div style={{ fontSize: "0.74rem", color: "var(--status-grey)", marginTop: 6 }}>
                      No courses currently assigned to this staff member. You can issue a standalone award or recognition.
                    </div>
                  )}
                  {recipientType === "staff" && selectedStaffId && recipientAssignments.length > 0 && !assignmentId && (
                    <div style={{ fontSize: "0.74rem", color: "var(--status-grey)", marginTop: 6 }}>
                      Selecting a course automatically populates the title and citation description below.
                    </div>
                  )}
                </div>

                {/* Section 3: Certificate Details */}
                <div style={{ background: "var(--sage-50)", border: "1px solid var(--sage-200)", borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#5B1A4A", color: "#D4A94A", fontSize: "0.72rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>3</div>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#5B1A4A" }}>Certificate Details</span>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <label className="form-label" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Certificate Type / Preset *</label>
                    <select
                      className="form-select"
                      value={presetIndex}
                      onChange={(e) => handlePresetChange(Number(e.target.value))}
                      style={{ marginBottom: presetIndex === CERT_PRESETS.length - 1 ? 6 : 0 }}
                    >
                      {CERT_PRESETS.map((p, idx) => (
                        <option key={idx} value={idx}>{p.title}</option>
                      ))}
                    </select>
                  </div>

                  {(presetIndex === CERT_PRESETS.length - 1 || !CERT_PRESETS.some(p => p.title === title)) && (
                    <div style={{ marginBottom: 10 }}>
                      <label className="form-label" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Custom Award or Certificate Title *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Enter custom title (e.g. Mentor of the Year)"
                        value={title}
                        onChange={(e) => {
                          setTitle(e.target.value);
                          setError("");
                        }}
                      />
                    </div>
                  )}

                  <div>
                    <label className="form-label" style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                      Achievement Description / Citation
                      <span style={{ fontWeight: 400, color: "var(--status-grey)", fontSize: "0.72rem", marginLeft: 6 }}>
                        (Printed in center)
                      </span>
                    </label>
                    <textarea
                      className="form-input"
                      rows={3}
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setError("");
                      }}
                      placeholder="Enter citation or reason for award…"
                    />
                  </div>
                </div>

                {/* Section 4: Issue Information */}
                <div style={{ background: "var(--sage-50)", border: "1px solid var(--sage-200)", borderRadius: 10, padding: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#5B1A4A", color: "#D4A94A", fontSize: "0.72rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>4</div>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "#5B1A4A" }}>Issue Information</span>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: "0.78rem", fontWeight: 600 }}>Issue Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Live Certificate Preview Panel */}
              <div style={{ position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 700, color: "#5B1A4A", fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 6 }}>
                    <Award size={15} color="#D4A94A" /> Live Certificate Preview
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: "#ECFDF5",
                      border: "1px solid #A7F3D0",
                      color: "#065F46",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10B981", display: "inline-block" }} /> Updates in Real-Time
                  </span>
                </div>

                {/* Mini Certificate Render */}
                <CertificatePreview
                  recipientName={previewRecipientName}
                  title={title}
                  description={description}
                  issueDate={issueDate}
                />

                <div style={{ fontSize: "0.72rem", color: "var(--status-grey)", textAlign: "center", lineHeight: 1.4, padding: "0 6px" }}>
                  Official eHealth printed template (A4 Landscape · IHRA &amp; SECP registered · Public QR Verification).
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ borderTop: "1px solid var(--sage-200)", paddingTop: 14 }}>
          {generatedCert ? (
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                style={{ background: "#5B1A4A", borderColor: "#5B1A4A" }}
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Generating PDF…" : "Generate Official Certificate"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Certificates Tab ──────────────────────────────────────────────────────────
function CertificatesTab({ onOpenGenerator }) {
  const lmsCertificates = useStore((s) => s.lmsCertificates);
  const fetchCertificates = useStore((s) => s.fetchCertificates);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchCertificates().finally(() => setLoading(false));
  }, [fetchCertificates]);

  return (
    <div>
      <CertificateHistoryTable
        certificates={lmsCertificates}
        loading={loading}
        onRefresh={() => {
          setLoading(true);
          fetchCertificates().finally(() => setLoading(false));
        }}
        onOpenGenerator={onOpenGenerator}
        title="Official Certificate Archive"
        subtitle="Complete record of all official awards, course completions, and recognitions issued across the organization"
        showRecipientColumn={true}
        itemsPerPageDefault={10}
      />
    </div>
  );
}

// ── Main LMS Page ─────────────────────────────────────────────────────────────
export default function LMS() {
  const lmsCourses = useStore((s) => s.lmsCourses);
  const lmsAssignments = useStore((s) => s.lmsAssignments);
  const lmsCertificates = useStore((s) => s.lmsCertificates);
  const fetchCourses = useStore((s) => s.fetchCourses);
  const fetchLmsAssignments = useStore((s) => s.fetchLmsAssignments);
  const fetchCertificates = useStore((s) => s.fetchCertificates);
  const deleteCourse = useStore((s) => s.deleteCourse);

  const [activeTab, setActiveTab] = useState("courses");
  const [showNewCourse, setShowNewCourse] = useState(false);
  const [showCertGenerator, setShowCertGenerator] = useState(false);
  const [assigningCourse, setAssigningCourse] = useState(null);

  useEffect(() => {
    fetchCourses();
    fetchLmsAssignments();
    fetchCertificates();
  }, [fetchCourses, fetchLmsAssignments, fetchCertificates]);

  const totalEnrolled = lmsAssignments.length;
  const inProgress = lmsAssignments.filter((a) => a.status === "in_progress").length;
  const totalCerts = lmsCertificates.length || lmsAssignments.filter((a) => a.status === "completed").length;

  const handleDeleteCourse = async (courseId) => {
    if (!window.confirm("Delete this course? All assignments will also be removed.")) return;
    await deleteCourse(courseId);
  };

  return (
    <div>
      {/* ── Page Header ── */}
      <div className="section-header">
        <div>
          <h1 className="page-title">Training &amp; LMS</h1>
          <p className="page-subtitle">Course library, staff assignments, official certificates &amp; QR verification</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-outline"
            style={{ borderColor: "#5B1A4A", color: "#5B1A4A", display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowCertGenerator(true)}
          >
            <Award size={15} /> Generate Certificate
          </button>
          <button className="btn btn-primary" onClick={() => setShowNewCourse(true)}>
            <Plus size={15} /> New Course
          </button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Courses", value: lmsCourses.length, icon: BookOpen, color: "var(--teal-600)" },
          { label: "Enrolled Staff", value: totalEnrolled, icon: Users, color: "#7C3AED" },
          { label: "In Progress", value: inProgress, icon: BarChart2, color: "var(--amber-600)" },
          { label: "Certificates Issued", value: totalCerts, icon: Award, color: "#5B1A4A" },
        ].map((kpi) => (
          <div key={kpi.label} className="card" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: kpi.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <kpi.icon size={20} color={kpi.color} />
            </div>
            <div>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--teal-800)", lineHeight: 1 }}>{kpi.value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--status-grey)", marginTop: 2 }}>{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        {[
          { id: "courses", label: "Course Library" },
          { id: "assignments", label: "Assignments & Progress" },
          { id: "certificates", label: "Certificates & Awards" },
        ].map((t) => (
          <button
            key={t.id}
            className={`tab-item${activeTab === t.id ? " active" : ""}`}
            onClick={() => setActiveTab(t.id)}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Courses Tab ── */}
      {activeTab === "courses" && (
        <div>
          {lmsCourses.length === 0 ? (
            <div className="card" style={{ padding: 56, textAlign: "center", color: "var(--status-grey)" }}>
              <GraduationCap size={44} style={{ margin: "0 auto 14px", opacity: 0.4, color: "var(--teal-600)" }} />
              <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--teal-800)", marginBottom: 6 }}>No courses yet</div>
              <p style={{ maxWidth: 360, margin: "0 auto 20px", fontSize: "0.85rem" }}>
                Create your first training course with video lectures. Staff can be assigned to any course and their progress tracked automatically.
              </p>
              <button className="btn btn-primary" onClick={() => setShowNewCourse(true)}><Plus size={14} /> Create First Course</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {lmsCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  onAssign={setAssigningCourse}
                  onDeleteCourse={handleDeleteCourse}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Assignments Tab ── */}
      {activeTab === "assignments" && <AssignmentsTab />}

      {/* ── Certificates Tab ── */}
      {activeTab === "certificates" && (
        <CertificatesTab onOpenGenerator={() => setShowCertGenerator(true)} />
      )}

      {/* ── Modals ── */}
      {showNewCourse && <NewCourseModal onClose={() => setShowNewCourse(false)} onCreated={() => fetchCourses()} />}
      {assigningCourse && <AssignCourseModal course={assigningCourse} onClose={() => setAssigningCourse(null)} />}
      {showCertGenerator && (
        <CertificateGeneratorModal
          onClose={() => setShowCertGenerator(false)}
          onGenerated={() => {
            fetchCertificates();
          }}
        />
      )}
    </div>
  );
}

