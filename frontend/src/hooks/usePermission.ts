import { useAuthStore } from '@/stores/auth.store'

export function usePermission(module: string, action: string = 'view'): boolean {
  return useAuthStore(state => state.hasPermission(module, action))
}
