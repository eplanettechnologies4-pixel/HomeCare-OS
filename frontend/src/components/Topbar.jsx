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
        aria-label="Toggle navigation"
      >
        <Menu size={20} />
      </button>

      {/* Page Title & Subtitle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 className="page-title" style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text)' }}>
          {pageTitle}
        </h1>
        {pageSubtitle && (
          <p className="page-subtitle" style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            {pageSubtitle}
          </p>
        )}
      </div>

      {/* Role Switcher Demo Widget — strictly restricted to genuine Super Admins */}
      {currentUser?.role === 'super_admin' && <RoleSelector />}

      {/* Search Bar with Leading Magnifier */}
      <div className="search-input-wrap" style={{ flex: '0 1 260px' }}>
        <Search size={16} />
        <input
          type="search"
          className="form-input search-input"
          placeholder="Search patients, bookings…"
          aria-label="Search dashboard"
        />
      </div>

      {/* Alert Bell */}
      <div style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => { setShowAlertDrop((v) => !v); setShowProfile(false); }}
          id="alert-bell-btn"
          aria-label="Alerts"
          style={{ position: 'relative', width: 40, height: 40, borderRadius: 10 }}
        >
          <Bell size={18} />
          {unread > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                minWidth: 16,
                height: 16,
                padding: '0 4px',
                background: 'var(--danger)',
                color: '#FFFFFF',
                borderRadius: 'var(--radius-pill)',
                fontSize: 10,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {unread}
            </span>
          )}
        </button>

        {showAlertDrop && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 8px)',
              width: 340,
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-modal)',
              border: '1px solid var(--border)',
              zIndex: 100,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                System Alerts ({unread})
              </span>
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto', padding: 8 }}>
              {alerts.length === 0 && (
                <p style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: 20, margin: 0 }}>
                  No active alerts
                </p>
              )}
              {alerts.map((a) => (
                <div
                  key={a.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    marginBottom: 6,
                    background: a.severity === 'critical' ? 'var(--danger-soft)' : 'var(--gray-50)',
                    border: `1px solid ${a.severity === 'critical' ? 'rgba(220,38,38,0.2)' : 'var(--border)'}`,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{a.message}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User Profile Dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost"
          style={{ gap: 8, padding: '4px 10px', height: 40, borderRadius: 10 }}
          onClick={() => { setShowProfile((v) => !v); setShowAlertDrop(false); }}
          aria-expanded={showProfile}
        >
          <div
            className="avatar"
            style={{
              width: 28,
              height: 28,
              fontSize: 12,
              fontWeight: 600,
              background: 'var(--primary-soft)',
              color: 'var(--primary-dark)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {currentUser
              ? currentUser.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
              : 'AD'}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            {currentUser ? currentUser.full_name.split(' ')[0] : 'Admin'}
          </span>
          <ChevronDown size={14} style={{ color: 'var(--muted)' }} />
        </button>

        {showProfile && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 8px)',
              width: 220,
              background: 'var(--surface)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-modal)',
              border: '1px solid var(--border)',
              zIndex: 100,
              overflow: 'hidden',
              padding: 6,
            }}
          >
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '8px 12px', fontSize: 13 }}
              onClick={() => { setShowIdCardModal(true); setShowProfile(false); }}
            >
              <FileText size={15} /> View Digital Staff ID
            </button>
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '8px 12px', fontSize: 13 }}
              onClick={() => setShowProfile(false)}
            >
              <Settings size={15} /> Account Settings
            </button>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 8, padding: '8px 12px', fontSize: 13, color: 'var(--danger)' }}
              onClick={() => logout && logout()}
            >
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        )}
      </div>

      {/* Profile ID Card Modal */}
      {showIdCardModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowIdCardModal(false)}>
          <div className="modal" style={{ maxWidth: 480, width: '100%' }}>
            <div className="modal-header">
              <h2 className="section-title" style={{ margin: 0 }}>
                My Digital Staff ID Card
              </h2>
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setShowIdCardModal(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: 24 }}>
              <StaffIdCard staffMember={staff[0]} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowIdCardModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
