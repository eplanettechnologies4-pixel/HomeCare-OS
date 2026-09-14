import React from 'react';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import useStore from './store/useStore';
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

  // Patient / Family Role → Family Portal Screen
  if (currentRole === 'patient_family' || activePage === 'family-portal') {
    return <FamilyPortal />;
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
