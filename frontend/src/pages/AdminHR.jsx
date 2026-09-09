import React, { useState } from 'react';
import { Plus, Megaphone, BookOpen, GraduationCap, DollarSign, Send, CheckCircle, Clock, FileText } from 'lucide-react';
import useStore from '../store/useStore';
import { ANNOUNCEMENTS, SALARY_DATA } from '../data/mockData';
import { format, formatDistanceToNow } from 'date-fns';

const PRIORITY_BADGE = { high: 'badge-red', normal: 'badge-teal' };
const DOCS = [
  { name: 'Wound Care SOP v3.2',             category: 'Clinical',  updated: '2026-08-27', size: '1.2 MB' },
  { name: 'Patient Consent Form (Standard)',  category: 'Legal',     updated: '2026-07-01', size: '245 KB' },
  { name: 'Medicine Administration Protocol', category: 'Clinical',  updated: '2026-06-15', size: '890 KB' },
  { name: 'Infection Control Guidelines',     category: 'Clinical',  updated: '2026-05-20', size: '2.1 MB' },
  { name: 'Staff Code of Conduct',            category: 'HR',        updated: '2026-01-10', size: '320 KB' },
  { name: 'Emergency Response Procedure',     category: 'Safety',    updated: '2026-04-30', size: '670 KB' },
];
const TRAINING = [
  { name: 'Basic Life Support (BLS) Refresher',   assigned: 8, completed: 5, due: '2026-09-05', mandatory: true },
  { name: 'Dementia Care Best Practices',          assigned: 4, completed: 4, due: '2026-08-31', mandatory: false },
  { name: 'Infection Prevention & Control',        assigned: 8, completed: 8, due: '2026-08-20', mandatory: true },
  { name: 'Patient Communication Skills',          assigned: 6, completed: 3, due: '2026-09-30', mandatory: false },
];

