import React, { useState } from 'react';
import {
  Heart, Calendar, MapPin, Phone, ShieldCheck, CheckCircle, ArrowRight,
  Star, Clock, Upload, FileText, Activity, AlertCircle, X, ChevronRight, MessageSquare, User
} from 'lucide-react';
import useStore from '../store/useStore';
import PublicHeader from '../components/PublicHeader';
import PublicFooter from '../components/PublicFooter';
import { PUBLIC_SERVICES } from '../data/mockData';

export default function PublicWebsite() {
  const blogPosts           = useStore((s) => s.blogPosts);
  const addLead             = useStore((s) => s.addLead);
  const submitPublicBooking = useStore((s) => s.submitPublicBooking);
  const setActivePage       = useStore((s) => s.setActivePage);
  const setCurrentRole      = useStore((s) => s.setCurrentRole);

  const [activeTab, setActiveTab]         = useState('home'); // 'home'|'services'|'pricing'|'blog'|'about'|'contact'
  const [selectedArticle, setSelectedArticle] = useState(null);

  // Contact Form State
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', service: 'General Inquiry', message: '' });
  const [contactSent, setContactSent] = useState(false);

  // ── 6-STEP BOOKING WIZARD STATE ──────────────────────────────────────────
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [bookingStep, setBookingStep]           = useState(1);
  const [bookingForm, setBookingForm]           = useState({
    service_id: 'long_term',
    service_title: 'Long-Term Skilled Nursing',
    patient_name: '',
    age: '',
    gender: 'M',
    phone: '+92-3',
    contact_person: '',
    address: 'House #12, Block 4, Clifton, Karachi',
    lat: 24.86,
    lng: 67.01,
    prescription_name: '',
    preferred_date: new Date().toISOString().split('T')[0],
    preferred_slot: 'morning',
    payment_method: 'advance', // 'advance' | 'pay_on_service'
  });

  const [bookingResult, setBookingResult] = useState(null);

  const handleContactSubmit = (e) => {
    e.preventDefault();
    if (!contactForm.name || !contactForm.phone) return;

    // Create New Lead in CRM Pipeline automatically! (Requirement 13)
    addLead({
      id: Date.now(),
      lead_name: contactForm.name,
      phone: contactForm.phone,
      email: contactForm.email || 'website.contact@homecareos.com',
      service_type: contactForm.service,
      stage: 'new',
      stage_display: 'New Inquiry',
      assigned_to: 'Usman Chaudhry',
      value: 3500,
      notes: `Public Website Inquiry: "${contactForm.message}"`,
      created_at: new Date().toISOString().substring(0, 10),
    });

    setContactSent(true);
    setTimeout(() => {
      setContactSent(false);
      setContactForm({ name: '', phone: '', email: '', service: 'General Inquiry', message: '' });
    }, 4000);
  };

  const handleBookingSubmit = () => {
    if (!bookingForm.patient_name || !bookingForm.phone || !bookingForm.address) {
      alert('Please fill in patient name, contact number and home address.');
      return;
    }

    // Call store action that auto-creates Patient + Booking + CRM Lead
    const res = submitPublicBooking(bookingForm);
    setBookingResult(res);
    setBookingStep(6);
  };

  const handleCreateFamilyAccount = () => {
    setShowBookingModal(false);
    setCurrentRole('patient_family');
    setActivePage('family-portal');
  };

  return (
    <div style={{ background: '#f8faf9', minHeight: '100vh', fontFamily: 'var(--font-body)', color: '#1f2937' }}>
      
      {/* Public Header */}
      <PublicHeader activeTab={activeTab} setActiveTab={setActiveTab} onOpenBookingModal={() => { setShowBookingModal(true); setBookingStep(1); }} />

      {/* ── SUB-PAGE 1: HOME PAGE ───────────────────────────────────────────── */}
      {activeTab === 'home' && (
        <div>
          {/* Hero Section with High-Res Medical Background Image */}
          <section style={{
            background: 'linear-gradient(135deg, rgba(45, 11, 67, 0.94) 0%, rgba(97, 31, 140, 0.88) 60%, rgba(117, 41, 167, 0.85) 100%), url("/hero-bg.png")',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            color: 'white',
            padding: '90px 40px 110px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 60, alignItems: 'center' }}>
              <div>
                <div className="badge badge-amber" style={{ fontSize: '0.8rem', padding: '6px 14px', marginBottom: 20, display: 'inline-flex', gap: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                  <Activity size={14} /> 24/7 Field Staff Dispatch & Live GPS Tracking
                </div>
                <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '3.2rem', lineHeight: 1.15, fontWeight: 800, margin: '0 0 20px', color: 'white', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
                  Hospital-Quality Medical Care Delivered at Your Home
                </h1>
                <p style={{ fontSize: '1.1rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.9)', marginBottom: 36, maxWidth: 560 }}>
                  Licensed doctors, BSN registered nurses, and DPT physiotherapists visiting your family in Karachi. Complete EMR, automated billing, and live map tracking.
                </p>

                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    style={{ background: '#FDE047', color: '#2d0b43', fontWeight: 800, fontSize: '1rem', padding: '14px 28px', borderRadius: 8, boxShadow: '0 4px 20px rgba(253,224,71,0.35)' }}
                    onClick={() => { setShowBookingModal(true); setBookingStep(1); }}
                  >
                    Book Home Visit Online →
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)', fontSize: '0.95rem', padding: '14px 22px', backdropFilter: 'blur(4px)' }}
                    onClick={() => setActiveTab('services')}
                  >
                    Explore 8 Services
                  </button>
                </div>
              </div>

              {/* Hero Image Visual Card */}
              <div style={{
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 20,
                padding: 24,
                boxShadow: '0 25px 50px rgba(0,0,0,0.4)'
              }}>
                <div style={{ background: '#611F8C', borderRadius: 14, padding: 20, color: 'white', marginBottom: 16, border: '1px solid rgba(255,255,255,0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span className="live-dot" />
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>Nurse Sarah Mitchell (RN)</span>
                    </div>
                    <span className="badge badge-green" style={{ fontSize: '0.7rem', background: '#d1fae5', color: '#065f46' }}>En-Route (ETA 8m)</span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.85)', marginBottom: 8 }}>
                    Patient: <strong>Tariq Mehmood</strong> (Post-Stroke Care)
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: 6, fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                    📍 GPS Tracking: 24.8607° N, 67.0011° E (Clifton)
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, textAlign: 'center' }}>
                  <div style={{ background: 'white', padding: 12, borderRadius: 10, color: '#2d0b43', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem', fontFamily: 'var(--font-mono)', color: '#611F8C' }}>50,000+</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--status-grey)', fontWeight: 600 }}>Visits Delivered</div>
                  </div>
                  <div style={{ background: 'white', padding: 12, borderRadius: 10, color: '#2d0b43', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem', fontFamily: 'var(--font-mono)', color: '#611F8C' }}>99.2%</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--status-grey)', fontWeight: 600 }}>On-Time Arrival</div>
                  </div>
                  <div style={{ background: 'white', padding: 12, borderRadius: 10, color: '#2d0b43', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.25rem', fontFamily: 'var(--font-mono)', color: '#611F8C' }}>4.9 ★</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--status-grey)', fontWeight: 600 }}>Patient Rating</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Service Overview Cards with Image Headers */}
          <section style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 40px' }}>
            <div style={{ textAlign: 'center', marginBottom: 50 }}>
              <span className="badge badge-amber" style={{ marginBottom: 10, padding: '6px 14px', fontSize: '0.8rem' }}>Clinical Care Services</span>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.4rem', color: '#2d0b43', margin: '0 0 10px', fontWeight: 800 }}>
                Comprehensive Home Healthcare Services
              </h2>
              <p style={{ color: 'var(--status-grey)', maxWidth: 620, margin: '0 auto', fontSize: '0.95rem' }}>
                From 24/7 skilled long-term nursing care and ICU-at-home to specialist doctor visits and physical therapy.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 28 }}>
              {PUBLIC_SERVICES.slice(0, 4).map(srv => (
                <div key={srv.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', transition: 'transform 0.2s ease, box-shadow 0.2s ease' }}>
                  <div>
                    {/* Card Image Header */}
                    <div style={{ height: 160, overflow: 'hidden', position: 'relative' }}>
                      <img src={srv.image || '/hero-bg.png'} alt={srv.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }} />
                      <span className="badge badge-amber" style={{ position: 'absolute', top: 12, right: 12, fontSize: '0.7rem' }}>
                        {srv.category.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ padding: 20 }}>
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', color: '#2d0b43', margin: '0 0 8px', fontWeight: 700 }}>
                        {srv.title}
                      </h3>
                      <p style={{ fontSize: '0.84rem', color: '#4b5563', lineHeight: 1.5, marginBottom: 14 }}>
                        {srv.short_desc}
                      </p>
                    </div>
                  </div>

                  <div style={{ padding: '0 20px 20px' }}>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#611F8C', marginBottom: 14 }}>
                      {srv.price_display}
                    </div>
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', justifyContent: 'center', fontSize: '0.85rem', background: '#611F8C' }}
                      onClick={() => {
                        setBookingForm({...bookingForm, service_id: srv.id, service_title: srv.title});
                        setShowBookingModal(true);
                        setBookingStep(1);
                      }}
                    >
                      Book This Service →
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <button className="btn btn-ghost" style={{ fontSize: '0.95rem', fontWeight: 700, color: '#611F8C', borderColor: '#e9d5ff' }} onClick={() => setActiveTab('services')}>
                View All 8 Healthcare Services & Pricing →
              </button>
            </div>
          </section>

          {/* 4-Step How It Works */}
          <section style={{ background: '#f4effa', padding: '70px 40px', borderTop: '1px solid #e9def5', borderBottom: '1px solid #e9def5' }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
              <div style={{ textAlign: 'center', marginBottom: 50 }}>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', color: '#2d0b43', margin: '0 0 10px', fontWeight: 800 }}>
                  How eHealth Works
                </h2>
                <p style={{ color: 'var(--status-grey)', fontSize: '0.95rem' }}>Seamless 4-step home healthcare dispatch and telemetry monitoring</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
                {[
                  { step: '01', title: 'Book Online / Call', desc: 'Select service, date preference and patient details in 2 minutes.' },
                  { step: '02', title: 'Care Manager Match', desc: 'Our Client Care Manager assigns a licensed nurse based on required clinical skills.' },
                  { step: '03', title: 'Live GPS Visit', desc: 'Track nurse arrival in real-time on map with digital check-in.' },
                  { step: '04', title: 'EMR & Vitals Report', desc: 'Receive digital daily vitals report & nurse notes instantly on your phone.' },
                ].map(item => (
                  <div key={item.step} className="card" style={{ padding: 22, textAlign: 'center', border: '1px solid #e9def5' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '1.8rem', color: '#DE9A3C', marginBottom: 10 }}>{item.step}</div>
                    <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', color: '#2d0b43', margin: '0 0 8px', fontWeight: 700 }}>{item.title}</h4>
                    <p style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.5, margin: 0 }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── SUB-PAGE 2: SERVICES ────────────────────────────────────────────── */}
      {activeTab === 'services' && (
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 40px' }}>
          <div style={{ marginBottom: 40, textAlign: 'center' }}>
            <span className="badge badge-amber" style={{ marginBottom: 10, padding: '6px 14px', fontSize: '0.8rem' }}>Clinical Excellence</span>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.6rem', color: '#2d0b43', margin: '0 0 10px', fontWeight: 800 }}>
              Our Home Healthcare Services
            </h1>
            <p style={{ color: 'var(--status-grey)', maxWidth: 600, margin: '0 auto' }}>Licensed clinical care delivered directly to your home in Karachi</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 28 }}>
            {PUBLIC_SERVICES.map(srv => (
              <div key={srv.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ height: 180, position: 'relative', overflow: 'hidden' }}>
                    <img src={srv.image || '/hero-bg.png'} alt={srv.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }} />
                    <span className="badge badge-teal" style={{ position: 'absolute', top: 12, right: 12, fontSize: '0.72rem', background: '#f3e8ff', color: '#611F8C' }}>
                      {srv.category.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ padding: 22 }}>
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: '#2d0b43', margin: '0 0 8px', fontWeight: 700 }}>
                      {srv.title}
                    </h3>
                    <p style={{ fontSize: '0.86rem', color: '#4b5563', lineHeight: 1.6, marginBottom: 16 }}>
                      {srv.full_desc}
                    </p>
                    <div style={{ background: '#faf5ff', padding: 14, borderRadius: 10, marginBottom: 16, border: '1px solid #f3e8ff' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.78rem', color: '#611F8C', marginBottom: 8 }}>Key Service Inclusions:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {srv.features.map((f, i) => (
                          <div key={i} style={{ fontSize: '0.75rem', color: '#374151', display: 'flex', gap: 6, alignItems: 'center' }}>
                            <CheckCircle size={13} style={{ color: '#611F8C', flexShrink: 0 }} /> {f}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0 22px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f4effa', paddingTop: 14 }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)' }}>Indicative Price</div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: '#b87320' }}>{srv.price_display}</div>
                  </div>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ background: '#611F8C', padding: '8px 16px', fontWeight: 600 }}
                    onClick={() => {
                      setBookingForm({...bookingForm, service_id: srv.id, service_title: srv.title});
                      setShowBookingModal(true);
                      setBookingStep(1);
                    }}
                  >
                    Book Now →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUB-PAGE 3: PRICING & PACKAGES ────────────────────────────────── */}
      {activeTab === 'pricing' && (
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.4rem', color: 'var(--teal-900)', margin: '0 0 10px' }}>
              Transparent Healthcare Pricing
            </h1>
            <p style={{ color: 'var(--status-grey)' }}>No hidden charges. Clear, predictable monthly and per-visit rates.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
            {[
              { name: 'Per Visit Plan', price: 'PKR 1,500 - 2,500', unit: 'per visit', desc: 'Ideal for short nurse visits, lab sampling & physio sessions.', features: ['30-60 min visit', 'Vitals check', 'Medication administration', 'Digital visit summary'] },
              { name: 'Monthly Skilled Care', price: 'PKR 65,000', unit: 'per month', popular: true, desc: 'Full 12h or 24/7 registered nurse for post-op rehab or chronic care.', features: ['Dedicated RN/BSN nurse', '24/7 Care Manager support', 'Free sterile dressing packs', 'Monthly doctor review'] },
              { name: 'Elderly Attendant', price: 'PKR 35,000', unit: 'per month', desc: 'Daily living caregiver assistance for senior citizens & dementia care.', features: ['Trained care giver', 'Hygiene & feeding support', 'Medication reminders', 'Daily caregiver logs'] },
            ].map((p, i) => (
              <div key={i} className="card" style={{ padding: 24, border: p.popular ? '2px solid var(--amber-500)' : '1px solid var(--sage-200)', position: 'relative' }}>
                {p.popular && <span className="badge badge-amber" style={{ position: 'absolute', top: -12, right: 20 }}>Most Requested</span>}
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'var(--teal-900)', margin: '0 0 6px' }}>{p.name}</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--status-grey)', marginBottom: 16 }}>{p.desc}</p>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '1.5rem', color: 'var(--teal-800)', marginBottom: 4 }}>{p.price}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginBottom: 20 }}>{p.unit}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {p.features.map((f, fi) => (
                    <div key={fi} style={{ fontSize: '0.8rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                      <CheckCircle size={14} style={{ color: 'var(--status-green)' }} /> {f}
                    </div>
                  ))}
                </div>
                <button className={`btn ${p.popular ? 'btn-primary' : 'btn-ghost'}`} style={{ width: '100%', justifyContent: 'center' }} onClick={() => { setShowBookingModal(true); setBookingStep(1); }}>
                  Choose Package
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUB-PAGE 4: BLOG & HEALTH GUIDES ──────────────────────────────── */}
      {activeTab === 'blog' && (
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 40px' }}>
          <div style={{ marginBottom: 40 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.4rem', color: 'var(--teal-900)', margin: '0 0 10px' }}>
              Clinical Health Guides & SOPs
            </h1>
            <p style={{ color: 'var(--status-grey)' }}>Educational articles published by HomeCare OS medical staff</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            {blogPosts.map(post => (
              <div key={post.id} className="card" style={{ padding: 22, cursor: 'pointer' }} onClick={() => setSelectedArticle(post)}>
                <span className="badge badge-teal" style={{ fontSize: '0.7rem', marginBottom: 10 }}>{post.category}</span>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--teal-900)', margin: '0 0 8px' }}>
                  {post.title}
                </h3>
                <p style={{ fontSize: '0.84rem', color: '#4b5563', lineHeight: 1.5, marginBottom: 14 }}>
                  {post.summary}
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--status-grey)', borderTop: '1px solid var(--sage-100)', paddingTop: 10 }}>
                  <span>By {post.author}</span>
                  <span className="ts">{post.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── SUB-PAGE 5: ABOUT US ───────────────────────────────────────────── */}
      {activeTab === 'about' && (
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '60px 40px' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.4rem', color: 'var(--teal-900)', margin: '0 0 16px' }}>
            About HomeCare OS
          </h1>
          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: '#374151', marginBottom: 30 }}>
            HomeCare OS is Pakistan's first technology-integrated home healthcare management platform. Founded with the mission to bring hospital-grade clinical standards, licensed nurses, and real-time GPS visit tracking to patients in the comfort of their home.
          </p>

          <div className="grid-2" style={{ gap: 20, marginBottom: 40 }}>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: '0 0 8px' }}>Our Mission</h3>
              <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: 0 }}>
                To transform home healthcare in Pakistan by combining PMDC/PNC certified clinical care with real-time GPS tracking and transparent digital EMRs.
              </p>
            </div>
            <div className="card" style={{ padding: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: '0 0 8px' }}>Branch Coverage</h3>
              <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: 0 }}>
                Operating 4 central dispatch hubs across Karachi: Gulshan-e-Iqbal, Clifton/DHA, North Nazimabad, and PECHS.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── SUB-PAGE 6: CONTACT US (INTEGRATED WITH CRM PIPELINE) ──────────── */}
      {activeTab === 'contact' && (
        <div style={{ maxWidth: 850, margin: '0 auto', padding: '60px 40px' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.4rem', color: 'var(--teal-900)', margin: '0 0 10px' }}>
              Contact & Inquiry
            </h1>
            <p style={{ color: 'var(--status-grey)' }}>Send us a message or request a callback from our Client Care Manager</p>
          </div>

          <div className="card" style={{ padding: 30 }}>
            {contactSent ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--status-green)' }}>
                <CheckCircle size={44} style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontFamily: 'var(--font-heading)', margin: '0 0 6px' }}>Inquiry Received!</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--status-grey)', margin: 0 }}>
                  Our CRM Executive (Usman Chaudhry) will call you back within 15 minutes.
                </p>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit}>
                <div className="grid-2" style={{ gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Your Name *</label>
                    <input className="form-input" required value={contactForm.name} onChange={e => setContactForm({...contactForm, name: e.target.value})} placeholder="e.g. Kamran Ahmed" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number (+92) *</label>
                    <input className="form-input" required value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} placeholder="+92-300-1234567" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <input type="email" className="form-input" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} placeholder="name@email.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Service Needed</label>
                  <select className="form-select" value={contactForm.service} onChange={e => setContactForm({...contactForm, service: e.target.value})}>
                    <option value="Long-Term Nursing">Long-Term Nursing</option>
                    <option value="Short Visit & Lab Sampling">Short Visit & Lab Sampling</option>
                    <option value="Home Physiotherapy">Home Physiotherapy</option>
                    <option value="Elderly Attendant">Elderly Attendant</option>
                    <option value="General Inquiry">General Inquiry</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Message / Details</label>
                  <textarea className="form-input" rows={4} value={contactForm.message} onChange={e => setContactForm({...contactForm, message: e.target.value})} placeholder="Describe patient condition and requirements..." />
                </div>
                <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px 0', fontWeight: 700 }}>
                  Send Inquiry to Care Manager →
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── 6-STEP PUBLIC BOOKING WIZARD MODAL ───────────────────────────── */}
      {showBookingModal && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setShowBookingModal(false)}>
          <div className="modal" style={{ width: 620 }}>
            <div className="modal-header" style={{ background: 'var(--teal-800)', color: 'white' }}>
              <div>
                <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'white' }}>
                  Public Self-Service Visit Booking
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  Step {bookingStep} of 6 — {['Select Service', 'Patient Details & Map Pin', 'Prescription Upload', 'Date & Time', 'Payment Review', 'Confirmation'][bookingStep - 1]}
                </div>
              </div>
              <button className="btn btn-ghost btn-icon" style={{ color: 'white' }} onClick={() => setShowBookingModal(false)}><X size={16} /></button>
            </div>

            <div className="modal-body" style={{ padding: 22 }}>
              
              {/* STEP 1: Select Service */}
              {bookingStep === 1 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)', marginBottom: 12 }}>
                    Step 1: Choose Required Healthcare Service
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {PUBLIC_SERVICES.map(srv => (
                      <div
                        key={srv.id}
                        onClick={() => setBookingForm({...bookingForm, service_id: srv.id, service_title: srv.title})}
                        style={{
                          border: bookingForm.service_id === srv.id ? '2px solid var(--teal-700)' : '1px solid var(--sage-200)',
                          background: bookingForm.service_id === srv.id ? 'var(--sage-50)' : 'white',
                          borderRadius: 8,
                          padding: 12,
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--teal-800)' }}>{srv.title}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--amber-600)', marginTop: 2 }}>{srv.price_display}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 2: Patient Details & Address Map Pin */}
              {bookingStep === 2 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)', marginBottom: 12 }}>
                    Step 2: Patient Information & Address Map Pin
                  </div>
                  <div className="grid-2" style={{ gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Patient Full Name *</label>
                      <input className="form-input" value={bookingForm.patient_name} onChange={e => setBookingForm({...bookingForm, patient_name: e.target.value})} placeholder="e.g. Tariq Mehmood" />
                    </div>
                    <div className="grid-2" style={{ gap: 6, marginBottom: 0 }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Age *</label>
                        <input type="number" className="form-input" value={bookingForm.age} onChange={e => setBookingForm({...bookingForm, age: e.target.value})} placeholder="65" />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Gender</label>
                        <select className="form-select" value={bookingForm.gender} onChange={e => setBookingForm({...bookingForm, gender: e.target.value})}>
                          <option value="M">Male</option>
                          <option value="F">Female</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Contact Phone (+92) *</label>
                      <input className="form-input" value={bookingForm.phone} onChange={e => setBookingForm({...bookingForm, phone: e.target.value})} placeholder="+92-300-1234567" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Home Address with Area *</label>
                      <input className="form-input" value={bookingForm.address} onChange={e => setBookingForm({...bookingForm, address: e.target.value})} placeholder="House #, Block, Area, Karachi" />
                    </div>
                  </div>

                  {/* Leaflet Address Map Pin Simulation */}
                  <div style={{ marginTop: 14, background: 'var(--sage-100)', padding: 12, borderRadius: 8, display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.8rem' }}>
                    <MapPin size={20} style={{ color: 'var(--amber-600)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--teal-800)' }}>Address Map Pin Selected</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--status-grey)', fontFamily: 'var(--font-mono)' }}>Lat: {bookingForm.lat}, Lng: {bookingForm.lng} (Clifton / Karachi)</div>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: Upload Prescription */}
              {bookingStep === 3 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)', marginBottom: 12 }}>
                    Step 3: Upload Doctor's Prescription (Optional)
                  </div>
                  <div style={{ border: '2px dashed var(--sage-300)', padding: 30, borderRadius: 10, textAlign: 'center', background: 'var(--sage-50)' }}>
                    <Upload size={32} style={{ color: 'var(--teal-600)', marginBottom: 10 }} />
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--teal-800)', marginBottom: 4 }}>
                      Click to upload doctor prescription image or PDF
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--status-grey)', marginBottom: 14 }}>
                      Helps our Care Manager verify required medication & clinical SOPs
                    </div>
                    <input
                      type="file"
                      id="rx-upload"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files[0]) setBookingForm({...bookingForm, prescription_name: e.target.files[0].name});
                      }}
                    />
                    <label htmlFor="rx-upload" className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                      Select File
                    </label>
                  </div>

                  {bookingForm.prescription_name && (
                    <div className="badge badge-teal" style={{ marginTop: 12, fontSize: '0.78rem' }}>
                      <FileText size={12} /> {bookingForm.prescription_name} Attached
                    </div>
                  )}
                </div>
              )}

              {/* STEP 4: Choose Date & Time */}
              {bookingStep === 4 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)', marginBottom: 12 }}>
                    Step 4: Choose Preferred Date & Time Slot
                  </div>
                  <div className="form-group">
                    <label className="form-label">Preferred Visit Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={bookingForm.preferred_date}
                      onChange={e => setBookingForm({...bookingForm, preferred_date: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time Slot Preference</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[
                        { id: 'morning', label: 'Morning Slot (09:00 AM - 12:00 PM)' },
                        { id: 'afternoon', label: 'Afternoon Slot (02:00 PM - 05:00 PM)' },
                      ].map(slot => (
                        <button
                          key={slot.id}
                          type="button"
                          className={`btn ${bookingForm.preferred_slot === slot.id ? 'btn-primary' : 'btn-ghost'}`}
                          style={{ flex: 1, fontSize: '0.78rem' }}
                          onClick={() => setBookingForm({...bookingForm, preferred_slot: slot.id})}
                        >
                          {slot.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: Review & Payment */}
              {bookingStep === 5 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--teal-800)', marginBottom: 12 }}>
                    Step 5: Review Booking & Select Payment Option
                  </div>
                  <div style={{ background: 'var(--sage-50)', padding: 14, borderRadius: 8, fontSize: '0.84rem', marginBottom: 16 }}>
                    <div><strong>Service:</strong> {bookingForm.service_title}</div>
                    <div><strong>Patient:</strong> {bookingForm.patient_name} ({bookingForm.age}y / {bookingForm.gender})</div>
                    <div><strong>Contact:</strong> {bookingForm.phone}</div>
                    <div><strong>Address:</strong> {bookingForm.address}</div>
                    <div><strong>Date & Slot:</strong> {bookingForm.preferred_date} ({bookingForm.preferred_slot})</div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Select Payment Method</label>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        type="button"
                        className={`btn ${bookingForm.payment_method === 'advance' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ flex: 1, fontSize: '0.8rem' }}
                        onClick={() => setBookingForm({...bookingForm, payment_method: 'advance'})}
                      >
                        Advance Online Card Payment
                      </button>
                      <button
                        type="button"
                        className={`btn ${bookingForm.payment_method === 'pay_on_service' ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ flex: 1, fontSize: '0.8rem' }}
                        onClick={() => setBookingForm({...bookingForm, payment_method: 'pay_on_service'})}
                      >
                        Pay on Service Arrival
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: Confirmation Screen & Instant Integration */}
              {bookingStep === 6 && bookingResult && (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <CheckCircle size={48} style={{ color: 'var(--status-green)', margin: '0 auto 12px' }} />
                  <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--teal-800)', margin: '0 0 6px' }}>
                    Visit Booking Confirmed!
                  </h3>
                  <div className="badge badge-amber" style={{ fontSize: '0.85rem', padding: '4px 12px', marginBottom: 16 }}>
                    Booking Ref: {bookingResult.reference}
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#4b5563', maxWidth: 450, margin: '0 auto 20px', lineHeight: 1.5 }}>
                    SMS & Email confirmation sent to {bookingForm.phone}. Our Client Care Manager (Hina Malik) is assigning your nurse right now.
                  </p>

                  {/* Account Creation Prompt for Family Portal (Requirement 13) */}
                  <div style={{ background: 'var(--sage-100)', border: '1px solid var(--teal-600)', borderRadius: 10, padding: 16 }}>
                    <div style={{ fontWeight: 700, color: 'var(--teal-800)', fontSize: '0.9rem', marginBottom: 4 }}>
                      Create a Family Account to track your visit live?
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginBottom: 12 }}>
                      View nurse live GPS location, daily vitals reports, and download invoice receipts instantly.
                    </div>
                    <button className="btn btn-primary btn-sm" onClick={handleCreateFamilyAccount} style={{ margin: '0 auto' }}>
                      Access Family Portal Now →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Navigation Footer */}
            {bookingStep < 6 && (
              <div className="modal-footer">
                {bookingStep > 1 && (
                  <button className="btn btn-ghost" onClick={() => setBookingStep(bookingStep - 1)}>
                    ← Back
                  </button>
                )}
                {bookingStep < 5 ? (
                  <button className="btn btn-primary" onClick={() => setBookingStep(bookingStep + 1)}>
                    Next Step →
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={handleBookingSubmit}>
                    Confirm & Complete Booking →
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Blog Article Detail Reader Modal */}
      {selectedArticle && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSelectedArticle(null)}>
          <div className="modal" style={{ width: 600 }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--teal-800)' }}>{selectedArticle.title}</h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelectedArticle(null)}><X size={14} /></button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: '0.78rem', color: 'var(--status-grey)', marginBottom: 14 }}>
                Published by {selectedArticle.author} · {selectedArticle.date}
              </div>
              <div style={{ fontSize: '0.9rem', lineHeight: 1.7, color: '#374151' }}>
                {selectedArticle.content}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedArticle(null)}>Close Article</button>
            </div>
          </div>
        </div>
      )}

      {/* Public Footer */}
      <PublicFooter setActiveTab={setActiveTab} onOpenBookingModal={() => { setShowBookingModal(true); setBookingStep(1); }} />
    </div>
  );
}
