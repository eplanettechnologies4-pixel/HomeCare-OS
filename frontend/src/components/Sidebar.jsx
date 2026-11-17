import React, { useState, useEffect, useMemo, useRef, memo } from 'react';
import useStore from '../store/useStore';
import { ROLE_CONFIG } from '../data/mockData';
import { isClinicianRole, getClinicianConfig } from '../config/clinicianRoleConfig';
import {
  LayoutDashboard, Calendar, MapPin, Users, UserCog,
  Heart, Receipt, DollarSign, BarChart2, X,
  Activity, Kanban, PieChart, Shield, GraduationCap,
  Pill, Truck, FlaskConical, FileText, LogOut,
  Star, AlertCircle, PhoneCall, CalendarDays, Clock, UserMinus, ShieldCheck,
  ChevronLeft, ChevronRight, FolderHeart, Pin, PinOff
} from 'lucide-react';

const NURSE_NAV_GROUPS = [
  {
    title: 'Overview',
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Care',
    items: [
      { id: 'patient-file',         label: 'Patient File',  icon: FolderHeart },
      { id: 'call-help',            label: 'Call Help',     icon: PhoneCall },
      { id: 'my-reviews',           label: 'My Reviews',    icon: Star },
    ],
  },
  {
    title: 'Me',
    items: [
      { id: 'my-docs',           label: 'My Docs & ID',      icon: FileText },
      { id: 'my-trainings',      label: 'My Trainings',      icon: GraduationCap },
      { id: 'my-timesheet',      label: 'My Timesheet',      icon: Clock },
      { id: 'leave-application', label: 'Leave Application', icon: CalendarDays },
      { id: 'permission',        label: 'Permission',        icon: Clock },
      { id: 'my-complaints',     label: 'My Complaints',     icon: AlertCircle },
      { id: 'resignation',       label: 'Resignation',       icon: UserMinus },
      { id: 'company-policies',  label: 'Company Policies',  icon: ShieldCheck },
    ],
  },
];

