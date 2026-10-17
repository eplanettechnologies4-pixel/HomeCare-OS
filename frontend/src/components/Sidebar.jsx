import React, { useState } from 'react';
import useStore from '../store/useStore';
import { ROLE_CONFIG } from '../data/mockData';
import {
  LayoutDashboard, Calendar, MapPin, Users, UserCog,
  Heart, Receipt, DollarSign, BarChart2, X,
  Activity, Kanban, PieChart, Shield, GraduationCap,
  Pill, Truck, FlaskConical, FileText, LogOut
} from 'lucide-react';

// Grouped navigation hierarchy according to enterprise system architecture
const NAV_GROUPS = [
  {
    title: 'Care',
    items: [
      { id: 'overview',   label: 'Overview',          icon: LayoutDashboard },
      { id: 'bookings',   label: 'Bookings',          icon: Calendar },
      { id: 'patients',   label: 'Patients',          icon: Heart },
      { id: 'therapy',    label: 'Therapy Services',  icon: Activity },
      { id: 'pharmacy',   label: 'Pharmacy Orders',   icon: Pill },
      { id: 'lab-orders', label: 'Lab Orders',        icon: FlaskConical },
      { id: 'equipment',  label: 'Equipment Rentals', icon: Truck },
    ]
  },
  {
    title: 'Operations',
    items: [
      { id: 'live-tracking', label: 'Live Tracking',  icon: MapPin, live: true },
      { id: 'staff',         label: 'Staff Directory',icon: Users },
      { id: 'crm',           label: 'CRM Leads',      icon: Kanban },
      { id: 'lms',           label: 'Training / LMS', icon: GraduationCap },
    ]
  },
  {
    title: 'Finance',
    items: [
      { id: 'billing',   label: 'Billing & Invoices', icon: Receipt },
      { id: 'accounts',  label: 'Accounts Ledger',    icon: DollarSign },
      { id: 'reports',   label: 'Reports',            icon: BarChart2 },
      { id: 'analytics', label: 'Analytics',          icon: PieChart },
    ]
  },
  {
    title: 'Admin',
    items: [
      { id: 'forms',    label: 'Form Builder',   icon: FileText },
      { id: 'admin-hr', label: 'Admin / HR',     icon: UserCog },
      { id: 'users',    label: 'Users & Roles',  icon: Shield },
    ]
  }
];

export default function Sidebar() {
  const [isHovered, setIsHovered] = useState(false);
  const activePage    = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);
  const sidebarOpen   = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const currentRole   = useStore((s) => s.currentRole);
  const currentUser   = useStore((s) => s.currentUser);
  const logout        = useStore((s) => s.logout);

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
        {/* Logo Header */}
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

        {/* Grouped Navigation */}
        <nav className="sidebar-nav">
          {NAV_GROUPS.map((group) => {
            const filteredItems = group.items.filter((item) => allowedNav.includes(item.id));
            if (filteredItems.length === 0) return null;

            return (
              <div key={group.title} className="nav-section">
                <p className="nav-section-label">{group.title}</p>
                {filteredItems.map(({ id, label, icon: Icon, live }) => {
                  const isActive = activePage === id;
                  return (
                    <button
                      key={id}
                      className={`nav-item${isActive ? ' active' : ''}`}
                      onClick={() => {
                        setActivePage(id);
                        if (sidebarOpen) toggleSidebar();
                      }}
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

        {/* Footer with User Details and Logout */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-inner" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 10 }}>
            <div className="avatar sidebar-avatar" title={currentUser?.full_name || 'Staff Member'}>
              {currentUser?.full_name
                ? currentUser.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
                : 'HC'}
            </div>
            <div className="sidebar-user-details" style={{ flex: 1, minWidth: 0 }}>
              <div className="sidebar-user-name">
                {currentUser?.full_name || 'Staff Member'}
              </div>
              <div className="sidebar-user-role">
                {currentUser?.role_display || ROLE_CONFIG[currentRole]?.label || currentRole}
              </div>
            </div>
            <button
              onClick={() => logout && logout()}
              className="btn btn-ghost btn-icon btn-sm"
              title="Sign Out"
              aria-label="Sign Out"
              style={{
                color: '#F87171',
                padding: 4,
                width: 28,
                height: 28,
                borderRadius: 6,
                flexShrink: 0,
                opacity: isHovered || sidebarOpen ? 1 : 0,
                transition: 'opacity 150ms ease',
              }}
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
