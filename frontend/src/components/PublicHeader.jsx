import React from 'react';
import { Heart, Calendar, Phone, Lock, ChevronRight } from 'lucide-react';
import useStore from '../store/useStore';

export default function PublicHeader({ activeTab, setActiveTab, onOpenBookingModal }) {
  const setActivePage = useStore((s) => s.setActivePage);

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(97, 31, 140, 0.96)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid rgba(253, 224, 71, 0.3)',
      color: 'white',
      padding: '0 40px',
      height: 70,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      {/* Brand Logo */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        onClick={() => setActiveTab('home')}
      >
        <img src="/ehealth-logo.png" alt="eHealth Logo" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.3)' }} />
        <div>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.4rem', fontWeight: 800, color: 'white' }}>
            e<span style={{ color: '#FDE047' }}>Health</span>
          </span>
          <span style={{ display: 'block', fontSize: '0.65rem', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            HOSPITAL AT HOME
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {[
          { id: 'home', label: 'Home' },
          { id: 'services', label: 'Services' },
          { id: 'pricing', label: 'Pricing & Packages' },
          { id: 'blog', label: 'Health Guides' },
          { id: 'about', label: 'About Us' },
          { id: 'contact', label: 'Contact' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === item.id ? 'var(--amber-400)' : 'rgba(255,255,255,0.85)',
              fontWeight: activeTab === item.id ? 700 : 500,
              fontSize: '0.9rem',
              cursor: 'pointer',
              borderBottom: activeTab === item.id ? '2px solid var(--amber-400)' : '2px solid transparent',
              paddingBottom: 4,
              transition: 'all 0.15s'
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.82rem', gap: 6 }}
          onClick={() => setActivePage('overview')}
        >
          <Lock size={14} /> Staff / Admin Login
        </button>
        <button
          className="btn"
          style={{ background: 'var(--amber-500)', color: 'var(--teal-900)', fontWeight: 700, fontSize: '0.85rem', padding: '8px 16px', borderRadius: 8 }}
          onClick={onOpenBookingModal}
        >
          <Calendar size={14} /> Book Visit Online →
        </button>
      </div>
    </header>
  );
}