export default function AdminHR() {
  const blogPosts = useStore((s) => s.blogPosts);
  const [tab, setTab] = useState('announcements');
  const [newAnn, setNewAnn] = useState(false);
  const [annForm, setAnnForm] = useState({ title: '', content: '', priority: 'normal' });

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Admin / HR</h1>
          <p className="page-subtitle">Announcements, documentation, training, and payroll</p>
        </div>
      </div>

      <div className="tabs-bar">
        {[
          { id: 'announcements', label: 'Announcements',  icon: Megaphone },
          { id: 'docs',          label: 'Documentation',  icon: BookOpen },
          { id: 'training',      label: 'Training',       icon: GraduationCap },
          { id: 'salaries',      label: 'Salaries',       icon: DollarSign },
          { id: 'content',       label: 'Public Content / CMS', icon: FileText },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} className={`tab-item${tab===id?' active':''}`}
            onClick={() => setTab(id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      {/* ── Announcements ─────────────────────────────────────────────────── */}
      {tab === 'announcements' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={() => setNewAnn(!newAnn)}>
              <Plus size={15} /> New Announcement
            </button>
          </div>

          {newAnn && (
            <div className="card" style={{ marginBottom: 20, padding: 20 }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)', marginBottom: 14 }}>Broadcast to All Staff</div>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="form-input" placeholder="Announcement title…" value={annForm.title} onChange={e=>setAnnForm({...annForm,title:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea className="form-textarea" placeholder="Write your message…" value={annForm.content} onChange={e=>setAnnForm({...annForm,content:e.target.value})} />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <select className="form-select" style={{ width: 160 }} value={annForm.priority} onChange={e=>setAnnForm({...annForm,priority:e.target.value})}>
                  <option value="normal">Normal</option>
                  <option value="high">High Priority</option>
                </select>
                <button className="btn btn-primary"><Send size={14} /> Broadcast</button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ANNOUNCEMENTS.map(a => (
              <div key={a.id} className="card" style={{ padding: 18 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ background: a.priority==='high'?'var(--status-red-bg)':'var(--teal-50)', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Megaphone size={16} style={{ color: a.priority==='high'?'var(--status-red)':'var(--teal-500)' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <h3 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>{a.title}</h3>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        {a.priority === 'high' && <span className="badge badge-red" style={{ fontSize: '0.68rem' }}>URGENT</span>}
                        <span className="ts">{formatDistanceToNow(new Date(a.date), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.6 }}>{a.content}</p>
                    <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--status-grey)' }}>Posted by {a.author}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Documentation Library ──────────────────────────────────────────── */}
      {tab === 'docs' && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Documentation Library</h3>
            <button className="btn btn-primary btn-sm"><Plus size={13} /> Upload</button>
          </div>
          <table className="data-table">
            <thead><tr><th>Document</th><th>Category</th><th>Last Updated</th><th>Size</th><th></th></tr></thead>
            <tbody>
              {DOCS.map((d, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, background: 'var(--sage-100)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, color: 'var(--teal-600)' }}>PDF</div>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{d.name}</span>
                    </div>
                  </td>
                  <td><span className="badge badge-teal" style={{ fontSize: '0.68rem' }}>{d.category}</span></td>
                  <td className="ts">{d.updated}</td>
                  <td className="ts">{d.size}</td>
                  <td><button className="btn btn-ghost btn-sm">View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Training ───────────────────────────────────────────────────────── */}
      {tab === 'training' && (
        <div>
          {TRAINING.map((t, i) => {
            const pct = Math.round((t.completed/t.assigned)*100);
            return (
              <div key={i} className="card" style={{ padding: 18, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>{t.name}</h3>
                    <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginTop: 3 }}>Due: <span className="ts">{t.due}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {t.mandatory && <span className="badge badge-red" style={{ fontSize: '0.68rem' }}>Mandatory</span>}
                    <span className={`badge ${pct===100?'badge-green':'badge-amber'}`} style={{ fontSize: '0.68rem' }}>
                      {pct===100?<CheckCircle size={10}/>:<Clock size={10}/>} {t.completed}/{t.assigned} completed
                    </span>
                  </div>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar" style={{ width: `${pct}%`, background: pct===100?'var(--status-green)':'var(--amber-500)' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Salaries ───────────────────────────────────────────────────────── */}
      {tab === 'salaries' && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Salaries & Payroll — August 2026</h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--teal-600)', marginTop: 2 }}>
                ✓ Overtime hours & attendance deductions auto-derived from Staff Attendance System
              </div>
            </div>
            <span className="badge badge-amber">{SALARY_DATA.filter(s=>s.status==='pending').length} pending approval</span>
          </div>
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Base Salary</th><th>OT Pay</th><th>Deductions</th><th>Net</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {SALARY_DATA.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.staff_name}</td>
                  <td className="ts">PKR {s.base_salary.toLocaleString()}</td>
                  <td className="ts">{s.overtime_pay>0?`PKR ${s.overtime_pay.toLocaleString()}`:'—'}</td>
                  <td className="ts" style={{ color: 'var(--status-red)' }}>-PKR {s.deductions.toLocaleString()}</td>
                  <td className="ts" style={{ fontWeight: 700, color: 'var(--teal-700)' }}>PKR {s.net_salary.toLocaleString()}</td>
                  <td><span className={`badge ${s.status==='paid'?'badge-green':'badge-amber'}`} style={{fontSize:'0.68rem'}}>{s.status}</span></td>
                  <td>{s.status==='pending'&&<button className="btn btn-primary btn-sm">Approve</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CMS Public Content ─────────────────────────────────────────────── */}
      {tab === 'content' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: 0 }}>Public Website Health Guides CMS</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--status-grey)', margin: '2px 0 0' }}>Publish educational health tips & clinical SOP articles to the public site</p>
            </div>
            <button className="btn btn-primary" onClick={() => alert('New Article CMS Editor Modal opened. Type title, SOP content, author.')}>
              <Plus size={14} /> Publish New Article
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Article Title</th>
                <th>Category</th>
                <th>Author</th>
                <th>Published Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {blogPosts.map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{p.title}</td>
                  <td><span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>{p.category}</span></td>
                  <td>{p.author}</td>
                  <td className="ts">{p.date}</td>
                  <td><span className="badge badge-green">Live on Web</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
