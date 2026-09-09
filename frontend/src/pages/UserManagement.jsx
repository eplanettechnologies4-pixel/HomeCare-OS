import React, { useState } from 'react';
import { UserCheck, Shield, Key, Lock, Plus, Search, Edit, Trash2, CheckCircle, AlertTriangle, RefreshCw, Eye, Sliders, History, X } from 'lucide-react';
import useStore from '../store/useStore';
import { ROLE_CONFIG } from '../data/mockData';

const MODULE_LIST = [
  { id: 'bookings', label: 'Bookings' },
  { id: 'patients', label: 'Patients (EMR)' },
  { id: 'billing',  label: 'Billing & Invoicing' },
  { id: 'staff',    label: 'Staff Roster' },
  { id: 'users',    label: 'User Management' },
];

export default function UserManagement() {
  const currentRole         = useStore((s) => s.currentRole);
  const systemUsers         = useStore((s) => s.systemUsers);
  const addSystemUser       = useStore((s) => s.addSystemUser);
  const toggleUserStatus    = useStore((s) => s.toggleUserStatus);
  const deleteSystemUser    = useStore((s) => s.deleteSystemUser);
  const permissionMatrix    = useStore((s) => s.permissionMatrix);
  const togglePermission    = useStore((s) => s.togglePermission);
  const auditLogs           = useStore((s) => s.auditLogs);
  const addAuditLog         = useStore((s) => s.addAuditLog);

  const isSuperAdmin = currentRole === 'super_admin';
  const isAdmin      = currentRole === 'admin' || isSuperAdmin;

  const [activeTab, setActiveTab] = useState('users');
  const [search, setSearch]       = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State for Add User
  const [userForm, setUserForm] = useState({
    full_name: '',
    email: '',
    phone: '+92-300-',
    role: 'nurse',
    branch: 'Gulshan Branch (Karachi)',
  });

  const [resetMessage, setResetMessage] = useState('');

  const filteredUsers = systemUsers.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.role_display.toLowerCase().includes(q);
  });

  const handleAddUserSubmit = () => {
    if (!userForm.full_name || !userForm.email) return;
    const tempPass = `HC-${Math.random().toString(36).slice(-6).toUpperCase()}`;
    const roleCfg = ROLE_CONFIG[userForm.role];

    const newUser = {
      id: Date.now(),
      full_name: userForm.full_name,
      email: userForm.email,
      phone: userForm.phone,
      role: userForm.role,
      role_display: roleCfg ? roleCfg.label : userForm.role,
      branch: userForm.branch,
      status: 'active',
      temp_password: tempPass,
      last_login: 'Never (Invite Sent)',
    };

    addSystemUser(newUser);

    // Record Audit Log
    addAuditLog({
      id: Date.now(),
      actor_name: isSuperAdmin ? 'Super Administrator' : 'Admin User',
      action: 'Created Account',
      target_user: `${userForm.full_name} (${roleCfg?.label})`,
      details: `Invite email sent. Temp Password: ${tempPass}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
    });

    setShowAddModal(false);
    setUserForm({ full_name: '', email: '', phone: '+92-300-', role: 'nurse', branch: 'Gulshan Branch (Karachi)' });
    alert(`Account created for ${newUser.full_name}! Auto-generated temp password: ${tempPass}`);
  };

  const handleToggleStatus = (user) => {
    if (!isSuperAdmin && user.role === 'admin') {
      alert('Only Super Admin can suspend other Admin accounts.');
      return;
    }
    toggleUserStatus(user.id);
    const newSt = user.status === 'active' ? 'Suspended' : 'Activated';

    addAuditLog({
      id: Date.now(),
      actor_name: isSuperAdmin ? 'Super Administrator' : 'Admin User',
      action: `${newSt} Account`,
      target_user: `${user.full_name} (${user.role_display})`,
      details: `Status changed to ${newSt}`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
    });
  };

  const handleResetPassword = (user) => {
    const temp = `RESET-${Math.random().toString(36).slice(-6).toUpperCase()}`;
    alert(`Password reset for ${user.full_name}! Temporary password: ${temp}`);

    addAuditLog({
      id: Date.now(),
      actor_name: isSuperAdmin ? 'Super Administrator' : 'Admin User',
      action: 'Reset Password',
      target_user: `${user.full_name} (${user.role_display})`,
      details: `Temp password ${temp} issued`,
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
    });
  };

  const handleDeleteUser = (user) => {
    if (!isSuperAdmin) {
      alert('Only Super Admin can delete user accounts.');
      return;
    }
    if (confirm(`Are you sure you want to delete user ${user.full_name}?`)) {
      deleteSystemUser(user.id);
      addAuditLog({
        id: Date.now(),
        actor_name: 'Super Administrator',
        action: 'Deleted Account',
        target_user: `${user.full_name} (${user.role_display})`,
        details: 'User account removed from system',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16)
      });
    }
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Settings & User Management</h1>
          <p className="page-subtitle">Manage system user accounts, role permission matrix, and view audit logs</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} /> Add New User
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="tabs-bar">
        {[
          { id: 'users',       label: 'User Accounts',       icon: UserCheck },
          { id: 'permissions', label: 'Role Permissions Matrix', icon: Sliders },
          { id: 'audit',       label: 'Audit Trail Logs',     icon: History },
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
            <div className="search-input-wrap" style={{ flex: '0 1 280px' }}>
              <Search size={14} />
              <input
                className="form-input search-input"
                placeholder="Search user name, email, role..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User Name</th>
                    <th>Email & Phone</th>
                    <th>Assigned Role</th>
                    <th>Branch Location</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(user => {
                    const isOtherAdmin = user.role === 'admin' && !isSuperAdmin;
                    return (
                      <tr key={user.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{user.full_name}</div>
                          {user.temp_password && (
                            <div className="ts" style={{ fontSize: '0.68rem', color: 'var(--amber-600)' }}>Temp: {user.temp_password}</div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.82rem' }}>{user.email}</div>
                          <div className="ts" style={{ color: 'var(--status-grey)' }}>{user.phone}</div>
                        </td>
                        <td>
                          <span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>
                            {user.role_display}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>{user.branch}</td>
                        <td>
                          <span className={`badge ${user.status === 'active' ? 'badge-green' : 'badge-red'}`}>
                            {user.status === 'active' ? 'Active' : 'Suspended'}
                          </span>
                        </td>
                        <td className="ts">{user.last_login}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button
                              className={`btn btn-ghost btn-sm`}
                              onClick={() => handleToggleStatus(user)}
                              disabled={isOtherAdmin}
                              title={user.status === 'active' ? 'Suspend Account' : 'Activate Account'}
                            >
                              {user.status === 'active' ? 'Suspend' : 'Activate'}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleResetPassword(user)}
                              disabled={isOtherAdmin}
                              title="Reset Password"
                            >
                              Reset
                            </button>
                            {isSuperAdmin && (
                              <button
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--status-red)' }}
                                onClick={() => handleDeleteUser(user)}
                                title="Delete Account"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
            {/* Permission Legend Badges */}
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
                  {MODULE_LIST.map(m => (
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
                    {MODULE_LIST.map(mod => {
                      const perms = permissionMatrix[roleKey]?.[mod.id] || { view: false, add: false, edit: false, delete: false };
                      const PERM_NAMES = { view: 'View', add: 'Add', edit: 'Edit', delete: 'Delete' };
                      return (
                        <td key={mod.id} style={{ textAlign: 'center', background: 'var(--sage-50)' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, fontSize: '0.68rem' }}>
                            {['view', 'add', 'edit', 'delete'].map(pk => {
                              const checked = perms[pk];
                              const labelText = pk[0].toUpperCase();
                              const fullName = PERM_NAMES[pk];
                              return (
                                <label
                                  key={pk}
                                  title={`${labelText} = ${fullName} Permission (${checked ? 'Allowed' : 'Denied'})`}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: isSuperAdmin ? 'pointer' : 'default' }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!isSuperAdmin}
                                    onChange={() => togglePermission(roleKey, mod.id, pk)}
                                    style={{ accentColor: 'var(--purple-700)' }}
                                  />
                                  <span style={{ color: checked ? 'var(--purple-700)' : '#9ca3af', fontWeight: checked ? 700 : 500 }}>{labelText}</span>
                                </label>
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

      {/* ── TAB 3: AUDIT LOG ───────────────────────────────────────────── */}
      {activeTab === 'audit' && (
        <div className="card">
          <div className="card-header">
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
              {auditLogs.map(log => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add User Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ width: 460 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>Add New System User</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddModal(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input className="form-input" value={userForm.full_name} onChange={e => setUserForm({...userForm, full_name: e.target.value})} placeholder="e.g. Dr. Aslam Khan" />
              </div>
              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input type="email" className="form-input" value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} placeholder="user@homecareos.com" />
              </div>
              <div className="form-group">
                <label className="form-label">Contact Phone (+92)</label>
                <input className="form-input" value={userForm.phone} onChange={e => setUserForm({...userForm, phone: e.target.value})} placeholder="+92-300-1234567" />
              </div>
              <div className="form-group">
                <label className="form-label">Assigned User Role *</label>
                <select className="form-select" value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})}>
                  {Object.entries(ROLE_CONFIG).filter(([k]) => k !== 'patient_family').map(([k, cfg]) => (
                    <option key={k} value={k}>{cfg.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Branch / Location Assignment</label>
                <select className="form-select" value={userForm.branch} onChange={e => setUserForm({...userForm, branch: e.target.value})}>
                  <option value="Head Office (Karachi)">Head Office (Karachi)</option>
                  <option value="Gulshan Branch (Karachi)">Gulshan Branch (Karachi)</option>
                  <option value="Clifton Branch (Karachi)">Clifton Branch (Karachi)</option>
                  <option value="DHA Branch (Karachi)">DHA Branch (Karachi)</option>
                  <option value="North Nazimabad Branch (Karachi)">North Nazimabad Branch (Karachi)</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddUserSubmit}>Create Account & Issue Temp Password</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
