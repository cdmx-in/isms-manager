import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useAuthStore } from '@/stores/auth.store'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { AssetsPage } from '@/pages/AssetsPage'
import RisksPageEnhanced from '@/pages/RisksPageEnhanced'
import { AddRiskPage } from '@/pages/AddRiskPage'
import { FrameworksPage } from '@/pages/FrameworksPage'
import { FrameworkControlsPage } from '@/pages/FrameworkControlsPage'
import { PoliciesPage } from '@/pages/PoliciesPage'
import { SoAPage } from '@/pages/SoAPage'
import { IncidentsPage } from '@/pages/IncidentsPage'
import { ChangesPage } from '@/pages/ChangesPage'
import { ExemptionsPage } from '@/pages/ExemptionsPage'
import { RequestExemptionPage } from '@/pages/RequestExemptionPage'
import { AssessmentsPage } from '@/pages/AssessmentsPage'
import AssessmentConductPage from '@/pages/AssessmentConductPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { UserManagementPage } from '@/pages/UserManagementPage'
import { InfrastructureMonitorPage } from '@/pages/InfrastructureMonitorPage'
import { GoogleWorkspacePage } from '@/pages/GoogleWorkspacePage'
import { AzurePage } from '@/pages/AzurePage'
import { OrganizationsPage } from '@/pages/OrganizationsPage'
import { useEffect } from 'react'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, checkAuth, user, currentOrganizationId, setCurrentOrganization } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Auto-set organization if not set after auth
  useEffect(() => {
    if (isAuthenticated && !currentOrganizationId && user?.organizationMemberships?.length) {
      const defaultOrg = user.organizationMemberships.find((m: any) => m.isDefault)
      const orgId = defaultOrg?.organizationId || user.organizationMemberships[0].organizationId
      if (orgId) setCurrentOrganization(orgId)
    }
  }, [isAuthenticated, currentOrganizationId, user, setCurrentOrganization])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function PermissionGate({ module, children }: { module: string; children: React.ReactNode }) {
  const hasPermission = useAuthStore(state => state.hasPermission)

  if (!hasPermission(module, 'view')) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-muted-foreground">You do not have permission to access this module.</p>
      </div>
    )
  }

  return <>{children}</>
}

function App() {
  return (
    <>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<Navigate to="/login" replace />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<PermissionGate module="dashboard"><DashboardPage /></PermissionGate>} />
          <Route path="assets" element={<PermissionGate module="assets"><AssetsPage /></PermissionGate>} />
          <Route path="risks" element={<PermissionGate module="risks"><RisksPageEnhanced /></PermissionGate>} />
          <Route path="risks/new" element={<PermissionGate module="risks"><AddRiskPage /></PermissionGate>} />
          <Route path="controls" element={<Navigate to="/frameworks" replace />} />
          <Route path="frameworks" element={<PermissionGate module="frameworks"><FrameworksPage /></PermissionGate>} />
          <Route path="frameworks/:slug" element={<PermissionGate module="frameworks"><FrameworkControlsPage /></PermissionGate>} />
          <Route path="policies" element={<PermissionGate module="policies"><PoliciesPage /></PermissionGate>} />
          <Route path="soa" element={<PermissionGate module="soa"><SoAPage /></PermissionGate>} />
          <Route path="incidents" element={<PermissionGate module="incidents"><IncidentsPage /></PermissionGate>} />
          <Route path="changes" element={<PermissionGate module="changes"><ChangesPage /></PermissionGate>} />
          <Route path="exemptions" element={<PermissionGate module="exemptions"><ExemptionsPage /></PermissionGate>} />
          <Route path="exemptions/new" element={<PermissionGate module="exemptions"><RequestExemptionPage /></PermissionGate>} />
          <Route path="assessments" element={<PermissionGate module="assessments"><AssessmentsPage /></PermissionGate>} />
          <Route path="assessments/:id" element={<PermissionGate module="assessments"><AssessmentConductPage /></PermissionGate>} />
          <Route path="infrastructure/cloudflare" element={<PermissionGate module="infrastructure"><InfrastructureMonitorPage /></PermissionGate>} />
          <Route path="infrastructure/google-workspace" element={<PermissionGate module="infrastructure"><GoogleWorkspacePage /></PermissionGate>} />
          <Route path="infrastructure/azure" element={<PermissionGate module="infrastructure"><AzurePage /></PermissionGate>} />
          <Route path="organizations" element={<PermissionGate module="settings"><OrganizationsPage /></PermissionGate>} />
          <Route path="audit-log" element={<PermissionGate module="audit_log"><AuditLogPage /></PermissionGate>} />
          <Route path="users" element={<PermissionGate module="users"><UserManagementPage /></PermissionGate>} />
          <Route path="settings" element={<PermissionGate module="settings"><SettingsPage /></PermissionGate>} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
