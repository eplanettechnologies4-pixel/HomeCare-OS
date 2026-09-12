import React, { useState } from 'react';
import { Plus, User, Phone, Tag, ArrowRight, X, CheckCircle, Search, UserCheck } from 'lucide-react';
import useStore from '../store/useStore';
import { format } from 'date-fns';

const STAGES = [
  { id: 'new_lead',   title: 'New Lead',   color: '#3eb39e' },
  { id: 'contacted',  title: 'Contacted',  color: '#DE9A3C' },
  { id: 'follow_up',  title: 'Follow-up',  color: '#b87320' },
  { id: 'converted',  title: 'Converted',  color: '#2D6A4F' },
];

export default function CRM() {
  const leads           = useStore((s) => s.leads);
  const addLead         = useStore((s) => s.addLead);
  const updateLeadStage = useStore((s) => s.updateLeadStage);
  const addBooking      = useStore((s) => s.addBooking);
  const setActivePage   = useStore((s) => s.setActivePage);

  const [showAddModal, setShowAddModal]   = useState(false);
  const [targetStage, setTargetStage]     = useState('new_lead');
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [selectedLead, setSelectedLead]   = useState(null);

  // Form states
  const [newLeadForm, setNewLeadForm] = useState({ name: '', phone: '', source: 'Website Inquiry', service_needed: 'Elderly Nursing Care', notes: '' });

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
    addLead({
      id: `lead-${Date.now()}`,
      name: newLeadForm.name,
      phone: newLeadForm.phone,
      source: newLeadForm.source,
      service_needed: newLeadForm.service_needed,
      notes: newLeadForm.notes,
      stage: targetStage,
      assigned_to: 'Hina Malik',
      created_at: new Date().toISOString()
    });
    setShowAddModal(false);
    setNewLeadForm({ name: '', phone: '', source: 'Website Inquiry', service_needed: 'Elderly Nursing Care', notes: '' });
  };

  const handleConvertLead = (lead) => {
    setSelectedLead(lead);
    setShowConvertModal(true);
  };

  const confirmConversion = () => {
    if (!selectedLead) return;
    // 1. Move lead to converted stage
    updateLeadStage(selectedLead.id, 'converted');
    
    // 2. Automatically create linked booking
    addBooking({
      id: Date.now(),
      patient_name: selectedLead.name,
      patient_mr: `MR-2024-00${Math.floor(Math.random()*90)+10}`,
      service_type: 'long_term',
      service_type_display: selectedLead.service_needed || 'Long-Term Care',
      status: 'pending',
      status_display: 'Pending',
      payment_status: 'pending',
      payment_status_display: 'Payment Pending',
      scheduled_time: new Date().toISOString(),
      address: 'PWD / Soan Garden, Islamabad (Converted Lead Address)',
      amount: 5000,
      amount_paid: 0,
      balance_due: 5000,
      notes: `Converted from CRM Lead (${selectedLead.source}). ${selectedLead.notes}`,
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
                    {lead.service_needed && (
                      <div style={{ fontSize: '0.75rem', background: 'var(--sage-50)', color: 'var(--teal-700)', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginBottom: 8 }}>
                        {lead.service_needed}
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
              <div className="form-group">
                <label className="form-label">Service Needed</label>
                <input className="form-input" value={newLeadForm.service_needed} onChange={e => setNewLeadForm({...newLeadForm, service_needed: e.target.value})} placeholder="E.g. Elderly Care, Physio, Wound Care..." />
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
