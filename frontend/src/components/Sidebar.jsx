import React, { useState } from 'react';
import useStore from '../store/useStore';
import { ROLE_CONFIG } from '../data/mockData';
import {
  LayoutDashboard, Calendar, MapPin, Users, UserCog,
  Heart, Settings, DollarSign, BarChart2, Menu, X,
  Activity, Receipt, Kanban, PieChart, Shield, GraduationCap,
  Pill, Truck, FlaskConical
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
  { section: 'Services', items: [
    { id: 'pharmacy',   label: 'Pharmacy Orders',   icon: Pill },
    { id: 'equipment',  label: 'Equipment Rentals', icon: Truck },
    { id: 'lab-orders', label: 'Lab Orders',        icon: FlaskConical },
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
  const [isHovered, setIsHovered] = useState(false);
  const activePage    = useStore((s) => s.activePage);
  const setActivePage  = useStore((s) => s.setActivePage);
  const sidebarOpen   = useStore((s) => s.sidebarOpen);
  const toggleSidebar  = useStore((s) => s.toggleSidebar);
  const currentRole   = useStore((s) => s.currentRole);
  const currentUser   = useStore((s) => s.currentUser);

  const allowedNav = ROLE_CONFIG[currentRole]?.nav || ['overview'];

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="drawer-backdrop" style={{ zIndex: 45 }} onClick={toggleSidebar} />
      )}

      <aside
        className={`sidebar${sidebarOpen ? ' open' : ''}${isHovered ? ' is-hovered' : ''}`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-inner">
            <img
              src="/ehealth-logo.png"
              alt="eHealth Logo"
              className="sidebar-logo-img"
            />
            <div className="sidebar-brand-text">
              <h1 className="sidebar-brand-title">
                e<span>Health</span>
              </h1>
              <p className="sidebar-tagline">
                HOSPITAL AT HOME
              </p>
            </div>
            <button
              onClick={toggleSidebar}
              className="sidebar-close-btn"
              title="Close Menu"
              aria-label="Close menu"
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
              <div key={section.section} className="nav-section">
                <p className="nav-section-label">{section.section}</p>
                {filteredItems.map(({ id, label, icon: Icon, live }) => {
                  const isActive = activePage === id;
                  return (
                    <button
                      key={id}
                      className={`nav-item${isActive ? ' active' : ''}`}
                      onClick={() => { setActivePage(id); if (sidebarOpen) toggleSidebar(); }}
                      title={label}
                      aria-label={label}
                    >
                      <div className="nav-icon-wrap">
                        <Icon size={17} className="nav-icon" />
                        {live && <span className="live-dot-badge" />}
                      </div>
                      <span className="nav-label">{label}</span>
                      {live && (
                        <span className="nav-live-indicator">
                          <span className="live-dot" style={{ width: 6, height: 6 }} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-inner">
            <div className="avatar sidebar-avatar" title={currentUser?.full_name || 'Staff Member'}>
              {currentUser?.full_name ? currentUser.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'HC'}
            </div>
            <div className="sidebar-user-details">
              <div className="sidebar-user-name">
                {currentUser?.full_name || 'Staff Member'}
              </div>
              <div className="sidebar-user-role">
                {currentUser?.role_display || ROLE_CONFIG[currentRole]?.label || currentRole}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
