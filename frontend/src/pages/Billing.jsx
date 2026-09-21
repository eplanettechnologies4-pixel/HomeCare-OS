import React, { useState, useEffect } from 'react';
import { DollarSign, FileText, Printer, Plus, X, Search, Check, CreditCard, Send } from 'lucide-react';
import useStore from '../store/useStore';
import UniversalPrintButton from '../components/UniversalPrintButton';
import { format } from 'date-fns';

const STATUS_BADGE = {
  paid:    'badge-green',
  partial: 'badge-amber',
  pending: 'badge-red',
  overdue: 'badge-red',
};

export default function Billing() {
  const invoices      = useStore((s) => s.invoices);
  const fetchInvoices = useStore((s) => s.fetchInvoices);
  const recordPayment = useStore((s) => s.recordInvoicePayment);
  const sendInvoice   = useStore((s) => s.sendInvoice);
  const patients      = useStore((s) => s.patients);

  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Bank Transfer');
  const [payRef, setPayRef]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch]       = useState('');
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [sendSuccessMsg, setSendSuccessMsg] = useState('');

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter && inv.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (inv.invoice_number || '').toLowerCase().includes(q) || (inv.patient_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalInvoiced = invoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
  const totalCollected = invoices.reduce((sum, i) => sum + (Number(i.amount_paid) || 0), 0);
  const totalPending = invoices.reduce((sum, i) => sum + (Number(i.balance_due) || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  const handleRecordPaymentSubmit = async () => {
    if (!selectedInvoice || !payAmount) return;
    await recordPayment(selectedInvoice.id, {
      amount: Number(payAmount),
      method: payMethod,
      received_at: new Date().toISOString().split('T')[0],
      reference: payRef,
    });
    setShowPaymentModal(false);
    setPayAmount('');
    setPayRef('');
    // Refresh selected invoice view from store
    const updated = useStore.getState().invoices.find(i => i.id === selectedInvoice.id);
    if (updated) setSelectedInvoice(updated);
  };

  const handleSendInvoice = async () => {
    if (!selectedInvoice) return;
    setSendingInvoice(true);
    setSendSuccessMsg('');
    const res = await sendInvoice(selectedInvoice.id);
    setSendingInvoice(false);
    if (res.success) {
      setSendSuccessMsg(`Invoice sent to ${selectedInvoice.patient_name}'s family portal!`);
      setTimeout(() => setSendSuccessMsg(''), 4000);
    }
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="page-title">Billing & Invoicing</h1>
          <p className="page-subtitle">Patient invoices, monthly billing packages, line-item breakdowns & receipts</p>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="stat-label">Total Invoiced</div>
          <div className="stat-value" style={{ color: 'var(--teal-700)' }}>PKR {totalInvoiced.toLocaleString()}</div>
          <div className="stat-sub">{invoices.length} invoices generated</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="stat-label">Total Collected</div>
          <div className="stat-value" style={{ color: 'var(--status-green)' }}>PKR {totalCollected.toLocaleString()}</div>
          <div className="stat-sub">{Math.round((totalCollected/totalInvoiced)*100 || 0)}% collection rate</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="stat-label">Outstanding Balance</div>
          <div className="stat-value" style={{ color: totalPending > 0 ? 'var(--status-red)' : 'var(--status-grey)' }}>PKR {totalPending.toLocaleString()}</div>
          <div className="stat-sub">Pending collection</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-input-wrap" style={{ flex: '0 1 240px' }}>
          <Search size={13} />
          <input
            className="form-input search-input"
            placeholder="Search Invoice # or Patient..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select className="form-select" style={{ flex: '0 1 160px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Invoice Data Table */}
      <div className="card">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice #</th>
                <th>Patient</th>
                <th>Billing Type</th>
                <th>Issued Date</th>
                <th>Due Date</th>
                <th>Total</th>
                <th>Amount Paid</th>
                <th>Balance Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(inv => (
                <tr key={inv.id} onClick={() => setSelectedInvoice(inv)}>
                  <td className="ts" style={{ fontWeight: 700, color: 'var(--teal-800)' }}>{inv.invoice_number}</td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{inv.patient_name}</div>
                    <div className="ts">{inv.patient_mr}</div>
                  </td>
                  <td><span className="badge badge-teal" style={{ fontSize: '0.68rem' }}>{inv.billing_type_display || inv.billing_type}</span></td>
                  <td className="ts">{inv.issued_date}</td>
                  <td className="ts">{inv.due_date}</td>
                  <td className="ts" style={{ fontWeight: 600 }}>PKR {inv.total?.toLocaleString()}</td>
                  <td className="ts" style={{ color: 'var(--status-green)' }}>PKR {inv.amount_paid?.toLocaleString()}</td>
                  <td className="ts" style={{ color: inv.balance_due > 0 ? 'var(--status-red)' : 'var(--status-grey)', fontWeight: inv.balance_due > 0 ? 700 : 400 }}>
                    PKR {inv.balance_due?.toLocaleString()}
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[inv.status] || 'badge-grey'}`}>{inv.status_display || inv.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Invoice Detail & PDF View Drawer ─────────────────────────────── */}
      {selectedInvoice && (
        <div>
          <div className="drawer-backdrop" onClick={() => setSelectedInvoice(null)} />
          <div className="drawer" style={{ width: 560 }}>
            <div className="drawer-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', margin: 0, color: 'var(--teal-800)' }}>
                  {selectedInvoice.invoice_number}
                </h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)' }}>{selectedInvoice.patient_name}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--teal-700)', display: 'flex', alignItems: 'center', gap: 4 }}
                  onClick={handleSendInvoice}
                  disabled={sendingInvoice}
                >
                  <Send size={13} /> {sendingInvoice ? 'Sending...' : 'Send Invoice'}
                </button>
                <UniversalPrintButton type="invoice" data={selectedInvoice} label="Print Invoice" variant="ghost" size="sm" />
                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedInvoice(null)}><X size={14} /></button>
              </div>
            </div>

            <div className="drawer-body" id="printable-invoice">
              {sendSuccessMsg && (
                <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '8px 12px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={14} /> {sendSuccessMsg}
                </div>
              )}
              {/* Invoice Print Header */}
              <div style={{ borderBottom: '2px solid var(--teal-700)', paddingBottom: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <img src="/ehealth-logo.png" alt="eHealth Logo" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                    <div>
                      <h3 style={{ fontFamily: 'var(--font-heading)', margin: 0, color: 'var(--teal-800)', fontSize: '1.3rem', fontWeight: 800 }}>
                        e<span style={{ color: '#DE9A3C' }}>Health</span>
                      </h3>
                      <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', fontWeight: 600 }}>HOSPITAL AT HOME</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--teal-800)' }}>INVOICE</div>
                    <div className="ts">{selectedInvoice.invoice_number}</div>
                  </div>
                </div>
              </div>

              {/* Billed To & Dates */}
              <div className="grid-2" style={{ marginBottom: 16, fontSize: '0.85rem' }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--teal-700)', marginBottom: 4 }}>BILLED TO:</div>
                  <div style={{ fontWeight: 600 }}>{selectedInvoice.patient_name}</div>
                  <div className="ts">MR#: {selectedInvoice.patient_mr}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--teal-700)', marginBottom: 4 }}>DETAILS:</div>
                  <div>Issued: <span className="ts">{selectedInvoice.issued_date}</span></div>
                  <div>Due Date: <span className="ts">{selectedInvoice.due_date}</span></div>
                  <div>Status: <span className={`badge ${STATUS_BADGE[selectedInvoice.status]}`}>{selectedInvoice.status}</span></div>
                </div>
              </div>

              {/* Line Items Table */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal-700)', marginBottom: 8 }}>LINE ITEMS BREAKDOWN</div>
                <table className="data-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr><th>Item & Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
                  </thead>
                  <tbody>
                    {(selectedInvoice.line_items || []).map(li => (
                      <tr key={li.id}>
                        <td>{li.description}</td>
                        <td className="ts">{li.quantity}</td>
                        <td className="ts">PKR {li.unit_price?.toLocaleString()}</td>
                        <td className="ts" style={{ fontWeight: 600 }}>PKR {li.amount?.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Calculation Summary */}
              <div style={{ marginLeft: 'auto', width: 220, fontSize: '0.85rem', marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span>Subtotal:</span>
                  <span className="ts">PKR {selectedInvoice.subtotal?.toLocaleString()}</span>
                </div>
                {selectedInvoice.discount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--status-green)' }}>
                    <span>Discount:</span>
                    <span className="ts">-PKR {selectedInvoice.discount?.toLocaleString()}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--sage-200)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--teal-800)' }}>
                  <span>Total:</span>
                  <span className="ts">PKR {selectedInvoice.total?.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--status-green)' }}>
                  <span>Amount Paid:</span>
                  <span className="ts">PKR {selectedInvoice.amount_paid?.toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: '1px solid var(--sage-200)', fontWeight: 700, color: selectedInvoice.balance_due > 0 ? 'var(--status-red)' : 'var(--status-grey)' }}>
                  <span>Balance Due:</span>
                  <span className="ts">PKR {selectedInvoice.balance_due?.toLocaleString()}</span>
                </div>
              </div>

              {/* Payment History Receipts */}
              {selectedInvoice.payments && selectedInvoice.payments.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--teal-700)', marginBottom: 8 }}>PAYMENT HISTORY</div>
                  {selectedInvoice.payments.map((p, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--sage-50)', borderRadius: 6, fontSize: '0.8rem', marginBottom: 6 }}>
                      <div>
                        <strong>{p.method}</strong> ({p.reference || 'No Ref'})
                        <div className="ts">{p.received_at}</div>
                      </div>
                      <span className="ts" style={{ fontWeight: 700, color: 'var(--status-green)' }}>+PKR {p.amount?.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Action */}
              {selectedInvoice.balance_due > 0 && (
                <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => setShowPaymentModal(true)}>
                  <CreditCard size={15} /> Record Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && selectedInvoice && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowPaymentModal(false)}>
          <div className="modal" style={{ width: 400 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>Record Payment</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setShowPaymentModal(false)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '0.85rem', marginBottom: 12, color: 'var(--status-grey)' }}>
                Invoice: <strong>{selectedInvoice.invoice_number}</strong> · Remaining: <strong className="ts" style={{ color: 'var(--status-red)' }}>PKR {selectedInvoice.balance_due?.toLocaleString()}</strong>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Amount (PKR)</label>
                <input type="number" className="form-input" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={selectedInvoice.balance_due} />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Method</label>
                <select className="form-select" value={payMethod} onChange={e => setPayMethod(e.target.value)}>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Online">Online</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reference Number (optional)</label>
                <input className="form-input" value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="IBFT transaction # / Cheque #" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPaymentModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRecordPaymentSubmit}>Confirm Payment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
