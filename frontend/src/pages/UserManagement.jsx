import React, { useState, useEffect } from 'react';
import {
  UserCheck, Shield, Key, Lock, Plus, Search, Edit, Trash2,
  CheckCircle, AlertTriangle, RefreshCw, Eye, EyeOff, Sliders, History, X, Check
} from 'lucide-react';
import useStore from '../store/useStore';
import { ROLE_CONFIG } from '../data/mockData';
import AddStaffUserModal from '../components/AddStaffUserModal';

const MODULE_LIST = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'patients', label: 'Patients (EMR)' },
  { id: 'billing',  label: 'Billing & Invoicing' },
  { id: 'staff',    label: 'Staff Roster' },
  { id: 'users',    label: 'User Management' },
];

export default function UserManagement() {
  const currentRole         = useStore((s) => s.currentRole);
  const staff               = useStore((s) => s.staff);
  const fetchStaff          = useStore((s) => s.fetchStaff);
  const toggleStaffStatus   = useStore((s) => s.toggleStaffStatus);
  const setUserPassword     = useStore((s) => s.setUserPassword);
  const deleteStaffMember   = useStore((s) => s.deleteStaffMember);
  const permissionMatrix    = useStore((s) => s.permissionMatrix);
  const togglePermission    = useStore((s) => s.togglePermission);
  const auditLogs           = useStore((s) => s.auditLogs);
  const addAuditLog         = useStore((s) => s.addAuditLog);

  const isSuperAdmin = currentRole === 'super_admin';
  const isAdmin      = currentRole === 'admin' || isSuperAdmin;

  const [activeTab, setActiveTab] = useState('users');
  const [search, setSearch]       = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Set Password Modal State (Admin-entered password)
  const [passwordTargetUser, setPasswordTargetUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Notification Banner
  const [bannerMsg, setBannerMsg] = useState('');

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const showBanner = (msg) => {
    setBannerMsg(msg);
    setTimeout(() => setBannerMsg(''), 5000);
  };

  if (!isSuperAdmin) {
    return (
      <div className="card" style={{ maxWidth: 520, margin: '60px auto', textAlign: 'center', padding: 40, borderTop: '4px solid var(--status-red)' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--status-red)' }}>
          <Shield size={32} />
        </div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--teal-900)', marginBottom: 8 }}>Super Administrator Access Required</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--status-grey)', lineHeight: 1.6, marginBottom: 24 }}>
          Access to System Settings, User Account Provisioning, and Role Permission Matrices is strictly restricted to Super Administrators.
        </p>
        <button className="btn btn-primary" onClick={() => useStore.getState().setActivePage('overview')}>
          Return to Overview
        </button>
      </div>
    );
  }

  const filteredUsers = staff.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const nameMatch = u.full_name && u.full_name.toLowerCase().includes(q);
    const usernameMatch = u.username && u.username.toLowerCase().includes(q);
    const emailMatch = u.email && u.email.toLowerCase().includes(q);
    const roleMatch = u.role_display && u.role_display.toLowerCase().includes(q);
    const empIdMatch = u.employee_id && u.employee_id.toLowerCase().includes(q);
    return nameMatch || usernameMatch || emailMatch || roleMatch || empIdMatch;
  });

  const handleToggleStatus = async (user) => {
    if (!isSuperAdmin && user.role === 'admin') {
      alert('Only Super Admin can suspend other Admin accounts.');
      return;
    }
    const res = await toggleStaffStatus(user.id);
    if (res.success) {
      const newSt = user.is_active ? 'Suspended' : 'Activated';
      showBanner(`Account for ${user.full_name} has been ${newSt}.`);
      addAuditLog({
        id: Date.now(),
        actor_name: isSuperAdmin ? 'Super Administrator' : 'Admin User',
        action: `${newSt} Account`,
        target_user: `${user.full_name} (${user.role_display || user.role})`,
        details: `Account status updated on backend. is_active=${!user.is_active}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      });
    } else {
      alert(res.error || 'Failed to toggle account status.');
    }
  };

  const openSetPasswordModal = (user) => {
    setPasswordTargetUser(user);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setShowPwd(false);
  };

  const handleSetPasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match. Please verify both fields.');
      return;
    }

    setPasswordLoading(true);
    const res = await setUserPassword(passwordTargetUser.id, newPassword, confirmPassword);
    setPasswordLoading(false);

    if (res.success) {
      setPasswordSuccess(`Password updated successfully for ${passwordTargetUser.username || passwordTargetUser.full_name}!`);
      addAuditLog({
        id: Date.now(),
        actor_name: isSuperAdmin ? 'Super Administrator' : 'Admin User',
        action: 'Reset Password',
        target_user: `${passwordTargetUser.full_name} (@${passwordTargetUser.username})`,
        details: 'Admin manually set new authentic login password on backend',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      });
      setTimeout(() => {
        setPasswordTargetUser(null);
      }, 1500);
    } else {
      setPasswordError(res.error || 'Failed to update password.');
    }
  };

  const handleDeleteUser = async (user) => {
    if (!isSuperAdmin) {
      alert('Only Super Admin can delete user accounts.');
      return;
    }
    if (confirm(`Are you sure you want to delete user ${user.full_name} (@${user.username})? This action removes the account from the database.`)) {
      const res = await deleteStaffMember(user.id);
      if (res.success) {
        showBanner(`User ${user.full_name} was removed from the database.`);
        addAuditLog({
          id: Date.now(),
          actor_name: 'Super Administrator',
          action: 'Deleted Account',
          target_user: `${user.full_name} (${user.role_display || user.role})`,
          details: 'User and linked staff member record deleted from backend database',
          timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        });
      } else {
        alert(res.error || 'Failed to delete account.');
      }
    }
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Settings & User Management</h1>
          <p className="page-subtitle">Manage system user accounts, authentic backend credentials, and role permissions</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Add New User
          </button>
        )}
      </div>

      {bannerMsg && (
        <div style={{ padding: '10px 16px', background: 'var(--teal-50)', border: '1px solid var(--teal-200)', borderRadius: 8, color: 'var(--teal-800)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem' }}>
          <CheckCircle size={16} color="var(--teal-600)" />
          <span>{bannerMsg}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="tabs-bar">
        {[
          { id: 'users',       label: 'User Accounts',           icon: UserCheck },
          { id: 'permissions', label: 'Role Permissions Matrix', icon: Sliders },
          { id: 'audit',       label: 'Audit Trail Logs',         icon: History },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`tab-item${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── TAB 1: USER ACCOUNTS TABLE ─────────────────────────────────── */}
      {activeTab === 'users' && (
        <div>
          <div className="filter-bar">
            <div className="search-input-wrap" style={{ flex: '0 1 320px' }}>
              <Search size={14} />
              <input
                className="form-input search-input"
                placeholder="Search by name, username, email, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div style={{ marginLeft: 'auto', fontSize: '0.82rem', color: 'var(--status-grey)' }}>
              Total Records: <strong>{filteredUsers.length}</strong> (Backend Synced)
            </div>
          </div>

          <div className="card">
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User & Login Username</th>
                    <th>Email & Phone</th>
                    <th>Role & Platform</th>
                    <th>Employee ID</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--status-grey)' }}>
                        No user accounts found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      const isOtherAdmin = user.role === 'admin' && !isSuperAdmin;
                      return (
                        <tr key={user.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{user.full_name}</div>
                            {user.username && (
                              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--primary-600)' }}>
                                @{user.username}
                              </div>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: '0.82rem' }}>{user.email || '—'}</div>
                            <div className="ts" style={{ color: 'var(--status-grey)' }}>{user.phone || '—'}</div>
                          </td>
                          <td>
                            <span className="badge badge-teal" style={{ fontSize: '0.72rem', display: 'inline-block', marginBottom: 2 }}>
                              {user.role_display || user.role}
                            </span>
                            {user.platform_allowed_display && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--status-grey)' }}>
                                {user.platform_allowed_display}
                              </div>
                            )}
                          </td>
                          <td style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                            {user.employee_id || '—'}
                          </td>
                          <td>
                            <span className={`badge ${user.is_active ? 'badge-green' : 'badge-red'}`}>
                              {user.is_active ? 'Active' : 'Suspended'}
                            </span>
                          </td>
                          <td className="ts">
                            {user.last_login
                              ? new Date(user.last_login).toLocaleString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Never'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleToggleStatus(user)}
                                disabled={isOtherAdmin}
                                title={user.is_active ? 'Suspend Account' : 'Activate Account'}
                              >
                                {user.is_active ? 'Suspend' : 'Activate'}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => openSetPasswordModal(user)}
                                disabled={isOtherAdmin}
                                title="Admin Set Password"
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <Key size={12} /> Set Password
                              </button>
                              {isSuperAdmin && (
                                <button
                                  className="btn btn-ghost btn-icon btn-sm"
                                  style={{ color: 'var(--status-red)' }}
                                  onClick={() => handleDeleteUser(user)}
                                  title="Delete Account from Database"
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: ROLE PERMISSIONS MATRIX ─────────────────────────────── */}
      {activeTab === 'permissions' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: 0 }}>Role Permission Matrix</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--status-grey)', margin: '2px 0 0' }}>
                {isSuperAdmin ? 'Customize view/add/edit/delete access per module across all roles' : 'Read-only view of role permissions (Super Admin editable)'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, fontSize: '0.75rem', fontWeight: 600 }}>
              <span className="badge" style={{ background: '#f3e8ff', color: '#611F8C', border: '1px solid #e9d5ff' }}><strong>V</strong> = View</span>
              <span className="badge" style={{ background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' }}><strong>A</strong> = Add</span>
              <span className="badge" style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}><strong>E</strong> = Edit</span>
              <span className="badge" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}><strong>D</strong> = Delete</span>
            </div>
          </div>

          <div className="data-table-wrap">
            <table className="data-table" style={{ fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Role Name</th>
                  {MODULE_LIST.map((m) => (
                    <th key={m.id} style={{ textAlign: 'center' }}>{m.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(ROLE_CONFIG).map(([roleKey, cfg]) => (
                  <tr key={roleKey}>
                    <td style={{ fontWeight: 700, color: 'var(--teal-800)' }}>
                      {cfg.label}
                    </td>
                    {MODULE_LIST.map((mod) => {
                      const perms = permissionMatrix[roleKey]?.[mod.id] || { view: false, add: false, edit: false, delete: false };
                      const PERM_NAMES = { view: 'View', add: 'Add', edit: 'Edit', delete: 'Delete' };
                      return (
                        <td key={mod.id} style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 3 }}>
                            {['view', 'add', 'edit', 'delete'].map((pKey) => {
                              const active = perms[pKey];
                              const letters = { view: 'V', add: 'A', edit: 'E', delete: 'D' };
                              return (
                                <button
                                  key={pKey}
                                  disabled={!isSuperAdmin}
                                  onClick={() => togglePermission(roleKey, mod.id, pKey)}
                                  title={`${cfg.label} -> ${mod.label}: ${PERM_NAMES[pKey]} (${active ? 'Allowed' : 'Denied'})`}
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: 4,
                                    border: 'none',
                                    cursor: isSuperAdmin ? 'pointer' : 'default',
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    background: active ? 'var(--teal-600)' : '#e5e7eb',
                                    color: active ? '#fff' : '#9ca3af',
                                    transition: 'background 0.15s',
                                  }}
                                >
                                  {letters[pKey]}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── TAB 3: AUDIT TRAIL LOGS ─────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 className="card-title">User Account Audit Log</h3>
            <span className="badge badge-teal">{auditLogs.length} events logged</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Actor (Admin)</th>
                <th>Action Performed</th>
                <th>Target Account</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--status-grey)', padding: '24px 0' }}>
                    No audit records recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="ts">{log.timestamp}</td>
                    <td style={{ fontWeight: 600 }}>{log.actor_name}</td>
                    <td>
                      <span className="badge badge-amber" style={{ fontSize: '0.7rem' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--teal-800)' }}>{log.target_user}</td>
                    <td style={{ fontSize: '0.8rem', color: '#4b5563' }}>{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Unified Add User Modal (Shared with Staff page) */}
      {showAddModal && (
        <AddStaffUserModal
          onClose={() => setShowAddModal(false)}
          onSuccess={(newStaff) => {
            setShowAddModal(false);
            showBanner(`Account for ${newStaff.full_name} (@${newStaff.username || 'user'}) successfully created in backend database!`);
            addAuditLog({
              id: Date.now(),
              actor_name: isSuperAdmin ? 'Super Administrator' : 'Admin User',
              action: 'Created Account',
              target_user: `${newStaff.full_name} (${newStaff.role_display || newStaff.role})`,
              details: `Account created with username: @${newStaff.username}. Password set directly by admin.`,
              timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            });
          }}
        />
      )}

      {/* Admin Set Password Modal (Zero auto-generated temp codes) */}
      {passwordTargetUser && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && !passwordLoading && setPasswordTargetUser(null)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-header">
              <div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>
                  Set Account Password
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--status-grey)' }}>
                  Target: <strong>{passwordTargetUser.full_name}</strong> (@{passwordTargetUser.username})
                </p>
              </div>
              <button className="btn btn-ghost btn-icon" onClick={() => setPasswordTargetUser(null)} disabled={passwordLoading}>
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleSetPasswordSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {passwordError && (
                  <div style={{ padding: '8px 12px', background: '#fee2e2', border: '1px solid #ef4444', color: '#b91c1c', borderRadius: 6, fontSize: '0.82rem' }}>
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div style={{ padding: '8px 12px', background: '#d1fae5', border: '1px solid #10b981', color: '#065f46', borderRadius: 6, fontSize: '0.82rem' }}>
                    {passwordSuccess}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">New Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      className="form-input"
                      required
                      style={{ paddingRight: 36 }}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      disabled={passwordLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--status-grey)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      tabIndex={-1}
                    >
                      {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password *</label>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className="form-input"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-type new password"
                    disabled={passwordLoading}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setPasswordTargetUser(null)} disabled={passwordLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={passwordLoading}>
                  {passwordLoading ? 'Saving...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
