import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Server,
  AlertTriangle,
  Shield,
  FileText,
  ClipboardCheck,
  AlertCircle,
  History,
  Settings,
  ChevronLeft,
  ChevronRight,
  Layers,
  Users,
  GitBranch,
  ShieldOff,
  ClipboardList,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth.store'

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { name: 'Frameworks', href: '/frameworks', icon: Layers, module: 'frameworks' },
  { name: 'Assets', href: '/assets', icon: Server, module: 'assets' },
  { name: 'Risks', href: '/risks', icon: AlertTriangle, module: 'risks' },
  { name: 'Policies', href: '/policies', icon: FileText, module: 'policies' },
  { name: 'Statement of Applicability', href: '/soa', icon: ClipboardCheck, module: 'soa' },
  { name: 'Incidents', href: '/incidents', icon: AlertCircle, module: 'incidents' },
  { name: 'Changes', href: '/changes', icon: GitBranch, module: 'changes' },
  { name: 'Exemptions', href: '/exemptions', icon: ShieldOff, module: 'exemptions' },
  { name: 'Assessments', href: '/assessments', icon: ClipboardList, module: 'assessments' },
  { name: 'Audit Log', href: '/audit-log', icon: History, module: 'audit_log' },
  { name: 'Users', href: '/users', icon: Users, module: 'users' },
  { name: 'Settings', href: '/settings', icon: Settings, module: 'settings' },
]

export function Sidebar() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const hasPermission = useAuthStore(state => state.hasPermission)

  const visibleNavItems = navItems.filter(item => hasPermission(item.module, 'view'))

  return (
    <aside
      className={cn(
        'flex flex-col border-r bg-card transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link to="/dashboard" className="flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <span className="text-lg font-bold">Compliance Manager</span>
          </Link>
        )}
        {collapsed && (
          <Link to="/dashboard" className="mx-auto">
            <Shield className="h-8 w-8 text-primary" />
          </Link>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {visibleNavItems.map((item) => {
          const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse button */}
      <div className="border-t p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Collapse
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