// Grouped navigation hierarchy according to enterprise system architecture
const NAV_GROUPS = [
  {
    title: 'Care',
    items: [
      { id: 'overview',     label: 'Overview',          icon: LayoutDashboard },
      { id: 'bookings',     label: 'Bookings',          icon: Calendar },
      { id: 'patient-file', label: 'Patient File',      icon: FolderHeart },
      { id: 'patients',     label: 'Patients',          icon: Heart },
      { id: 'therapy',      label: 'Therapy Services',  icon: Activity },
      { id: 'pharmacy',     label: 'Pharmacy Orders',   icon: Pill },
      { id: 'lab-orders',   label: 'Lab Orders',        icon: FlaskConical },
      { id: 'equipment',    label: 'Equipment Rentals', icon: Truck },
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

function Sidebar() {
  const [isPinned, setIsPinned] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('sidebar_pinned') === 'true';
      } catch (e) {
        return false;
      }
    }
    return false;
  });

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('sidebar_collapsed') === 'true';
      } catch (e) {
        return false;
      }
    }
    return false;
  });

  const [isHovered, setIsHovered] = useState(false);
  const hoverTimerRef = useRef(null);

  const activePage    = useStore((s) => s.activePage);
  const setActivePage = useStore((s) => s.setActivePage);
  const sidebarOpen   = useStore((s) => s.sidebarOpen);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const currentRole   = useStore((s) => s.currentRole);
  const currentUser   = useStore((s) => s.currentUser);
  const logout        = useStore((s) => s.logout);

  const resolvedRole = currentRole || (typeof window !== 'undefined' ? localStorage.getItem('currentRole') : null) || 'nurse';
  const allowedNav = useMemo(() => {
    return ROLE_CONFIG[resolvedRole]?.nav || ['overview'];
  }, [resolvedRole]);

  const isClinician = useMemo(() => isClinicianRole(resolvedRole), [resolvedRole]);
  const clinicianConfig = useMemo(() => getClinicianConfig(resolvedRole), [resolvedRole]);
  const clinicianNavGroups = useMemo(() => clinicianConfig.sidebarGroups, [clinicianConfig]);
  const adminNavGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedNav.includes(item.id)),
    })).filter((group) => group.items.length > 0);
  }, [allowedNav]);

  // For staff roles, rail is 72px unless pinned. For admin, follows isCollapsed.
  const effectiveCollapsed = isClinician ? !isPinned : isCollapsed;
  const isExpanded = isClinician
    ? isPinned || isHovered || sidebarOpen
    : !isCollapsed || isHovered || sidebarOpen;

  // Synchronize CSS variable: stays 72px for staff unless pinned so overlay does NOT shift layout!
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const activeWidth = effectiveCollapsed ? '72px' : '240px';
      document.documentElement.style.setProperty('--sidebar-collapsed', activeWidth);
    }
  }, [effectiveCollapsed]);

  // Esc key closes hover overlay and mobile drawer
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        setIsHovered(false);
        if (sidebarOpen && toggleSidebar) toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarOpen, toggleSidebar]);

  // 120ms debounce for hover open & close
  const handleMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHovered(true), 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHovered(false), 120);
  };

  const handleTogglePin = () => {
    const next = !isPinned;
    setIsPinned(next);
    try {
      localStorage.setItem('sidebar_pinned', String(next));
    } catch (e) {}
  };

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="drawer-backdrop" style={{ zIndex: 45 }} onClick={toggleSidebar} />
      )}

      <aside
        className={`sidebar ${effectiveCollapsed ? 'is-collapsed' : 'is-expanded'}${sidebarOpen ? ' open' : ''}${isHovered ? ' is-hovered' : ''}`}
        style={{
          width: isExpanded ? 240 : 72,
          transition: 'width 150ms cubic-bezier(0.4, 0, 0.2, 1)',
          ...(isClinician && isHovered && !isPinned ? {
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 50,
            boxShadow: '4px 0 24px rgba(0,0,0,0.22)',
          } : {}),
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => setIsHovered(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsHovered(false);
          }
        }}
      >
        {/* Logo Header */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-inner" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <img
                src="/ehealth-logo.png"
                alt="eHealth Logo"
                className="sidebar-logo-img"
              />
              <div
                className="sidebar-brand-text"
                style={{
                  opacity: isExpanded ? 1 : 0,
                  maxWidth: isExpanded ? 180 : 0,
                  overflow: 'hidden',
                  pointerEvents: isExpanded ? 'auto' : 'none',
                  transition: 'opacity 150ms ease, max-width 150ms ease',
                  whiteSpace: 'nowrap',
                }}
              >
                <h1 className="sidebar-brand-title">
                  e<span>Health</span>
                </h1>
                <p className="sidebar-tagline">
                  HOSPITAL AT HOME
                </p>
              </div>
            </div>

            {/* Pin Toggle Button for Staff Roles */}
            {isClinician && (
              <button
                onClick={handleTogglePin}
                className="btn btn-ghost btn-sm"
                style={{
                  color: isPinned ? '#8B5CF6' : '#94A3B8',
                  background: isPinned ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                }}
                title={isPinned ? 'Unpin sidebar (auto-collapse to 72px rail)' : 'Pin sidebar expanded (240px)'}
                aria-label={isPinned ? 'Unpin sidebar' : 'Pin sidebar'}
              >
                {isPinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
            )}

            {/* Desktop collapse toggle button for Admin */}
            {!isClinician && (
              <button
                onClick={() => {
                  const next = !isCollapsed;
                  setIsCollapsed(next);
                  try { localStorage.setItem('sidebar_collapsed', String(next)); } catch (e) {}
                }}
                className="btn btn-ghost btn-sm"
                style={{
                  color: '#94A3B8',
                  padding: '4px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 26,
                  height: 26,
                }}
                title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isCollapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
              </button>
            )}

            {/* Mobile close button */}
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
        <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
          {isClinician ? (
            clinicianNavGroups.map((group) => (
              <div key={group.title} className="nav-section" style={{ marginBottom: 12 }}>
                <p
                  className="nav-section-label"
                  style={{
                    opacity: isExpanded ? 1 : 0,
                    maxHeight: isExpanded ? 36 : 0,
                    overflow: 'hidden',
                    pointerEvents: isExpanded ? 'auto' : 'none',
                    transition: 'opacity 150ms ease, max-height 150ms ease',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#94A3B8',
                    padding: isExpanded ? '6px 14px 2px' : '0 14px',
                    margin: 0,
                  }}
                >
                  {group.title}
                </p>
                {group.items.map(({ id, label, icon: Icon }) => {
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 14px',
                        width: '100%',
                        textAlign: 'left',
                        background: isActive ? '#6D28D9' : 'transparent',
                        color: isActive ? '#FFFFFF' : '#CBD5E1',
                        borderRadius: 8,
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'background-color 150ms ease, color 150ms ease',
                      }}
                    >
                      <div className="nav-icon-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                        <Icon size={18} className="nav-icon" style={{ color: isActive ? '#FFFFFF' : '#94A3B8' }} />
                        {(id === 'patient-file' || id === 'call-help' || id === 'my-reviews') && (
                          <span
                            style={{
                              position: 'absolute',
                              top: -2,
                              right: -2,
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#8B5CF6',
                            }}
                          />
                        )}
                      </div>
                      <span
                        className="nav-label"
                        style={{
                          opacity: isExpanded ? 1 : 0,
                          maxWidth: isExpanded ? 170 : 0,
                          overflow: 'hidden',
                          pointerEvents: isExpanded ? 'auto' : 'none',
                          transition: 'opacity 150ms ease, max-width 150ms ease',
                          fontSize: '14px',
                          fontWeight: isActive ? 600 : 400,
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}
                      >
                        {label}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            adminNavGroups.map((group) => (
              <div key={group.title} className="nav-section">
                <p
                  className="nav-section-label"
                  style={{
                    opacity: isExpanded ? 1 : 0,
                    maxHeight: isExpanded ? 36 : 0,
                    overflow: 'hidden',
                    pointerEvents: isExpanded ? 'auto' : 'none',
                    transition: 'opacity 150ms ease, max-height 150ms ease',
                  }}
                >
                  {group.title}
                </p>
                {group.items.map(({ id, label, icon: Icon, live }) => {
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
                      <span
                        className="nav-label"
                        style={{
                          opacity: isExpanded ? 1 : 0,
                          maxWidth: isExpanded ? 170 : 0,
                          overflow: 'hidden',
                          pointerEvents: isExpanded ? 'auto' : 'none',
                          transition: 'opacity 150ms ease, max-width 150ms ease',
                        }}
                      >
                        {label}
                      </span>
                      {live && (
                        <span className="nav-live-indicator">
                          <span className="live-dot" style={{ width: 6, height: 6 }} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </nav>

        {/* Footer with User Details and Logout */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-inner" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 10 }}>
            <div className="avatar sidebar-avatar" title={currentUser?.full_name || 'Staff Member'}>
              {currentUser?.full_name
                ? currentUser.full_name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
                : 'RN'}
            </div>
            <div
              className="sidebar-user-details"
              style={{
                flex: 1,
                minWidth: 0,
                maxWidth: isExpanded ? 150 : 0,
                overflow: 'hidden',
                pointerEvents: isExpanded ? 'auto' : 'none',
                opacity: isExpanded ? 1 : 0,
                transition: 'opacity 150ms ease, max-width 150ms ease',
              }}
            >
              <div className="sidebar-user-name" style={{ color: '#F8FAFC', fontSize: '13px', fontWeight: 600 }}>
                {currentUser?.full_name || 'Mariam Sheikh'}
              </div>
              <div className="sidebar-user-role" style={{ color: '#A78BFA', fontSize: '12px' }}>
                {currentUser?.role_display || ROLE_CONFIG[currentRole]?.label || 'Registered Nurse'}
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
                opacity: isExpanded ? 1 : 0,
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

export default memo(Sidebar);
