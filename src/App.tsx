import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/components/shell/AppShell";
import { LoadingState } from "@/components/hris/states";
import { useAuth } from "@/providers/AuthProvider";
import { PERMISSIONS, type Permission } from "@/domain/permissions";
import { EmptyState } from "@/components/hris/states";
import { RouteErrorBoundary } from "@/components/hris/RouteErrorBoundary";
import { ShieldAlert } from "lucide-react";

import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import SelfServicePage from "@/pages/SelfServicePage";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const EmployeesPage = lazy(() => import("@/pages/EmployeesPage"));
const EmployeeDetailPage = lazy(() => import("@/pages/EmployeeDetailPage"));
const OrganizationPage = lazy(() => import("@/pages/OrganizationPage"));
const PositionsPage = lazy(() => import("@/pages/PositionsPage"));
const ContractsPage = lazy(() => import("@/pages/ContractsPage"));
const AttendancePage = lazy(() => import("@/pages/AttendancePage"));
const LeavePage = lazy(() => import("@/pages/LeavePage"));
const PayrollPage = lazy(() => import("@/pages/PayrollPage"));
const BenefitsPage = lazy(() => import("@/pages/BenefitsPage"));
const EducationPage = lazy(() => import("@/pages/EducationPage"));
const TrainingsPage = lazy(() => import("@/pages/TrainingsPage"));
const PerformancePage = lazy(() => import("@/pages/PerformancePage"));
const DisciplinePage = lazy(() => import("@/pages/DisciplinePage"));
const DocumentsPage = lazy(() => import("@/pages/DocumentsPage"));
const MutationsPage = lazy(() => import("@/pages/MutationsPage"));
const ResignationsPage = lazy(() => import("@/pages/ResignationsPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const ImportPage = lazy(() => import("@/pages/ImportPage"));
const AuditPage = lazy(() => import("@/pages/AuditPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const ProfilePage = lazy(() => import("@/pages/ProfilePage"));

/** Guard for routes that need a permission. The backend check is still final. */
function Guard({ permission, children }: { permission: Permission; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Akses tidak tersedia"
        description={`Halaman ini memerlukan izin ${permission}. Hubungi Super Admin bila Anda merasa ini keliru.`}
      />
    );
  }
  return <>{children}</>;
}

function NotFound() {  return (
    <EmptyState
      title="Halaman tidak ditemukan"
      description="Alamat yang Anda buka tidak tersedia di HRIS PIAT6."
    />
  );
}

/**
 * Landing route inside the shell: HR roles get the operational dashboard,
 * employees land on their own portal instead of a dashboard they cannot read.
 */
function HomeRoute() {
  const { can } = useAuth();
  if (can(PERMISSIONS.HR_VIEW)) return <DashboardPage />;
  return <Navigate to="/app/portal" replace />;
}

export default function App() {
  return (
    <Suspense fallback={<LoadingState label="Memuat modul…" />}>
      <RouteErrorBoundary>
        <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<HomeRoute />} />
          <Route
            path="portal"
            element={
              <Guard permission={PERMISSIONS.HR_SELF_VIEW}>
                <RouteErrorBoundary pageName="Portal Karyawan">
                  <SelfServicePage />
                </RouteErrorBoundary>
              </Guard>
            }
          />
          <Route
            path="employees"
            element={
              <Guard permission={PERMISSIONS.HR_VIEW}>
                <EmployeesPage />
              </Guard>
            }
          />
          <Route
            path="employees/:id"
            element={
              <Guard permission={PERMISSIONS.HR_VIEW}>
                <EmployeeDetailPage />
              </Guard>
            }
          />
          <Route
            path="organization"
            element={
              <Guard permission={PERMISSIONS.HR_VIEW}>
                <OrganizationPage />
              </Guard>
            }
          />
          <Route
            path="positions"
            element={
              <Guard permission={PERMISSIONS.HR_VIEW}>
                <PositionsPage />
              </Guard>
            }
          />
          <Route
            path="contracts"
            element={
              <Guard permission={PERMISSIONS.HR_CONTRACT_VIEW}>
                <ContractsPage />
              </Guard>
            }
          />
          <Route
            path="attendance"
            element={
              <Guard permission={PERMISSIONS.HR_ATTENDANCE_VIEW}>
                <AttendancePage />
              </Guard>
            }
          />
          <Route
            path="leave"
            element={
              <Guard permission={PERMISSIONS.HR_LEAVE_VIEW}>
                <LeavePage />
              </Guard>
            }
          />
          <Route
            path="payroll"
            element={
              <Guard permission={PERMISSIONS.HR_PAYROLL_VIEW}>
                <PayrollPage />
              </Guard>
            }
          />
          <Route
            path="benefits"
            element={
              <Guard permission={PERMISSIONS.HR_VIEW}>
                <BenefitsPage />
              </Guard>
            }
          />
          <Route
            path="education"
            element={
              <Guard permission={PERMISSIONS.HR_VIEW}>
                <EducationPage />
              </Guard>
            }
          />
          <Route
            path="trainings"
            element={
              <Guard permission={PERMISSIONS.HR_TRAINING_VIEW}>
                <TrainingsPage />
              </Guard>
            }
          />
          <Route
            path="performance"
            element={
              <Guard permission={PERMISSIONS.HR_PERFORMANCE_VIEW}>
                <PerformancePage />
              </Guard>
            }
          />
          <Route
            path="discipline"
            element={
              <Guard permission={PERMISSIONS.HR_SENSITIVE_VIEW}>
                <DisciplinePage />
              </Guard>
            }
          />
          <Route
            path="documents"
            element={
              <Guard permission={PERMISSIONS.HR_DOCUMENT_VIEW}>
                <DocumentsPage />
              </Guard>
            }
          />
          <Route
            path="mutations"
            element={
              <Guard permission={PERMISSIONS.HR_VIEW}>
                <MutationsPage />
              </Guard>
            }
          />
          <Route
            path="resignations"
            element={
              <Guard permission={PERMISSIONS.HR_VIEW}>
                <ResignationsPage />
              </Guard>
            }
          />
          <Route
            path="reports"
            element={
              <Guard permission={PERMISSIONS.HR_REPORT_VIEW}>
                <ReportsPage />
              </Guard>
            }
          />
          <Route
            path="import"
            element={
              <Guard permission={PERMISSIONS.HR_IMPORT}>
                <ImportPage />
              </Guard>
            }
          />
          <Route
            path="audit"
            element={
              <Guard permission={PERMISSIONS.HR_AUDIT_VIEW}>
                <AuditPage />
              </Guard>
            }
          />
          <Route
            path="settings"
            element={
              <Guard permission={PERMISSIONS.HR_SETTINGS}>
                <SettingsPage />
              </Guard>
            }
          />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RouteErrorBoundary>
    </Suspense>
  );
}
