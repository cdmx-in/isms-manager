import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/components/ui/use-toast'
import { downloadBlob } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Globe,
  ShieldCheck,
  AlertTriangle,
  WifiOff,
  Search,
  RefreshCw,
  CloudOff,
  Clock,
  Wifi,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Activity,
  ExternalLink,
  RotateCw,
  Download,
  Settings2,
  Timer,
  Eye,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

const exposureConfig: Record<string, {
  label: string
  color: string
  dotColor: string
  icon: any
}> = {
  PUBLIC: {
    label: 'Public',
    color: 'bg-red-100 text-red-800 border-red-200',
    dotColor: 'bg-red-500',
    icon: AlertTriangle,
  },
  PRIVATE: {
    label: 'Private',
    color: 'bg-green-100 text-green-800 border-green-200',
    dotColor: 'bg-green-500',
    icon: ShieldCheck,
  },
  UNREACHABLE: {
    label: 'Unreachable',
    color: 'bg-gray-100 text-gray-600 border-gray-200',
    dotColor: 'bg-gray-400',
    icon: WifiOff,
  },
  PENDING: {
    label: 'Pending',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
    dotColor: 'bg-blue-400',
    icon: Clock,
  },
  ERROR: {
    label: 'Error',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
    dotColor: 'bg-amber-500',
    icon: CloudOff,
  },
}

const typeColors: Record<string, string> = {
  A: 'bg-blue-100 text-blue-700 border-blue-200',
  AAAA: 'bg-purple-100 text-purple-700 border-purple-200',
  CNAME: 'bg-teal-100 text-teal-700 border-teal-200',
}

const CRON_LABELS: Record<string, string> = {
  '0 0 * * *': 'Daily at midnight UTC',
  '0 */6 * * *': 'Every 6 hours',
  '0 */12 * * *': 'Every 12 hours',
  '0 0 * * 0': 'Weekly (Sunday midnight UTC)',
}

