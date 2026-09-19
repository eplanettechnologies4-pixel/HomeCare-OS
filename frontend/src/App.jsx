import React from 'react';
import { Shield, Smartphone } from 'lucide-react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import useStore from './store/useStore';
import { ROLE_CONFIG } from './data/mockData';
import Overview      from './pages/Overview';
import LiveTracking  from './pages/LiveTracking';
import Bookings      from './pages/Bookings';
import Staff         from './pages/Staff';
import Patients      from './pages/Patients';
import Patient360    from './pages/Patient360';
import Therapy       from './pages/Therapy';
import AdminHR       from './pages/AdminHR';
import Accounts      from './pages/Accounts';
import Billing       from './pages/Billing';
import CRM           from './pages/CRM';
import Reports       from './pages/Reports';
import Analytics     from './pages/Analytics';
import UserManagement from './pages/UserManagement';
import FamilyPortal  from './pages/FamilyPortal';
import Login         from './pages/Login';
import PublicWebsite from './pages/PublicWebsite';
import PublicVerification from './pages/PublicVerification';
import LMS            from './pages/LMS';

const PAGE_META = {
  'overview':       { title: 'Overview',            subtitle: 'Live operations at a glance' },
  'bookings':       { title: 'Bookings',            subtitle: 'Manage all patient visit bookings' },
  'live-tracking':  { title: 'Live Tracking',       subtitle: 'Real-time field staff GPS tracking' },
  'staff':          { title: 'Staff',               subtitle: 'Staff directory, roster and attendance' },
  'patients':       { title: 'Patients (EMR)',      subtitle: 'Electronic medical records' },
  'patient-360':    { title: 'Patient 360° Profile',subtitle: 'Comprehensive medical record & history' },
  'therapy':        { title: 'Therapy Services',    subtitle: 'Physio, Speech, Psychology, Dietetics' },
  'admin-hr':       { title: 'Admin / HR',          subtitle: 'Announcements, docs, training \u0026 payroll' },
  'lms':            { title: 'Training / LMS',       subtitle: 'Course library, staff assignments \u0026 certificates' },
  'accounts':       { title: 'Accounts',            subtitle: 'Payments, invoices and revenue' },
  'billing':        { title: 'Billing & Invoicing', subtitle: 'Patient billing packages, invoices & ledger' },
  'crm':            { title: 'CRM / Leads Pipeline',subtitle: 'Inquiries, follow-ups, and lead conversion' },
  'reports':        { title: 'Reports',             subtitle: 'Operational reports and export' },
  'analytics':      { title: 'Analytics',           subtitle: 'Executive KPIs, trends, and service breakdown' },
  'users':          { title: 'Users & Permissions', subtitle: 'User accounts, role matrix, and audit trail' },
};

const PAGE_COMPONENTS = {
  'overview':       Overview,
  'bookings':       Bookings,
  'live-tracking':  LiveTracking,
  'staff':          Staff,
  'patients':       Patients,
  'patient-360':    Patient360,
  'therapy':        Therapy,
  'admin-hr':       AdminHR,
  'lms':            LMS,
  'accounts':       Accounts,
  'billing':        Billing,
  'crm':            CRM,
  'reports':        Reports,
  'analytics':      Analytics,
  'users':          UserManagement,
};

