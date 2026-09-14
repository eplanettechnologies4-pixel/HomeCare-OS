import React from 'react';
import useStore from '../store/useStore';
import { ROLE_CONFIG } from '../data/mockData';
import {
  LayoutDashboard, Calendar, MapPin, Users, UserCog,
  Heart, Settings, DollarSign, BarChart2, Menu, X,
  Activity, Receipt, Kanban, PieChart, Shield, GraduationCap
} from 'lucide-react';

const NAV = [
  { section: 'Core', items: [
    { id: 'overview',      label: 'Overview',       icon: LayoutDashboard },
    { id: 'bookings',      label: 'Bookings',       icon: Calendar },
    { id: 'live-tracking', label: 'Live Tracking',  icon: MapPin, live: true },
  ]},
  { section: 'People', items: [
    { id: 'staff',    label: 'Staff',    icon: Users },
    { id: 'patients', label: 'Patients', icon: Heart },
  ]},
  { section: 'Clinical', items: [
    { id: 'therapy',  label: 'Therapy Services', icon: Activity },
  ]},
  { section: 'Operations', items: [
    { id: 'crm',       label: 'CRM Leads',   icon: Kanban },
    { id: 'billing',   label: 'Billing',     icon: Receipt },
    { id: 'accounts',  label: 'Accounts',    icon: DollarSign },
    { id: 'admin-hr',  label: 'Admin / HR',  icon: UserCog },
    { id: 'lms',       label: 'Training / LMS', icon: GraduationCap },
    { id: 'reports',   label: 'Reports',     icon: BarChart2 },
    { id: 'analytics', label: 'Analytics',   icon: PieChart },
    { id: 'users',     label: 'Users & Roles', icon: Shield },
  ]},
];

export default function Sidebar() {
  const activePage    = useStore((s) => s.activePage);
  const setActivePage  = useStore((s) => s.setActivePage);
  const sidebarOpen   = useStore((s) => s.sidebarOpen);
  const toggleSidebar  = useStore((s) => s.toggleSidebar);
  const currentRole   = useStore((s) => s.currentRole);

  const allowedNav = ROLE_CONFIG[currentRole]?.nav || ['overview'];

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="drawer-backdrop" style={{ zIndex: 45 }} onClick={toggleSidebar} />
      )}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/ehealth-logo.png"
              alt="eHealth Logo"
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                objectFit: 'cover',
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                border: '2px solid rgba(255,255,255,0.25)',
                flexShrink: 0
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'white', margin: 0, lineHeight: 1.15, display: 'flex', alignItems: 'center', gap: 1 }}>
                e<span style={{ color: '#FDE047' }}>Health</span>
              </h1>
              <p className="sidebar-tagline" style={{ margin: 0, marginTop: 2, fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.7)' }}>
                HOSPITAL AT HOME
              </p>
            </div>
            <button
              onClick={toggleSidebar}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'none' }}
              className="sidebar-close-btn"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {NAV.map((section) => {
            const filteredItems = section.items.filter(item => allowedNav.includes(item.id));
            if (filteredItems.length === 0) return null;

            return (
              <div key={section.section}>
                <p className="nav-section-label">{section.section}</p>
                {filteredItems.map(({ id, label, icon: Icon, live }) => (
                  <button
                    key={id}
                    className={`nav-item${activePage === id ? ' active' : ''}`}
                    onClick={() => { setActivePage(id); if (sidebarOpen) toggleSidebar(); }}
                    style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer' }}
                  >
                    <Icon size={16} className="nav-icon" />
                    {label}
                    {live && (
                      <span style={{ marginLeft: 'auto' }}>
                        <span className="live-dot" style={{ width: 6, height: 6 }} />
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="avatar" style={{ background: 'rgba(255,255,255,0.15)', color: 'white' }}>AD</div>
            <div>
              <div style={{ color: 'white', fontSize: '0.8rem', fontWeight: 600 }}>Admin User</div>
              <div style={{ color: 'var(--amber-400)', fontSize: '0.7rem', textTransform: 'capitalize' }}>
                {ROLE_CONFIG[currentRole]?.label || currentRole}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
