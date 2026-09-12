import React from 'react';
import { Heart, Phone, Mail, MapPin, ShieldCheck, Clock } from 'lucide-react';

export default function PublicFooter({ setActiveTab, onOpenBookingModal }) {
  return (
    <footer style={{ background: '#2d0b43', color: 'rgba(255,255,255,0.85)', padding: '60px 40px 30px', borderTop: '1px solid rgba(253,224,71,0.3)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', gap: 40, marginBottom: 40 }}>
        
        {/* Col 1: Brand Info */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <img src="/ehealth-logo.png" alt="eHealth Logo" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
            <div>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: 800, color: 'white' }}>
                e<span style={{ color: '#FDE047' }}>Health</span>
              </span>
              <span style={{ display: 'block', fontSize: '0.6rem', color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                HOSPITAL AT HOME
              </span>
            </div>
          </div>
          <p style={{ fontSize: '0.85rem', lineHeight: 1.6, color: 'rgba(255,255,255,0.65)', marginBottom: 20 }}>
            Pakistan's leading technology-enabled home healthcare platform. Dispatching licensed doctors, registered nurses, and certified physiotherapists directly to your doorstep.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>24/7 Medical Emergency Dispatch</span>
            <span className="badge badge-teal" style={{ fontSize: '0.72rem' }}>PMDC & PNC Licensed</span>
          </div>
        </div>

        {/* Col 2: Services */}
        <div>
          <h4 style={{ color: 'white', fontFamily: 'var(--font-heading)', margin: '0 0 14px', fontSize: '0.95rem' }}>Our Services</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('services')}>Long-Term Nursing Care</a></li>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('services')}>Home Physiotherapy</a></li>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('services')}>Short Visits & Lab Sampling</a></li>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('services')}>Medicine & Oxygen Delivery</a></li>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('services')}>Elderly Care Attendants</a></li>
          </ul>
        </div>

        {/* Col 3: Quick Links */}
        <div>
          <h4 style={{ color: 'white', fontFamily: 'var(--font-heading)', margin: '0 0 14px', fontSize: '0.95rem' }}>Quick Links</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('about')}>About HomeCare OS</a></li>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('pricing')}>Pricing & Packages</a></li>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('blog')}>Health Guides & SOPs</a></li>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={() => setActiveTab('contact')}>Contact & Branch Locations</a></li>
            <li><a style={{ color: 'inherit', cursor: 'pointer' }} onClick={onOpenBookingModal}>Book Visit Online</a></li>
          </ul>
        </div>

        {/* Col 4: Contact & Hotline */}
        <div>
          <h4 style={{ color: 'white', fontFamily: 'var(--font-heading)', margin: '0 0 14px', fontSize: '0.95rem' }}>Islamabad Central Dispatch</h4>
          <div style={{ fontSize: '0.82rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Phone size={14} style={{ color: 'var(--amber-400)' }} />
              <span><strong>Hotline:</strong> +92-51-111-CARE-OS (2273)</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Mail size={14} style={{ color: 'var(--amber-400)' }} />
              <span>support@ehealth.com</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <MapPin size={14} style={{ color: 'var(--amber-400)', flexShrink: 0, marginTop: 2 }} />
              <span>Main Office: PWD Road, adjacent to Soan Garden, Islamabad</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 20, display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)' }}>
        <div>© 2026 eHealth — Hospital at Home. All rights reserved. Registered Healthcare Service Provider.</div>
        <div>Privacy Policy · Terms of Service · HIPAA & Data Protection Compliant</div>
      </div>
    </footer>
  );
}
