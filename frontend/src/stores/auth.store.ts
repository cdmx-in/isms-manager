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
    organization: {
      id: string
      name: string
      slug: string
    }
  }>
}

interface AuthState {
  user: User | null
  accessToken: string | null
  isAuthenticated: boolean
  isLoading: boolean
  currentOrganizationId: string | null
  
  setUser: (user: User | null) => void
  setAccessToken: (token: string | null) => void
  setCurrentOrganization: (id: string | null) => void
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
      accessToken: null,
      isAuthenticated: false,
      isLoading: true,
      currentOrganizationId: null,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      
      setAccessToken: (accessToken) => set({ accessToken }),
      
      setCurrentOrganization: (currentOrganizationId) => set({ currentOrganizationId }),

      login: async (email, password) => {
        const response = await authApi.login(email, password)
        const { user, accessToken } = response.data.data
        
        const currentOrganizationId = getPreferredOrgId(user.organizationMemberships)

        set({
          user,
          accessToken,
          isAuthenticated: true,
          isLoading: false,
          currentOrganizationId,
        })
      },

      register: async (data) => {
        const response = await authApi.register(data)
        const { user, accessToken } = response.data.data

        const currentOrganizationId = getPreferredOrgId(user.organizationMemberships)

        set({
          user,
          accessToken,
          isAuthenticated: true,
          isLoading: false,
          currentOrganizationId,
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
            accessToken: null, 
            isAuthenticated: false, 
            currentOrganizationId: null 
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
          })
        } catch (error) {
          set({ 
            user: null, 
            isAuthenticated: false, 
            isLoading: false 
          })
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ 
        accessToken: state.accessToken,
        currentOrganizationId: state.currentOrganizationId,
      }),
    }
  )
)