export function InfrastructureMonitorPage() {
  const { currentOrganizationId, hasPermission } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const orgId = currentOrganizationId || ''

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [proxiedFilter, setProxiedFilter] = useState('all')
  const [zoneFilter, setZoneFilter] = useState('all')
  const [originFilter, setOriginFilter] = useState('all')
  const [page, setPage] = useState(1)
  const limit = 50

  const [showSettings, setShowSettings] = useState(false)
  const [showDetail, setShowDetail] = useState<any>(null)
  const [cfToken, setCfToken] = useState('')
  const [cfProxy, setCfProxy] = useState('')
  const [cfSchedule, setCfSchedule] = useState('0 0 * * *')
  const [cfEnabled, setCfEnabled] = useState(true)

  // Queries
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['infra-stats', orgId],
    queryFn: () => api.infrastructure.stats(orgId),
    enabled: !!orgId,
    refetchInterval: 15000,
  })

  const { data: configData } = useQuery({
    queryKey: ['infra-config', orgId],
    queryFn: () => api.infrastructure.getConfig(orgId),
    enabled: !!orgId,
  })

  const { data: recordsData, isLoading: recordsLoading } = useQuery({
    queryKey: ['infra-records', orgId, search, typeFilter, statusFilter, proxiedFilter, zoneFilter, originFilter, page],
    queryFn: () => api.infrastructure.records(orgId, {
      search: search || undefined,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      exposureStatus: statusFilter !== 'all' ? statusFilter : undefined,
      proxied: proxiedFilter !== 'all' ? proxiedFilter : undefined,
      zoneId: zoneFilter !== 'all' ? zoneFilter : undefined,
      originProtected: originFilter !== 'all' ? originFilter : undefined,
      page,
      limit,
    }),
    enabled: !!orgId,
  })

  const { data: zones } = useQuery({
    queryKey: ['infra-zones', orgId],
    queryFn: () => api.infrastructure.zones(orgId),
    enabled: !!orgId,
  })

  const { data: scanStatus } = useQuery({
    queryKey: ['infra-scan-status', orgId],
    queryFn: () => api.infrastructure.scanStatus(orgId),
    enabled: !!orgId,
    refetchInterval: 3000,
  })

  // Mutations
  const triggerScanMutation = useMutation({
    mutationFn: () => api.infrastructure.triggerScan(orgId),
    onSuccess: () => {
      toast({ title: 'Scan started', description: 'Infrastructure scan is running in the background.' })
      queryClient.invalidateQueries({ queryKey: ['infra-scan-status'] })
    },
    onError: (err: any) => {
      toast({
        title: 'Scan failed',
        description: err.response?.data?.error?.message || 'Failed to start scan',
        variant: 'destructive',
      })
    },
  })

  const checkRecordMutation = useMutation({
    mutationFn: (id: string) => api.infrastructure.checkRecord(id, orgId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infra-records'] })
      queryClient.invalidateQueries({ queryKey: ['infra-stats'] })
    },
    onError: () => {
      toast({ title: 'Check failed', description: 'Failed to check domain', variant: 'destructive' })
    },
  })

  const saveConfigMutation = useMutation({
    mutationFn: () => api.infrastructure.saveConfig({
      organizationId: orgId,
      cloudflareApiToken: cfToken,
      httpCheckProxy: cfProxy || undefined,
      scanSchedule: cfSchedule,
      isEnabled: cfEnabled,
    }),
    onSuccess: () => {
      toast({ title: 'Settings saved', description: 'Cloudflare configuration updated.' })
      setShowSettings(false)
      queryClient.invalidateQueries({ queryKey: ['infra-config'] })
      queryClient.invalidateQueries({ queryKey: ['infra-stats'] })
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to save settings',
        description: err.response?.data?.error?.message || 'Invalid configuration',
        variant: 'destructive',
      })
    },
  })

  const records = recordsData?.data || []
  const pagination = recordsData?.pagination
  const isScanning = scanStatus?.status === 'running'
  const canEdit = hasPermission('infrastructure', 'edit')
  const isConfigured = stats?.isConfigured || configData?.hasApiToken

  const scanProgress = isScanning && scanStatus?.totalRecords > 0
    ? Math.round((scanStatus.checkedRecords / scanStatus.totalRecords) * 100)
    : 0

  const openSettings = () => {
    setCfToken('')
    setCfProxy(configData?.httpCheckProxy || '')
    setCfSchedule(configData?.scanSchedule || stats?.scanSchedule || '0 0 * * *')
    setCfEnabled(configData?.isEnabled ?? true)
    setShowSettings(true)
  }

  const handleExport = async () => {
    try {
      const blob = await api.infrastructure.exportReport(orgId)
      const date = new Date().toISOString().split('T')[0]
      downloadBlob(blob, `infrastructure-exposure-report-${date}.csv`)
      toast({ title: 'Report exported', description: 'CSV report downloaded.' })
    } catch {
      toast({ title: 'Export failed', description: 'Failed to generate report', variant: 'destructive' })
    }
  }

  const openDetail = async (record: any) => {
    try {
      const full = await api.infrastructure.getRecord(record.id, orgId)
      setShowDetail(full)
    } catch {
      setShowDetail(record)
    }
  }

  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Cloud className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cloudflare DNS Monitor</h1>
            <p className="text-muted-foreground">
              Monitor DNS records and domain exposure across Cloudflare zones
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={openSettings}>
              <Settings2 className="mr-2 h-4 w-4" />
              Settings
            </Button>
          )}
          {isConfigured && records.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
          )}
          {canEdit && isConfigured && (
            <Button
              size="sm"
              onClick={() => triggerScanMutation.mutate()}
              disabled={isScanning || triggerScanMutation.isPending}
            >
              {isScanning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Scan Now
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Not configured warning */}
      {!isConfigured && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">Cloudflare API not configured</p>
                  <p className="text-sm text-amber-600">
                    Click Settings to configure your Cloudflare API token for this organization.
                  </p>
                </div>
              </div>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={openSettings}>Configure</Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Domains</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
              <Globe className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalRecords || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Across {stats?.zoneCount || 0} zones</p>
          </CardContent>
        </Card>
        <Card className="border-red-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Public Exposure</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-4 w-4 text-red-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.publicCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Publicly accessible</p>
          </CardContent>
        </Card>
        <Card className="border-green-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Private</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
              <ShieldCheck className="h-4 w-4 text-green-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.privateCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Access restricted</p>
          </CardContent>
        </Card>
        <Card className="border-amber-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unreachable</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100">
              <WifiOff className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {(stats?.unreachableCount || 0) + (stats?.errorCount || 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Dangling / timeout</p>
          </CardContent>
        </Card>
        <Card className="border-orange-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Origin Exposed</CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100">
              <ShieldAlert className="h-4 w-4 text-orange-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats?.originExposedCount || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Origin IP leaked</p>
          </CardContent>
        </Card>
      </div>

      {/* Scan status + schedule banner */}
      {(scanStatus || isConfigured) && (
        <Card className={isScanning ? 'border-blue-200 bg-blue-50/50' : ''}>
          <CardContent className="py-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isScanning ? (
                    <>
                      <div className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                      </div>
                      <span className="text-sm font-medium text-blue-700">
                        {!scanStatus?.zonesScanned ? (
                          'Syncing DNS zones from Cloudflare...'
                        ) : scanStatus?.totalRecords > 0 && scanStatus?.checkedRecords < scanStatus?.totalRecords ? (
                          <>
                            Checking HTTP exposure...
                            {scanStatus?.currentDomain && (
                              <span className="font-normal text-blue-600 ml-1">({scanStatus.currentDomain})</span>
                            )}
                          </>
                        ) : scanStatus?.totalRecords > 0 && scanStatus?.checkedRecords >= scanStatus?.totalRecords ? (
                          'Running origin protection checks...'
                        ) : (
                          <>
                            Scanning...
                            {scanStatus?.currentDomain && (
                              <span className="font-normal text-blue-600 ml-1">({scanStatus.currentDomain})</span>
                            )}
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <>
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Last scan: {scanStatus?.completedAt ? formatDateTime(scanStatus.completedAt) : 'Never'}
                        {scanStatus?.status === 'failed' && <span className="ml-2 text-red-600">(Failed)</span>}
                      </span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Timer className="h-3.5 w-3.5" />
                  <span>{CRON_LABELS[stats?.scanSchedule || '0 0 * * *'] || stats?.scanSchedule || 'Daily at midnight UTC'}</span>
                </div>
              </div>
              {isScanning && (
                <div className="space-y-1">
                  {scanStatus?.totalRecords > 0 ? (
                    <>
                      <Progress value={scanProgress} className="h-2" />
                      <div className="flex justify-between text-xs text-blue-600">
                        <span>{scanStatus.checkedRecords || 0} / {scanStatus.totalRecords} records checked</span>
                        <span>{scanProgress}%</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <Progress className="h-2" />
                      <p className="text-xs text-blue-600">
                        {scanStatus?.zonesScanned
                          ? `${scanStatus.zonesScanned} zones synced, ${scanStatus.recordsScanned || 0} records found — preparing HTTP checks...`
                          : 'Fetching zones and DNS records from Cloudflare...'}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search domains..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className="pl-10"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="AAAA">AAAA</SelectItem>
                <SelectItem value="CNAME">CNAME</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PUBLIC">Public</SelectItem>
                <SelectItem value="PRIVATE">Private</SelectItem>
                <SelectItem value="UNREACHABLE">Unreachable</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
            <Select value={proxiedFilter} onValueChange={(v) => { setProxiedFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Proxied" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Proxied</SelectItem>
                <SelectItem value="false">Direct</SelectItem>
              </SelectContent>
            </Select>
            <Select value={originFilter} onValueChange={(v) => { setOriginFilter(v); setPage(1) }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Origin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Origins</SelectItem>
                <SelectItem value="true">Protected</SelectItem>
                <SelectItem value="false">Exposed</SelectItem>
              </SelectContent>
            </Select>
            {zones && zones.length > 0 && (
              <Select value={zoneFilter} onValueChange={(v) => { setZoneFilter(v); setPage(1) }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Zones</SelectItem>
                  {zones.map((zone: any) => (
                    <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Records table */}
      <Card>
        <CardContent className="p-0">
          {recordsLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Globe className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium">No DNS records found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {isConfigured
                  ? 'Click "Scan Now" to fetch records from Cloudflare'
                  : 'Configure your Cloudflare API token to get started'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[220px]">Domain</TableHead>
                    <TableHead>Zone</TableHead>
                    <TableHead className="w-[60px]">Type</TableHead>
                    <TableHead className="w-[60px] text-center">Proxied</TableHead>
                    <TableHead className="w-[100px]">Exposure</TableHead>
                    <TableHead className="w-[60px] text-center">Origin</TableHead>
                    <TableHead className="w-[50px] text-center">HTTP</TableHead>
                    <TableHead className="w-[70px] text-right">Time</TableHead>
                    <TableHead className="w-[130px]">Checked</TableHead>
                    <TableHead className="w-[70px] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((record: any) => {
                    const cfg = exposureConfig[record.exposureStatus] || exposureConfig.PENDING
                    const StatusIcon = cfg.icon
                    return (
                      <TableRow key={record.id} className="text-xs">
                        <TableCell className="max-w-[220px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={`h-2 w-2 rounded-full flex-shrink-0 ${cfg.dotColor}`} />
                            <span className="font-medium text-xs break-all leading-tight truncate" title={record.name}>{record.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{record.zone?.name || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeColors[record.type] || ''}`}>
                            {record.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {record.proxied ? (
                            <Wifi className="h-3.5 w-3.5 text-yellow-500 mx-auto" title="Proxied through Cloudflare" />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">Direct</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-1 ${cfg.color}`}>
                            <StatusIcon className="h-2.5 w-2.5" />
                            {cfg.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {record.originProtected === true ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-green-500 mx-auto" title="Origin protected" />
                          ) : record.originProtected === false ? (
                            <ShieldOff className="h-3.5 w-3.5 text-orange-500 mx-auto" title={record.originExposureType || 'Origin exposed'} />
                          ) : (
                            <span className="text-[10px] text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {record.httpStatusCode ? (
                            <span className={`text-xs font-mono ${
                              record.httpStatusCode >= 200 && record.httpStatusCode < 300 ? 'text-green-600'
                                : record.httpStatusCode === 403 ? 'text-blue-600'
                                : record.httpStatusCode >= 400 ? 'text-red-600'
                                : 'text-muted-foreground'
                            }`}>{record.httpStatusCode}</span>
                          ) : <span className="text-[10px] text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          {record.responseTimeMs != null ? (
                            <span className={`text-xs ${
                              record.responseTimeMs < 500 ? 'text-green-600'
                                : record.responseTimeMs < 2000 ? 'text-amber-600'
                                : 'text-red-600'
                            }`}>{record.responseTimeMs}ms</span>
                          ) : <span className="text-[10px] text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] text-muted-foreground">
                            {record.lastCheckedAt ? formatDateTime(record.lastCheckedAt) : 'Never'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openDetail(record)} title="Details">
                              <Eye className="h-3 w-3" />
                            </Button>
                            {canEdit && (
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => checkRecordMutation.mutate(record.id)} disabled={checkRecordMutation.isPending} title="Re-check">
                                <RotateCw className={`h-3 w-3 ${checkRecordMutation.isPending ? 'animate-spin' : ''}`} />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    {((page - 1) * limit) + 1}-{Math.min(page * limit, pagination.total)} of {pagination.total}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground px-1">{page}/{pagination.totalPages}</span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Cloudflare Settings</DialogTitle>
            <DialogDescription>Configure Cloudflare API access for this organization.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">API Token</label>
              <Input
                type="password"
                placeholder={configData?.hasApiToken ? '********** (leave blank to keep current)' : 'Enter Cloudflare API token'}
                value={cfToken}
                onChange={(e) => setCfToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Requires Zone:Read and DNS:Read permissions.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">HTTP Check Proxy (optional)</label>
              <Input
                placeholder="http://user:pass@host:port"
                value={cfProxy}
                onChange={(e) => setCfProxy(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Proxy for checking domain exposure. Leave empty for direct.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Scan Schedule</label>
              <Select value={cfSchedule} onValueChange={setCfSchedule}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0 0 * * *">Daily at midnight UTC</SelectItem>
                  <SelectItem value="0 */6 * * *">Every 6 hours</SelectItem>
                  <SelectItem value="0 */12 * * *">Every 12 hours</SelectItem>
                  <SelectItem value="0 0 * * 0">Weekly (Sunday midnight)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="cfEnabled" checked={cfEnabled} onChange={(e) => setCfEnabled(e.target.checked)} className="rounded" />
              <label htmlFor="cfEnabled" className="text-sm font-medium">Enable automatic scanning</label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button
              onClick={() => saveConfigMutation.mutate()}
              disabled={saveConfigMutation.isPending || (!cfToken && !configData?.hasApiToken)}
            >
              {saveConfigMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Record Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="break-all text-base">{showDetail?.name}</DialogTitle>
            <DialogDescription>DNS Record Details</DialogDescription>
          </DialogHeader>
          {showDetail && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Zone</p>
                  <p className="font-medium">{showDetail.zone?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Record Type</p>
                  <Badge variant="outline" className={typeColors[showDetail.type] || ''}>{showDetail.type}</Badge>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Content (Target)</p>
                  <p className="font-mono text-sm break-all">{showDetail.content}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Proxied</p>
                  <div className="flex items-center gap-1.5">
                    {showDetail.proxied ? (
                      <><Wifi className="h-3.5 w-3.5 text-yellow-500" /><span>Yes (Cloudflare)</span></>
                    ) : <span>No (Direct)</span>}
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">TTL</p>
                  <p>{showDetail.ttl === 1 ? 'Auto' : `${showDetail.ttl}s`}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Exposure Status</p>
                  {(() => {
                    const c = exposureConfig[showDetail.exposureStatus] || exposureConfig.PENDING
                    const Icon = c.icon
                    return <Badge variant="outline" className={`gap-1 ${c.color}`}><Icon className="h-3 w-3" />{c.label}</Badge>
                  })()}
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">HTTP Status</p>
                  <p className="font-mono">{showDetail.httpStatusCode || '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Response Time</p>
                  <p>{showDetail.responseTimeMs != null ? `${showDetail.responseTimeMs}ms` : '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Last Checked</p>
                  <p>{showDetail.lastCheckedAt ? formatDateTime(showDetail.lastCheckedAt) : 'Never'}</p>
                </div>
                {showDetail.checkError && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Error</p>
                    <p className="text-red-600 text-sm">{showDetail.checkError}</p>
                  </div>
                )}
              </div>
              {/* Origin Protection */}
              {showDetail.originProtected !== undefined && showDetail.originProtected !== null && (
                <div className={`rounded-lg p-3 ${showDetail.originProtected ? 'bg-green-50 border border-green-200' : 'bg-orange-50 border border-orange-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {showDetail.originProtected ? (
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                    ) : (
                      <ShieldAlert className="h-4 w-4 text-orange-600" />
                    )}
                    <span className={`text-sm font-medium ${showDetail.originProtected ? 'text-green-800' : 'text-orange-800'}`}>
                      {showDetail.originProtected ? 'Origin Protected' : 'Origin Exposed'}
                    </span>
                    {showDetail.originExposureType && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-300">
                        {showDetail.originExposureType === 'IP_LEAK' ? 'IP Leak' : showDetail.originExposureType === 'BOTH' ? 'IP Leak + Direct Access' : showDetail.originExposureType}
                      </Badge>
                    )}
                  </div>
                  {showDetail.originExposureDetails && (
                    <p className="text-xs text-orange-700 mt-1">{showDetail.originExposureDetails}</p>
                  )}
                </div>
              )}
              {showDetail.exposureStatus === 'PUBLIC' && (
                <a href={`https://${showDetail.name}`} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline">
                  <ExternalLink className="h-3.5 w-3.5" />Open in browser
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
