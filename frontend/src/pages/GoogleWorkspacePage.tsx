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
import { Textarea } from '@/components/ui/textarea'
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
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Users, ShieldCheck, AlertTriangle, UserX, ShieldAlert,
  Search, RefreshCw, Loader2, ChevronLeft, ChevronRight,
  Download, Settings2, Timer, Smartphone, KeyRound,
  CheckCircle2, XCircle, AlertCircle, MinusCircle, Info,
  HelpCircle, ExternalLink, Copy, Check, Upload,
  FolderTree, Crown, Tag, ChevronDown, ChevronUp, Pencil, X, Eye, Zap,
} from 'lucide-react'
import { GoogleWorkspaceLogo } from '@/components/icons/ServiceLogos'
import { Label } from '@/components/ui/label'

const CRON_LABELS: Record<string, string> = {
  '30 18 * * *': 'Daily at midnight IST',
  '30 0,6,12,18 * * *': 'Every 6 hours IST',
  '30 6,18 * * *': 'Every 12 hours IST',
  '30 18 * * 6': 'Weekly (Sunday midnight IST)',
  // Legacy UTC for display
  '0 0 * * *': 'Daily at midnight IST',
  '0 */6 * * *': 'Every 6 hours IST',
  '0 */12 * * *': 'Every 12 hours IST',
  '0 0 * * 0': 'Weekly (Sunday midnight IST)',
}

const GW_CRON_MIGRATE: Record<string, string> = {
  '0 0 * * *': '30 18 * * *',
  '0 */6 * * *': '30 0,6,12,18 * * *',
  '0 */12 * * *': '30 6,18 * * *',
  '0 0 * * 0': '30 18 * * 6',
}

const PHASE_LABELS: Record<string, string> = {
  users: 'Syncing users...',
  groups: 'Syncing groups...',
  oauth: 'Scanning OAuth apps...',
  devices: 'Syncing mobile devices...',
  alerts: 'Fetching alerts...',
  cis: 'Running CIS checks...',
  orgUnits: 'Syncing org units...',
  adminRoles: 'Syncing admin roles...',
}

const cisStatusConfig: Record<string, { icon: any; color: string; bg: string }> = {
  PASS: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100 text-green-800 border-green-200' },
  FAIL: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100 text-red-800 border-red-200' },
  WARNING: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-100 text-amber-800 border-amber-200' },
  ERROR: { icon: MinusCircle, color: 'text-gray-500', bg: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const riskConfig: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800 border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200',
  LOW: 'bg-green-100 text-green-800 border-green-200',
}

const HIGH_RISK_PATTERNS = [
  { pattern: 'gmail', label: 'Gmail access' },
  { pattern: 'mail.google', label: 'Google Mail access' },
  { pattern: 'drive', label: 'Google Drive access' },
  { pattern: 'calendar', label: 'Calendar access' },
  { pattern: 'admin', label: 'Admin API access' },
  { pattern: 'spreadsheets', label: 'Spreadsheets access' },
]
const MEDIUM_RISK_PATTERNS = [
  { pattern: 'readonly', label: 'Read-only data access' },
  { pattern: 'contacts', label: 'Contacts access' },
  { pattern: 'userinfo', label: 'User info access' },
  { pattern: 'profile', label: 'Profile access' },
  { pattern: 'openid', label: 'OpenID authentication' },
]

function getRiskReasons(scopes: string[]): { level: string; reasons: string[] } {
  const scopeStr = scopes.join(' ').toLowerCase()
  const highReasons = HIGH_RISK_PATTERNS.filter(p => scopeStr.includes(p.pattern)).map(p => p.label)
  if (highReasons.length > 0) return { level: 'HIGH', reasons: highReasons }
  const medReasons = MEDIUM_RISK_PATTERNS.filter(p => scopeStr.includes(p.pattern)).map(p => p.label)
  if (medReasons.length > 0) return { level: 'MEDIUM', reasons: medReasons }
  return { level: 'LOW', reasons: ['No sensitive scope patterns detected'] }
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent?.trim() || ''
}

// Extracts human-readable values from nested objects: {"customerPrimaryDomain":"cdmx.in"} → "cdmx.in"
function flattenValue(val: any): string {
  if (val == null) return '-'
  if (typeof val === 'string') {
    if (val.includes('<') && val.includes('>')) return stripHtml(val)
    return val
  }
  if (Array.isArray(val)) {
    return val.map(v => flattenValue(v)).join('; ')
  }
  if (typeof val === 'object') {
    const entries = Object.entries(val).filter(([k]) => k !== '@type')
    // Single-value object: unwrap
    if (entries.length === 1) return flattenValue(entries[0][1])
    // Multi-value object: "key: value" pairs
    return entries.map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').trim()}: ${flattenValue(v)}`).join(', ')
  }
  return String(val)
}

function cleanAlertValue(val: any): string {
  return flattenValue(val) || '-'
}

// Skip encoded IDs and internal fields
const SKIP_ALERT_KEYS = new Set(['alertDetails', 'query', 'requestId', 'customerId', 'nextPageToken', 'messageId'])
function isUsefulAlertField(key: string, val: any): boolean {
  if (SKIP_ALERT_KEYS.has(key)) return false
  const s = cleanAlertValue(val)
  if (s === '-') return false
  // Skip long base64/encoded strings with no spaces
  if (s.length > 30 && !s.includes(' ') && /^[A-Za-z0-9+/=_-]+$/.test(s)) return false
  return true
}

// For arrays of objects (like messages), extract the most useful field
function renderAlertArray(arr: any[]): { label: string; text: string }[] {
  return arr.map((item, i) => {
    if (typeof item !== 'object') return { label: `#${i + 1}`, text: String(item) }
    // Filter out IDs and encoded values, keep readable fields
    const useful = Object.entries(item).filter(([k, v]) => isUsefulAlertField(k, v))
    if (useful.length === 0) return null
    return {
      label: `#${i + 1}`,
      text: useful.map(([k, v]) => flattenValue(v)).join(' — '),
    }
  }).filter(Boolean) as { label: string; text: string }[]
}

const severityConfig: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-800 border-red-200',
  MEDIUM: 'bg-amber-100 text-amber-800 border-amber-200',
  LOW: 'bg-blue-100 text-blue-800 border-blue-200',
}

