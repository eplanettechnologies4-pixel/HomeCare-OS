import React, { useState, useEffect } from 'react';
import { Plus, User, Phone, Tag, ArrowRight, X, CheckCircle, Search, UserCheck, Stethoscope } from 'lucide-react';
import useStore from '../store/useStore';
import { format } from 'date-fns';
import { SERVICE_CATEGORIES, getItemsByCategory, findCatalogItem, PHARMACY_REQUIREMENTS_NOTE } from '../data/serviceCatalog';

const STAGES = [
  { id: 'new_lead',   title: 'New Lead',   color: '#3eb39e' },
  { id: 'contacted',  title: 'Contacted',  color: '#DE9A3C' },
  { id: 'follow_up',  title: 'Follow-up',  color: '#b87320' },
  { id: 'converted',  title: 'Converted',  color: '#2D6A4F' },
];

export default function CRM() {
  const leads           = useStore((s) => s.leads);
  const catalog         = useStore((s) => s.catalog);
  const fetchCatalog    = useStore((s) => s.fetchCatalog);
  const addLead         = useStore((s) => s.addLead);
  const updateLeadStage = useStore((s) => s.updateLeadStage);
  const addBooking      = useStore((s) => s.addBooking);
  const setActivePage   = useStore((s) => s.setActivePage);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const [showAddModal, setShowAddModal]   = useState(false);
  const [targetStage, setTargetStage]     = useState('new_lead');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [selectedLead, setSelectedLead]   = useState(null);

  // Form states with Catalogue integration
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    phone: '',
    source: 'Website Inquiry',
    category: 'doctors',
    package_type: 'per_month',
    requested_item: 'Online Specialist',
    service_mode: 'online',
    provider_level: 'specialist',
    shift_role: '',
    shift_duration: '4_hours',
    rental_period: '',
    delivery_charge: '',
    estimated_price: 3500,
    amount: '3500',
    notes: '',
  });

  const handleLeadCategoryChange = (catId) => {
    const items = getItemsByCategory(catId, catalog);
    let first = items[0] || null;
    let autoAmount = '';
    let est = null;
    let mode = '';
    let level = '';
    let role = '';
    let period = '';
    let duration = '4_hours';
    let pkgType = newLeadForm.package_type || 'per_month';

    if (catId === 'long_term') {
      pkgType = 'per_month';
      duration = '8_hours';
      role = 'rn';
      first = findCatalogItem('long_term', 'Per month - 8h - Registered Nurse (RN)', catalog) || first;
    }

    if (first) {
      if (first.price_min != null && first.price_min === first.price_max) {
        autoAmount = String(first.price_min);
        est = first.price_min;
      }
      mode = first.service_mode || (catId === 'doctors' ? 'online' : '');
      level = first.provider_level || (catId === 'doctors' ? 'specialist' : '');
      if (catId !== 'long_term') role = first.shift_role || '';
      period = first.rental_period || (catId === 'equipment_rental' ? 'monthly' : '');
      if (first.shift_duration && catId !== 'long_term') duration = first.shift_duration;
    }

    setNewLeadForm(f => ({
      ...f,
      category: catId,
      package_type: pkgType,
      requested_item: first ? first.name : '',
      service_mode: mode,
      provider_level: level,
      shift_role: role,
      rental_period: period,
      shift_duration: duration,
      estimated_price: est,
      amount: autoAmount,
    }));
  };

  const handleLeadItemChange = (itemName) => {
    const it = findCatalogItem(newLeadForm.category, itemName, catalog);
    let autoAmount = '';
    let est = null;
    let mode = newLeadForm.service_mode;
    let level = newLeadForm.provider_level;
    let role = newLeadForm.shift_role;
    let period = newLeadForm.rental_period;
    let duration = newLeadForm.shift_duration;
    let pkgType = newLeadForm.package_type || 'per_month';

    if (it) {
      if (it.price_min != null && it.price_min === it.price_max) {
        autoAmount = String(it.price_min);
        est = it.price_min;
      } else {
        autoAmount = '';
        est = it.price_min || null;
      }
      if (it.service_mode) mode = it.service_mode;
      if (it.provider_level) level = it.provider_level;
      if (it.shift_role) role = it.shift_role;
      if (it.rental_period) period = it.rental_period;
      if (it.shift_duration) duration = it.shift_duration;
      if (it.package_type) pkgType = it.package_type;
      else if (itemName.startsWith('Per shift')) pkgType = 'per_shift';
      else if (itemName.startsWith('Per month')) pkgType = 'per_month';
    }

    setNewLeadForm(f => ({
      ...f,
      requested_item: itemName,
      package_type: pkgType,
      service_mode: mode,
      provider_level: level,
      shift_role: role,
      rental_period: period,
      shift_duration: duration,
      estimated_price: est,
      amount: autoAmount,
    }));
  };

  const handleLeadLongTermChange = (newPkgType, newDuration, newRole) => {
    let role = newRole;
    if (newDuration === '8_hours' && role === 'attendant') {
      role = 'rn';
    } else if (newDuration === '24_hours' && role === 'rn') {
      role = 'assistant';
    }
    const pkgPrefix = newPkgType === 'per_shift' ? 'Per shift' : 'Per month';
    const durPrefix = newDuration === '8_hours' ? '8h' : newDuration === '12_hours' ? '12h' : '24h';
    const roleName = role === 'rn' ? 'Registered Nurse (RN)' : (role === 'assistant' ? 'Nursing Assistant' : 'Nursing Attendant');
    const candidateName = `${pkgPrefix} - ${durPrefix} - ${roleName}`;
    const it = findCatalogItem('long_term', candidateName, catalog);
    setNewLeadForm(f => ({
      ...f,
      package_type: newPkgType,
      shift_duration: newDuration,
      shift_role: role,
      requested_item: it ? candidateName : f.requested_item,
      estimated_price: it?.price_min ?? null,
      amount: it?.price_min ? String(it.price_min) : f.amount,
    }));
  };

  // Native HTML5 Drag and Drop handlers
  const handleDragStart = (e, leadId) => {
    e.dataTransfer.setData('text/plain', leadId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, stageId) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (leadId) {
      updateLeadStage(leadId, stageId);
    }
  };

  const handleAddSubmit = () => {
    if (!newLeadForm.name || !newLeadForm.phone) return;
    const catName = SERVICE_CATEGORIES.find(c => c.id === newLeadForm.category)?.name || newLeadForm.category;
    addLead({
      id: `lead-${Date.now()}`,
      name: newLeadForm.name,
      phone: newLeadForm.phone,
      source: newLeadForm.source,
      service_needed: `${newLeadForm.requested_item || catName} (${catName})`,
      category: newLeadForm.category,
      requested_item: newLeadForm.requested_item,
      service_mode: newLeadForm.service_mode,
      provider_level: newLeadForm.provider_level,
      shift_role: newLeadForm.shift_role,
      rental_period: newLeadForm.rental_period,
      estimated_price: newLeadForm.estimated_price,
      amount: newLeadForm.amount,
      notes: newLeadForm.notes,
      stage: targetStage,
      assigned_to: 'Hina Malik',
      created_at: new Date().toISOString()
    });
    setShowAddModal(false);
    setNewLeadForm({
      name: '',
      phone: '',
      source: 'Website Inquiry',
      category: 'doctors',
      package_type: 'per_month',
      requested_item: 'Online Specialist',
      service_mode: 'online',
      provider_level: 'specialist',
      shift_role: '',
      shift_duration: '4_hours',
      rental_period: '',
      delivery_charge: '',
      estimated_price: 3500,
      amount: '3500',
      notes: '',
    });
  };

  const handleConvertLead = (lead) => {
    setSelectedLead(lead);
    setShowConvertModal(true);
  };

  const confirmConversion = () => {
    if (!selectedLead) return;
    updateLeadStage(selectedLead.id, 'converted');
    
    const amt = Number(selectedLead.amount || selectedLead.estimated_price) || 3500;
    const cat = selectedLead.category || 'doctors';
    const catName = SERVICE_CATEGORIES.find(c => c.id === cat)?.name || cat;

    addBooking({
      id: Date.now(),
      patient_name: selectedLead.name,
      patient_mr: `MR-2026-00${Math.floor(Math.random()*90)+10}`,
      service_type: cat,
      service_type_display: catName,
      requested_item: selectedLead.requested_item || selectedLead.service_needed || '',
      service_mode: selectedLead.service_mode || '',
      provider_level: selectedLead.provider_level || '',
      shift_role: selectedLead.shift_role || '',
      rental_period: selectedLead.rental_period || '',
      estimated_price: selectedLead.estimated_price !== undefined ? selectedLead.estimated_price : null,
      status: 'pending',
      status_display: 'Pending',
      payment_status: 'pending',
      payment_status_display: 'Payment Pending',
      scheduled_time: new Date().toISOString(),
      address: 'Islamabad / Rawalpindi (Lead Address)',
      amount: amt,
      amount_paid: 0,
      balance_due: amt,
      notes: `Converted from CRM Lead (${selectedLead.source}). ${selectedLead.notes || ''}`.trim(),
      created_at: new Date().toISOString()
    });

    setShowConvertModal(false);
    setActivePage('bookings');
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">CRM / Leads Pipeline</h1>
          <p className="page-subtitle">Manage patient inquiries, follow-ups, and convert leads to active bookings</p>
        </div>
      </div>

      {/* Kanban Board Container */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, alignItems: 'flex-start', minHeight: 'calc(100vh - 220px)' }}>
        {STAGES.map(stage => {
          const stageLeads = leads.filter(l => l.stage === stage.id);
          return (
            <div
              key={stage.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, stage.id)}
              style={{
                background: 'var(--sage-100)',
                borderRadius: 'var(--radius-md)',
                padding: 14,
                minHeight: 500,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Column Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: stage.color }} />
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', margin: 0, color: 'var(--teal-800)' }}>
                    {stage.title}
                  </h3>
                </div>
                <span className="badge badge-teal" style={{ fontSize: '0.7rem' }}>
                  {stageLeads.length}
                </span>
              </div>

              {/* Add Lead Button per Column */}
              <button
                className="btn btn-ghost btn-sm"
                style={{ width: '100%', marginBottom: 12, borderStyle: 'dashed', justifyContent: 'center' }}
                onClick={() => { setTargetStage(stage.id); setShowAddModal(true); }}
              >
                <Plus size={13} /> Add Lead
              </button>

              {/* Lead Cards List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
                {stageLeads.map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead.id)}
                    style={{
                      background: 'white',
                      borderRadius: 'var(--radius-sm)',
                      padding: 14,
                      boxShadow: 'var(--shadow-card)',
                      cursor: 'grab',
                      borderLeft: `4px solid ${stage.color}`,
                      transition: 'transform 0.15s, box-shadow 0.15s'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)', marginBottom: 4 }}>
                      {lead.name}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Phone size={12} /> {lead.phone}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                      {(lead.requested_item || lead.service_needed) && (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, background: 'var(--sage-50)', color: 'var(--teal-800)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--sage-200)' }}>
                          {lead.requested_item || lead.service_needed}
                        </span>
                      )}
                      {lead.service_mode && (
                        <span className={`badge ${lead.service_mode === 'online' ? 'badge-blue' : 'badge-green'}`} style={{ fontSize: '0.66rem' }}>
                          {lead.service_mode === 'online' ? 'Online' : 'Home Visit'}
                        </span>
                      )}
                    </div>
                    {lead.estimated_price !== null && lead.estimated_price !== undefined && (
                      <div style={{ fontSize: '0.74rem', color: '#0d9488', fontWeight: 700, marginBottom: 6 }}>
                        Est: PKR {Number(lead.estimated_price).toLocaleString()}
                      </div>
                    )}
                    {lead.notes && (
                      <div style={{ fontSize: '0.75rem', color: '#4b5563', fontStyle: 'italic', marginBottom: 10, lineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        "{lead.notes}"
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: '1px solid var(--sage-100)', fontSize: '0.72rem', color: 'var(--status-grey)' }}>
                      <span>Source: <strong>{lead.source}</strong></span>
                      {stage.id !== 'converted' ? (
                        <button
                          className="btn btn-amber btn-sm"
                          style={{ fontSize: '0.68rem', padding: '2px 8px' }}
                          onClick={() => handleConvertLead(lead)}
                        >
                          Convert →
                        </button>
                      ) : (
                        <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>✓ Converted</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Lead Modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>New Lead Entry</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowAddModal(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input className="form-input" value={newLeadForm.name} onChange={e => setNewLeadForm({...newLeadForm, name: e.target.value})} placeholder="Inquirer / Patient Name" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="form-input" value={newLeadForm.phone} onChange={e => setNewLeadForm({...newLeadForm, phone: e.target.value})} placeholder="+92-3xx-xxxxxxx" />
              </div>
              <div className="form-group">
                <label className="form-label">Lead Source</label>
                <select className="form-select" value={newLeadForm.source} onChange={e => setNewLeadForm({...newLeadForm, source: e.target.value})}>
                  <option value="Website Inquiry">Website Inquiry</option>
                  <option value="Doctor Referral">Doctor Referral</option>
                  <option value="Facebook Ad">Facebook Ad</option>
                  <option value="Google Search">Google Search</option>
                  <option value="Walk-in">Walk-in</option>
                  <option value="Phone Call">Phone Call</option>
                </select>
              </div>
              {/* Category and Item Select */}
              <div className="grid-2" style={{ gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Service Category</label>
                  <select
                    className="form-select"
                    value={newLeadForm.category}
                    onChange={e => handleLeadCategoryChange(e.target.value)}
                  >
                    {SERVICE_CATEGORIES.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Service Item</label>
                  <select
                    className="form-select"
                    value={newLeadForm.requested_item}
                    onChange={e => handleLeadItemChange(e.target.value)}
                  >
                    {getItemsByCategory(newLeadForm.category, catalog).map(it => (
                      <option key={it.name} value={it.name}>{it.name} ({it.price_text})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Extra Category Fields */}
              {newLeadForm.category === 'doctors' && (
                <div className="grid-2" style={{ gap: 10, background: '#f0fdfa', border: '1px solid #99f6e4', padding: '8px 10px', borderRadius: 6, marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.74rem' }}>Mode</label>
                    <select
                      className="form-select"
                      value={newLeadForm.service_mode}
                      onChange={e => setNewLeadForm({ ...newLeadForm, service_mode: e.target.value })}
                    >
                      <option value="online">Online Video</option>
                      <option value="home">Home Visit</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.74rem' }}>Provider Level</label>
                    <select
                      className="form-select"
                      value={newLeadForm.provider_level}
                      onChange={e => setNewLeadForm({ ...newLeadForm, provider_level: e.target.value })}
                    >
                      <option value="specialist">Specialist</option>
                      <option value="medical_officer">Medical Officer</option>
                    </select>
                  </div>
                </div>
              )}

              {newLeadForm.category === 'long_term' && (
                <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '8px 10px', borderRadius: 6, marginBottom: 10 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1e40af', textTransform: 'uppercase', marginBottom: 6 }}>
                    Long-Term Package & Shift Details
                  </div>
                  <div className="grid-3" style={{ gap: 8, marginBottom: 4 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.74rem' }}>Package Type</label>
                      <select
                        className="form-select"
                        value={newLeadForm.package_type || 'per_month'}
                        onChange={e => handleLeadLongTermChange(e.target.value, newLeadForm.shift_duration || '8_hours', newLeadForm.shift_role || 'rn')}
                      >
                        <option value="per_month">Per month</option>
                        <option value="per_shift">Per shift</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.74rem' }}>Shift</label>
                      <select
                        className="form-select"
                        value={newLeadForm.shift_duration}
                        onChange={e => handleLeadLongTermChange(newLeadForm.package_type || 'per_month', e.target.value, newLeadForm.shift_role || 'rn')}
                      >
                        <option value="8_hours">8 Hours</option>
                        <option value="12_hours">12 Hours</option>
                        <option value="24_hours">24 Hours</option>
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.74rem' }}>Role</label>
                      <select
                        className="form-select"
                        value={newLeadForm.shift_role}
                        onChange={e => handleLeadLongTermChange(newLeadForm.package_type || 'per_month', newLeadForm.shift_duration || '8_hours', e.target.value)}
                      >
                        <option value="rn" disabled={newLeadForm.shift_duration === '24_hours'}>
                          Registered Nurse (RN) {newLeadForm.shift_duration === '24_hours' ? '(Not offered)' : ''}
                        </option>
                        <option value="assistant">Nursing Assistant</option>
                        <option value="attendant" disabled={newLeadForm.shift_duration === '8_hours'}>
                          Nursing Attendant {newLeadForm.shift_duration === '8_hours' ? '(Not offered)' : ''}
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {newLeadForm.category === 'medicine_delivery' && (
                <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: '8px 10px', borderRadius: 6, marginBottom: 10, fontSize: '0.76rem', color: '#c2410c' }}>
                  <strong>Pharmacy Requirements:</strong> {PHARMACY_REQUIREMENTS_NOTE}
                </div>
              )}

              {newLeadForm.category === 'equipment_rental' && (
                <div className="grid-2" style={{ gap: 10, background: '#fffbeb', border: '1px solid #fde68a', padding: '8px 10px', borderRadius: 6, marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.74rem' }}>Rental Period</label>
                    <select
                      className="form-select"
                      value={newLeadForm.rental_period}
                      onChange={e => setNewLeadForm({ ...newLeadForm, rental_period: e.target.value })}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                      <option value="daily">Daily</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.74rem' }}>Delivery Charge (PKR)</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="e.g. 2000"
                      value={newLeadForm.delivery_charge}
                      onChange={e => setNewLeadForm({ ...newLeadForm, delivery_charge: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {/* Rate / Amount Field */}
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Estimated Rate / Amount (PKR)</label>
                  {(() => {
                    const it = findCatalogItem(newLeadForm.category, newLeadForm.requested_item);
                    if (!it) return null;
                    if (it.price_min != null && it.price_min === it.price_max) {
                      return <span style={{ fontSize: '0.72rem', color: '#15803d', fontWeight: 600 }}>Catalogue: PKR {it.price_min.toLocaleString()}</span>;
                    }
                    if (it.price_min != null && it.price_min !== it.price_max) {
                      return <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>Range: PKR {it.price_min.toLocaleString()} - {it.price_max.toLocaleString()}</span>;
                    }
                    return <span style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 600 }}>Price on request</span>;
                  })()}
                </div>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Enter PKR amount"
                  value={newLeadForm.amount}
                  onChange={e => setNewLeadForm({ ...newLeadForm, amount: e.target.value })}
                />
                {(() => {
                  const it = findCatalogItem(newLeadForm.category, newLeadForm.requested_item);
                  if (it && (it.price_min == null || it.price_min !== it.price_max)) {
                    return (
                      <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: 2 }}>
                        ⚠️ Staff must type agreed PKR amount ({it.price_text || 'custom quote'}).
                      </div>
                    );
                  }
                  return (
                    <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', marginTop: 2 }}>
                      Auto-filled from catalogue (editable by staff).
                    </div>
                  );
                })()}
              </div>
              <div className="form-group">
                <label className="form-label">Inquiry Notes</label>
                <textarea className="form-textarea" rows={3} value={newLeadForm.notes} onChange={e => setNewLeadForm({...newLeadForm, notes: e.target.value})} placeholder="Details of patient condition & requirements..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddSubmit}>Save Lead</button>
            </div>
          </div>
        </div>
      )}

      {/* Convert Lead Modal */}
      {showConvertModal && selectedLead && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowConvertModal(false)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>Convert Lead to Active Patient</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowConvertModal(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.88rem', color: '#374151', marginBottom: 14 }}>
                Converting <strong>{selectedLead.name}</strong> will move this lead to the Converted column and automatically create a linked active Booking record.
              </p>
              <div style={{ background: 'var(--sage-50)', padding: 12, borderRadius: 8, fontSize: '0.82rem' }}>
                <div><strong>Service:</strong> {selectedLead.service_needed}</div>
                <div><strong>Phone:</strong> {selectedLead.phone}</div>
                <div><strong>Notes:</strong> {selectedLead.notes}</div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowConvertModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmConversion}>Confirm Conversion & Create Booking</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
