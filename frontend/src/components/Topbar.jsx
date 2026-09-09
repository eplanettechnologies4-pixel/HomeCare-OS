import React, { useState } from 'react';
import { Bell, Search, Menu, ChevronDown, LogOut, Settings, FileText, X } from 'lucide-react';
import useStore from '../store/useStore';
import RoleSelector from './RoleSelector';
import StaffIdCard from './StaffIdCard';

export default function Topbar({ pageTitle, pageSubtitle }) {
  const alerts        = useStore((s) => s.alerts);
  const staff         = useStore((s) => s.staff);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const [showAlertDrop, setShowAlertDrop] = useState(false);
  const [showProfile, setShowProfile]     = useState(false);
  const [showIdCardModal, setShowIdCardModal] = useState(false);

  const unread = alerts.length;

  const logout = useStore((s) => s.logout);
  const currentUser = useStore((s) => s.currentUser);

  return (
    <header className="topbar">
      {/* Mobile hamburger */}
      <button
        onClick={toggleSidebar}
        className="btn btn-ghost btn-icon"
        style={{ display: 'none' }}
        id="sidebar-toggle"
      >
        <Menu size={20} />
      </button>

      {/* Page title */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--teal-800)', margin: 0, lineHeight: 1.2 }}>
          {pageTitle}
        </h2>
        {pageSubtitle && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--status-grey)' }}>{pageSubtitle}</p>
        )}
      </div>

      {/* Role Switcher Demo Widget */}
      <RoleSelector />

      {/* Public Site Switcher Button */}
      <button
        className="btn btn-ghost btn-sm"
        style={{ fontSize: '0.78rem', gap: 4, color: 'var(--teal-700)', border: '1px solid var(--sage-300)' }}
        onClick={() => useStore.getState().setActivePage('public-site')}
        title="View Public Marketing & Booking Website"
      >
        🌐 View Public Site
      </button>

      {/* Search */}
      <div className="search-input-wrap" style={{ flex: '0 1 240px' }}>
        <Search size={14} />
        <input
          className="form-input search-input"
          placeholder="Search patients, bookings…"
          style={{ fontSize: '0.85rem', padding: '7px 12px 7px 32px' }}
        />
      </div>

      {/* Alert bell */}
      <div style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => { setShowAlertDrop((v) => !v); setShowProfile(false); }}
          id="alert-bell-btn"
          style={{ position: 'relative' }}
        >
          <Bell size={20} />
          {unread > 0 && (
            <span style={{
              position: 'absolute', top: 4, right: 4,
              width: 16, height: 16,
              background: 'var(--status-red)', color: 'white',
              borderRadius: '50%', fontSize: '0.65rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              lineHeight: 1,
            }}>
              {unread}
            </span>
          )}
        </button>

        {showAlertDrop && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            width: 340, background: 'white',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-modal)',
            border: '1px solid var(--sage-200)',
            zIndex: 100, overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--sage-200)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--teal-700)' }}>Alerts ({unread})</span>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto', padding: '8px' }}>
              {alerts.length === 0 && (
                <p style={{ color: 'var(--status-grey)', fontSize: '0.85rem', textAlign: 'center', padding: 16 }}>No active alerts</p>
              )}
              {alerts.map((a) => (
                <div key={a.id} className={`alert-item ${a.severity}`}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1a2e2b' }}>{a.title}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginTop: 2 }}>{a.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Profile */}
      <div style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost"
          style={{ gap: 8, padding: '6px 10px' }}
          onClick={() => { setShowProfile((v) => !v); setShowAlertDrop(false); }}
        >
          <div className="avatar" style={{ width: 30, height: 30, fontSize: '0.75rem' }}>
            {currentUser ? currentUser.full_name.split(' ').map(n=>n[0]).join('') : 'AD'}
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--teal-700)' }}>
            {currentUser ? currentUser.full_name.split(' ')[0] : 'Admin'}
          </span>
          <ChevronDown size={14} />
        </button>

        {showProfile && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)',
            width: 210, background: 'white',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-modal)',
            border: '1px solid var(--sage-200)',
            zIndex: 100, overflow: 'hidden', padding: '6px',
          }}>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '8px 12px' }}
              onClick={() => { setShowIdCardModal(true); setShowProfile(false); }}
            >
              <FileText size={15} /> View My Digital ID Card
            </button>
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '8px 12px' }}>
              <Settings size={15} /> Settings
            </button>
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '8px 12px', color: 'var(--status-red)' }} onClick={logout}>
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Profile ID Card Modal */}
      {showIdCardModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowIdCardModal(false)}>
          <div className="modal" style={{ width: 480 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>
                My Digital Staff ID Card
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowIdCardModal(false)}><X size={14} /></button>
            </div>
            <div className="modal-body" style={{ padding: 24 }}>
              <StaffIdCard staffMember={staff[0]} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowIdCardModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