const REQUIRED_SCOPES: { scope: string; purpose: string; isNew?: boolean }[] = [
  { scope: 'https://www.googleapis.com/auth/admin.directory.user.readonly', purpose: 'List users and 2FA status' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.group.readonly', purpose: 'List groups and memberships' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.device.mobile.readonly', purpose: 'List mobile devices' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.user.security', purpose: 'List OAuth tokens per user' },
  { scope: 'https://www.googleapis.com/auth/admin.reports.audit.readonly', purpose: 'Audit log access' },
  { scope: 'https://www.googleapis.com/auth/admin.reports.usage.readonly', purpose: 'Usage reports' },
  { scope: 'https://www.googleapis.com/auth/apps.alerts', purpose: 'Alert Center alerts' },
  { scope: 'https://www.googleapis.com/auth/apps.groups.settings', purpose: 'Group security settings' },
  { scope: 'https://www.googleapis.com/auth/admin.directory.orgunit.readonly', purpose: 'Org Units tab', isNew: true },
  { scope: 'https://www.googleapis.com/auth/admin.directory.rolemanagement.readonly', purpose: 'Admin Roles tab', isNew: true },
]

const ALL_SCOPES_TEXT = REQUIRED_SCOPES.map(s => s.scope).join(',\n')

const OU_RISK_TAG_OPTIONS = [
  'External Drive Sharing Allowed',
  'Email Restriction Exemption',
  'Less Restrictive Security Policy',
  'Service Account OU',
  'Shared Mailbox OU',
  'External Collaboration Allowed',
  'Custom Apps Allowed',
  'BYOD Policy',
]

export function GoogleWorkspacePage() {
  const { currentOrganizationId, hasPermission } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const orgId = currentOrganizationId || ''

  const [activeTab, setActiveTab] = useState('overview')
  const [showSettings, setShowSettings] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [copiedScope, setCopiedScope] = useState('')

  // Settings form
  const [saKey, setSaKey] = useState('')
  const [saKeyValid, setSaKeyValid] = useState<boolean | null>(null)
  const [saKeyError, setSaKeyError] = useState('')
  const [saFileName, setSaFileName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminEmailTouched, setAdminEmailTouched] = useState(false)
  const [gwDomain, setGwDomain] = useState('')
  const [gwSchedule, setGwSchedule] = useState('30 18 * * *')
  const [gwEnabled, setGwEnabled] = useState(true)

  // Connection test
  const [connTesting, setConnTesting] = useState(false)
  const [connTestResult, setConnTestResult] = useState<any>(null)

  // Tab filters
  const [userSearch, setUserSearch] = useState('')
  const [userAdminFilter, setUserAdminFilter] = useState('all')
  const [userSuspendedFilter, setUserSuspendedFilter] = useState('all')
  const [userTwoFaFilter, setUserTwoFaFilter] = useState('all')
  const [userPage, setUserPage] = useState(1)

  const [groupSearch, setGroupSearch] = useState('')
  const [groupExternalFilter, setGroupExternalFilter] = useState('all')
  const [groupPage, setGroupPage] = useState(1)

  const [oauthRiskFilter, setOauthRiskFilter] = useState('all')
  const [oauthVerifiedFilter, setOauthVerifiedFilter] = useState('all')
  const [oauthPage, setOauthPage] = useState(1)

  const [deviceTypeFilter, setDeviceTypeFilter] = useState('all')
  const [deviceStatusFilter, setDeviceStatusFilter] = useState('all')
  const [deviceCompromisedFilter, setDeviceCompromisedFilter] = useState('all')
  const [devicePage, setDevicePage] = useState(1)

  const [alertSeverityFilter, setAlertSeverityFilter] = useState('all')
  const [alertStatusFilter, setAlertStatusFilter] = useState('all')
  const [alertPage, setAlertPage] = useState(1)

  const [userOuFilter, setUserOuFilter] = useState('all')

  const [ouSearch, setOuSearch] = useState('')
  const [ouRiskFilter, setOuRiskFilter] = useState('all')
  const [ouPage, setOuPage] = useState(1)
  const [editingOuTags, setEditingOuTags] = useState<any>(null)
  const [editingTags, setEditingTags] = useState<string[]>([])
  const [editingNotes, setEditingNotes] = useState('')
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [viewingAlert, setViewingAlert] = useState<any>(null)
  const [viewingDevice, setViewingDevice] = useState<any>(null)

  const limit = 50

  // Queries - always active
  const { data: stats } = useQuery({
    queryKey: ['gw-stats', orgId],
    queryFn: () => api.googleWorkspace.stats(orgId),
    enabled: !!orgId,
    refetchInterval: 15000,
  })

  const { data: configData } = useQuery({
    queryKey: ['gw-config', orgId],
    queryFn: () => api.googleWorkspace.getConfig(orgId),
    enabled: !!orgId,
  })

  const { data: scanStatus } = useQuery({
    queryKey: ['gw-scan-status', orgId],
    queryFn: () => api.googleWorkspace.scanStatus(orgId),
    enabled: !!orgId,
    refetchInterval: 3000,
  })

  // Tab-specific queries (lazy load)
  const { data: usersData } = useQuery({
    queryKey: ['gw-users', orgId, userSearch, userAdminFilter, userSuspendedFilter, userTwoFaFilter, userOuFilter, userPage],
    queryFn: () => api.googleWorkspace.users(orgId, {
      search: userSearch || undefined,
      admin: userAdminFilter !== 'all' ? userAdminFilter : undefined,
      suspended: userSuspendedFilter !== 'all' ? userSuspendedFilter : undefined,
      twoFa: userTwoFaFilter !== 'all' ? userTwoFaFilter : undefined,
      orgUnitPath: userOuFilter !== 'all' ? userOuFilter : undefined,
      page: userPage, limit,
    }),
    enabled: !!orgId && activeTab === 'users',
  })

  const { data: groupsData } = useQuery({
    queryKey: ['gw-groups', orgId, groupSearch, groupExternalFilter, groupPage],
    queryFn: () => api.googleWorkspace.groups(orgId, {
      search: groupSearch || undefined,
      externalMembers: groupExternalFilter !== 'all' ? groupExternalFilter : undefined,
      page: groupPage, limit,
    }),
    enabled: !!orgId && activeTab === 'groups',
  })

  const { data: cisData } = useQuery({
    queryKey: ['gw-cis', orgId],
    queryFn: () => api.googleWorkspace.cisChecks(orgId),
    enabled: !!orgId && activeTab === 'cis',
  })

  const { data: oauthData } = useQuery({
    queryKey: ['gw-oauth', orgId, oauthRiskFilter, oauthVerifiedFilter, oauthPage],
    queryFn: () => api.googleWorkspace.oauthApps(orgId, {
      riskLevel: oauthRiskFilter !== 'all' ? oauthRiskFilter : undefined,
      verified: oauthVerifiedFilter !== 'all' ? oauthVerifiedFilter : undefined,
      page: oauthPage, limit,
    }),
    enabled: !!orgId && activeTab === 'oauth',
  })

  const { data: alertsData } = useQuery({
    queryKey: ['gw-alerts', orgId, alertSeverityFilter, alertStatusFilter, alertPage],
    queryFn: () => api.googleWorkspace.alerts(orgId, {
      severity: alertSeverityFilter !== 'all' ? alertSeverityFilter : undefined,
      status: alertStatusFilter !== 'all' ? alertStatusFilter : undefined,
      page: alertPage, limit,
    }),
    enabled: !!orgId && activeTab === 'alerts',
  })

  const { data: devicesData } = useQuery({
    queryKey: ['gw-devices', orgId, deviceTypeFilter, deviceStatusFilter, deviceCompromisedFilter, devicePage],
    queryFn: () => api.googleWorkspace.devices(orgId, {
      type: deviceTypeFilter !== 'all' ? deviceTypeFilter : undefined,
      status: deviceStatusFilter !== 'all' ? deviceStatusFilter : undefined,
      compromised: deviceCompromisedFilter !== 'all' ? deviceCompromisedFilter : undefined,
      page: devicePage, limit,
    }),
    enabled: !!orgId && activeTab === 'devices',
  })

  const { data: orgUnitsData } = useQuery({
    queryKey: ['gw-org-units', orgId, ouSearch, ouRiskFilter, ouPage],
    queryFn: () => api.googleWorkspace.orgUnits(orgId, {
      search: ouSearch || undefined,
      hasRiskTags: ouRiskFilter !== 'all' ? ouRiskFilter : undefined,
      page: ouPage, limit,
    }),
    enabled: !!orgId && activeTab === 'orgUnits',
  })

  const { data: allOrgUnits } = useQuery({
    queryKey: ['gw-all-org-units', orgId],
    queryFn: () => api.googleWorkspace.orgUnits(orgId, { limit: 500 }),
    enabled: !!orgId && (activeTab === 'users' || activeTab === 'orgUnits'),
  })

  const { data: adminRolesData } = useQuery({
    queryKey: ['gw-admin-roles', orgId],
    queryFn: () => api.googleWorkspace.adminRoles(orgId),
    enabled: !!orgId && activeTab === 'adminRoles',
  })

  const { data: roleAssignmentsData } = useQuery({
    queryKey: ['gw-role-assignments', orgId],
    queryFn: () => api.googleWorkspace.roleAssignments(orgId),
    enabled: !!orgId && (activeTab === 'users' || activeTab === 'adminRoles'),
  })

  // Mutations
  const triggerScanMutation = useMutation({
    mutationFn: () => api.googleWorkspace.triggerScan(orgId),
    onSuccess: () => {
      toast({ title: 'Scan started', description: 'Google Workspace scan is running in the background.' })
      queryClient.invalidateQueries({ queryKey: ['gw-scan-status'] })
    },
    onError: (err: any) => {
      toast({ title: 'Scan failed', description: err.response?.data?.error?.message || 'Failed to start scan', variant: 'destructive' })
    },
  })

  const validateAndSetKey = (raw: string) => {
    setSaKey(raw)
    if (!raw.trim()) {
      setSaKeyValid(null)
      setSaKeyError('')
      return
    }
    try {
      // Clean common paste artifacts
      const cleaned = raw
        .replace(/^\uFEFF/, '')
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u00A0]/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim()
      const parsed = JSON.parse(cleaned)
      if (!parsed.client_email || !parsed.private_key || !parsed.type) {
        setSaKeyValid(false)
        setSaKeyError('Missing required fields (type, client_email, private_key). Paste the complete file.')
        return
      }
      setSaKeyValid(true)
      setSaKeyError('')
    } catch {
      setSaKeyValid(false)
      setSaKeyError('Invalid JSON format. Paste the complete file or use the Upload button.')
    }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSaFileName(file.name)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      if (text) {
        validateAndSetKey(text)
      }
    }
    reader.readAsText(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const handleTestConnection = async () => {
    setConnTesting(true)
    setConnTestResult(null)
    try {
      let keyToTest = ''
      if (saKey.trim()) {
        keyToTest = getCleanedKey()
      }
      const result = await api.googleWorkspace.testConnection({
        serviceAccountKey: keyToTest || undefined,
        organizationId: !keyToTest ? orgId : undefined,
        adminEmail,
        domain: gwDomain || undefined,
      })
      setConnTestResult(result)
    } catch (err: any) {
      setConnTestResult({ valid: false, error: err.response?.data?.error?.message || 'Connection test failed' })
    } finally {
      setConnTesting(false)
    }
  }

  const getCleanedKey = (): string => {
    if (!saKey.trim()) return ''
    const cleaned = saKey
      .replace(/^\uFEFF/, '')
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
      .replace(/[\u00A0]/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .trim()
    // Parse and re-stringify to normalize
    const parsed = JSON.parse(cleaned)
    return JSON.stringify(parsed)
  }

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      let cleanedKey = ''
      if (saKey.trim()) {
        try {
          cleanedKey = getCleanedKey()
        } catch (e: any) {
          throw { response: { data: { error: { message: `Invalid service account JSON: ${e.message}. Use the Upload button to load the JSON file directly.` } } } }
        }
      }
      // Test connection before saving (only if we have a key or existing key)
      if (cleanedKey || configData?.hasServiceAccountKey) {
        setConnTesting(true)
        setConnTestResult(null)
        try {
          const testResult = await api.googleWorkspace.testConnection({
            serviceAccountKey: cleanedKey || undefined,
            organizationId: !cleanedKey ? orgId : undefined,
            adminEmail,
            domain: gwDomain || undefined,
          })
          setConnTestResult(testResult)
          if (!testResult.valid) {
            throw { response: { data: { error: { message: testResult.error || 'Connection test failed. Please verify your credentials.' } } } }
          }
        } catch (err: any) {
          if (err.response?.data?.error) throw err
          setConnTestResult({ valid: false, error: err.message || 'Connection test failed' })
          throw { response: { data: { error: { message: err.response?.data?.error?.message || 'Connection test failed. Please verify your credentials.' } } } }
        } finally {
          setConnTesting(false)
        }
      }
      return api.googleWorkspace.saveConfig({
        organizationId: orgId,
        serviceAccountKey: cleanedKey,
        adminEmail,
        domain: gwDomain || undefined,
        scanSchedule: gwSchedule,
        isEnabled: gwEnabled,
      })
    },
    onSuccess: () => {
      toast({ title: 'Settings saved', description: 'Google Workspace configuration updated and connection verified.' })
      setShowSettings(false)
      queryClient.invalidateQueries({ queryKey: ['gw-config'] })
      queryClient.invalidateQueries({ queryKey: ['gw-stats'] })
    },
    onError: (err: any) => {
      toast({ title: 'Failed to save settings', description: err.response?.data?.error?.message || 'Invalid configuration', variant: 'destructive' })
    },
  })

  const updateRiskTagsMutation = useMutation({
    mutationFn: ({ ouId, riskTags, riskNotes }: { ouId: string; riskTags: string[]; riskNotes: string }) =>
      api.googleWorkspace.updateOrgUnitRiskTags(orgId, ouId, { riskTags, riskNotes }),
    onSuccess: () => {
      toast({ title: 'Risk tags updated', description: 'Org unit risk tags have been saved.' })
      setEditingOuTags(null)
      queryClient.invalidateQueries({ queryKey: ['gw-org-units'] })
      queryClient.invalidateQueries({ queryKey: ['gw-all-org-units'] })
      queryClient.invalidateQueries({ queryKey: ['gw-stats'] })
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update', description: err.response?.data?.error?.message || 'Failed to update risk tags', variant: 'destructive' })
    },
  })

  const isScanning = scanStatus?.status === 'running'
  const canEdit = hasPermission('infrastructure', 'edit')
  const isConfigured = stats?.isConfigured || configData?.hasServiceAccountKey

  const scanProgress = isScanning && scanStatus?.totalPhases > 0
    ? Math.round((scanStatus.completedPhases / scanStatus.totalPhases) * 100)
    : 0

  const openSettings = () => {
    setSaKey('')
    setSaKeyValid(null)
    setSaKeyError('')
    setSaFileName('')
    setAdminEmail(configData?.adminEmail || '')
    setAdminEmailTouched(false)
    setGwDomain(configData?.domain || '')
    const rawSchedule = configData?.scanSchedule || stats?.scanSchedule || '30 18 * * *'
    setGwSchedule(GW_CRON_MIGRATE[rawSchedule] || rawSchedule)
    setGwEnabled(configData?.isEnabled ?? true)
    setConnTesting(false)
    setConnTestResult(null)
    setShowSettings(true)
  }

  const handleExport = async (type: string = 'overview') => {
    try {
      const blob = await api.googleWorkspace.exportReport(orgId, type)
      const date = new Date().toISOString().split('T')[0]
      downloadBlob(blob, `gworkspace-${type}-${date}.csv`)
      toast({ title: 'Report exported', description: 'CSV report downloaded.' })
    } catch {
      toast({ title: 'Export failed', description: 'Failed to generate report', variant: 'destructive' })
    }
  }

  // Group CIS checks by category
  const cisChecks = cisData || []
  const cisCategories = cisChecks.reduce((acc: Record<string, any[]>, check: any) => {
    if (!acc[check.category]) acc[check.category] = []
    acc[check.category].push(check)
    return acc
  }, {})

  const renderPagination = (pagination: any, currentPage: number, setPage: (p: number) => void) => {
    if (!pagination || pagination.totalPages <= 1) return null
    return (
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-muted-foreground">
          Showing {((currentPage - 1) * limit) + 1}-{Math.min(currentPage * limit, pagination.total)} of {pagination.total}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" disabled={currentPage >= pagination.totalPages} onClick={() => setPage(currentPage + 1)}>
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
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <GoogleWorkspaceLogo className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Google Workspace Monitor</h1>
            <p className="text-muted-foreground text-sm mt-1">Security posture and compliance observatory for your Google Workspace</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button variant="outline" size="sm" onClick={openSettings}>
              <Settings2 className="h-4 w-4 mr-1" /> Settings
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => handleExport('overview')}>
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          {canEdit && isConfigured && (
            <Button size="sm" onClick={() => triggerScanMutation.mutate()} disabled={isScanning || triggerScanMutation.isPending}>
              {isScanning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {isScanning ? 'Scanning...' : 'Scan Now'}
            </Button>
          )}
        </div>
      </div>

      {/* Not configured warning */}
      {!isConfigured && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-medium">Google Workspace is not configured.</span>
              <Button variant="link" className="text-amber-800 underline p-0 h-auto" onClick={() => setShowHelp(true)}>Setup guide</Button>
              {canEdit && <Button variant="link" className="text-amber-800 underline p-0 h-auto" onClick={openSettings}>Configure now</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-blue-600">{stats?.totalUsers ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.activeUsers ?? 0} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">Suspended</CardTitle>
            <UserX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-red-600">{stats?.suspendedUsers ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.adminUsers ?? 0} admins total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">2FA Enrollment</CardTitle>
            <ShieldCheck className="h-4 w-4 text-teal-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-teal-600">{stats?.twoFaPct ?? 0}%</div>
            <p className="text-xs text-muted-foreground">{stats?.enrolledIn2Sv ?? 0} of {stats?.activeUsers ?? 0} users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-amber-600">{stats?.activeAlerts ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.totalAlerts ?? 0} total alerts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">Groups</CardTitle>
            <Users className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-indigo-600">{stats?.totalGroups ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.externalGroups ?? 0} with external members</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">OAuth Apps</CardTitle>
            <KeyRound className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-purple-600">{stats?.totalOAuthApps ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.highRiskApps ?? 0} high-risk</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">Mobile Devices</CardTitle>
            <Smartphone className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-gray-700">{stats?.totalDevices ?? 0}</div>
            <p className="text-xs text-muted-foreground">Enrolled devices</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">CIS Compliance</CardTitle>
            <ShieldAlert className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-green-600">
              {stats?.cisPassCount ?? 0}/{stats?.cisTotalCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Checks passed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">Org Units</CardTitle>
            <FolderTree className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-cyan-600">{stats?.totalOrgUnits ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.riskTaggedOrgUnits > 0
                ? <span className="text-amber-600">{stats.riskTaggedOrgUnits} with risk tags</span>
                : 'No risk tags assigned'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
            <CardTitle className="text-sm font-medium">Admin Roles</CardTitle>
            <Crown className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="text-2xl font-bold text-rose-600">{stats?.totalAdminRoles ?? 0}</div>
            <p className="text-xs text-muted-foreground">{stats?.totalRoleAssignments ?? 0} role assignments</p>
          </CardContent>
        </Card>
      </div>

      {/* Scan status banner */}
      {isScanning && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">
                  {PHASE_LABELS[scanStatus?.phase || ''] || 'Scanning...'} (Phase {scanStatus?.completedPhases || 0}/{scanStatus?.totalPhases || 6})
                </p>
                <Progress value={scanProgress} className="h-2 mt-1" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!isScanning && stats?.lastScan && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Timer className="h-4 w-4" />
            <span>Last scan: {formatDateTime(stats.lastScan.completedAt)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Timer className="h-4 w-4" />
            <span>Schedule: {CRON_LABELS[stats.scanSchedule] || stats.scanSchedule}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full">
          <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
          <TabsTrigger value="users" className="flex-1">Users</TabsTrigger>
          <TabsTrigger value="groups" className="flex-1">Groups</TabsTrigger>
          <TabsTrigger value="cis" className="flex-1">CIS Controls</TabsTrigger>
          <TabsTrigger value="alerts" className="flex-1">Alerts</TabsTrigger>
          <TabsTrigger value="oauth" className="flex-1">OAuth Apps</TabsTrigger>
          <TabsTrigger value="devices" className="flex-1">Devices</TabsTrigger>
          <TabsTrigger value="orgUnits" className="flex-1">Org Units</TabsTrigger>
          <TabsTrigger value="adminRoles" className="flex-1">Admin Roles</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {stats?.cisTotalCount > 0 && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">CIS Compliance Summary</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0">
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold">
                    {stats.cisTotalCount > 0 ? Math.round((stats.cisPassCount / stats.cisTotalCount) * 100) : 0}%
                  </div>
                  <Progress value={stats.cisTotalCount > 0 ? (stats.cisPassCount / stats.cisTotalCount) * 100 : 0} className="flex-1 h-3" />
                  <span className="text-sm text-muted-foreground">{stats.cisPassCount}/{stats.cisTotalCount} passed</span>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Quick Summary</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-muted-foreground">Active Users:</span> <strong>{stats?.activeUsers ?? 0}</strong></div>
                <div><span className="text-muted-foreground">Admins:</span> <strong>{stats?.adminUsers ?? 0}</strong></div>
                <div><span className="text-muted-foreground">2FA Enforced:</span> <strong>{stats?.enforcedIn2Sv ?? 0}</strong></div>
                <div><span className="text-muted-foreground">External Groups:</span> <strong className={stats?.externalGroups > 0 ? 'text-red-600' : ''}>{stats?.externalGroups ?? 0}</strong></div>
                <div><span className="text-muted-foreground">High-Risk Apps:</span> <strong className={stats?.highRiskApps > 0 ? 'text-red-600' : ''}>{stats?.highRiskApps ?? 0}</strong></div>
                <div><span className="text-muted-foreground">Active Alerts:</span> <strong className={stats?.activeAlerts > 0 ? 'text-amber-600' : ''}>{stats?.activeAlerts ?? 0}</strong></div>
                <div><span className="text-muted-foreground">Devices:</span> <strong>{stats?.totalDevices ?? 0}</strong></div>
                <div><span className="text-muted-foreground">Archived:</span> <strong>{stats?.archivedUsers ?? 0}</strong></div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search users..." value={userSearch} onChange={e => { setUserSearch(e.target.value); setUserPage(1); }} className="pl-9 h-9" />
            </div>
            <Select value={userAdminFilter} onValueChange={v => { setUserAdminFilter(v); setUserPage(1); }}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Admin" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="true">Admins Only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userSuspendedFilter} onValueChange={v => { setUserSuspendedFilter(v); setUserPage(1); }}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="false">Active</SelectItem>
                <SelectItem value="true">Suspended</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userTwoFaFilter} onValueChange={v => { setUserTwoFaFilter(v); setUserPage(1); }}>
              <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="2FA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All 2FA</SelectItem>
                <SelectItem value="enrolled">Enrolled</SelectItem>
                <SelectItem value="not_enrolled">Not Enrolled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={userOuFilter} onValueChange={v => { setUserOuFilter(v); setUserPage(1); }}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Org Unit" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Org Units</SelectItem>
                {(allOrgUnits?.data || []).map((ou: any) => (
                  <SelectItem key={ou.id} value={ou.orgUnitPath}>{ou.orgUnitPath}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-9" onClick={() => handleExport('users')}>
              <Download className="h-4 w-4 mr-1" /> Export
            </Button>
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">2FA</TableHead>
                  <TableHead className="text-xs">Last Login</TableHead>
                  <TableHead className="text-xs">Org Unit</TableHead>
                  <TableHead className="text-xs">Admin Roles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usersData?.data || []).map((u: any) => {
                  const userRoles = (roleAssignmentsData || []).filter((ra: any) => ra.assignedToEmail === u.primaryEmail)
                  const ouRiskTags = (allOrgUnits?.data || []).find((ou: any) => ou.orgUnitPath === u.orgUnitPath)?.riskTags || []
                  const isInRiskyOu = ouRiskTags.length > 0
                  return (
                  <TableRow key={u.id} className={isInRiskyOu ? 'bg-amber-50/50' : ''}>
                    <TableCell className="text-xs font-medium max-w-[220px] break-all">{u.primaryEmail}</TableCell>
                    <TableCell className="text-xs">{u.fullName}</TableCell>
                    <TableCell className="text-xs">
                      {u.isAdmin && <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">Admin</Badge>}
                      {u.isDelegatedAdmin && !u.isAdmin && <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">Delegated</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.suspended ? <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-[10px]">Suspended</Badge>
                        : u.archived ? <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">Archived</Badge>
                        : <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-[10px]">Active</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {u.isEnrolledIn2Sv
                        ? <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-[10px]">{u.isEnforcedIn2Sv ? 'Enforced' : 'Enrolled'}</Badge>
                        : <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-[10px]">Not Enrolled</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.lastLoginTime ? formatDateTime(u.lastLoginTime) : 'Never'}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-1">
                        {isInRiskyOu && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="text-amber-500 hover:text-amber-700"><AlertTriangle className="h-3.5 w-3.5" /></button>
                            </PopoverTrigger>
                            <PopoverContent side="left" className="w-64 p-3">
                              <p className="text-xs font-medium mb-1">Risk-tagged Org Unit</p>
                              <div className="flex flex-wrap gap-1">
                                {ouRiskTags.map((tag: string) => (
                                  <Badge key={tag} variant="outline" className="bg-red-100 text-red-800 border-red-200 text-[10px]">{tag}</Badge>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        <span className="text-muted-foreground">{u.orgUnitPath || '/'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {userRoles.map((ra: any) => (
                          <Badge key={ra.id} variant="outline" className={`text-[10px] ${ra.adminRole?.isSuperAdminRole ? 'bg-red-100 text-red-800 border-red-200' : 'bg-purple-100 text-purple-800 border-purple-200'}`}>
                            {ra.adminRole?.roleName || 'Unknown'}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
                {(usersData?.data || []).length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {renderPagination(usersData?.pagination, userPage, setUserPage)}
        </TabsContent>

        {/* Groups Tab */}
        <TabsContent value="groups" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search groups..." value={groupSearch} onChange={e => { setGroupSearch(e.target.value); setGroupPage(1); }} className="pl-9 h-9" />
            </div>
            <Select value={groupExternalFilter} onValueChange={v => { setGroupExternalFilter(v); setGroupPage(1); }}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="External" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                <SelectItem value="true">External Allowed</SelectItem>
                <SelectItem value="false">Internal Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Email</TableHead>
                  <TableHead className="text-xs">Members</TableHead>
                  <TableHead className="text-xs">External Members</TableHead>
                  <TableHead className="text-xs">Who Can Join</TableHead>
                  <TableHead className="text-xs">Who Can Post</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(groupsData?.data || []).map((g: any) => (
                  <TableRow key={g.id}>
                    <TableCell className="text-xs font-medium">{g.name}</TableCell>
                    <TableCell className="text-xs max-w-[200px] break-all">{g.email}</TableCell>
                    <TableCell className="text-xs">{g.memberCount}</TableCell>
                    <TableCell className="text-xs">
                      {g.allowExternalMembers
                        ? <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-[10px]">Allowed</Badge>
                        : <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-[10px]">Blocked</Badge>}
                    </TableCell>
                    <TableCell className="text-xs">{g.whoCanJoin || '-'}</TableCell>
                    <TableCell className="text-xs">{g.whoCanPostMessage || '-'}</TableCell>
                  </TableRow>
                ))}
                {(groupsData?.data || []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No groups found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {renderPagination(groupsData?.pagination, groupPage, setGroupPage)}
        </TabsContent>

        {/* CIS Controls Tab */}
        <TabsContent value="cis" className="space-y-4">
          {cisChecks.length > 0 && (
            <Card>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-4">
                  <div className="text-2xl font-bold">
                    {cisChecks.filter((c: any) => c.status === 'PASS').length}/{cisChecks.length} passed
                  </div>
                  <Progress value={(cisChecks.filter((c: any) => c.status === 'PASS').length / cisChecks.length) * 100} className="flex-1 h-3" />
                  <Button variant="outline" size="sm" onClick={() => handleExport('cis')}>
                    <Download className="h-4 w-4 mr-1" /> Export
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {Object.entries(cisCategories).map(([category, checks]: [string, any[]]) => (
            <Card key={category}>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">{category}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {checks.map((check: any) => {
                  const cfg = cisStatusConfig[check.status] || cisStatusConfig.ERROR
                  const StatusIcon = cfg.icon
                  return (
                    <div key={check.checkId} className="flex items-start gap-3 p-2 rounded-md hover:bg-muted/50">
                      <StatusIcon className={`h-5 w-5 mt-0.5 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{check.checkId}</span>
                          <span className="text-sm font-medium">{check.title}</span>
                          <Badge variant="outline" className={`${cfg.bg} text-[10px] ml-auto`}>{check.status}</Badge>
                        </div>
                        {check.details && <p className="text-xs text-muted-foreground mt-1">{check.details}</p>}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}

          {cisChecks.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Info className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No CIS check results available. Run a scan to generate compliance checks.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Alerts Tab */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={alertSeverityFilter} onValueChange={v => { setAlertSeverityFilter(v); setAlertPage(1); }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={alertStatusFilter} onValueChange={v => { setAlertStatusFilter(v); setAlertPage(1); }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="NOT_STARTED">Not Started</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Source</TableHead>
                  <TableHead className="text-xs">Severity</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Start Time</TableHead>
                  <TableHead className="text-xs w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(alertsData?.data || []).map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs font-medium">{a.type}</TableCell>
                    <TableCell className="text-xs">{a.source || '-'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`${severityConfig[a.severity] || severityConfig.MEDIUM} text-[10px]`}>{a.severity}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`text-[10px] ${a.status === 'ACTIVE' ? 'bg-red-100 text-red-800 border-red-200' : 'bg-green-100 text-green-800 border-green-200'}`}>{a.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.startTime ? formatDateTime(a.startTime) : '-'}</TableCell>
                    <TableCell className="text-xs">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewingAlert(a)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(alertsData?.data || []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No alerts found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {renderPagination(alertsData?.pagination, alertPage, setAlertPage)}
        </TabsContent>

        {/* OAuth Apps Tab */}
        <TabsContent value="oauth" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={oauthRiskFilter} onValueChange={v => { setOauthRiskFilter(v); setOauthPage(1); }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risks</SelectItem>
                <SelectItem value="HIGH">High Risk</SelectItem>
                <SelectItem value="MEDIUM">Medium Risk</SelectItem>
                <SelectItem value="LOW">Low Risk</SelectItem>
              </SelectContent>
            </Select>
            <Select value={oauthVerifiedFilter} onValueChange={v => { setOauthVerifiedFilter(v); setOauthPage(1); }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Verified" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Apps</SelectItem>
                <SelectItem value="true">Verified</SelectItem>
                <SelectItem value="false">Unverified</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">App Name</TableHead>
                  <TableHead className="text-xs">Client ID</TableHead>
                  <TableHead className="text-xs">Users</TableHead>
                  <TableHead className="text-xs">Verified</TableHead>
                  <TableHead className="text-xs">Risk Level</TableHead>
                  <TableHead className="text-xs">Scopes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(oauthData?.data || []).map((app: any) => {
                  const riskInfo = getRiskReasons(app.scopes || [])
                  return (
                    <TableRow key={app.id}>
                      <TableCell className="text-xs font-medium">{app.displayText}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate font-mono">{app.clientId}</TableCell>
                      <TableCell className="text-xs">{app.userCount}</TableCell>
                      <TableCell className="text-xs">
                        {app.anonymous
                          ? <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">Unverified</Badge>
                          : <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-[10px]">Verified</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className={`${riskConfig[app.riskLevel] || riskConfig.LOW} text-[10px]`}>{app.riskLevel}</Badge>
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="text-muted-foreground hover:text-foreground transition-colors">
                                <Info className="h-3.5 w-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="left" align="start" className="w-80 p-3">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`${riskConfig[app.riskLevel] || riskConfig.LOW} text-[10px]`}>{app.riskLevel} RISK</Badge>
                                  <span className="text-xs font-medium">{app.displayText}</span>
                                </div>
                                <div>
                                  <p className="text-xs font-medium mb-1">Why this risk level?</p>
                                  <ul className="text-xs text-muted-foreground space-y-0.5">
                                    {riskInfo.reasons.map((r, i) => (
                                      <li key={i} className="flex items-center gap-1.5">
                                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${app.riskLevel === 'HIGH' ? 'bg-red-500' : app.riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-green-500'}`} />
                                        {r}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                                {(app.scopes || []).length > 0 && (
                                  <div>
                                    <p className="text-xs font-medium mb-1">Scopes ({app.scopes.length})</p>
                                    <div className="max-h-32 overflow-y-auto bg-muted/50 rounded p-1.5 space-y-0.5">
                                      {app.scopes.map((scope: string, i: number) => (
                                        <p key={i} className="text-[10px] font-mono text-muted-foreground break-all">{scope}</p>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <p className="text-[10px] text-muted-foreground italic">
                                  Risk is based on OAuth scope sensitivity. Apps accessing Gmail, Drive, Calendar, or Admin APIs are marked high risk.
                                </p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px]">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-muted-foreground hover:text-foreground hover:underline transition-colors">
                              {(app.scopes || []).length} scope(s)
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="left" align="start" className="w-80 p-3">
                            <p className="text-xs font-medium mb-2">OAuth Scopes for {app.displayText}</p>
                            {(app.scopes || []).length > 0 ? (
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {app.scopes.map((scope: string, i: number) => (
                                  <p key={i} className="text-[10px] font-mono text-muted-foreground break-all bg-muted/50 rounded px-1.5 py-0.5">{scope}</p>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">No scopes recorded</p>
                            )}
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {(oauthData?.data || []).length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No OAuth apps found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {renderPagination(oauthData?.pagination, oauthPage, setOauthPage)}
        </TabsContent>

        {/* Devices Tab */}
        <TabsContent value="devices" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select value={deviceTypeFilter} onValueChange={v => { setDeviceTypeFilter(v); setDevicePage(1); }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ANDROID">Android</SelectItem>
                <SelectItem value="IOS">iOS</SelectItem>
                <SelectItem value="GOOGLE_SYNC">Google Sync</SelectItem>
              </SelectContent>
            </Select>
            <Select value={deviceStatusFilter} onValueChange={v => { setDeviceStatusFilter(v); setDevicePage(1); }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="UNPROVISIONED">Unprovisioned</SelectItem>
              </SelectContent>
            </Select>
            <Select value={deviceCompromisedFilter} onValueChange={v => { setDeviceCompromisedFilter(v); setDevicePage(1); }}>
              <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="Integrity" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Devices</SelectItem>
                <SelectItem value="true">Compromised Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Model</TableHead>
                  <TableHead className="text-xs">OS</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Compromised</TableHead>
                  <TableHead className="text-xs">Encrypted</TableHead>
                  <TableHead className="text-xs">Last Sync</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                  <TableHead className="text-xs w-[60px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(devicesData?.data || []).map((d: any) => {
                  const isCompromised = d.compromisedStatus && !['No compromise detected', 'NO_COMPROMISE_DETECTED', 'Undetected', ''].includes(d.compromisedStatus)
                  return (
                  <TableRow key={d.id} className={isCompromised ? 'bg-red-50/50' : ''}>
                    <TableCell className="text-xs">{d.deviceType}</TableCell>
                    <TableCell className="text-xs">{d.model || '-'}</TableCell>
                    <TableCell className="text-xs">{d.os || '-'}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline" className={`text-[10px] ${
                        d.status === 'APPROVED' ? 'bg-green-100 text-green-800 border-green-200'
                        : d.status === 'BLOCKED' ? 'bg-red-100 text-red-800 border-red-200'
                        : 'bg-amber-100 text-amber-800 border-amber-200'
                      }`}>{d.status || 'Unknown'}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {isCompromised
                        ? <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-[10px]">Compromised</Badge>
                        : <span className="text-muted-foreground">Clean</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.encryptionStatus === 'Encrypted' || d.encryptionStatus === 'ENCRYPTED'
                        ? <span className="text-green-600">Yes</span>
                        : d.encryptionStatus ? <span className="text-red-600">No</span> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{d.lastSync ? formatDateTime(d.lastSync) : '-'}</TableCell>
                    <TableCell className="text-xs max-w-[180px] break-all">{d.ownerEmail || '-'}</TableCell>
                    <TableCell className="text-xs">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setViewingDevice(d)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  )
                })}
                {(devicesData?.data || []).length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No devices found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {renderPagination(devicesData?.pagination, devicePage, setDevicePage)}
        </TabsContent>

        {/* Org Units Tab */}
        <TabsContent value="orgUnits" className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search org units..." value={ouSearch} onChange={e => { setOuSearch(e.target.value); setOuPage(1); }} className="pl-9 h-9" />
            </div>
            <Select value={ouRiskFilter} onValueChange={v => { setOuRiskFilter(v); setOuPage(1); }}>
              <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Risk Tags" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Org Units</SelectItem>
                <SelectItem value="true">With Risk Tags</SelectItem>
                <SelectItem value="false">No Risk Tags</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Path</TableHead>
                  <TableHead className="text-xs">Name</TableHead>
                  <TableHead className="text-xs">Users</TableHead>
                  <TableHead className="text-xs">Risk Tags</TableHead>
                  <TableHead className="text-xs">Notes</TableHead>
                  {canEdit && <TableHead className="text-xs w-[60px]">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(orgUnitsData?.data || []).map((ou: any) => {
                  const depth = (ou.orgUnitPath || '/').split('/').filter(Boolean).length
                  return (
                    <TableRow key={ou.id} className={ou.riskTags?.length > 0 ? 'bg-amber-50/50' : ''}>
                      <TableCell className="text-xs font-mono">
                        <span style={{ paddingLeft: `${Math.max(0, depth - 1) * 16}px` }}>{ou.orgUnitPath}</span>
                      </TableCell>
                      <TableCell className="text-xs font-medium">{ou.name}</TableCell>
                      <TableCell className="text-xs">{ou.userCount ?? 0}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {(ou.riskTags || []).map((tag: string) => (
                            <Badge key={tag} variant="outline" className="bg-red-100 text-red-800 border-red-200 text-[10px]">
                              <Tag className="h-2.5 w-2.5 mr-0.5" />{tag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{ou.riskNotes || '-'}</TableCell>
                      {canEdit && (
                        <TableCell className="text-xs">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                            setEditingOuTags(ou)
                            setEditingTags(ou.riskTags || [])
                            setEditingNotes(ou.riskNotes || '')
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                {(orgUnitsData?.data || []).length === 0 && (
                  <TableRow><TableCell colSpan={canEdit ? 6 : 5} className="text-center py-8 text-muted-foreground">No org units found. Run a scan to sync organizational units.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {renderPagination(orgUnitsData?.pagination, ouPage, setOuPage)}
        </TabsContent>

        {/* Admin Roles Tab */}
        <TabsContent value="adminRoles" className="space-y-4">
          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[30px]"></TableHead>
                  <TableHead className="text-xs">Role Name</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Assigned Users</TableHead>
                  <TableHead className="text-xs">Privileges</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(adminRolesData || []).map((role: any) => {
                  const assignments = role.assignments || []
                  const isExpanded = expandedRoleId === role.id
                  return (
                    <>
                      <TableRow key={role.id} className={`cursor-pointer hover:bg-muted/50 ${role.isSuperAdminRole ? 'bg-red-50/50' : ''}`} onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}>
                        <TableCell className="text-xs">
                          {assignments.length > 0 && (isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />)}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{role.roleName}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex gap-1">
                            {role.isSuperAdminRole && <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 text-[10px]">Super Admin</Badge>}
                            {role.isSystemRole && <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 text-[10px]">System</Badge>}
                            {!role.isSystemRole && <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">Custom</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className={`text-[10px] ${assignments.length > 0 ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                            {assignments.length} user{assignments.length !== 1 ? 's' : ''}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(role.privilegeNames || []).length > 0 ? (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-muted-foreground hover:text-foreground hover:underline transition-colors">
                                  {role.privilegeNames.length} privilege{role.privilegeNames.length !== 1 ? 's' : ''}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent side="left" className="w-80 p-3">
                                <p className="text-xs font-medium mb-2">Privileges for {role.roleName}</p>
                                <div className="max-h-48 overflow-y-auto space-y-1">
                                  {role.privilegeNames.map((p: string, i: number) => (
                                    <p key={i} className="text-[10px] font-mono text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">{p}</p>
                                  ))}
                                </div>
                              </PopoverContent>
                            </Popover>
                          ) : '-'}
                        </TableCell>
                      </TableRow>
                      {isExpanded && assignments.length > 0 && (
                        <TableRow key={`${role.id}-expanded`}>
                          <TableCell colSpan={5} className="bg-muted/30 p-0">
                            <div className="px-8 py-2">
                              <p className="text-xs font-medium text-muted-foreground mb-2">Assigned Users:</p>
                              <div className="flex flex-wrap gap-2">
                                {assignments.map((a: any) => (
                                  <div key={a.id} className="flex items-center gap-1.5 bg-white rounded-md border px-2 py-1">
                                    <Crown className={`h-3 w-3 ${role.isSuperAdminRole ? 'text-red-500' : 'text-purple-500'}`} />
                                    <span className="text-xs">{a.assignedToEmail || a.assignedTo}</span>
                                    {a.scopeType && a.scopeType !== 'CUSTOMER' && (
                                      <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 text-[9px]">{a.scopeType}</Badge>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
                {(adminRolesData || []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No admin roles found. Run a scan to sync admin roles.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Device Details Dialog */}
      <Dialog open={!!viewingDevice} onOpenChange={(open) => { if (!open) setViewingDevice(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-gray-500" />
              Device Details
            </DialogTitle>
            <DialogDescription>
              {viewingDevice?.model || viewingDevice?.deviceType || 'Mobile device'} — {viewingDevice?.ownerEmail || 'Unknown owner'}
            </DialogDescription>
          </DialogHeader>
          {viewingDevice && (() => {
            const isCompromised = viewingDevice.compromisedStatus && !['No compromise detected', 'NO_COMPROMISE_DETECTED', 'Undetected', ''].includes(viewingDevice.compromisedStatus)
            const isEncrypted = viewingDevice.encryptionStatus === 'Encrypted' || viewingDevice.encryptionStatus === 'ENCRYPTED'
            return (
              <div className="space-y-4">
                {/* Compromised alert banner */}
                {isCompromised && (
                  <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Device Compromised</p>
                      <p className="text-xs text-red-700 mt-0.5">Status: {viewingDevice.compromisedStatus}</p>
                      <p className="text-xs text-red-600 mt-1">This device may be rooted or jailbroken. Consider revoking access and notifying the user.</p>
                    </div>
                  </div>
                )}

                {/* Device info */}
                <Card>
                  <CardContent className="py-3 px-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      <div>
                        <span className="text-xs text-muted-foreground">Device Type</span>
                        <p className="text-sm font-medium">{viewingDevice.deviceType}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Model</span>
                        <p className="text-sm font-medium">{viewingDevice.model || '-'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Operating System</span>
                        <p className="text-sm font-medium">{viewingDevice.os || '-'}</p>
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground">Owner</span>
                        <p className="text-sm font-medium break-all">{viewingDevice.ownerEmail || '-'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Security status */}
                <Card>
                  <CardContent className="py-3 px-4">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Security Status</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className={`text-center p-2 rounded-lg border ${
                        viewingDevice.status === 'APPROVED' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                      }`}>
                        <p className="text-[10px] text-muted-foreground">Status</p>
                        <p className={`text-xs font-semibold ${
                          viewingDevice.status === 'APPROVED' ? 'text-green-700' : 'text-amber-700'
                        }`}>{viewingDevice.status || 'Unknown'}</p>
                      </div>
                      <div className={`text-center p-2 rounded-lg border ${isCompromised ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                        <p className="text-[10px] text-muted-foreground">Integrity</p>
                        <p className={`text-xs font-semibold ${isCompromised ? 'text-red-700' : 'text-green-700'}`}>
                          {isCompromised ? 'Compromised' : 'Clean'}
                        </p>
                      </div>
                      <div className={`text-center p-2 rounded-lg border ${
                        isEncrypted ? 'bg-green-50 border-green-200' : viewingDevice.encryptionStatus ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <p className="text-[10px] text-muted-foreground">Encryption</p>
                        <p className={`text-xs font-semibold ${
                          isEncrypted ? 'text-green-700' : viewingDevice.encryptionStatus ? 'text-red-700' : 'text-gray-500'
                        }`}>{isEncrypted ? 'Encrypted' : viewingDevice.encryptionStatus || 'Unknown'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Timestamps */}
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>Last Sync: {viewingDevice.lastSync ? formatDateTime(viewingDevice.lastSync) : 'Never'}</span>
                  <span>Updated: {viewingDevice.updatedAt ? formatDateTime(viewingDevice.updatedAt) : '-'}</span>
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingDevice(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Details Dialog */}
      <Dialog open={!!viewingAlert} onOpenChange={(open) => { if (!open) setViewingAlert(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className={`p-1.5 rounded-full ${viewingAlert?.severity === 'HIGH' ? 'bg-red-100' : viewingAlert?.severity === 'MEDIUM' ? 'bg-amber-100' : 'bg-blue-100'}`}>
                <AlertTriangle className={`h-4 w-4 ${viewingAlert?.severity === 'HIGH' ? 'text-red-600' : viewingAlert?.severity === 'MEDIUM' ? 'text-amber-600' : 'text-blue-600'}`} />
              </div>
              {viewingAlert?.type}
            </DialogTitle>
            <DialogDescription>
              {viewingAlert?.source ? `Source: ${viewingAlert.source}` : 'Alert details and event information'}
            </DialogDescription>
          </DialogHeader>
          {viewingAlert && (() => {
            let parsedDesc: any = null
            try { parsedDesc = JSON.parse(viewingAlert.description || '{}') } catch { /* not JSON */ }
            return (
              <div className="space-y-4 overflow-y-auto pr-1">
                {/* Status row */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`${severityConfig[viewingAlert.severity] || severityConfig.MEDIUM} text-xs`}>{viewingAlert.severity}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-xs ${viewingAlert.status === 'ACTIVE' ? 'bg-red-100 text-red-800 border-red-200' : viewingAlert.status === 'NOT_STARTED' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-green-100 text-green-800 border-green-200'}`}>{viewingAlert.status}</Badge>
                  </div>
                  {viewingAlert.startTime && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Timer className="h-3 w-3" /> {formatDateTime(viewingAlert.startTime)}
                      {viewingAlert.endTime && <> &mdash; {formatDateTime(viewingAlert.endTime)}</>}
                    </span>
                  )}
                </div>

                {/* Parsed description - readable format */}
                {parsedDesc && (
                  <div className="space-y-3">
                    {/* Affected user */}
                    {parsedDesc.email && (
                      <Card className="border-blue-100">
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-blue-500" />
                            <div>
                              <Label className="text-xs text-muted-foreground">Affected User</Label>
                              <p className="text-sm font-medium">{parsedDesc.email}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* Events */}
                    {parsedDesc.events?.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground mb-2 block">Events ({parsedDesc.events.length})</Label>
                        <div className="space-y-2">
                          {parsedDesc.events.map((evt: any, i: number) => (
                            <Card key={i} className="border-muted">
                              <CardContent className="py-3 px-4">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                  {evt.deviceType && (
                                    <div>
                                      <span className="text-xs text-muted-foreground">Device Type</span>
                                      <p className="font-medium">{evt.deviceType}</p>
                                    </div>
                                  )}
                                  {evt.deviceModel && (
                                    <div>
                                      <span className="text-xs text-muted-foreground">Device Model</span>
                                      <p className="font-medium">{evt.deviceModel}</p>
                                    </div>
                                  )}
                                  {evt.deviceProperty && (
                                    <div className="col-span-2">
                                      <span className="text-xs text-muted-foreground">Property Changed</span>
                                      <p className="font-medium">{evt.deviceProperty.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase())}</p>
                                    </div>
                                  )}
                                  {(evt.oldValue || evt.newValue) && (
                                    <div className="col-span-2 flex items-center gap-2 bg-muted/50 rounded-md p-2">
                                      <div className="flex-1">
                                        <span className="text-[10px] text-muted-foreground uppercase">Old Value</span>
                                        <p className="text-xs font-mono">{evt.oldValue || '-'}</p>
                                      </div>
                                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                      <div className="flex-1">
                                        <span className="text-[10px] text-muted-foreground uppercase">New Value</span>
                                        <p className="text-xs font-mono">{evt.newValue || '-'}</p>
                                      </div>
                                    </div>
                                  )}
                                  {/* Render any other unknown event fields (skip internal IDs) */}
                                  {Object.entries(evt).filter(([k]) => !['deviceId','deviceType','deviceModel','deviceProperty','oldValue','newValue','resourceId'].includes(k)).map(([k, v]) => (
                                    <div key={k}>
                                      <span className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c: string) => c.toUpperCase())}</span>
                                      <p className="text-xs font-medium">{cleanAlertValue(v)}</p>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Render any other top-level parsed description fields */}
                    {(() => {
                      const extras = Object.entries(parsedDesc).filter(([k, v]) => !['@type','email','events'].includes(k) && isUsefulAlertField(k, v))
                      const scalarFields = extras.filter(([, v]) => !Array.isArray(v) && cleanAlertValue(v).length <= 120)
                      const longFields = extras.filter(([, v]) => !Array.isArray(v) && cleanAlertValue(v).length > 120)
                      const arrayFields = extras.filter(([, v]) => Array.isArray(v))
                      if (extras.length === 0) return null
                      return (
                        <div className="space-y-3">
                          {scalarFields.length > 0 && (
                            <Card className="border-muted">
                              <CardContent className="py-3 px-4">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                  {scalarFields.map(([k, v]) => (
                                    <div key={k}>
                                      <span className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c: string) => c.toUpperCase())}</span>
                                      <p className="text-xs font-medium">{cleanAlertValue(v)}</p>
                                    </div>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          )}
                          {longFields.map(([k, v]) => (
                            <div key={k}>
                              <Label className="text-xs text-muted-foreground">{k.replace(/([A-Z])/g, ' $1').replace(/^./, (c: string) => c.toUpperCase())}</Label>
                              <div className="mt-1 p-3 bg-muted/50 rounded-md text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                                {cleanAlertValue(v)}
                              </div>
                            </div>
                          ))}
                          {arrayFields.map(([k, v]) => {
                            const items = renderAlertArray(v as any[])
                            if (items.length === 0) return null
                            return (
                              <div key={k}>
                                <Label className="text-xs text-muted-foreground mb-2 block">
                                  {k.replace(/([A-Z])/g, ' $1').replace(/^./, (c: string) => c.toUpperCase())} ({items.length})
                                </Label>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {items.map((item, i) => (
                                    <div key={i} className="p-2 bg-muted/50 rounded-md text-xs">
                                      {item.text}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Plain text description fallback */}
                {!parsedDesc && viewingAlert.description && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Description</Label>
                    <div className="mt-1 p-3 bg-muted/50 rounded-md text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {viewingAlert.description}
                    </div>
                  </div>
                )}

                {/* Footer metadata */}
                <div className="flex items-center justify-end pt-3 border-t text-xs text-muted-foreground">
                  <span>Synced: {viewingAlert.updatedAt ? formatDateTime(viewingAlert.updatedAt) : '-'}</span>
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingAlert(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Risk Tag Editor Dialog */}
      <Dialog open={!!editingOuTags} onOpenChange={(open) => { if (!open) setEditingOuTags(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Risk Tags</DialogTitle>
            <DialogDescription>
              Assign risk tags to <strong>{editingOuTags?.orgUnitPath}</strong> to flag security policy exceptions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Risk Tags</Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {OU_RISK_TAG_OPTIONS.map(tag => (
                  <div key={tag} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tag-${tag}`}
                      checked={editingTags.includes(tag)}
                      onCheckedChange={(checked) => {
                        setEditingTags(prev => checked ? [...prev, tag] : prev.filter(t => t !== tag))
                      }}
                    />
                    <label htmlFor={`tag-${tag}`} className="text-xs cursor-pointer">{tag}</label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea
                value={editingNotes}
                onChange={e => setEditingNotes(e.target.value)}
                placeholder="Additional context about this OU's security exceptions..."
                rows={3}
                className="mt-1 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOuTags(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingOuTags) {
                  updateRiskTagsMutation.mutate({
                    ouId: editingOuTags.id,
                    riskTags: editingTags,
                    riskNotes: editingNotes,
                  })
                }
              }}
              disabled={updateRiskTagsMutation.isPending}
            >
              {updateRiskTagsMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Save Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog - Two-pane layout */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="w-[95vw] max-w-3xl p-0 gap-0">
          <DialogHeader className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between">
              <DialogTitle>Google Workspace Settings</DialogTitle>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setShowSettings(false); setShowHelp(true) }}>
                <HelpCircle className="h-4 w-4 mr-1" /> Setup Guide
              </Button>
            </div>
            <DialogDescription>Configure Google Workspace API access for this organization.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:divide-x border-t">
            {/* Left Pane - Credentials */}
            <div className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Credentials</h3>

              {/* Service Account Key */}
              <div>
                <label className="text-sm font-medium">Service Account JSON Key</label>
                <div className={`mt-1.5 flex items-center gap-2 border rounded-md px-3 py-2.5 ${saKeyValid === true ? 'border-green-400 bg-green-50' : saKeyValid === false ? 'border-red-400 bg-red-50' : 'bg-muted/30'}`}>
                  <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm truncate flex-1">
                    {saKeyValid === true
                      ? (saFileName || 'Key loaded')
                      : configData?.hasServiceAccountKey
                        ? 'Key configured'
                        : 'No key uploaded'}
                  </span>
                  <label className="cursor-pointer shrink-0">
                    <input type="file" accept=".json,application/json" onChange={handleFileUpload} className="hidden" />
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 transition-colors">
                      <Upload className="h-3 w-3" /> {configData?.hasServiceAccountKey || saKeyValid === true ? 'Replace' : 'Upload'}
                    </span>
                  </label>
                </div>
                {saKeyValid === true && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Valid service account JSON</p>
                )}
                {saKeyValid === false && saKeyError && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><XCircle className="h-3 w-3" /> {saKeyError}</p>
                )}
                {saKeyValid === null && configData?.hasServiceAccountKey && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Upload new file to replace</p>
                )}
                {saKeyValid === null && !configData?.hasServiceAccountKey && (
                  <p className="text-xs text-muted-foreground mt-1">Upload JSON key from Google Cloud Console. <button className="underline text-blue-600" onClick={() => { setShowSettings(false); setShowHelp(true) }}>Need help?</button></p>
                )}
              </div>

              {/* Admin Email */}
              <div>
                <label className="text-sm font-medium">Admin Email <span className="text-red-500">*</span></label>
                <Input
                  type="email"
                  placeholder="admin@yourdomain.com"
                  value={adminEmail}
                  onChange={e => { setAdminEmail(e.target.value); setConnTestResult(null) }}
                  onBlur={() => setAdminEmailTouched(true)}
                  className={`mt-1.5 ${adminEmailTouched && !adminEmail ? 'border-red-400' : adminEmailTouched && adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) ? 'border-red-400' : ''}`}
                />
                {adminEmailTouched && !adminEmail && (
                  <p className="text-xs text-red-600 mt-1">Admin email is required</p>
                )}
                {adminEmailTouched && adminEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) && (
                  <p className="text-xs text-red-600 mt-1">Enter a valid email address</p>
                )}
                {(!adminEmailTouched || (adminEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail))) && (
                  <p className="text-xs text-muted-foreground mt-1">Super admin for domain-wide delegation</p>
                )}
              </div>

              {/* Domain */}
              <div>
                <label className="text-sm font-medium">Domain <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  type="text"
                  placeholder="Auto-detected from admin email"
                  value={gwDomain}
                  onChange={e => setGwDomain(e.target.value)}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty to auto-detect</p>
              </div>
            </div>

            {/* Right Pane - Connection & Schedule */}
            <div className="p-5 space-y-4 border-t md:border-t-0">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Connection & Schedule</h3>

              {/* Test Connection */}
              <div className="border rounded-md p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Zap className="h-4 w-4" /> Test Connection
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTestConnection}
                    disabled={connTesting || (!saKey.trim() && !configData?.hasServiceAccountKey) || !adminEmail || (!!saKey.trim() && saKeyValid !== true)}
                    className="h-7 text-xs"
                  >
                    {connTesting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}
                    {connTesting ? 'Testing...' : 'Test'}
                  </Button>
                </div>
                {connTestResult && (
                  <div className={`mt-2 p-2 rounded text-xs ${connTestResult.valid ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                    <div className="flex items-center gap-1.5 font-medium">
                      {connTestResult.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                      {connTestResult.valid ? 'Connection successful' : 'Connection failed'}
                    </div>
                    {connTestResult.valid && (
                      <div className="mt-1 space-y-0.5 text-green-600">
                        {connTestResult.clientEmail && <div>SA: {connTestResult.clientEmail}</div>}
                        {connTestResult.projectId && <div>Project: {connTestResult.projectId}</div>}
                        {connTestResult.latency && <div>Latency: {connTestResult.latency}ms</div>}
                      </div>
                    )}
                    {!connTestResult.valid && connTestResult.error && (
                      <div className="mt-1">{connTestResult.error}</div>
                    )}
                  </div>
                )}
                {!connTestResult && (
                  <p className="text-xs text-muted-foreground mt-1.5">Verifies credentials and admin delegation</p>
                )}
              </div>

              {/* Scan Schedule */}
              <div>
                <label className="text-sm font-medium">Scan Schedule</label>
                <Select value={gwSchedule} onValueChange={setGwSchedule}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30 18 * * *">Daily at midnight IST</SelectItem>
                    <SelectItem value="30 0,6,12,18 * * *">Every 6 hours IST</SelectItem>
                    <SelectItem value="30 6,18 * * *">Every 12 hours IST</SelectItem>
                    <SelectItem value="30 18 * * 6">Weekly (Sunday midnight IST)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Indian Standard Time (UTC+5:30)</p>
              </div>

              {/* Enable toggle */}
              <div className="flex items-center gap-2">
                <Checkbox checked={gwEnabled} onCheckedChange={(v) => setGwEnabled(!!v)} id="gw-enabled" />
                <label htmlFor="gw-enabled" className="text-sm">Enable automatic scanning</label>
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setAdminEmailTouched(true)
                if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) return
                if (!saKey && !configData?.hasServiceAccountKey) return
                if (saKey.trim() && saKeyValid !== true) return
                saveConfigMutation.mutate()
              }}
              disabled={saveConfigMutation.isPending || connTesting}
            >
              {(saveConfigMutation.isPending || connTesting) ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {connTesting ? 'Verifying...' : saveConfigMutation.isPending ? 'Saving...' : 'Test & Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Setup Help Dialog */}
      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5 text-blue-500" /> Google Workspace Setup Guide</DialogTitle>
            <DialogDescription>Follow these steps to configure Google Workspace monitoring with a service account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5 text-sm overflow-y-auto pr-2">
            {/* Step 1 */}
            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
                Create a Google Cloud Project
              </h3>
              <ol className="list-decimal pl-8 space-y-1 text-muted-foreground">
                <li>Go to <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="h-3 w-3" /></a></li>
                <li>Create a new project or select an existing one</li>
              </ol>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                Enable Required APIs
              </h3>
              <p className="text-muted-foreground pl-8">Enable these APIs in your Google Cloud project:</p>
              <ul className="list-disc pl-12 space-y-0.5 text-muted-foreground">
                <li><strong>Admin SDK API</strong> — User, Group, Device, Token management</li>
                <li><strong>Google Workspace Alert Center API</strong> — Security alerts</li>
                <li><strong>Groups Settings API</strong> — Group security settings</li>
              </ul>
              <p className="text-muted-foreground pl-8 text-xs">Go to <em>APIs & Services &gt; Library</em> and search for each API to enable it.</p>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">3</span>
                Create a Service Account
              </h3>
              <ol className="list-decimal pl-8 space-y-1 text-muted-foreground">
                <li>Go to <em>IAM & Admin &gt; Service Accounts</em></li>
                <li>Click <strong>Create Service Account</strong></li>
                <li>Give it a name (e.g., "ISMS Workspace Audit")</li>
                <li>No additional roles needed at the project level</li>
                <li>Click <strong>Done</strong></li>
              </ol>
            </div>

            {/* Step 4 */}
            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">4</span>
                Create & Download JSON Key
              </h3>
              <ol className="list-decimal pl-8 space-y-1 text-muted-foreground">
                <li>Click on the service account you created</li>
                <li>Go to the <strong>Keys</strong> tab</li>
                <li>Click <strong>Add Key &gt; Create new key</strong></li>
                <li>Select <strong>JSON</strong> and click <strong>Create</strong></li>
                <li>A JSON file will be downloaded — paste its <strong>full contents</strong> in the Settings dialog</li>
              </ol>
            </div>

            {/* Step 5 */}
            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">5</span>
                Configure Domain-Wide Delegation
              </h3>
              <ol className="list-decimal pl-8 space-y-1 text-muted-foreground">
                <li>On the service account details page, copy the <strong>Client ID</strong> (numeric)</li>
                <li>Go to <a href="https://admin.google.com/ac/owl/domainwidedelegation" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline inline-flex items-center gap-0.5">Google Admin Console &gt; Security &gt; API Controls &gt; Domain-wide Delegation <ExternalLink className="h-3 w-3" /></a></li>
                <li>Click <strong>Add new</strong></li>
                <li>Paste the Client ID</li>
                <li>Add the following OAuth scopes (copy all at once):</li>
              </ol>
              <div className="ml-8 relative">
                <div className="bg-gray-50 border rounded-md p-3 font-mono text-xs overflow-x-auto max-h-40 overflow-y-auto">
                  {REQUIRED_SCOPES.map((s, i) => (
                    <div key={i} className={`flex items-start gap-2 py-0.5 ${s.isNew ? 'bg-amber-50 -mx-1 px-1 rounded' : ''}`}>
                      <span className="text-gray-900 break-all">{s.scope}</span>
                      <span className={`text-[10px] whitespace-nowrap ${s.isNew ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                        — {s.purpose}{s.isNew ? ' (NEW)' : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2 h-7 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(REQUIRED_SCOPES.map(s => s.scope).join(','))
                    setCopiedScope('all')
                    setTimeout(() => setCopiedScope(''), 2000)
                  }}
                >
                  {copiedScope === 'all' ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                  {copiedScope === 'all' ? 'Copied!' : 'Copy All'}
                </Button>
              </div>
              <ol className="list-decimal pl-8 space-y-1 text-muted-foreground" start={6}>
                <li>Click <strong>Authorize</strong></li>
              </ol>
            </div>

            {/* Step 6 */}
            <div className="space-y-2">
              <h3 className="font-semibold text-base flex items-center gap-2">
                <span className="bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">6</span>
                Enter Configuration
              </h3>
              <ul className="list-disc pl-8 space-y-1 text-muted-foreground">
                <li><strong>Service Account JSON Key</strong> — Paste the full JSON file you downloaded in Step 4</li>
                <li><strong>Admin Email</strong> — A <strong>Super Admin</strong> email in your Google Workspace domain (the service account impersonates this user)</li>
                <li><strong>Domain</strong> — Optional, auto-detected from admin email</li>
              </ul>
            </div>

            {/* Troubleshooting */}
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1.5">
              <h4 className="font-semibold text-amber-800 flex items-center gap-1"><AlertTriangle className="h-4 w-4" /> Troubleshooting</h4>
              <ul className="list-disc pl-5 space-y-1 text-amber-700 text-xs">
                <li><strong>Invalid credentials error</strong> — Ensure the admin email is a Super Admin, not just a regular admin</li>
                <li><strong>403 Forbidden</strong> — Domain-wide delegation may not be configured correctly. Double-check the Client ID and scopes</li>
                <li><strong>API not enabled</strong> — Some features (like Alert Center) require their API to be explicitly enabled in Google Cloud Console</li>
                <li><strong>Delegation takes time</strong> — After configuring domain-wide delegation, it can take up to 24 hours to propagate (usually 5-15 minutes)</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowHelp(false)}>Close</Button>
            <Button onClick={() => { setShowHelp(false); setShowSettings(true) }}>
              <Settings2 className="h-4 w-4 mr-1" /> Open Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
