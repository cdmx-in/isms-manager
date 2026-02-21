import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/components/ui/use-toast'
import { downloadBlob, formatDateTime } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Users, ShieldCheck, AlertTriangle, UserX,
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Download, Settings2, KeyRound, Server, Globe, Shield,
  CheckCircle2, XCircle, AlertCircle, MinusCircle, Info,
  HelpCircle, Copy, Check, Lock, Unlock, Eye,
} from 'lucide-react'

const CRON_LABELS: Record<string, string> = {
  '0 2 * * *': 'Daily at 2:00 AM UTC',
  '0 */6 * * *': 'Every 6 hours',
  '0 */12 * * *': 'Every 12 hours',
  '0 0 * * 0': 'Weekly (Sunday midnight UTC)',
}

const PHASE_LABELS: Record<string, string> = {
  users: 'Syncing users...',
  mfa: 'Checking MFA status...',
  groups: 'Syncing groups...',
  apps: 'Syncing app registrations...',
  conditionalAccess: 'Fetching Conditional Access policies...',
  resources: 'Syncing resources...',
  security: 'Fetching security alerts & Defender...',
  cis: 'Running CIS checks...',
}

const cisStatusConfig: Record<string, { icon: any; color: string; bg: string }> = {
  PASS: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100 text-green-800 border-green-200' },
  FAIL: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 text-red-800 border-red-200' },
  WARNING: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-100 text-amber-800 border-amber-200' },
  ERROR: { icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const severityConfig: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-blue-100 text-blue-800 border-blue-200',
  informational: 'bg-gray-100 text-gray-600 border-gray-200',
  High: 'bg-red-100 text-red-800 border-red-200',
  Medium: 'bg-amber-100 text-amber-800 border-amber-200',
  Low: 'bg-blue-100 text-blue-800 border-blue-200',
}

const defenderStatusConfig: Record<string, string> = {
  Healthy: 'bg-green-100 text-green-800 border-green-200',
  Unhealthy: 'bg-red-100 text-red-800 border-red-200',
  NotApplicable: 'bg-gray-100 text-gray-600 border-gray-200',
}

const caStateConfig: Record<string, string> = {
  enabled: 'bg-green-100 text-green-800 border-green-200',
  disabled: 'bg-gray-100 text-gray-600 border-gray-200',
  enabledForReportingButNotEnforced: 'bg-amber-100 text-amber-800 border-amber-200',
}

const REQUIRED_PERMISSIONS = [
  { name: 'User.Read.All', type: 'Application', purpose: 'Read all users' },
  { name: 'Group.Read.All', type: 'Application', purpose: 'Read all groups' },
  { name: 'Application.Read.All', type: 'Application', purpose: 'Read app registrations' },
  { name: 'Policy.Read.All', type: 'Application', purpose: 'Read Conditional Access policies' },
  { name: 'SecurityEvents.Read.All', type: 'Application', purpose: 'Read security alerts' },
  { name: 'UserAuthenticationMethod.Read.All', type: 'Application', purpose: 'Read MFA methods' },
  { name: 'Directory.Read.All', type: 'Application', purpose: 'Read directory data' },
]

export function AzurePage() {
  const { currentOrganization } = useAuthStore()
  const orgId = currentOrganization?.id || ''
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState('overview')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [copiedPerms, setCopiedPerms] = useState(false)

  // Settings form state
  const [tenantId, setTenantId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [subscriptionId, setSubscriptionId] = useState('')
  const [scanSchedule, setScanSchedule] = useState('0 2 * * *')
  const [isEnabled, setIsEnabled] = useState(true)

  // Filters
  const [userSearch, setUserSearch] = useState('')
  const [userEnabled, setUserEnabled] = useState('')
  const [userMfa, setUserMfa] = useState('')
  const [userType, setUserType] = useState('')
  const [userPage, setUserPage] = useState(1)

  const [groupSearch, setGroupSearch] = useState('')
  const [groupType, setGroupType] = useState('')
  const [groupVisibility, setGroupVisibility] = useState('')
  const [groupPage, setGroupPage] = useState(1)

  const [appSearch, setAppSearch] = useState('')
  const [appAudience, setAppAudience] = useState('')
  const [appExpired, setAppExpired] = useState('')
  const [appPage, setAppPage] = useState(1)

  const [caState, setCaState] = useState('')
  const [caPage, setCaPage] = useState(1)

  const [resSearch, setResSearch] = useState('')
  const [resType, setResType] = useState('')
  const [resLocation, setResLocation] = useState('')
  const [resPage, setResPage] = useState(1)

  const [alertSeverity, setAlertSeverity] = useState('')
  const [alertStatus, setAlertStatus] = useState('')
  const [alertPage, setAlertPage] = useState(1)

  const [defSeverity, setDefSeverity] = useState('')
  const [defStatus, setDefStatus] = useState('')
  const [defPage, setDefPage] = useState(1)

  // =========== QUERIES ===========
  const configQuery = useQuery({
    queryKey: ['azure-config', orgId],
    queryFn: () => api.azure.getConfig(orgId),
    enabled: !!orgId,
  })

  const statsQuery = useQuery({
    queryKey: ['azure-stats', orgId],
    queryFn: () => api.azure.stats(orgId),
    enabled: !!orgId,
  })

  const scanStatusQuery = useQuery({
    queryKey: ['azure-scan-status', orgId],
    queryFn: () => api.azure.scanStatus(orgId),
    enabled: !!orgId,
    refetchInterval: (query) => {
      const data = query.state.data
      return data?.status === 'running' ? 3000 : false
    },
  })

  const scanHistoryQuery = useQuery({
    queryKey: ['azure-scan-history', orgId],
    queryFn: () => api.azure.scanHistory(orgId, 10),
    enabled: !!orgId && activeTab === 'overview',
  })

  const cisQuery = useQuery({
    queryKey: ['azure-cis', orgId],
    queryFn: () => api.azure.cisChecks(orgId),
    enabled: !!orgId && (activeTab === 'overview' || activeTab === 'cis'),
  })

  const usersQuery = useQuery({
    queryKey: ['azure-users', orgId, userSearch, userEnabled, userMfa, userType, userPage],
    queryFn: () => api.azure.users(orgId, { search: userSearch || undefined, enabled: userEnabled || undefined, mfa: userMfa || undefined, userType: userType || undefined, page: userPage, limit: 25 }),
    enabled: !!orgId && activeTab === 'users',
  })

  const groupsQuery = useQuery({
    queryKey: ['azure-groups', orgId, groupSearch, groupType, groupVisibility, groupPage],
    queryFn: () => api.azure.groups(orgId, { search: groupSearch || undefined, type: groupType || undefined, visibility: groupVisibility || undefined, page: groupPage, limit: 25 }),
    enabled: !!orgId && activeTab === 'groups',
  })

  const appsQuery = useQuery({
    queryKey: ['azure-apps', orgId, appSearch, appAudience, appExpired, appPage],
    queryFn: () => api.azure.apps(orgId, { search: appSearch || undefined, audience: appAudience || undefined, expired: appExpired || undefined, page: appPage, limit: 25 }),
    enabled: !!orgId && activeTab === 'apps',
  })

  const caQuery = useQuery({
    queryKey: ['azure-ca', orgId, caState, caPage],
    queryFn: () => api.azure.conditionalAccess(orgId, { state: caState || undefined, page: caPage, limit: 25 }),
    enabled: !!orgId && activeTab === 'conditional-access',
  })

  const resourcesQuery = useQuery({
    queryKey: ['azure-resources', orgId, resSearch, resType, resLocation, resPage],
    queryFn: () => api.azure.resources(orgId, { search: resSearch || undefined, type: resType || undefined, location: resLocation || undefined, page: resPage, limit: 25 }),
    enabled: !!orgId && activeTab === 'resources',
  })

  const alertsQuery = useQuery({
    queryKey: ['azure-alerts', orgId, alertSeverity, alertStatus, alertPage],
    queryFn: () => api.azure.securityAlerts(orgId, { severity: alertSeverity || undefined, status: alertStatus || undefined, page: alertPage, limit: 25 }),
    enabled: !!orgId && activeTab === 'alerts',
  })

  const defenderQuery = useQuery({
    queryKey: ['azure-defender', orgId, defSeverity, defStatus, defPage],
    queryFn: () => api.azure.defender(orgId, { severity: defSeverity || undefined, status: defStatus || undefined, page: defPage, limit: 25 }),
    enabled: !!orgId && activeTab === 'defender',
  })

  // =========== MUTATIONS ===========
  const saveConfigMut = useMutation({
    mutationFn: () => api.azure.saveConfig({
      organizationId: orgId,
      tenantId,
      clientId,
      clientSecret: clientSecret || undefined,
      subscriptionId,
      scanSchedule,
      isEnabled,
    }),
    onSuccess: () => {
      toast({ title: 'Settings saved', description: 'Azure configuration updated successfully.' })
      queryClient.invalidateQueries({ queryKey: ['azure-config'] })
      setSettingsOpen(false)
      setClientSecret('')
    },
    onError: (err: any) => {
      toast({ title: 'Failed to save settings', description: err?.response?.data?.message || err.message, variant: 'destructive' })
    },
  })

  const triggerScanMut = useMutation({
    mutationFn: () => api.azure.triggerScan(orgId),
    onSuccess: () => {
      toast({ title: 'Scan started', description: 'Azure scan is running in the background.' })
      queryClient.invalidateQueries({ queryKey: ['azure-scan-status'] })
    },
    onError: (err: any) => {
      toast({ title: 'Scan failed', description: err?.response?.data?.message || err.message, variant: 'destructive' })
    },
  })

  const exportMut = useMutation({
    mutationFn: (type: string) => api.azure.exportReport(orgId, type),
    onSuccess: (data: any, type: string) => {
      downloadBlob(data, `azure-${type}-report.csv`)
      toast({ title: 'Export complete' })
    },
  })

  // Open settings with existing config
  const openSettings = () => {
    const cfg = configQuery.data
    if (cfg) {
      setTenantId(cfg.tenantId || '')
      setClientId(cfg.clientId || '')
      setSubscriptionId(cfg.subscriptionId || '')
      setScanSchedule(cfg.scanSchedule || '0 2 * * *')
      setIsEnabled(cfg.isEnabled ?? true)
      setClientSecret('')
    } else {
      setTenantId('')
      setClientId('')
      setSubscriptionId('')
      setScanSchedule('0 2 * * *')
      setIsEnabled(true)
      setClientSecret('')
    }
    setSettingsOpen(true)
  }

  const copyPermissions = () => {
    navigator.clipboard.writeText(REQUIRED_PERMISSIONS.map(p => p.name).join('\n'))
    setCopiedPerms(true)
    setTimeout(() => setCopiedPerms(false), 2000)
  }

  const stats = statsQuery.data
  const scanStatus = scanStatusQuery.data
  const isScanning = scanStatus?.status === 'running'
  const scanProgress = isScanning ? Math.round(((scanStatus?.completedPhases || 0) / (scanStatus?.totalPhases || 8)) * 100) : 0
  const isConfigured = !!configQuery.data

  // =========== PAGINATION HELPER ===========
  const PaginationControls = ({ pagination, page, setPage }: { pagination: any; page: number; setPage: (p: number) => void }) => {
    if (!pagination || pagination.pages <= 1) return null
    return (
      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-muted-foreground">
          Page {pagination.page} of {pagination.pages} ({pagination.total} total)
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={page >= pagination.pages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Azure Monitor</h1>
          <p className="text-muted-foreground">Entra ID & Infrastructure security monitoring</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setHelpOpen(true)}>
            <HelpCircle className="h-4 w-4 mr-1" /> Setup Guide
          </Button>
          <Button variant="outline" size="sm" onClick={openSettings}>
            <Settings2 className="h-4 w-4 mr-1" /> Settings
          </Button>
          <Select onValueChange={(v) => exportMut.mutate(v)}>
            <SelectTrigger className="w-[130px] h-8">
              <Download className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Export" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="overview">Overview</SelectItem>
              <SelectItem value="users">Users</SelectItem>
              <SelectItem value="groups">Groups</SelectItem>
              <SelectItem value="apps">App Registrations</SelectItem>
              <SelectItem value="cis">CIS Checks</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => triggerScanMut.mutate()} disabled={isScanning || !isConfigured}>
            {isScanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            {isScanning ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>
      </div>

      {/* Scan Status Banner */}
      {isScanning && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm font-medium text-blue-800">
                  {PHASE_LABELS[scanStatus?.phase || ''] || 'Scanning...'}
                </span>
              </div>
              <span className="text-sm text-blue-600">
                Phase {(scanStatus?.completedPhases || 0) + 1}/{scanStatus?.totalPhases || 8}
              </span>
            </div>
            <Progress value={scanProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Not configured banner */}
      {!isConfigured && !configQuery.isLoading && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Azure is not configured.</span>
              <Button variant="link" className="text-amber-800 underline p-0 h-auto" onClick={openSettings}>
                Configure now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-bold">{stats.totalUsers}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Active Users</p>
                  <p className="text-2xl font-bold">{stats.activeUsers}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Guest Users</p>
                  <p className="text-2xl font-bold">{stats.guestUsers}</p>
                </div>
                <UserX className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">MFA Coverage</p>
                  <p className="text-2xl font-bold">{stats.mfaPct}%</p>
                </div>
                <ShieldCheck className="h-8 w-8 text-teal-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Groups</p>
                  <p className="text-2xl font-bold">{stats.totalGroups}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">App Registrations</p>
                  <p className="text-2xl font-bold">{stats.totalApps}</p>
                </div>
                <KeyRound className="h-8 w-8 text-orange-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Resources</p>
                  <p className="text-2xl font-bold">{stats.totalResources}</p>
                </div>
                <Server className="h-8 w-8 text-gray-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Active Alerts</p>
                  <p className="text-2xl font-bold text-red-600">{stats.highAlerts}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
          <TabsTrigger value="apps">Apps</TabsTrigger>
          <TabsTrigger value="conditional-access">Conditional Access</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="alerts">Security Alerts</TabsTrigger>
          <TabsTrigger value="cis">CIS Controls</TabsTrigger>
        </TabsList>

        {/* ========== OVERVIEW TAB ========== */}
        <TabsContent value="overview" className="space-y-4">
          {/* CIS Score */}
          {cisQuery.data && cisQuery.data.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">CIS Azure Foundations Benchmark</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-3">
                  <div className="text-3xl font-bold">
                    {cisQuery.data.filter((c: any) => c.status === 'PASS').length}/{cisQuery.data.length}
                  </div>
                  <span className="text-muted-foreground">checks passed</span>
                  <Progress
                    value={(cisQuery.data.filter((c: any) => c.status === 'PASS').length / cisQuery.data.length) * 100}
                    className="flex-1 h-3"
                  />
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="text-green-600">{cisQuery.data.filter((c: any) => c.status === 'PASS').length} Pass</span>
                  <span className="text-red-600">{cisQuery.data.filter((c: any) => c.status === 'FAIL').length} Fail</span>
                  <span className="text-amber-600">{cisQuery.data.filter((c: any) => c.status === 'WARNING').length} Warning</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Defender Summary */}
          {stats && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Defender for Cloud</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Assessments</p>
                    <p className="text-xl font-semibold">{stats.totalAssessments}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Healthy</p>
                    <p className="text-xl font-semibold text-green-600">{stats.healthyAssessments}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Unhealthy</p>
                    <p className="text-xl font-semibold text-red-600">{stats.totalAssessments - stats.healthyAssessments}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scan History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Scan History</CardTitle>
            </CardHeader>
            <CardContent>
              {scanHistoryQuery.data && scanHistoryQuery.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Triggered By</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Completed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scanHistoryQuery.data.map((log: any) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <Badge variant="outline" className={
                            log.status === 'completed' ? 'bg-green-100 text-green-800 border-green-200' :
                            log.status === 'failed' ? 'bg-red-100 text-red-800 border-red-200' :
                            'bg-blue-100 text-blue-800 border-blue-200'
                          }>
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{log.triggeredBy}</TableCell>
                        <TableCell>{formatDateTime(log.startedAt)}</TableCell>
                        <TableCell>{log.completedAt ? formatDateTime(log.completedAt) : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No scans yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ========== USERS TAB ========== */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search users..." value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(1) }} className="pl-9 h-9" />
            </div>
            <Select value={userEnabled} onValueChange={v => { setUserEnabled(v === 'all' ? '' : v); setUserPage(1) }}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Enabled" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Enabled</SelectItem>
                <SelectItem value="false">Disabled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userMfa} onValueChange={v => { setUserMfa(v === 'all' ? '' : v); setUserPage(1) }}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="MFA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">MFA Enabled</SelectItem>
                <SelectItem value="false">No MFA</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userType} onValueChange={v => { setUserType(v === 'all' ? '' : v); setUserPage(1) }}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Member">Member</SelectItem>
                <SelectItem value="Guest">Guest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Display Name</TableHead>
                <TableHead>UPN</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead>Last Sign-In</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(usersQuery.data?.data || []).map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.displayName}</TableCell>
                  <TableCell className="text-sm">{u.userPrincipalName}</TableCell>
                  <TableCell>
                    {u.accountEnabled
                      ? <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                      : <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Disabled</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={u.userType === 'Guest' ? 'bg-purple-100 text-purple-800 border-purple-200' : ''}>
                      {u.userType || 'Member'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.mfaRegistered
                      ? <ShieldCheck className="h-4 w-4 text-green-600" />
                      : <XCircle className="h-4 w-4 text-red-500" />}
                  </TableCell>
                  <TableCell className="text-sm">{u.lastSignInDateTime ? formatDateTime(u.lastSignInDateTime) : '-'}</TableCell>
                  <TableCell className="text-sm">{u.createdDateTime ? formatDateTime(u.createdDateTime) : '-'}</TableCell>
                </TableRow>
              ))}
              {usersQuery.data?.data?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationControls pagination={usersQuery.data?.pagination} page={userPage} setPage={setUserPage} />
        </TabsContent>

        {/* ========== GROUPS TAB ========== */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search groups..." value={groupSearch} onChange={e => { setGroupSearch(e.target.value); setGroupPage(1) }} className="pl-9 h-9" />
            </div>
            <Select value={groupType} onValueChange={v => { setGroupType(v === 'all' ? '' : v); setGroupPage(1) }}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="security">Security</SelectItem>
                <SelectItem value="mail">Mail-Enabled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupVisibility} onValueChange={v => { setGroupVisibility(v === 'all' ? '' : v); setGroupPage(1) }}>
              <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="Visibility" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="Public">Public</SelectItem>
                <SelectItem value="Private">Private</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Mail</TableHead>
                <TableHead>Security</TableHead>
                <TableHead>Mail-Enabled</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Visibility</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(groupsQuery.data?.data || []).map((g: any) => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.displayName}</TableCell>
                  <TableCell className="text-sm">{g.mail || '-'}</TableCell>
                  <TableCell>{g.securityEnabled ? <ShieldCheck className="h-4 w-4 text-green-600" /> : <MinusCircle className="h-4 w-4 text-gray-400" />}</TableCell>
                  <TableCell>{g.mailEnabled ? <CheckCircle2 className="h-4 w-4 text-blue-600" /> : <MinusCircle className="h-4 w-4 text-gray-400" />}</TableCell>
                  <TableCell>{g.memberCount}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={g.visibility === 'Public' ? 'bg-amber-100 text-amber-800 border-amber-200' : ''}>
                      {g.visibility || 'Private'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {groupsQuery.data?.data?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No groups found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationControls pagination={groupsQuery.data?.pagination} page={groupPage} setPage={setGroupPage} />
        </TabsContent>

        {/* ========== APPS TAB ========== */}
        <TabsContent value="apps" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search apps..." value={appSearch} onChange={e => { setAppSearch(e.target.value); setAppPage(1) }} className="pl-9 h-9" />
            </div>
            <Select value={appAudience} onValueChange={v => { setAppAudience(v === 'all' ? '' : v); setAppPage(1) }}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Audience" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Audiences</SelectItem>
                <SelectItem value="AzureADMyOrg">My Org Only</SelectItem>
                <SelectItem value="AzureADMultipleOrgs">Multiple Orgs</SelectItem>
                <SelectItem value="AzureADandPersonalMicrosoftAccount">Personal + Org</SelectItem>
              </SelectContent>
            </Select>
            <Select value={appExpired} onValueChange={v => { setAppExpired(v === 'all' ? '' : v); setAppPage(1) }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Credentials" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Expired</SelectItem>
                <SelectItem value="false">Valid</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>App ID</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead>Password Creds</TableHead>
                <TableHead>Key Creds</TableHead>
                <TableHead>Expired</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(appsQuery.data?.data || []).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.displayName}</TableCell>
                  <TableCell className="text-sm font-mono">{a.appId?.substring(0, 8)}...</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={a.signInAudience !== 'AzureADMyOrg' ? 'bg-amber-100 text-amber-800 border-amber-200' : ''}>
                      {a.signInAudience === 'AzureADMyOrg' ? 'Single' :
                       a.signInAudience === 'AzureADMultipleOrgs' ? 'Multi' : 'Personal'}
                    </Badge>
                  </TableCell>
                  <TableCell>{a.passwordCredentialCount}</TableCell>
                  <TableCell>{a.keyCredentialCount}</TableCell>
                  <TableCell>
                    {a.hasExpiredCredentials
                      ? <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200">Expired</Badge>
                      : <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">Valid</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{a.createdDateTime ? formatDateTime(a.createdDateTime) : '-'}</TableCell>
                </TableRow>
              ))}
              {appsQuery.data?.data?.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No app registrations found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationControls pagination={appsQuery.data?.pagination} page={appPage} setPage={setAppPage} />
        </TabsContent>

        {/* ========== CONDITIONAL ACCESS TAB ========== */}
        <TabsContent value="conditional-access" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={caState} onValueChange={v => { setCaState(v === 'all' ? '' : v); setCaPage(1) }}>
              <SelectTrigger className="w-[200px] h-9"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                <SelectItem value="enabled">Enabled</SelectItem>
                <SelectItem value="disabled">Disabled</SelectItem>
                <SelectItem value="enabledForReportingButNotEnforced">Report Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Grant Controls</TableHead>
                <TableHead>Modified</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(caQuery.data?.data || []).map((p: any) => {
                let condSummary = '-'
                let grantSummary = '-'
                try {
                  const cond = JSON.parse(p.conditions || '{}')
                  const parts: string[] = []
                  if (cond.users?.includeUsers?.length) parts.push(`${cond.users.includeUsers.length} users`)
                  if (cond.users?.includeRoles?.length) parts.push(`${cond.users.includeRoles.length} roles`)
                  if (cond.applications?.includeApplications?.length) parts.push(`${cond.applications.includeApplications.length} apps`)
                  if (cond.clientAppTypes?.length) parts.push(cond.clientAppTypes.join(', '))
                  condSummary = parts.join(', ') || 'All'
                } catch {}
                try {
                  const grant = JSON.parse(p.grantControls || '{}')
                  grantSummary = (grant.builtInControls || []).join(', ') || grant.operator || '-'
                } catch {}
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.displayName}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={caStateConfig[p.state] || ''}>
                        {p.state === 'enabledForReportingButNotEnforced' ? 'Report Only' : p.state}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">{condSummary}</TableCell>
                    <TableCell className="text-sm">{grantSummary}</TableCell>
                    <TableCell className="text-sm">{p.modifiedDateTime ? formatDateTime(p.modifiedDateTime) : '-'}</TableCell>
                  </TableRow>
                )
              })}
              {caQuery.data?.data?.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No Conditional Access policies found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationControls pagination={caQuery.data?.pagination} page={caPage} setPage={setCaPage} />
        </TabsContent>

        {/* ========== RESOURCES TAB ========== */}
        <TabsContent value="resources" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search resources..." value={resSearch} onChange={e => { setResSearch(e.target.value); setResPage(1) }} className="pl-9 h-9" />
            </div>
            <Input placeholder="Filter by type..." value={resType} onChange={e => { setResType(e.target.value); setResPage(1) }} className="w-[200px] h-9" />
            <Input placeholder="Filter by location..." value={resLocation} onChange={e => { setResLocation(e.target.value); setResPage(1) }} className="w-[150px] h-9" />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Resource Group</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(resourcesQuery.data?.data || []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm">{r.type?.split('/')?.pop() || r.type}</TableCell>
                  <TableCell className="text-sm">{r.resourceGroup}</TableCell>
                  <TableCell className="text-sm">{r.location}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={r.provisioningState === 'Succeeded' ? 'bg-green-100 text-green-800 border-green-200' : ''}>
                      {r.provisioningState || '-'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {resourcesQuery.data?.data?.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No resources found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationControls pagination={resourcesQuery.data?.pagination} page={resPage} setPage={setResPage} />
        </TabsContent>

        {/* ========== SECURITY ALERTS TAB ========== */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={alertSeverity} onValueChange={v => { setAlertSeverity(v === 'all' ? '' : v); setAlertPage(1) }}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="informational">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={alertStatus} onValueChange={v => { setAlertStatus(v === 'all' ? '' : v); setAlertPage(1) }}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="inProgress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(alertsQuery.data?.data || []).map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium max-w-[250px] truncate">{a.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={severityConfig[a.severity] || ''}>
                      {a.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      a.status === 'resolved' ? 'bg-green-100 text-green-800 border-green-200' :
                      a.status === 'new' ? 'bg-red-100 text-red-800 border-red-200' :
                      'bg-amber-100 text-amber-800 border-amber-200'
                    }>
                      {a.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{a.category || '-'}</TableCell>
                  <TableCell className="text-sm">{a.serviceSource || '-'}</TableCell>
                  <TableCell className="text-sm">{a.createdDateTime ? formatDateTime(a.createdDateTime) : '-'}</TableCell>
                </TableRow>
              ))}
              {alertsQuery.data?.data?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No security alerts found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <PaginationControls pagination={alertsQuery.data?.pagination} page={alertPage} setPage={setAlertPage} />
        </TabsContent>

        {/* ========== CIS CONTROLS TAB ========== */}
        <TabsContent value="cis" className="space-y-4">
          {cisQuery.data && cisQuery.data.length > 0 ? (
            (() => {
              const grouped: Record<string, any[]> = {}
              for (const check of cisQuery.data) {
                if (!grouped[check.category]) grouped[check.category] = []
                grouped[check.category].push(check)
              }
              return Object.entries(grouped).map(([category, checks]) => (
                <Card key={category}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      {category}
                      <Badge variant="outline" className="ml-auto">
                        {checks.filter((c: any) => c.status === 'PASS').length}/{checks.length} passed
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {checks.map((check: any) => {
                      const cfg = cisStatusConfig[check.status] || cisStatusConfig.ERROR
                      const Icon = cfg.icon
                      return (
                        <div key={check.checkId} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                          <Icon className={`h-5 w-5 mt-0.5 ${cfg.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{check.checkId}</span>
                              <span className="font-medium text-sm">{check.title}</span>
                              <Badge variant="outline" className={`${cfg.bg} ml-auto`}>{check.status}</Badge>
                            </div>
                            {check.details && (
                              <p className="text-sm text-muted-foreground mt-0.5">{check.details}</p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              ))
            })()
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No CIS check results yet. Run a scan to generate CIS Azure Foundations Benchmark results.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ========== SETTINGS DIALOG ========== */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Azure Configuration</DialogTitle>
            <DialogDescription>Configure Azure Service Principal credentials for monitoring.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Tenant ID</label>
              <Input value={tenantId} onChange={e => setTenantId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <div>
              <label className="text-sm font-medium">Client ID (Application ID)</label>
              <Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <div>
              <label className="text-sm font-medium">Client Secret</label>
              <Input
                type="password"
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                placeholder={configQuery.data?.hasClientSecret ? '(configured - leave blank to keep)' : 'Enter client secret'}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Subscription ID</label>
              <Input value={subscriptionId} onChange={e => setSubscriptionId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
            </div>
            <div>
              <label className="text-sm font-medium">Scan Schedule</label>
              <Select value={scanSchedule} onValueChange={setScanSchedule}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CRON_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="azEnabled" checked={isEnabled} onCheckedChange={(v) => setIsEnabled(!!v)} />
              <label htmlFor="azEnabled" className="text-sm">Enable automated scanning</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveConfigMut.mutate()}
              disabled={saveConfigMut.isPending || !tenantId || !clientId || !subscriptionId || (!clientSecret && !configQuery.data?.hasClientSecret)}
            >
              {saveConfigMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save & Verify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== SETUP GUIDE DIALOG ========== */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Azure Setup Guide</DialogTitle>
            <DialogDescription>How to configure an Azure Service Principal for monitoring.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-2">
            {/* Step 1 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-sm font-bold">1</div>
              <div>
                <h4 className="font-medium">Create an App Registration</h4>
                <p className="text-sm text-muted-foreground">Go to Azure Portal &rarr; Microsoft Entra ID &rarr; App registrations &rarr; New registration. Name it (e.g., "ISMS Monitor"), set to single tenant.</p>
              </div>
            </div>
            {/* Step 2 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-sm font-bold">2</div>
              <div>
                <h4 className="font-medium">Create a Client Secret</h4>
                <p className="text-sm text-muted-foreground">In the app registration, go to Certificates & secrets &rarr; New client secret. Copy the secret value immediately (it won't be shown again).</p>
              </div>
            </div>
            {/* Step 3 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-sm font-bold">3</div>
              <div>
                <h4 className="font-medium">Grant API Permissions</h4>
                <p className="text-sm text-muted-foreground mb-2">In API permissions &rarr; Add a permission &rarr; Microsoft Graph &rarr; Application permissions. Add these:</p>
                <div className="bg-muted rounded-lg p-3 space-y-1">
                  {REQUIRED_PERMISSIONS.map(p => (
                    <div key={p.name} className="flex items-center justify-between text-sm">
                      <code className="font-mono text-xs">{p.name}</code>
                      <span className="text-xs text-muted-foreground">{p.purpose}</span>
                    </div>
                  ))}
                  <div className="pt-2">
                    <Button variant="outline" size="sm" onClick={copyPermissions}>
                      {copiedPerms ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                      {copiedPerms ? 'Copied!' : 'Copy All'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            {/* Step 4 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-sm font-bold">4</div>
              <div>
                <h4 className="font-medium">Grant Admin Consent</h4>
                <p className="text-sm text-muted-foreground">Click "Grant admin consent for [tenant]" in the API permissions page. All permissions should show a green checkmark.</p>
              </div>
            </div>
            {/* Step 5 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-sm font-bold">5</div>
              <div>
                <h4 className="font-medium">Assign Subscription Reader Role</h4>
                <p className="text-sm text-muted-foreground">Go to Subscriptions &rarr; [your subscription] &rarr; Access control (IAM) &rarr; Add role assignment. Assign "Reader" role to your app registration.</p>
              </div>
            </div>
            {/* Step 6 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-sm font-bold">6</div>
              <div>
                <h4 className="font-medium">Optional: Security Reader for Defender</h4>
                <p className="text-sm text-muted-foreground">For Defender for Cloud data, also assign "Security Reader" role on the subscription.</p>
              </div>
            </div>
            {/* Step 7 */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-sm font-bold">7</div>
              <div>
                <h4 className="font-medium">Copy Credentials</h4>
                <p className="text-sm text-muted-foreground">From the app registration overview, copy: <strong>Application (client) ID</strong>, <strong>Directory (tenant) ID</strong>. From your subscription, copy the <strong>Subscription ID</strong>.</p>
              </div>
            </div>

            {/* Troubleshooting */}
            <div className="border-t pt-4">
              <h4 className="font-medium mb-2 flex items-center gap-1"><Info className="h-4 w-4" /> Troubleshooting</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li><strong>Invalid credentials</strong>: Verify Tenant ID, Client ID, and Client Secret are correct.</li>
                <li><strong>403 Forbidden</strong>: Ensure admin consent is granted for all API permissions.</li>
                <li><strong>No Conditional Access data</strong>: Requires Azure AD P2 license.</li>
                <li><strong>No Defender data</strong>: Requires Microsoft Defender for Cloud enabled on the subscription.</li>
                <li><strong>Permission propagation</strong>: New role assignments may take 5-10 minutes to propagate.</li>
              </ul>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