export default function App() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const activePage      = useStore((s) => s.activePage);
  const currentRole     = useStore((s) => s.currentRole);
  const currentUser     = useStore((s) => s.currentUser);
  const fetchAllData    = useStore((s) => s.fetchAllData);

  React.useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
    }
  }, [isAuthenticated, fetchAllData]);

  // Detect public verification routes from URL pathname or search (no login required)
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const search = typeof window !== 'undefined' ? window.location.search : '';
  const urlParams = new URLSearchParams(search);

  const isCertRoute = pathname.startsWith('/verify-certificate') || pathname.startsWith('/verify-cert') || activePage === 'verify-cert';
  const isStaffRoute = pathname.startsWith('/verify-staff') || activePage === 'verify-staff';

  if (isCertRoute || isStaffRoute) {
    let certId = '';
    if (pathname.startsWith('/verify-certificate/')) {
      certId = decodeURIComponent(pathname.replace('/verify-certificate/', '').trim());
    } else if (pathname.startsWith('/verify-cert/')) {
      certId = decodeURIComponent(pathname.replace('/verify-cert/', '').trim());
    }
    if (!certId) {
      certId = urlParams.get('id') || urlParams.get('cert') || urlParams.get('cert_id') || '';
    }

    let empId = 'HC-N-000123';
    if (pathname.startsWith('/verify-staff/')) {
      empId = decodeURIComponent(pathname.replace('/verify-staff/', '').trim()) || empId;
    } else if (urlParams.get('empId')) {
      empId = urlParams.get('empId');
    }

    return (
      <PublicVerification
        empId={empId}
        initialCertId={certId}
        initialMode={isCertRoute ? 'certificate' : 'staff'}
      />
    );
  }

  // Public Website mode (no login required to browse)
  if (activePage === 'public-site') {
    return <PublicWebsite />;
  }

  // Unauthenticated → Login Screen
  if (!isAuthenticated) {
    return <Login />;
  }

  // Mobile-Only Account Guard: Field staff configured for mobile only must use the mobile app
  if (currentUser?.platform_allowed === 'mobile') {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', background: 'var(--teal-900)', fontFamily: 'var(--font-body)', padding: 20 }}>
        <div className="card" style={{ maxWidth: 520, textAlign: 'center', padding: 40, borderTop: '4px solid var(--status-amber)' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'var(--status-amber)' }}>
            <Smartphone size={32} />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--teal-900)', marginBottom: 12 }}>
            Mobile App Access Only
          </h2>
          <p style={{ fontSize: '0.92rem', color: 'var(--status-grey)', lineHeight: 1.6, marginBottom: 20 }}>
            Hello <strong>{currentUser.full_name || currentUser.username}</strong>. Your account is configured for <strong>Mobile Only</strong> access ({currentUser.role_display || 'Field Staff'}). Field visits, vitals recording, and clinical shift tasks must be performed through the <strong>HomeCare OS Mobile App</strong>.
          </p>
          <div style={{ background: 'var(--sage-50)', padding: 16, borderRadius: 'var(--radius-md)', marginBottom: 24, textAlign: 'left', fontSize: '0.85rem', color: 'var(--teal-800)' }}>
            <div>📱 <strong>Mobile App:</strong> Available on iOS & Android field devices</div>
            <div style={{ marginTop: 6 }}>🔒 <strong>Platform Allowed:</strong> Mobile Only</div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => useStore.getState().logout()}>
            Sign Out & Return to Login
          </button>
        </div>
      </div>
    );
  }

  // Patient / Family Role → Family Portal Screen
  if (currentRole === 'patient_family' || activePage === 'family-portal') {
    return <FamilyPortal />;
  }

  // Role Access Guard: Check if the current role is authorized to view this page
  const allowedNav = ROLE_CONFIG[currentRole]?.nav || ['overview'];
  const isSuperAdmin = currentRole === 'super_admin' && currentUser?.role === 'super_admin';
  const isAllowed =
    isSuperAdmin ||
    allowedNav.includes(activePage) ||
    (activePage === 'patient-360' && allowedNav.includes('patients'));

  if (!isAllowed) {
    return (
      <div className="app-shell">
        <Sidebar />
        <div className="main-area">
          <Topbar pageTitle="Access Restricted" pageSubtitle="Insufficient Permissions" />
          <main className="page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div className="card" style={{ maxWidth: 480, textAlign: 'center', padding: 36, borderTop: '4px solid var(--status-red)' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(239, 68, 68, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--status-red)' }}>
                <Shield size={28} />
              </div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--teal-900)', marginBottom: 8 }}>Access Restricted</h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--status-grey)', lineHeight: 1.5, marginBottom: 20 }}>
                This module (<strong>{PAGE_META[activePage]?.title || activePage}</strong>) is locked down for Super Administrator access only. Your current role is <strong>{ROLE_CONFIG[currentRole]?.label || currentRole}</strong>.
              </p>
              <button className="btn btn-primary" onClick={() => useStore.getState().setActivePage('overview')}>
                Return to Overview
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const meta = PAGE_META[activePage] || { title: 'eHealth', subtitle: 'Hospital at Home' };
  const PageComponent = PAGE_COMPONENTS[activePage] || Overview;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        <Topbar pageTitle={meta.title} pageSubtitle={meta.subtitle} />
        <main className="page-content">
          <PageComponent />
        </main>
      </div>
    </div>
  );
}
