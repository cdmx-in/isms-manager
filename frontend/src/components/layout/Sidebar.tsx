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
  ChevronDown,
  Layers,
  Users,
  GitBranch,
  ShieldOff,
  ClipboardList,
  Radio,
  Building2,
  ChevronsUpDown,
  Lock,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth.store'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CloudflareLogo, GoogleWorkspaceLogo, AzureLogo } from '@/components/icons/ServiceLogos'

interface NavItem {
  name: string
  href: string
  icon: any
  module: string
  serviceSlug?: string
  children?: NavItem[]
}

const navItems: NavItem[] = [
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
  {
    name: 'Infrastructure',
    href: '/infrastructure',
    icon: Radio,
    module: 'infrastructure',
    children: [
      { name: 'Cloudflare', href: '/infrastructure/cloudflare', icon: CloudflareLogo, module: 'infrastructure', serviceSlug: 'cloudflare' },
      { name: 'Google Workspace', href: '/infrastructure/google-workspace', icon: GoogleWorkspaceLogo, module: 'infrastructure', serviceSlug: 'google_workspace' },
      { name: 'Azure', href: '/infrastructure/azure', icon: AzureLogo, module: 'infrastructure', serviceSlug: 'azure' },
    ],
  },
  {
    name: 'Admin',
    href: '/admin',
    icon: Lock,
    module: 'users',
    children: [
      { name: 'Organizations', href: '/organizations', icon: Building2, module: 'settings' },
      { name: 'Users', href: '/users', icon: Users, module: 'users' },
      { name: 'Audit Log', href: '/audit-log', icon: History, module: 'audit_log' },
      { name: 'Settings', href: '/settings', icon: Settings, module: 'settings' },
    ],
  },
]

export function Sidebar() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const isChildActive = (item: NavItem) =>
    item.children?.some(c => location.pathname === c.href || location.pathname.startsWith(c.href + '/')) ?? false

  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    navItems.forEach(item => {
      if (item.children && isChildActive(item)) {
        initial[item.name] = true
      }
    })
    return initial
  })
  const { user, currentOrganizationId, setCurrentOrganization, hasPermission } = useAuthStore()

  const memberships = user?.organizationMemberships || []
  const currentOrg = memberships.find(m => m.organizationId === currentOrganizationId)
  const enabledServices = currentOrg?.organization?.enabledServices || ['cloudflare', 'google_workspace', 'azure']

  const visibleNavItems = navItems
    .filter(item => hasPermission(item.module, 'view'))
    .map(item => {
      if (!item.children) return item
      const filteredChildren = item.children.filter(child =>
        !child.serviceSlug || enabledServices.includes(child.serviceSlug)
      )
      if (filteredChildren.length === 0 && item.children.some(c => c.serviceSlug)) return null
      return { ...item, children: filteredChildren }
    })
    .filter(Boolean) as NavItem[]

  const switchOrg = (orgId: string) => {
    setCurrentOrganization(orgId)
    // Reload page to refresh all data for new org
    window.location.reload()
  }

  const toggleMenu = (name: string) => {
    setExpandedMenus(prev => ({ ...prev, [name]: !prev[name] }))
  }

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

      {/* Organization Switcher */}
      {!collapsed && memberships.length > 0 && (
        <div className="px-3 py-2 border-b">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between h-9 text-sm font-medium">
                <div className="flex items-center gap-2 truncate">
                  {currentOrg?.organization?.logo ? (
                    <img src={currentOrg.organization.logo} alt="" className="h-5 w-5 flex-shrink-0 rounded object-contain" />
                  ) : (
                    <Building2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{currentOrg?.organization?.name || 'Select Org'}</span>
                </div>
                <ChevronsUpDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[232px]">
              {memberships.map(m => (
                <DropdownMenuItem
                  key={m.organizationId}
                  onClick={() => switchOrg(m.organizationId)}
                  className={cn(
                    'flex items-center justify-between',
                    m.organizationId === currentOrganizationId && 'bg-accent'
                  )}
                >
                  <span className="truncate">{m.organization.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{m.role}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {collapsed && memberships.length > 1 && (
        <div className="px-2 py-2 border-b flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" title={currentOrg?.organization?.name}>
                {currentOrg?.organization?.logo ? (
                  <img src={currentOrg.organization.logo} alt="" className="h-5 w-5 rounded object-contain" />
                ) : (
                  <Building2 className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="start">
              {memberships.map(m => (
                <DropdownMenuItem
                  key={m.organizationId}
                  onClick={() => switchOrg(m.organizationId)}
                  className={cn(m.organizationId === currentOrganizationId && 'bg-accent')}
                >
                  {m.organization.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const hasChildren = item.children && item.children.length > 0
          const isActive = hasChildren
            ? isChildActive(item)
            : location.pathname === item.href || location.pathname.startsWith(item.href + '/')
          const isExpanded = expandedMenus[item.name]

          if (hasChildren) {
            return (
              <div key={item.name}>
                <button
                  onClick={() => toggleMenu(item.name)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                  title={collapsed ? item.name : undefined}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.name}</span>
                      <ChevronDown className={cn(
                        'h-4 w-4 transition-transform',
                        isExpanded && 'rotate-180'
                      )} />
                    </>
                  )}
                </button>
                {!collapsed && isExpanded && (
                  <div className="ml-4 mt-1 space-y-1 border-l pl-3">
                    {item.children!.map((child) => {
                      const isChildActive = location.pathname === child.href || location.pathname.startsWith(child.href + '/')
                      return (
                        <Link
                          key={child.name}
                          to={child.href}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                            isChildActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          )}
                        >
                          <child.icon className="h-4 w-4 flex-shrink-0" />
                          <span>{child.name}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

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
