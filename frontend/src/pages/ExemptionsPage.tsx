import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Plus,
  Loader2,
  Search,
  Filter,
  ShieldOff,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Eye,
  History,
  MoreHorizontal,
  Pencil,
  SendHorizontal,
  Ban,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  FileCheck,
} from 'lucide-react'

// ============================================
// CONSTANTS
// ============================================

const EXEMPTION_TYPE_OPTIONS = [
  { value: 'FULL', label: 'Full Exemption' },
  { value: 'PARTIAL', label: 'Partial Deviation' },
]

const EXEMPTION_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300', icon: CheckCircle2 },
  EXPIRED: { label: 'Expired', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300', icon: XCircle },
  REVOKED: { label: 'Revoked', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300', icon: Ban },
  UNDER_REVIEW: { label: 'Under Review', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300', icon: Clock },
}

const APPROVAL_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300' },
  PENDING_FIRST_APPROVAL: { label: '1st Approval', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
  PENDING_SECOND_APPROVAL: { label: '2nd Approval', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' },
}

const INITIAL_FORM = {
  title: '',
  controlId: '',
  frameworkId: '',
  exemptionType: 'FULL',
  justification: '',
  riskAcceptance: '',
  compensatingControls: '',
  validFrom: '',
  validUntil: '',
  reviewDate: '',
  comments: '',
}

// ============================================
// HELPERS
// ============================================

function isExpired(validUntil: string | Date): boolean {
  return new Date(validUntil) <= new Date()
}

function isExpiringSoon(validUntil: string | Date): boolean {
  const now = new Date()
  const expiry = new Date(validUntil)
  const thirtyDays = new Date()
  thirtyDays.setDate(thirtyDays.getDate() + 30)
  return expiry > now && expiry <= thirtyDays
}

function getEffectiveStatus(exemption: any): string {
  if (exemption.status === 'ACTIVE' && isExpired(exemption.validUntil)) {
    return 'EXPIRED'
  }
  return exemption.status
}

// ============================================
// COMPONENT
// ============================================

export function ExemptionsPage() {
  const navigate = useNavigate()
  const { currentOrganizationId, user, hasPermission } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Role checks
  const userMembership = user?.organizationMemberships?.find(
    (m: any) => m.organizationId === currentOrganizationId
  )
  const userOrgRole = userMembership?.role || user?.role || 'VIEWER'
  const canEdit = hasPermission('exemptions', 'edit')
  const canApprove = hasPermission('exemptions', 'approve')
  const canApproveFirst = ['LOCAL_ADMIN', 'ADMIN'].includes(userOrgRole) || user?.role === 'ADMIN'
  const canApproveSecond = userOrgRole === 'ADMIN' || user?.role === 'ADMIN'

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [approvalFilter, setApprovalFilter] = useState('')
  const [frameworkFilter, setFrameworkFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)

  // Dialog state
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [isVersionsOpen, setIsVersionsOpen] = useState(false)
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [isRevokeOpen, setIsRevokeOpen] = useState(false)
  const [isRenewOpen, setIsRenewOpen] = useState(false)
  const [isApprovalOpen, setIsApprovalOpen] = useState(false)
  const [approvalLevel, setApprovalLevel] = useState<1 | 2>(1)

  // Form state
  const [selectedExemption, setSelectedExemption] = useState<any>(null)
  const [formData, setFormData] = useState({ ...INITIAL_FORM })
  const [approvalComments, setApprovalComments] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [revokeReason, setRevokeReason] = useState('')
  const [renewData, setRenewData] = useState({ validUntil: '', reviewDate: '', justification: '', comments: '' })

  const activeFilterCount = [search, statusFilter, approvalFilter, frameworkFilter, typeFilter].filter(Boolean).length

  // ============================================
  // QUERIES
  // ============================================

  const { data: response, isLoading } = useQuery({
    queryKey: ['exemptions', currentOrganizationId, search, statusFilter, approvalFilter, frameworkFilter, typeFilter, page, limit],
    queryFn: () =>
      api.exemptions.list(currentOrganizationId!, {
        search: search || undefined,
        status: statusFilter || undefined,
        approvalStatus: approvalFilter || undefined,
        frameworkId: frameworkFilter || undefined,
        exemptionType: typeFilter || undefined,
        page,
        limit,
      }),
    enabled: !!currentOrganizationId,
  })

  const { data: stats } = useQuery({
    queryKey: ['exemption-stats', currentOrganizationId],
    queryFn: () => api.exemptions.stats(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const { data: controls } = useQuery({
    queryKey: ['controls-for-exemption', currentOrganizationId],
    queryFn: () => api.controls.list(currentOrganizationId!, { limit: 500 }),
    enabled: !!currentOrganizationId,
  })

  const { data: frameworks } = useQuery({
    queryKey: ['frameworks'],
    queryFn: () => api.frameworks.list(),
  })

  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ['exemption-versions', selectedExemption?.id],
    queryFn: () => api.exemptions.getVersions(selectedExemption!.id),
    enabled: !!selectedExemption?.id && isVersionsOpen,
  })

  const exemptions = response?.data || []
  const pagination = response?.pagination

  // Group controls by framework for the selector
  const controlsByFramework = useMemo(() => {
    if (!controls) return {}
    const grouped: Record<string, any[]> = {}
    controls.forEach((c: any) => {
      const fw = c.framework?.shortName || 'Other'
      if (!grouped[fw]) grouped[fw] = []
      grouped[fw].push(c)
    })
    return grouped
  }, [controls])

  // ============================================
  // MUTATIONS
  // ============================================

  const invalidateExemptions = () => {
    queryClient.invalidateQueries({ queryKey: ['exemptions'] })
    queryClient.invalidateQueries({ queryKey: ['exemption-stats'] })
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.exemptions.update(id, data),
    onSuccess: () => {
      toast({ title: 'Exemption updated' })
      invalidateExemptions()
      setIsEditOpen(false)
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Failed to update exemption', variant: 'destructive' })
    },
  })

  const submitForReviewMutation = useMutation({
    mutationFn: (id: string) => api.exemptions.submitForReview(id),
    onSuccess: (data: any) => {
      toast({ title: 'Submitted for review', description: data?.message })
      invalidateExemptions()
      setIsDetailOpen(false)
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Failed to submit', variant: 'destructive' })
    },
  })

  const firstApprovalMutation = useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) => api.exemptions.firstApproval(id, comments),
    onSuccess: (data: any) => {
      toast({ title: '1st level approved', description: data?.message })
      invalidateExemptions()
      setIsApprovalOpen(false)
      setIsDetailOpen(false)
      setApprovalComments('')
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Failed to approve', variant: 'destructive' })
    },
  })

  const secondApprovalMutation = useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) => api.exemptions.secondApproval(id, comments),
    onSuccess: (data: any) => {
      toast({ title: 'Exemption approved', description: data?.message })
      invalidateExemptions()
      setIsApprovalOpen(false)
      setIsDetailOpen(false)
      setApprovalComments('')
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Failed to approve', variant: 'destructive' })
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.exemptions.reject(id, reason),
    onSuccess: (data: any) => {
      toast({ title: 'Exemption rejected', description: data?.message })
      invalidateExemptions()
      setIsRejectOpen(false)
      setIsDetailOpen(false)
      setRejectReason('')
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Failed to reject', variant: 'destructive' })
    },
  })

  const revokeMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.exemptions.revoke(id, reason),
    onSuccess: (data: any) => {
      toast({ title: 'Exemption revoked', description: data?.message })
      invalidateExemptions()
      setIsRevokeOpen(false)
      setIsDetailOpen(false)
      setRevokeReason('')
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Failed to revoke', variant: 'destructive' })
    },
  })

  const renewMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.exemptions.renew(id, data),
    onSuccess: (data: any) => {
      toast({ title: 'Renewal submitted', description: data?.message })
      invalidateExemptions()
      setIsRenewOpen(false)
      setIsDetailOpen(false)
      setRenewData({ validUntil: '', reviewDate: '', justification: '', comments: '' })
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Failed to renew', variant: 'destructive' })
    },
  })

  // ============================================
  // HANDLERS
  // ============================================

  const handleUpdate = () => {
    if (!selectedExemption) return
    updateMutation.mutate({
      id: selectedExemption.id,
      data: {
        ...formData,
        frameworkId: formData.frameworkId || undefined,
        validFrom: formData.validFrom || undefined,
        reviewDate: formData.reviewDate || undefined,
      },
    })
  }

  const openEdit = (exemption: any) => {
    setSelectedExemption(exemption)
    setFormData({
      title: exemption.title || '',
      controlId: exemption.controlId || '',
      frameworkId: exemption.frameworkId || '',
      exemptionType: exemption.exemptionType || 'FULL',
      justification: exemption.justification || '',
      riskAcceptance: exemption.riskAcceptance || '',
      compensatingControls: exemption.compensatingControls || '',
      validFrom: exemption.validFrom ? new Date(exemption.validFrom).toISOString().split('T')[0] : '',
      validUntil: exemption.validUntil ? new Date(exemption.validUntil).toISOString().split('T')[0] : '',
      reviewDate: exemption.reviewDate ? new Date(exemption.reviewDate).toISOString().split('T')[0] : '',
      comments: exemption.comments || '',
    })
    setIsEditOpen(true)
  }

  const openDetail = (exemption: any) => {
    setSelectedExemption(exemption)
    setIsDetailOpen(true)
  }

  const openApproval = (level: 1 | 2) => {
    setApprovalLevel(level)
    setApprovalComments('')
    setIsApprovalOpen(true)
  }

  const openRenew = () => {
    setRenewData({
      validUntil: '',
      reviewDate: '',
      justification: selectedExemption?.justification || '',
      comments: '',
    })
    setIsRenewOpen(true)
  }

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setApprovalFilter('')
    setFrameworkFilter('')
    setTypeFilter('')
    setPage(1)
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Control Exemptions</h1>
          <p className="text-muted-foreground">
            Manage control exemption requests, approvals, and renewals
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => navigate('/exemptions/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Request Exemption
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">All exemptions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.active || 0}</div>
            <p className="text-xs text-muted-foreground">Currently in effect</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{stats?.pendingApproval || 0}</div>
            <p className="text-xs text-muted-foreground">Awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.expiringSoon || 0}</div>
            <p className="text-xs text-muted-foreground">Within 30 days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.expired || 0}</div>
            <p className="text-xs text-muted-foreground">Past validity</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, ID, or control..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                  <SelectItem value="REVOKED">Revoked</SelectItem>
                </SelectContent>
              </Select>
              <Select value={approvalFilter || 'all'} onValueChange={(v) => { setApprovalFilter(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Approval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Approvals</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_FIRST_APPROVAL">Pending 1st</SelectItem>
                  <SelectItem value="PENDING_SECOND_APPROVAL">Pending 2nd</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 items-center">
              <Select value={frameworkFilter || 'all'} onValueChange={(v) => { setFrameworkFilter(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Framework" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Frameworks</SelectItem>
                  {(frameworks || []).map((fw: any) => (
                    <SelectItem key={fw.id} value={fw.id}>{fw.shortName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={typeFilter || 'all'} onValueChange={(v) => { setTypeFilter(v === 'all' ? '' : v); setPage(1) }}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="FULL">Full Exemption</SelectItem>
                  <SelectItem value="PARTIAL">Partial Deviation</SelectItem>
                </SelectContent>
              </Select>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground hover:text-foreground">
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Clear filters ({activeFilterCount})
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Exemptions</CardTitle>
          <CardDescription>
            {pagination ? `${pagination.total} exemption${pagination.total !== 1 ? 's' : ''} found` : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">ID</TableHead>
                    <TableHead>Control</TableHead>
                    <TableHead className="min-w-[200px]">Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exemptions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <ShieldOff className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                        <p className="text-muted-foreground">No exemptions found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {activeFilterCount > 0
                            ? 'Try adjusting your filters'
                            : 'Click "Request Exemption" to create one'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    exemptions.map((ex: any) => {
                      const effectiveStatus = getEffectiveStatus(ex)
                      const statusConfig = EXEMPTION_STATUS_CONFIG[effectiveStatus] || EXEMPTION_STATUS_CONFIG.UNDER_REVIEW
                      const approvalConfig = APPROVAL_STATUS_CONFIG[ex.approvalStatus] || APPROVAL_STATUS_CONFIG.DRAFT
                      const StatusIcon = statusConfig.icon
                      const expired = isExpired(ex.validUntil)
                      const expiringSoon = !expired && isExpiringSoon(ex.validUntil)

                      return (
                        <TableRow
                          key={ex.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => openDetail(ex)}
                        >
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">{ex.exemptionId}</span>
                          </TableCell>
                          <TableCell>
                            <div className="text-xs">
                              <span className="font-mono text-muted-foreground">{ex.control?.controlId}</span>
                              <p className="text-foreground truncate max-w-[180px]">{ex.control?.name}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium truncate max-w-[250px] block">{ex.title}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {ex.exemptionType === 'FULL' ? 'Full' : 'Partial'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <StatusIcon className={cn('h-3.5 w-3.5', {
                                'text-green-500': effectiveStatus === 'ACTIVE',
                                'text-red-500': effectiveStatus === 'EXPIRED',
                                'text-gray-500': effectiveStatus === 'REVOKED',
                                'text-blue-500': effectiveStatus === 'UNDER_REVIEW',
                              })} />
                              <span className="text-sm">{statusConfig.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={cn('text-xs font-normal', approvalConfig.color)} variant="secondary">
                              {approvalConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className={cn('text-sm whitespace-nowrap', {
                              'text-red-600 font-medium': expired,
                              'text-yellow-600 font-medium': expiringSoon,
                            })}>
                              {formatDate(ex.validUntil)}
                              {expired && (
                                <Badge variant="destructive" className="ml-1.5 text-[10px] px-1 py-0">Expired</Badge>
                              )}
                              {expiringSoon && (
                                <Badge className="ml-1.5 text-[10px] px-1 py-0 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" variant="secondary">Soon</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {ex.requestedBy?.firstName} {ex.requestedBy?.lastName}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(ex) }}>
                                  <Eye className="mr-2 h-4 w-4" /> View Details
                                </DropdownMenuItem>
                                {canEdit && (ex.approvalStatus === 'DRAFT' || ex.approvalStatus === 'REJECTED') && (
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(ex) }}>
                                    <Pencil className="mr-2 h-4 w-4" /> Edit
                                  </DropdownMenuItem>
                                )}
                                {canEdit && (ex.approvalStatus === 'DRAFT' || ex.approvalStatus === 'REJECTED') && (
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); submitForReviewMutation.mutate(ex.id) }}>
                                    <SendHorizontal className="mr-2 h-4 w-4" /> Submit for Review
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedExemption(ex); setIsVersionsOpen(true) }}>
                                  <History className="mr-2 h-4 w-4" /> Version History
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && pagination.totalPages > 0 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">Rows:</span>
                      <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1) }}>
                        <SelectTrigger className="w-[70px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[10, 20, 50, 100].map((size) => (
                            <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                      </Button>
                      <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>
                        Next <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ============================================ */}
      {/* EDIT DIALOG */}
      {/* ============================================ */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Exemption {selectedExemption?.exemptionId}</DialogTitle>
            <DialogDescription>
              Update the exemption details. Changes will reset approval if currently approved.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Exemption Type *</Label>
                <Select value={formData.exemptionType} onValueChange={(v) => setFormData({ ...formData, exemptionType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXEMPTION_TYPE_OPTIONS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Control *</Label>
              <Select value={formData.controlId} onValueChange={(v) => {
                const control = controls?.find((c: any) => c.id === v)
                setFormData({ ...formData, controlId: v, frameworkId: control?.frameworkId || formData.frameworkId })
              }}>
                <SelectTrigger><SelectValue placeholder="Select a control..." /></SelectTrigger>
                <SelectContent>
                  {Object.entries(controlsByFramework).map(([fw, ctrls]) => (
                    <div key={fw}>
                      <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{fw}</div>
                      {(ctrls as any[]).map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.controlId} - {c.name}</SelectItem>
                      ))}
                    </div>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Business Justification *</Label>
              <Textarea
                value={formData.justification}
                onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Risk Acceptance</Label>
              <Textarea
                value={formData.riskAcceptance}
                onChange={(e) => setFormData({ ...formData, riskAcceptance: e.target.value })}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label>Compensating Controls</Label>
              <Textarea
                value={formData.compensatingControls}
                onChange={(e) => setFormData({ ...formData, compensatingControls: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Valid From</Label>
                <Input type="date" value={formData.validFrom} onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valid Until *</Label>
                <Input type="date" value={formData.validUntil} onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Review Date</Label>
                <Input type="date" value={formData.reviewDate} onChange={(e) => setFormData({ ...formData, reviewDate: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button
              onClick={handleUpdate}
              disabled={!formData.title || !formData.controlId || !formData.justification || !formData.validUntil || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* DETAIL DIALOG */}
      {/* ============================================ */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Exemption Details</DialogTitle>
          {selectedExemption && (() => {
            const effectiveStatus = getEffectiveStatus(selectedExemption)
            const statusConfig = EXEMPTION_STATUS_CONFIG[effectiveStatus] || EXEMPTION_STATUS_CONFIG.UNDER_REVIEW
            const approvalConfig = APPROVAL_STATUS_CONFIG[selectedExemption.approvalStatus] || APPROVAL_STATUS_CONFIG.DRAFT
            const StatusIcon = statusConfig.icon
            const expired = isExpired(selectedExemption.validUntil)
            const expiringSoon = !expired && isExpiringSoon(selectedExemption.validUntil)

            return (
              <>
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted border">{selectedExemption.exemptionId}</span>
                        <Badge variant="outline" className="text-xs">
                          {selectedExemption.exemptionType === 'FULL' ? 'Full Exemption' : 'Partial Deviation'}
                        </Badge>
                        <Badge className="text-xs" variant="outline">v{selectedExemption.version?.toFixed(1)}</Badge>
                      </div>
                      <h2 className="text-lg font-semibold leading-tight">{selectedExemption.title}</h2>
                    </div>
                  </div>
                  {/* Status badges */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className={cn('inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full border', statusConfig.color)}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusConfig.label}
                      {expired && effectiveStatus === 'EXPIRED' && selectedExemption.status === 'ACTIVE' && (
                        <span className="text-[10px]">(auto)</span>
                      )}
                    </div>
                    <Badge className={cn('text-xs', approvalConfig.color)} variant="secondary">
                      {approvalConfig.label}
                    </Badge>
                    {expiringSoon && (
                      <Badge className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" variant="secondary">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Expiring Soon
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Body - Split View */}
                <div className="grid grid-cols-5 divide-x max-h-[calc(90vh-160px)] overflow-hidden">
                  {/* Left Panel (2/5) */}
                  <div className="col-span-2 p-5 overflow-y-auto space-y-5">
                    {/* Control Info */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Control</h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950">
                            <ShieldOff className="h-4 w-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Control ID</p>
                            <p className="text-sm font-medium">{selectedExemption.control?.controlId}</p>
                          </div>
                        </div>
                        <div className="pl-11">
                          <p className="text-sm">{selectedExemption.control?.name}</p>
                        </div>
                        {selectedExemption.framework && (
                          <div className="pl-11">
                            <p className="text-xs text-muted-foreground">Framework</p>
                            <p className="text-sm">{selectedExemption.framework.shortName || selectedExemption.framework.name}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dates */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Validity</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 dark:bg-green-950">
                            <Calendar className="h-4 w-4 text-green-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Valid From</p>
                            <p className="text-sm font-medium">{selectedExemption.validFrom ? formatDate(selectedExemption.validFrom) : 'Not set'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={cn('flex items-center justify-center w-8 h-8 rounded-lg', {
                            'bg-red-50 dark:bg-red-950': expired,
                            'bg-yellow-50 dark:bg-yellow-950': expiringSoon,
                            'bg-gray-50 dark:bg-gray-800': !expired && !expiringSoon,
                          })}>
                            <Calendar className={cn('h-4 w-4', {
                              'text-red-500': expired,
                              'text-yellow-500': expiringSoon,
                              'text-gray-500': !expired && !expiringSoon,
                            })} />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Valid Until</p>
                            <p className={cn('text-sm font-medium', {
                              'text-red-600': expired,
                              'text-yellow-600': expiringSoon,
                            })}>
                              {formatDate(selectedExemption.validUntil)}
                              {expired && ' (Expired)'}
                              {expiringSoon && ' (Expiring Soon)'}
                            </p>
                          </div>
                        </div>
                        {selectedExemption.reviewDate && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950">
                              <RefreshCw className="h-4 w-4 text-purple-500" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Review Date</p>
                              <p className="text-sm font-medium">{formatDate(selectedExemption.reviewDate)}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Requested By */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Requested By</h4>
                      <p className="text-sm">
                        {selectedExemption.requestedBy?.firstName} {selectedExemption.requestedBy?.lastName}
                      </p>
                      {selectedExemption.requestedBy?.email && (
                        <p className="text-xs text-muted-foreground">{selectedExemption.requestedBy.email}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Created: {formatDate(selectedExemption.createdAt)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Actions</h4>
                      <div className="space-y-2">
                        {canEdit && (selectedExemption.approvalStatus === 'DRAFT' || selectedExemption.approvalStatus === 'REJECTED') && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => openEdit(selectedExemption)}
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" /> Edit Exemption
                            </Button>
                            <Button
                              size="sm"
                              className="w-full justify-start"
                              onClick={() => submitForReviewMutation.mutate(selectedExemption.id)}
                              disabled={submitForReviewMutation.isPending}
                            >
                              {submitForReviewMutation.isPending
                                ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                                : <SendHorizontal className="mr-2 h-3.5 w-3.5" />}
                              Submit for Review
                            </Button>
                          </>
                        )}

                        {canApproveFirst && selectedExemption.approvalStatus === 'PENDING_FIRST_APPROVAL' && (
                          <Button
                            size="sm"
                            className="w-full justify-start bg-green-600 hover:bg-green-700"
                            onClick={() => openApproval(1)}
                          >
                            <FileCheck className="mr-2 h-3.5 w-3.5" /> Approve (1st Level)
                          </Button>
                        )}

                        {canApproveSecond && selectedExemption.approvalStatus === 'PENDING_SECOND_APPROVAL' && (
                          <Button
                            size="sm"
                            className="w-full justify-start bg-green-600 hover:bg-green-700"
                            onClick={() => openApproval(2)}
                          >
                            <FileCheck className="mr-2 h-3.5 w-3.5" /> Approve (2nd Level)
                          </Button>
                        )}

                        {canApprove && ['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'].includes(selectedExemption.approvalStatus) && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => { setRejectReason(''); setIsRejectOpen(true) }}
                          >
                            <XCircle className="mr-2 h-3.5 w-3.5" /> Reject
                          </Button>
                        )}

                        {canApprove && selectedExemption.status === 'ACTIVE' && selectedExemption.approvalStatus === 'APPROVED' && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => { setRevokeReason(''); setIsRevokeOpen(true) }}
                          >
                            <Ban className="mr-2 h-3.5 w-3.5" /> Revoke Exemption
                          </Button>
                        )}

                        {canEdit && (expired || expiringSoon) && selectedExemption.status !== 'REVOKED' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start border-yellow-300 text-yellow-700 hover:bg-yellow-50 dark:border-yellow-800 dark:text-yellow-400 dark:hover:bg-yellow-950"
                            onClick={openRenew}
                          >
                            <RefreshCw className="mr-2 h-3.5 w-3.5" /> Renew Exemption
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => setIsVersionsOpen(true)}
                        >
                          <History className="mr-2 h-3.5 w-3.5" /> Version History ({selectedExemption._count?.versions || 0})
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Right Panel (3/5) */}
                  <div className="col-span-3 p-5 overflow-y-auto space-y-5">
                    {/* Justification */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Business Justification</h4>
                      <div className="rounded-lg border p-4 bg-muted/20">
                        <p className="text-sm whitespace-pre-wrap">{selectedExemption.justification}</p>
                      </div>
                    </div>

                    {/* Risk Acceptance */}
                    {selectedExemption.riskAcceptance && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Risk Acceptance</h4>
                        <div className="rounded-lg border border-orange-200 dark:border-orange-900 p-4 bg-orange-50/50 dark:bg-orange-950/30">
                          <p className="text-sm whitespace-pre-wrap">{selectedExemption.riskAcceptance}</p>
                        </div>
                      </div>
                    )}

                    {/* Compensating Controls */}
                    {selectedExemption.compensatingControls && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Compensating Controls</h4>
                        <div className="rounded-lg border border-green-200 dark:border-green-900 p-4 bg-green-50/50 dark:bg-green-950/30">
                          <p className="text-sm whitespace-pre-wrap">{selectedExemption.compensatingControls}</p>
                        </div>
                      </div>
                    )}

                    {/* Control Details */}
                    {selectedExemption.control?.description && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Control Description</h4>
                        <div className="rounded-lg border p-4 bg-muted/20">
                          <p className="text-xs text-muted-foreground mb-1">{selectedExemption.control.controlId} - {selectedExemption.control.name}</p>
                          <p className="text-sm">{selectedExemption.control.description}</p>
                        </div>
                      </div>
                    )}

                    {/* Comments */}
                    {selectedExemption.comments && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Comments</h4>
                        <div className="rounded-lg border p-4 bg-muted/20">
                          <p className="text-sm whitespace-pre-wrap">{selectedExemption.comments}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* APPROVAL DIALOG */}
      {/* ============================================ */}
      <Dialog open={isApprovalOpen} onOpenChange={setIsApprovalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {approvalLevel === 1 ? '1st Level Approval' : '2nd Level Approval (Final)'}
            </DialogTitle>
            <DialogDescription>
              {approvalLevel === 1
                ? 'Grant first level approval for this exemption request.'
                : 'Grant final approval. The exemption will become active.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Exemption</p>
              <p className="text-sm font-medium">{selectedExemption?.exemptionId} - {selectedExemption?.title}</p>
            </div>
            <div className="space-y-2">
              <Label>Comments (optional)</Label>
              <Textarea
                placeholder="Add approval comments..."
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApprovalOpen(false)}>Cancel</Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (approvalLevel === 1) {
                  firstApprovalMutation.mutate({ id: selectedExemption.id, comments: approvalComments || undefined })
                } else {
                  secondApprovalMutation.mutate({ id: selectedExemption.id, comments: approvalComments || undefined })
                }
              }}
              disabled={firstApprovalMutation.isPending || secondApprovalMutation.isPending}
            >
              {(firstApprovalMutation.isPending || secondApprovalMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* REJECT DIALOG */}
      {/* ============================================ */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Reject Exemption</DialogTitle>
            <DialogDescription>
              Reject this exemption request and send it back for revision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Exemption</p>
              <p className="text-sm font-medium">{selectedExemption?.exemptionId} - {selectedExemption?.title}</p>
            </div>
            <div className="space-y-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                placeholder="Explain why this exemption is being rejected..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate({ id: selectedExemption.id, reason: rejectReason })}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
            >
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* REVOKE DIALOG */}
      {/* ============================================ */}
      <Dialog open={isRevokeOpen} onOpenChange={setIsRevokeOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Revoke Exemption</DialogTitle>
            <DialogDescription>
              Revoke this active exemption. The control will need to be fully implemented.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-red-200 dark:border-red-900 p-3 bg-red-50/50 dark:bg-red-950/30">
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">Warning</p>
              <p className="text-sm text-red-700 dark:text-red-300">
                Revoking this exemption means the organization must implement {selectedExemption?.control?.controlId} fully. This action cannot be undone.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Revocation Reason *</Label>
              <Textarea
                placeholder="Explain why this exemption is being revoked..."
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRevokeOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => revokeMutation.mutate({ id: selectedExemption.id, reason: revokeReason })}
              disabled={!revokeReason.trim() || revokeMutation.isPending}
            >
              {revokeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Ban className="mr-2 h-4 w-4" />
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* RENEW DIALOG */}
      {/* ============================================ */}
      <Dialog open={isRenewOpen} onOpenChange={setIsRenewOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Renew Exemption</DialogTitle>
            <DialogDescription>
              Extend the validity of this exemption. The renewal requires re-approval.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Exemption</p>
              <p className="text-sm font-medium">{selectedExemption?.exemptionId} - {selectedExemption?.title}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Current expiry: {selectedExemption?.validUntil ? formatDate(selectedExemption.validUntil) : '-'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>New Valid Until *</Label>
                <Input
                  type="date"
                  value={renewData.validUntil}
                  onChange={(e) => setRenewData({ ...renewData, validUntil: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>New Review Date</Label>
                <Input
                  type="date"
                  value={renewData.reviewDate}
                  onChange={(e) => setRenewData({ ...renewData, reviewDate: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Updated Justification</Label>
              <Textarea
                placeholder="Update the justification if needed..."
                value={renewData.justification}
                onChange={(e) => setRenewData({ ...renewData, justification: e.target.value })}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Comments</Label>
              <Textarea
                placeholder="Reason for renewal..."
                value={renewData.comments}
                onChange={(e) => setRenewData({ ...renewData, comments: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenewOpen(false)}>Cancel</Button>
            <Button
              onClick={() => renewMutation.mutate({
                id: selectedExemption.id,
                data: {
                  validUntil: renewData.validUntil,
                  reviewDate: renewData.reviewDate || undefined,
                  justification: renewData.justification || undefined,
                  comments: renewData.comments || undefined,
                },
              })}
              disabled={!renewData.validUntil || renewMutation.isPending}
            >
              {renewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <RefreshCw className="mr-2 h-4 w-4" />
              Submit Renewal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* VERSION HISTORY DIALOG */}
      {/* ============================================ */}
      <Dialog open={isVersionsOpen} onOpenChange={setIsVersionsOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Version History - {selectedExemption?.exemptionId}
            </DialogTitle>
            <DialogDescription>
              Complete audit trail of changes and approvals.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {versionsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !versions || versions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No version history available.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Version</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v: any) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          v{v.version?.toFixed(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={cn('text-xs', {
                            'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300':
                              v.action.includes('Approval') || v.action === '2nd Level Approval',
                            'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300':
                              v.action === 'Rejected' || v.action === 'Revoked',
                            'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300':
                              v.action === 'Submitted for Review',
                            'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300':
                              v.action === 'Renewal Request',
                          })}
                        >
                          {v.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm">{v.actor}</p>
                          {v.actorDesignation && (
                            <p className="text-xs text-muted-foreground">{v.actorDesignation}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm text-muted-foreground line-clamp-2">{v.changeDescription}</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(v.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
