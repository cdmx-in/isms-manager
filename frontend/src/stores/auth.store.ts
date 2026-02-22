import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi } from '@/lib/api'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
  avatar?: string
  organizationMemberships: Array<{
    organizationId: string
    role: string
    isDefault?: boolean
    orgRoleId?: string | null
    orgRole?: {
      id: string
      name: string
      permissions: string[]
    } | null
    effectivePermissions?: string[]
    organization: {
      id: string
      name: string
      slug: string
      logo?: string | null
      enabledServices?: string[]
    }
  }>
}

// Helper: compute permissions for a given org membership
function getPermissionsForMembership(
  user: User | null,
  orgId: string | null
): string[] {
  if (!user || !orgId) return []
  // Global admin gets everything
  if (user.role === 'ADMIN') return ['*']
  const membership = user.organizationMemberships.find(
    m => m.organizationId === orgId
  )
  if (!membership) return []
  return membership.effectivePermissions || []
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  currentOrganizationId: string | null
  permissions: string[]

  setUser: (user: User | null) => void
  setCurrentOrganization: (id: string | null) => void
  hasPermission: (module: string, action?: string) => boolean
  login: (email: string, password: string) => Promise<void>
  register: (data: { email: string; password: string; firstName: string; lastName: string; organizationName?: string }) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

const getPreferredOrgId = (memberships: User['organizationMemberships']): string | null => {
  if (!memberships?.length) return null
  const defaultOrg = memberships.find(m => m.isDefault)
  return defaultOrg?.organizationId || memberships[0].organizationId
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      currentOrganizationId: null,
      permissions: [],

      setUser: (user) => {
        const orgId = get().currentOrganizationId
        set({
          user,
          isAuthenticated: !!user,
          permissions: getPermissionsForMembership(user, orgId),
        })
      },

      setCurrentOrganization: (currentOrganizationId) => {
        const { user } = get()
        set({
          currentOrganizationId,
          permissions: getPermissionsForMembership(user, currentOrganizationId),
        })
      },

      hasPermission: (module: string, action: string = 'view') => {
        const { user, permissions } = get()
        // Global admin always has access
        if (user?.role === 'ADMIN') return true
        // Wildcard (shouldn't normally happen but safety)
        if (permissions.includes('*')) return true
        return permissions.includes(`${module}:${action}`)
      },

      login: async (email, password) => {
        const response = await authApi.login(email, password)
        const { user } = response.data.data

        const currentOrganizationId = getPreferredOrgId(user.organizationMemberships)

        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          currentOrganizationId,
          permissions: getPermissionsForMembership(user, currentOrganizationId),
        })
      },

      register: async (data) => {
        const response = await authApi.register(data)
        const { user } = response.data.data

        const currentOrganizationId = getPreferredOrgId(user.organizationMemberships)

        set({
          user,
          isAuthenticated: true,
          isLoading: false,
          currentOrganizationId,
          permissions: getPermissionsForMembership(user, currentOrganizationId),
        })
      },

      logout: async () => {
        try {
          await authApi.logout()
        } catch (error) {
          // Ignore logout errors
        } finally {
          set({
            user: null,
            isAuthenticated: false,
            currentOrganizationId: null,
            permissions: [],
          })
        }
      },

      checkAuth: async () => {
        try {
          const response = await authApi.me()
          const user = response.data.data
          const storedOrgId = get().currentOrganizationId
          const isStoredOrgValid = storedOrgId && user.organizationMemberships?.some(
            (m: any) => m.organizationId === storedOrgId
          )
          const currentOrganizationId = isStoredOrgValid
            ? storedOrgId
            : getPreferredOrgId(user.organizationMemberships)

          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            currentOrganizationId,
            permissions: getPermissionsForMembership(user, currentOrganizationId),
          })
        } catch (error) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            permissions: [],
          })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        currentOrganizationId: state.currentOrganizationId,
      }),
    }
  )
)
