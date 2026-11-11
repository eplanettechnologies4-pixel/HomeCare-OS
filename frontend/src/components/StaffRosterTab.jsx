import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar, Clock, Users, CheckCircle2, AlertTriangle, ChevronLeft,
  ChevronRight, Copy, Plus, Trash2, History, Settings, Shield, X,
  Car, RefreshCw, AlertCircle, Edit3, Check, Filter, Search, ArrowRight
} from 'lucide-react';
import apiFetch from '../services/api';
import useStore from '../store/useStore';

function formatKarachiDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function StaffRosterTab() {
  const currentRole = useStore((s) => s.currentRole);
  const currentUser = useStore((s) => s.currentUser);
  const canPublish = ['super_admin', 'admin'].includes(currentRole);
  const isCareManager = currentRole === 'care_manager';

  // Week navigation (Monday start)
  const [currentMonday, setCurrentMonday] = useState(() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when Sunday
    const monday = new Date(now.setDate(diff));
    return monday.toISOString().split('T')[0];
  });

  const [roleFilter, setRoleFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [rosterData, setRosterData] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [toast, setToast] = useState(null);

  // Modals & Drawers
  const [cellEditModal, setCellEditModal] = useState({ open: false, staff: null, date: null, currentShift: null });
  const [templatesModal, setTemplatesModal] = useState(false);
  const [historyModal, setHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Bulk Actions Modal
  const [bulkModal, setBulkModal] = useState({ open: false, type: 'copy_previous_week' });
  const [selectedStaffIds, setSelectedStaffIds] = useState([]);
  const [bulkShiftTemplateId, setBulkShiftTemplateId] = useState('');
  const [bulkDays, setBulkDays] = useState(['mon', 'tue', 'wed', 'thu', 'fri']);

  // Template Form State
  const [templateForm, setTemplateForm] = useState({
    name: '',
    start_time: '08:00',
    end_time: '16:00',
    location: 'Main Hospital / Field',
    color: '#059669',
    is_off: false,
  });
  const [editingTemplateId, setEditingTemplateId] = useState(null);

  // Cell Edit Form State
  const [cellForm, setCellForm] = useState({
    shift_template_id: '',
    is_off: false,
    buddy_staff_id: '',
    transport_driver_name: '',
    transport_driver_phone: '',
    transport_pickup_time: '',
    reason: '',
  });

  // Fetch Roster Grid
  const fetchRoster = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ week_start: currentMonday });
      if (roleFilter) params.append('role', roleFilter);
      if (searchQuery) params.append('search', searchQuery);

      const res = await apiFetch(`/staff/roster/?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setRosterData(json);
      } else {
        const err = await res.json();
        setToast({ type: 'error', text: err.detail || 'Failed to load staff roster.' });
      }
    } catch {
      setToast({ type: 'error', text: 'Network connection error loading roster.' });
    } finally {
      setLoading(false);
    }
  }, [currentMonday, roleFilter, searchQuery]);

  // Fetch Templates
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await apiFetch('/staff/shift-templates/?all=true');
      if (res.ok) {
        const json = await res.json();
        setTemplates(json);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchRoster();
  }, [fetchRoster]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Navigate Week
  const handlePrevWeek = () => {
    const cur = new Date(currentMonday + 'T00:00:00');
    cur.setDate(cur.getDate() - 7);
    setCurrentMonday(cur.toISOString().split('T')[0]);
  };

  const handleNextWeek = () => {
    const cur = new Date(currentMonday + 'T00:00:00');
    cur.setDate(cur.getDate() + 7);
    setCurrentMonday(cur.toISOString().split('T')[0]);
  };

  const handleThisWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    setCurrentMonday(monday.toISOString().split('T')[0]);
  };

  // Cell Click -> Open Assignment Modal
  const handleCellClick = (staffObj, dateStr, shiftInfo) => {
    if (shiftInfo?.is_leave) {
      setToast({ type: 'info', text: `${staffObj.name} is on Approved Leave on this day. Shifts cannot be assigned on approved leave days.` });
      return;
    }

    setCellEditModal({
      open: true,
      staff: staffObj,
      date: dateStr,
      currentShift: shiftInfo,
    });

    setCellForm({
      shift_template_id: shiftInfo?.shift_template_id || (templates[0]?.id || ''),
      is_off: bool(shiftInfo?.is_off),
      buddy_staff_id: shiftInfo?.buddy_staff_id || '',
      transport_driver_name: shiftInfo?.transport_driver_name || '',
      transport_driver_phone: shiftInfo?.transport_driver_phone || '',
      transport_pickup_time: shiftInfo?.transport_pickup_time || '',
      reason: '',
    });
  };

  function bool(val) {
    return Boolean(val);
  }

  // Save Cell Assignment
  const handleSaveCell = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/staff/roster/assign/', {
        method: 'POST',
        body: JSON.stringify({
          staff_id: cellEditModal.staff.id,
          date: cellEditModal.date,
          shift_template_id: cellForm.is_off ? null : cellForm.shift_template_id,
          is_off: cellForm.is_off,
          buddy_staff_id: cellForm.buddy_staff_id || null,
          transport_driver_name: cellForm.transport_driver_name,
          transport_driver_phone: cellForm.transport_driver_phone,
          transport_pickup_time: cellForm.transport_pickup_time,
          reason: cellForm.reason,
        }),
      });

      if (res.ok) {
        setToast({ type: 'success', text: `Shift saved for ${cellEditModal.staff.name} on ${cellEditModal.date}.` });
        setCellEditModal({ open: false, staff: null, date: null, currentShift: null });
        fetchRoster();
      } else {
        const err = await res.json();
        setToast({ type: 'error', text: err.detail || 'Failed to assign shift.' });
      }
    } catch {
      setToast({ type: 'error', text: 'Network connection error saving shift.' });
    }
  };

  // Publish Week
  const handlePublishWeek = async () => {
    if (!window.confirm(`Publish duty roster for the week of ${formatKarachiDate(currentMonday)}?\n\nThis will make all assignments live for clinical staff and send each affected staff member an official notification.`)) {
      return;
    }

    try {
      const res = await apiFetch('/staff/roster/publish/', {
        method: 'POST',
        body: JSON.stringify({ week_start: currentMonday }),
      });

      if (res.ok) {
        const json = await res.json();
        setToast({ type: 'success', text: `Roster Published! Revision ${json.revision} is now live (${json.notifications_sent} staff notified).` });
        fetchRoster();
      } else {
        const err = await res.json();
        setToast({ type: 'error', text: err.detail || 'Failed to publish roster.' });
      }
    } catch {
      setToast({ type: 'error', text: 'Network connection error publishing roster.' });
    }
  };

  // Execute Bulk Action
  const handleExecuteBulk = async () => {
    const actionType = bulkModal.type;

    let payload = { action: actionType, week_start: currentMonday };

    if (actionType === 'copy_previous_week') {
      if (!window.confirm(`Copy all shifts from the previous week into the week of ${formatKarachiDate(currentMonday)}?\n\nStaff on approved leave will be safely preserved.`)) {
        return;
      }
    } else if (actionType === 'apply_shift') {
      if (selectedStaffIds.length === 0) {
        setToast({ type: 'error', text: 'Please select at least one staff member.' });
        return;
      }
      if (!bulkShiftTemplateId) {
        setToast({ type: 'error', text: 'Please select a shift template.' });
        return;
      }
      // Map day names to dates
      const selectedDates = (rosterData?.days || []).map(d => d.date);
      if (!window.confirm(`Apply selected shift to ${selectedStaffIds.length} staff member(s) across this week?`)) {
        return;
      }
      payload.staff_ids = selectedStaffIds;
      payload.dates = selectedDates;
      payload.shift_template_id = bulkShiftTemplateId;
    } else if (actionType === 'fill_mon_fri') {
      if (selectedStaffIds.length === 0) {
        setToast({ type: 'error', text: 'Please select a staff member.' });
        return;
      }
      if (!window.confirm(`Fill Monday to Friday shift for selected staff member?`)) {
        return;
      }
      payload.staff_id = selectedStaffIds[0];
      payload.shift_template_id = bulkShiftTemplateId || templates[0]?.id;
    } else if (actionType === 'clear_cells') {
      if (selectedStaffIds.length === 0) {
        setToast({ type: 'error', text: 'Please select at least one staff member.' });
        return;
      }
      if (!window.confirm(`Clear all assigned shifts for ${selectedStaffIds.length} staff member(s) in this week?`)) {
        return;
      }
      payload.staff_ids = selectedStaffIds;
      payload.dates = (rosterData?.days || []).map(d => d.date);
    }

    try {
      const res = await apiFetch('/staff/roster/bulk/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const json = await res.json();
        setToast({ type: 'success', text: `Bulk action complete: ${json.cells_updated} shifts updated.` });
        setBulkModal({ open: false, type: 'copy_previous_week' });
        setSelectedStaffIds([]);
        fetchRoster();
      } else {
        const err = await res.json();
        setToast({ type: 'error', text: err.detail || 'Bulk action failed.' });
      }
    } catch {
      setToast({ type: 'error', text: 'Network connection error.' });
    }
  };

  // Open History Modal
  const handleOpenHistory = async () => {
    setHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await apiFetch(`/staff/roster/history/?week_start=${currentMonday}`);
      if (res.ok) {
        const json = await res.json();
        setHistoryLogs(json.results || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  // Save Shift Template
  const handleSaveTemplate = async (e) => {
    e.preventDefault();
    try {
      let res;
      if (editingTemplateId) {
        res = await apiFetch(`/staff/shift-templates/${editingTemplateId}/`, {
          method: 'PATCH',
          body: JSON.stringify(templateForm),
        });
      } else {
        res = await apiFetch('/staff/shift-templates/', {
          method: 'POST',
          body: JSON.stringify(templateForm),
        });
      }

      if (res.ok) {
        setToast({ type: 'success', text: `Shift template ${editingTemplateId ? 'updated' : 'created'} successfully.` });
        setEditingTemplateId(null);
        setTemplateForm({ name: '', start_time: '08:00', end_time: '16:00', location: 'Main Hospital', color: '#059669', is_off: false });
        fetchTemplates();
      } else {
        const err = await res.json();
        setToast({ type: 'error', text: err.detail || 'Failed to save shift template.' });
      }
    } catch {
      setToast({ type: 'error', text: 'Network error saving template.' });
    }
  };

  const handleToggleTemplateStatus = async (tmpl) => {
    try {
      const res = await apiFetch(`/staff/shift-templates/${tmpl.id}/deactivate/`, { method: 'POST' });
      if (res.ok) {
        fetchTemplates();
      }
    } catch {
      // ignore
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            background: toast.type === 'error' ? '#FEF2F2' : (toast.type === 'info' ? '#EFF6FF' : '#ECFDF5'),
            border: `1px solid ${toast.type === 'error' ? '#FCA5A5' : (toast.type === 'info' ? '#BFDBFE' : '#A7F3D0')}`,
            color: toast.type === 'error' ? '#991B1B' : (toast.type === 'info' ? '#1E40AF' : '#065F46'),
            fontSize: '0.88rem',
            fontWeight: 600,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {toast.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{toast.text}</span>
          </div>
          <button type="button" onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* ── Top Bar: Week Picker, Status Badge, Bulk Actions, Publish Button ── */}
      <div
        className="card"
        style={{
          padding: '18px 22px',
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #EEF0F4',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
        }}
      >
        {/* Left: Week Navigation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F3F4F6', borderRadius: 10, padding: 4 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handlePrevWeek}
              title="Previous week"
              style={{ padding: '6px 10px' }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleThisWeek}
              style={{ fontWeight: 700, fontSize: '0.8rem', padding: '6px 12px' }}
            >
              This Week
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleNextWeek}
              title="Next week"
              style={{ padding: '6px 10px' }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1E1B4B' }}>
              Week of {formatKarachiDate(rosterData?.week_start_date || currentMonday)} – {formatKarachiDate(rosterData?.week_end_date || currentMonday)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
              Standard 7-Day Clinical Grid (Monday start · Asia/Karachi)
            </div>
          </div>

          {/* Status & Revision Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: 999,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                background: rosterData?.status === 'published' ? '#D1FAE5' : '#FEF3C7',
                color: rosterData?.status === 'published' ? '#065F46' : '#92400E',
                border: `1px solid ${rosterData?.status === 'published' ? '#A7F3D0' : '#FDE68A'}`,
              }}
            >
              {rosterData?.status === 'published' ? '● Published' : '○ Draft'} (Rev {rosterData?.revision || 1})
            </span>
            {rosterData?.published_at && (
              <span style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>
                Published {new Date(rosterData.published_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} by {rosterData.published_by || 'Admin'}
              </span>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={fetchRoster}
            title="Refresh Roster"
            style={{ color: '#6B7280' }}
          >
            <RefreshCw size={14} /> Refresh
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setTemplatesModal(true)}
            style={{ color: '#4B5563', gap: 6 }}
          >
            <Settings size={14} /> Shift Templates
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleOpenHistory}
            style={{ color: '#4B5563', gap: 6 }}
          >
            <History size={14} /> Audit Trail
          </button>

          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => setBulkModal({ open: true, type: 'copy_previous_week' })}
            style={{ color: '#6D28D9', borderColor: '#DDD6FE', gap: 6 }}
          >
            <Copy size={14} /> Bulk Actions
          </button>

          {canPublish && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={handlePublishWeek}
              style={{
                background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
                boxShadow: '0 2px 8px rgba(109,40,217,0.3)',
                fontWeight: 700,
                gap: 6,
              }}
            >
              <CheckCircle2 size={15} /> Publish Week
            </button>
          )}
        </div>
      </div>

      {/* ── Validation Warnings / Role Coverage Banner ── */}
      {rosterData?.coverage_warnings?.length > 0 && (
        <div
          style={{
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#92400E', fontWeight: 700, fontSize: '0.85rem' }}>
            <AlertTriangle size={16} /> Clinical Role Coverage Alerts:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {rosterData.coverage_warnings.map((w, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: '#FEF3C7',
                  color: '#B45309',
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid #FDE68A',
                }}
              >
                {w.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty Shift Templates Alert / Callout ── */}
      {!loading && templates.length === 0 && (
        <div
          style={{
            background: '#F5F3FF',
            border: '1.5px dashed #A78BFA',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: '#DDD6FE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6D28D9',
                flexShrink: 0,
              }}
            >
              <Clock size={22} />
            </div>
            <div>
              <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#4C1D95' }}>
                Create your first shift template
              </div>
              <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: 2 }}>
                Define shift schedules (e.g. Morning, Evening, Night) to start assigning clinical duty hours.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setTemplatesModal(true)}
            style={{
              background: '#6D28D9',
              fontWeight: 700,
              gap: 6,
              padding: '8px 16px',
            }}
          >
            <Plus size={16} /> Create your first shift template
          </button>
        </div>
      )}

      {/* ── Filter & Search Row ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="search-input-wrap" style={{ flex: '1 1 240px', maxWidth: 320 }}>
          <Search size={14} />
          <input
            type="text"
            className="form-input"
            placeholder="Search staff name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="form-select"
          style={{ width: 'auto', minWidth: 160 }}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="">All Clinical Roles</option>
          <option value="nurse">Nurse</option>
          <option value="doctor">Doctor</option>
          <option value="physio">Physiotherapist</option>
          <option value="speech">Speech Therapist</option>
          <option value="psychologist">Psychotherapist</option>
          <option value="dietician">Dietician</option>
        </select>

        <div style={{ fontSize: '0.8rem', color: '#6B7280', marginLeft: 'auto' }}>
          Weekly Overtime Threshold: <strong>{rosterData?.max_weekly_hours || 60}h max</strong> (HR Policy)
        </div>
      </div>

      {/* ── Weekly Roster Grid Table ── */}
      <div
        className="card"
        style={{
          background: '#FFFFFF',
          borderRadius: 16,
          border: '1px solid #EEF0F4',
          overflowX: 'auto',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#FAF5FF', borderBottom: '2px solid #EDE9FE' }}>
              <th style={{ padding: '14px 16px', minWidth: 220, fontSize: '0.82rem', fontWeight: 800, color: '#4B5563' }}>
                Staff Member
              </th>
              {(rosterData?.days || []).map((d) => (
                <th key={d.date} style={{ padding: '14px 12px', minWidth: 130, textAlign: 'center' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#1E1B4B' }}>{d.short_name}</div>
                  <div style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: 2 }}>{d.date.slice(5)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={{ padding: 48, textAlign: 'center' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }} />
                  <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>Loading weekly schedule grid...</div>
                </td>
              </tr>
            ) : rosterData?.staff?.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 48, textAlign: 'center', color: '#6B7280' }}>
                  No staff members match the selected filter.
                </td>
              </tr>
            ) : (
              (rosterData?.staff || []).map((st) => (
                <tr key={st.id} style={{ borderBottom: '1px solid #F3F4F6', transition: 'background 0.15s ease' }}>
                  {/* Staff Info Column */}
                  <td style={{ padding: '12px 16px', background: '#FAFAFA', borderRight: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          background: '#EDE9FE',
                          color: '#6D28D9',
                          fontWeight: 800,
                          fontSize: '0.85rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          overflow: 'hidden',
                        }}
                      >
                        {st.photo ? (
                          <img src={st.photo} alt={st.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          st.name.split(' ').map(n => n[0]).join('')
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1F2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {st.name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600 }}>{st.role_display}</span>
                          <span style={{ fontSize: '0.68rem', color: '#9CA3AF' }}>• {st.employee_id}</span>
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <span
                            style={{
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: st.exceeds_max_hours ? '#FEE2E2' : '#F3F4F6',
                              color: st.exceeds_max_hours ? '#DC2626' : '#4B5563',
                              border: st.exceeds_max_hours ? '1px solid #FCA5A5' : 'none',
                            }}
                            title={st.exceeds_max_hours ? `Exceeds max weekly limit (${rosterData?.max_weekly_hours}h)` : 'Total weekly scheduled hours'}
                          >
                            {st.weekly_hours} hrs {st.exceeds_max_hours && '⚠️ Max exceeded'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 7 Day Cells */}
                  {(rosterData?.days || []).map((d) => {
                    const shift = st.shifts?.[d.date];
                    const isLeave = shift?.state === 'leave';
                    const isOff = shift?.state === 'off' || shift?.is_off;
                    const isShift = shift?.state === 'shift';

                    return (
                      <td
                        key={d.date}
                        onClick={() => handleCellClick(st, d.date, shift)}
                        style={{
                          padding: 8,
                          textAlign: 'center',
                          cursor: isLeave ? 'not-allowed' : 'pointer',
                          background: isLeave ? '#F9FAFB' : '#FFFFFF',
                          borderRight: '1px solid #F9FAFB',
                        }}
                      >
                        {isLeave ? (
                          <div
                            style={{
                              padding: '8px 6px',
                              borderRadius: 8,
                              background: '#F3F4F6',
                              border: '1px dashed #D1D5DB',
                              fontSize: '0.72rem',
                              color: '#6B7280',
                              fontWeight: 700,
                            }}
                            title={`Approved Leave: ${shift.leave_reason || shift.leave_type_display}`}
                          >
                            🌴 Leave
                            <div style={{ fontSize: '0.65rem', fontWeight: 500, color: '#9CA3AF' }}>{shift.leave_type_display}</div>
                          </div>
                        ) : isOff ? (
                          <div
                            style={{
                              padding: '8px 6px',
                              borderRadius: 8,
                              background: '#F3F4F6',
                              border: '1px solid #E5E7EB',
                              fontSize: '0.72rem',
                              color: '#4B5563',
                              fontWeight: 600,
                            }}
                          >
                            Off Duty
                          </div>
                        ) : isShift ? (
                          <div
                            style={{
                              padding: '6px 8px',
                              borderRadius: 8,
                              background: `${shift.color}15`,
                              border: `1.5px solid ${shift.color}40`,
                              color: '#1F2937',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textAlign: 'left',
                              position: 'relative',
                            }}
                          >
                            <div style={{ color: shift.color, fontWeight: 800 }}>{shift.shift_name}</div>
                            {shift.start_time && shift.end_time && (
                              <div style={{ fontSize: '0.68rem', color: '#6B7280', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Clock size={11} />
                                {shift.start_time} – {shift.end_time}
                              </div>
                            )}
                            {(shift.buddy_name || shift.transport_driver_name) && (
                              <div style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: 2 }}>
                                {shift.buddy_name && `Buddy: ${shift.buddy_name.split(' ')[0]}`}
                                {shift.transport_driver_name && ` • Van: ${shift.transport_driver_name.split(' ')[0]}`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              padding: '10px 6px',
                              borderRadius: 8,
                              border: '1px dashed #E5E7EB',
                              color: '#9CA3AF',
                              fontSize: '0.72rem',
                              fontWeight: 500,
                            }}
                          >
                            + Assign
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── MODAL 1: Edit Shift Cell Modal ── */}
      {cellEditModal.open && cellEditModal.staff && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setCellEditModal({ open: false, staff: null, date: null, currentShift: null })}>
          <div className="modal" style={{ width: 500, maxWidth: '95vw', padding: 24, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1E1B4B' }}>
                  Assign Clinical Shift
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: 2 }}>
                  {cellEditModal.staff.name} ({cellEditModal.staff.role_display}) • {cellEditModal.date}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-icon"
                onClick={() => setCellEditModal({ open: false, staff: null, date: null, currentShift: null })}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCell} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="shift_type"
                    checked={!cellForm.is_off}
                    onChange={() => setCellForm(f => ({ ...f, is_off: false }))}
                  />
                  Working Shift
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="shift_type"
                    checked={cellForm.is_off}
                    onChange={() => setCellForm(f => ({ ...f, is_off: true }))}
                  />
                  Mark as Off Duty
                </label>
              </div>

              {!cellForm.is_off && (
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>Shift Template</label>
                  <select
                    className="form-select"
                    value={cellForm.shift_template_id}
                    onChange={(e) => setCellForm({ ...cellForm, shift_template_id: e.target.value })}
                    required={!cellForm.is_off}
                  >
                    <option value="">Choose shift...</option>
                    {templates.filter(t => !t.is_off && t.is_active).map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.start_time?.slice(0,5)} – {t.end_time?.slice(0,5)} · {t.location})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Transport & Buddy Fields */}
              {!cellForm.is_off && (
                <div style={{ background: '#F9FAFB', padding: 12, borderRadius: 10, border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#4B5563', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Car size={13} /> Shift Buddy & Transport Dispatch (Optional)
                  </div>

                  <div className="grid-2" style={{ gap: 10 }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 600 }}>Driver Name</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Driver name"
                        value={cellForm.transport_driver_name}
                        onChange={(e) => setCellForm({ ...cellForm, transport_driver_name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 600 }}>Driver Phone</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Phone number"
                        value={cellForm.transport_driver_phone}
                        onChange={(e) => setCellForm({ ...cellForm, transport_driver_phone: e.target.value })}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 600 }}>Pickup Time</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 07:15 AM"
                      value={cellForm.transport_pickup_time}
                      onChange={(e) => setCellForm({ ...cellForm, transport_pickup_time: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>Reason / Audit Note (Optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Coverage swap, emergency roster adjustment"
                  value={cellForm.reason}
                  onChange={(e) => setCellForm({ ...cellForm, reason: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setCellEditModal({ open: false, staff: null, date: null, currentShift: null })}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ background: '#6D28D9', gap: 6 }}>
                  <Check size={14} /> Save Shift Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Shift Templates Manager ── */}
      {templatesModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setTemplatesModal(false)}>
          <div className="modal" style={{ width: 680, maxWidth: '95vw', padding: 24, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1E1B4B' }}>
                  Shift Templates Manager
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                  Create and manage master shifts. Changes do not rewrite past published assignments.
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setTemplatesModal(false)}>
                <X size={16} />
              </button>
            </div>

            {/* Template Form */}
            {canPublish && (
              <form onSubmit={handleSaveTemplate} style={{ background: '#FAF5FF', padding: 16, borderRadius: 12, border: '1px solid #E9D5FF', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#6D28D9' }}>
                  {editingTemplateId ? 'Edit Shift Template' : 'Add New Shift Template'}
                </div>

                <div className="grid-2" style={{ gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Shift Name</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Morning, Evening, Night"
                      value={templateForm.name}
                      onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Duty Location</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Main Hospital, Home Care"
                      value={templateForm.location}
                      onChange={(e) => setTemplateForm({ ...templateForm, location: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid-3" style={{ gap: 10 }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Start Time</label>
                    <input
                      type="time"
                      className="form-input"
                      value={templateForm.start_time}
                      onChange={(e) => setTemplateForm({ ...templateForm, start_time: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>End Time</label>
                    <input
                      type="time"
                      className="form-input"
                      value={templateForm.end_time}
                      onChange={(e) => setTemplateForm({ ...templateForm, end_time: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>Badge Color</label>
                    <input
                      type="color"
                      className="form-input"
                      style={{ height: 38, padding: 2 }}
                      value={templateForm.color}
                      onChange={(e) => setTemplateForm({ ...templateForm, color: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  {editingTemplateId && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditingTemplateId(null);
                        setTemplateForm({ name: '', start_time: '08:00', end_time: '16:00', location: 'Main Hospital', color: '#059669', is_off: false });
                      }}
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button type="submit" className="btn btn-primary btn-sm" style={{ background: '#6D28D9' }}>
                    {editingTemplateId ? 'Update Template' : 'Add Template'}
                  </button>
                </div>
              </form>
            )}

            {/* List Templates */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {templates.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: '#6B7280', background: '#F9FAFB', borderRadius: 8, border: '1px dashed #D1D5DB' }}>
                  <Clock size={28} style={{ margin: '0 auto 8px', color: '#9CA3AF' }} />
                  <div style={{ fontWeight: 600, color: '#374151' }}>Create your first shift template</div>
                  <div style={{ fontSize: '0.8rem', marginTop: 4 }}>Use the form above to add a shift template (e.g., Morning 08:00 - 16:00).</div>
                </div>
              )}
              {templates.map(t => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: t.is_active ? '#FFFFFF' : '#F9FAFB',
                    border: `1px solid ${t.is_active ? '#E5E7EB' : '#F3F4F6'}`,
                    opacity: t.is_active ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, background: t.color }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1F2937' }}>
                        {t.name} {!t.is_active && <span style={{ color: '#DC2626', fontSize: '0.7rem' }}>(Deactivated)</span>}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                        {t.start_time?.slice(0,5)} – {t.end_time?.slice(0,5)} • {t.location}
                      </div>
                    </div>
                  </div>

                  {canPublish && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditingTemplateId(t.id);
                          setTemplateForm({
                            name: t.name,
                            start_time: t.start_time?.slice(0,5) || '08:00',
                            end_time: t.end_time?.slice(0,5) || '16:00',
                            location: t.location || '',
                            color: t.color || '#059669',
                            is_off: t.is_off,
                          });
                        }}
                      >
                        <Edit3 size={13} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleToggleTemplateStatus(t)}
                        style={{ color: t.is_active ? '#DC2626' : '#059669', fontSize: '0.72rem' }}
                      >
                        {t.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Bulk Actions Modal ── */}
      {bulkModal.open && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setBulkModal({ open: false, type: 'copy_previous_week' })}>
          <div className="modal" style={{ width: 560, maxWidth: '95vw', padding: 24, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#1E1B4B' }}>
                  Roster Bulk Actions
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                  Target week: {formatKarachiDate(currentMonday)}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setBulkModal({ open: false, type: 'copy_previous_week' })}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="form-label" style={{ fontWeight: 700 }}>Choose Action</label>
                <select
                  className="form-select"
                  value={bulkModal.type}
                  onChange={(e) => setBulkModal({ ...bulkModal, type: e.target.value })}
                >
                  <option value="copy_previous_week">1. Copy Previous Week's Roster (Mon-Sun)</option>
                  <option value="apply_shift">2. Apply a Shift Template to Selected Staff</option>
                  <option value="fill_mon_fri">3. Fill Monday to Friday for One Staff Member</option>
                  <option value="clear_cells">4. Clear Shifts for Selected Staff in this Week</option>
                </select>
              </div>

              {/* Selection for apply_shift / fill_mon_fri / clear_cells */}
              {bulkModal.type !== 'copy_previous_week' && (
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Select Staff Member(s)</label>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 8, padding: 8 }}>
                    {(rosterData?.staff || []).map(s => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                          type={bulkModal.type === 'fill_mon_fri' ? 'radio' : 'checkbox'}
                          name="selected_staff"
                          checked={selectedStaffIds.includes(s.id)}
                          onChange={(e) => {
                            if (bulkModal.type === 'fill_mon_fri') {
                              setSelectedStaffIds([s.id]);
                            } else {
                              if (e.target.checked) setSelectedStaffIds(prev => [...prev, s.id]);
                              else setSelectedStaffIds(prev => prev.filter(id => id !== s.id));
                            }
                          }}
                        />
                        <span>{s.name} ({s.role_display})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {['apply_shift', 'fill_mon_fri'].includes(bulkModal.type) && (
                <div>
                  <label className="form-label" style={{ fontWeight: 700 }}>Shift Template to Apply</label>
                  <select
                    className="form-select"
                    value={bulkShiftTemplateId}
                    onChange={(e) => setBulkShiftTemplateId(e.target.value)}
                  >
                    <option value="">Select shift template...</option>
                    {templates.filter(t => t.is_active).map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.start_time?.slice(0,5)} – {t.end_time?.slice(0,5)})</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ background: '#FFFBEB', padding: 10, borderRadius: 8, border: '1px solid #FCD34D', fontSize: '0.78rem', color: '#92400E' }}>
                ⚠️ Notice: A confirmation prompt showing the exact number of modified cells will appear before applying. Approved leave days are never overwritten.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setBulkModal({ open: false, type: 'copy_previous_week' })}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={handleExecuteBulk} style={{ background: '#6D28D9' }}>
                  Execute Bulk Action
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: Audit History Modal ── */}
      {historyModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setHistoryModal(false)}>
          <div className="modal" style={{ width: 680, maxWidth: '95vw', padding: 24, borderRadius: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#1E1B4B' }}>
                  Roster Audit History
                </h3>
                <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                  Immutable chronological audit logs for week {formatKarachiDate(currentMonday)} (No PHI stored).
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setHistoryModal(false)}>
                <X size={16} />
              </button>
            </div>

            {loadingHistory ? (
              <div style={{ padding: 36, textAlign: 'center' }}>
                <div className="spinner" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>Loading audit entries...</div>
              </div>
            ) : historyLogs.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#6B7280', padding: 32, fontSize: '0.85rem' }}>
                No audit entries recorded for this week window yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 400, overflowY: 'auto' }}>
                {historyLogs.map(l => (
                  <div
                    key={l.id}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 8,
                      background: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      fontSize: '0.82rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, color: '#1F2937' }}>
                      <span>{l.action}</span>
                      <span style={{ fontSize: '0.72rem', color: '#6B7280', fontWeight: 500 }}>
                        {new Date(l.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#4B5563', marginTop: 4 }}>
                      Actor: <strong>{l.actor_name}</strong> • Target: <em>{l.target}</em>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#6B7280', marginTop: 4, fontFamily: 'monospace' }}>
                      {l.details}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

