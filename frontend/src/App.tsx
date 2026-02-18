import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { useAuthStore } from '@/stores/auth.store'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { AssetsPage } from '@/pages/AssetsPage'
import RisksPageEnhanced from '@/pages/RisksPageEnhanced'
import { ControlsPage } from '@/pages/ControlsPage'
import { PoliciesPage } from '@/pages/PoliciesPage'
import { SoAPage } from '@/pages/SoAPage'
import { IncidentsPage } from '@/pages/IncidentsPage'
import { AuditLogPage } from '@/pages/AuditLogPage'
import { SettingsPage } from '@/pages/SettingsPage'
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
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="assets" element={<AssetsPage />} />
          <Route path="risks" element={<RisksPageEnhanced />} />
          <Route path="controls" element={<ControlsPage />} />
          <Route path="policies" element={<PoliciesPage />} />
          <Route path="soa" element={<SoAPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="audit-log" element={<AuditLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </>
  )
}

export default App
