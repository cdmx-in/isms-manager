import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, soaApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileDown,
  MoreHorizontal,
  Pencil,
  SendHorizontal,
  FileCheck,
  AlertTriangle,
  History,
  Shield,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================
// CONSTANTS
// ============================================

const STATUS_OPTIONS = [
  { value: 'NOT_STARTED', label: 'Not Started', color: 'bg-gray-100 text-gray-800' },
  { value: 'IN_PROGRESS', label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
  { value: 'IMPLEMENTED', label: 'Implemented', color: 'bg-green-100 text-green-800' },
  { value: 'NOT_APPLICABLE', label: 'Not Applicable', color: 'bg-slate-100 text-slate-600' },
]

const APPROVAL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: Clock },
  PENDING_FIRST_APPROVAL: { label: 'Pending 1st Approval', color: 'bg-amber-100 text-amber-800', icon: Clock },
  PENDING_SECOND_APPROVAL: { label: 'Pending 2nd Approval', color: 'bg-blue-100 text-blue-800', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
}

const CATEGORIES = [
  { id: 'A5_ORGANIZATIONAL', prefix: 'A.5', name: 'Organizational Controls', count: 37 },
  { id: 'A6_PEOPLE', prefix: 'A.6', name: 'People Controls', count: 8 },
  { id: 'A7_PHYSICAL', prefix: 'A.7', name: 'Physical Controls', count: 14 },
  { id: 'A8_TECHNOLOGICAL', prefix: 'A.8', name: 'Technological Controls', count: 34 },
]

const getApprovalConfig = (status: string) =>
  APPROVAL_STATUS_CONFIG[status] || APPROVAL_STATUS_CONFIG.DRAFT

const getStatusOption = (status: string) =>
  STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]

// ============================================
// MAIN COMPONENT
// ============================================

export function SoAPage() {
  const { user, currentOrganizationId } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // User role
  const userOrgRole = user?.organizationMemberships?.find(
    (m: any) => m.organizationId === currentOrganizationId
  )?.role || user?.role || 'USER'
  const canApproveFirst = ['LOCAL_ADMIN', 'ADMIN'].includes(userOrgRole)
  const canApproveSecond = userOrgRole === 'ADMIN'
  const canApprove = canApproveFirst || canApproveSecond

  // State
  const [activeTab, setActiveTab] = useState('soa')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [approvalFilter, setApprovalFilter] = useState<string>('')
  const [selectedEntry, setSelectedEntry] = useState<any>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isApprovalOpen, setIsApprovalOpen] = useState(false)
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [approvalComments, setApprovalComments] = useState('')
  const [rejectReason, setRejectReason] = useState('')

  const [formData, setFormData] = useState({
    isApplicable: true,
    justification: '',
    status: 'NOT_STARTED',
    controlOwner: '',
    documentationReferences: '',
    comments: '',
    controlSource: 'Annex A ISO 27001:2022',
    changeDescription: '',
  })

  // ============================================
  // QUERIES
  // ============================================

  const { data: soaResponse, isLoading } = useQuery({
    queryKey: ['soa', currentOrganizationId, search, categoryFilter, statusFilter, approvalFilter],
    queryFn: () =>
      api.soa.list(currentOrganizationId!, {
        search: search || undefined,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
        approvalStatus: approvalFilter || undefined,
      }),
    enabled: !!currentOrganizationId,
  })

  const soaEntries = soaResponse?.data || []
  const stats = soaResponse?.stats || {}


  const { data: pendingApprovals } = useQuery({
    queryKey: ['soa-pending-approvals', currentOrganizationId],
    queryFn: () => api.soa.pendingApprovals(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const { data: versions } = useQuery({
    queryKey: ['soa-versions', selectedEntry?.id],
    queryFn: () => api.soa.getVersions(selectedEntry!.id),
    enabled: !!selectedEntry?.id && isVersionHistoryOpen,
  })

  // ============================================
  // MUTATIONS
  // ============================================

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['soa'] })
    queryClient.invalidateQueries({ queryKey: ['soa-pending-approvals'] })
    queryClient.invalidateQueries({ queryKey: ['soa-versions'] })
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.soa.update(id, data),
    onSuccess: () => {
      invalidateAll()
      setIsEditOpen(false)
      toast({ title: 'SoA entry updated successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update SoA entry',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const submitForReviewMutation = useMutation({
    mutationFn: ({ id, desc }: { id: string; desc?: string }) =>
      api.soa.submitForReview(id, desc),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.message || 'Submitted for 1st level approval' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to submit', variant: 'destructive' }),
  })

  const firstApprovalMutation = useMutation({
    mutationFn: ({ id, comments }: { id: string; comments: string }) =>
      api.soa.firstApproval(id, comments),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.message || '1st level approval granted' })
      setIsApprovalOpen(false)
      setApprovalComments('')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to approve', variant: 'destructive' }),
  })

  const secondApprovalMutation = useMutation({
    mutationFn: ({ id, comments }: { id: string; comments: string }) =>
      api.soa.secondApproval(id, comments),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.message || 'SoA entry fully approved' })
      setIsApprovalOpen(false)
      setApprovalComments('')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to approve', variant: 'destructive' }),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.soa.reject(id, reason),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.message || 'SoA entry rejected' })
      setIsRejectOpen(false)
      setRejectReason('')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to reject', variant: 'destructive' }),
  })

  const bulkSubmitMutation = useMutation({
    mutationFn: () => api.soa.bulkSubmit(currentOrganizationId!),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.message || 'All draft entries submitted for review' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to bulk submit', variant: 'destructive' }),
  })

  // ============================================
  // HANDLERS
  // ============================================

  const handleEntryClick = (entry: any) => {
    setSelectedEntry(entry)
    setFormData({
      isApplicable: entry.isApplicable ?? true,
      justification: entry.justification || '',
      status: entry.status || 'NOT_STARTED',
      controlOwner: entry.controlOwner || '',
      documentationReferences: entry.documentationReferences || '',
      comments: entry.comments || '',
      controlSource: entry.controlSource || 'Annex A ISO 27001:2022',
      changeDescription: '',
    })
    setIsEditOpen(true)
  }

  const handleUpdate = () => {
    if (selectedEntry) {
      updateMutation.mutate({ id: selectedEntry.id, data: formData })
    }
  }

  const handleSubmitForReview = (entry: any) => {
    submitForReviewMutation.mutate({
      id: entry.id,
      desc: `Submitting ${entry.control?.controlId} for review`,
    })
  }

  const handleApproval = (entry: any) => {
    setSelectedEntry(entry)
    setApprovalComments('')
    setIsApprovalOpen(true)
  }

  const handleReject = (entry: any) => {
    setSelectedEntry(entry)
    setRejectReason('')
    setIsRejectOpen(true)
  }

  const submitApproval = () => {
    if (!selectedEntry) return
    if (selectedEntry.approvalStatus === 'PENDING_FIRST_APPROVAL') {
      firstApprovalMutation.mutate({ id: selectedEntry.id, comments: approvalComments })
    } else if (selectedEntry.approvalStatus === 'PENDING_SECOND_APPROVAL') {
      secondApprovalMutation.mutate({ id: selectedEntry.id, comments: approvalComments })
    }
  }

  const submitRejection = () => {
    if (!selectedEntry || !rejectReason) return
    rejectMutation.mutate({ id: selectedEntry.id, reason: rejectReason })
  }

  const handleExportCSV = async () => {
    try {
      const response = await soaApi.export(currentOrganizationId!, 'csv')
      const blob = new Blob([response.data], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'statement-of-applicability.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast({ title: 'SoA exported successfully' })
    } catch {
      toast({ title: 'Failed to export', variant: 'destructive' })
    }
  }

  // Group entries by category
  const groupedEntries = soaEntries.reduce((acc: any, entry: any) => {
    const cat = entry.control?.category || 'Unknown'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(entry)
    return acc
  }, {})

  const pendingCount = pendingApprovals?.length || 0
  const implementedPct = stats.applicable > 0
    ? Math.round((stats.implemented / stats.applicable) * 100)
    : 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Statement of Applicability</h1>
          <p className="text-muted-foreground">
            ISO/IEC 27001:2022 Annex A Controls - Statement of Applicability
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <FileDown className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Total Controls</p>
          <p className="text-2xl font-bold mt-1">{stats.total || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-green-600">Applicable</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{stats.applicable || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Not Applicable</p>
          <p className="text-2xl font-bold text-gray-500 mt-1">{stats.notApplicable || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-blue-600">Implemented</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{stats.implemented || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-amber-600">In Progress</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{stats.inProgress || 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Implementation</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl font-bold">{implementedPct}%</span>
            <Progress value={implementedPct} className="flex-1 h-2" />
          </div>
        </Card>
      </div>

      {/* Approval Banner */}
      {canApprove && pendingCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              {pendingCount} SoA entr{pendingCount > 1 ? 'ies' : 'y'} pending your approval
            </span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setActiveTab('approvals')}>
              Review Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="soa">Statement of Applicability</TabsTrigger>
          <TabsTrigger value="approvals" className="relative">
            Review & Approval
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs w-5 h-5">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="versions">Version History</TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* SOA TABLE TAB                                */}
        {/* ============================================ */}
        <TabsContent value="soa" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by control ID or name..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter || 'all'} onValueChange={(v) => setCategoryFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-[200px]">
                    <Filter className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.prefix} - {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={approvalFilter || 'all'} onValueChange={(v) => setApprovalFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Approvals" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Approvals</SelectItem>
                    {Object.entries(APPROVAL_STATUS_CONFIG).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* SoA Table with frozen columns */}
          {CATEGORIES.map((category) => {
            const entries = groupedEntries[category.id]
            if (!entries || entries.length === 0) return null

            const catApplicable = entries.filter((e: any) => e.isApplicable).length
            const catImplemented = entries.filter((e: any) => e.isApplicable && e.status === 'IMPLEMENTED').length

            return (
              <Card key={category.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">
                      {category.prefix} - {category.name}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{entries.length} controls</span>
                      <span>{catApplicable} applicable</span>
                      <span>{catImplemented} implemented</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto relative">
                    <div className="max-h-[500px] overflow-auto">
                      <table className="w-full text-sm border-collapse" style={{ minWidth: '1600px' }}>
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="sticky left-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[90px] border-r">
                              Control No
                            </th>
                            <th className="sticky left-[90px] z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[200px] border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                              Control Name
                            </th>
                            <th className="px-3 py-3 text-left font-medium w-[250px]">Control</th>
                            <th className="px-3 py-3 text-left font-medium w-[100px]">Source</th>
                            <th className="px-3 py-3 text-left font-medium w-[100px]">Applicable</th>
                            <th className="px-3 py-3 text-left font-medium w-[120px]">Status</th>
                            <th className="px-3 py-3 text-left font-medium w-[140px]">Control Owner</th>
                            <th className="px-3 py-3 text-left font-medium w-[200px]">Justification</th>
                            <th className="px-3 py-3 text-left font-medium w-[180px]">Documentation Ref</th>
                            <th className="px-3 py-3 text-left font-medium w-[150px]">Comments</th>
                            <th className="px-3 py-3 text-left font-medium w-[80px]">Version</th>
                            <th className="px-3 py-3 text-left font-medium w-[140px]">Approval</th>
                            <th className="px-3 py-3 text-right font-medium w-[60px]">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((entry: any) => {
                            const statusOpt = getStatusOption(entry.status)
                            const approval = getApprovalConfig(entry.approvalStatus)

                            return (
                              <tr key={entry.id} className="border-b hover:bg-muted/30 transition-colors">
                                <td className="sticky left-0 z-10 bg-background px-3 py-2.5 font-mono text-xs font-semibold border-r">
                                  {entry.control?.controlId}
                                </td>
                                <td className="sticky left-[90px] z-10 bg-background px-3 py-2.5 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                  <span className="font-medium text-sm line-clamp-2">{entry.control?.name}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="text-xs text-muted-foreground line-clamp-3">
                                    {entry.control?.description || '-'}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-xs">{entry.controlSource || 'Annex A'}</td>
                                <td className="px-3 py-2.5">
                                  {entry.isApplicable ? (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Yes</Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200">No</Badge>
                                  )}
                                </td>
                                <td className="px-3 py-2.5">
                                  <Badge className={cn('text-xs', statusOpt.color)}>
                                    {statusOpt.label}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2.5 text-xs">{entry.controlOwner || '-'}</td>
                                <td className="px-3 py-2.5">
                                  <span className="text-xs text-muted-foreground line-clamp-2">
                                    {entry.justification || '-'}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="text-xs text-muted-foreground line-clamp-2">
                                    {entry.documentationReferences || '-'}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="text-xs text-muted-foreground line-clamp-2">
                                    {entry.comments || '-'}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <span className="font-mono text-xs">{entry.version?.toFixed(1) || '0.1'}</span>
                                </td>
                                <td className="px-3 py-2.5">
                                  <Badge className={cn('text-xs', approval.color)}>
                                    {approval.label}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleEntryClick(entry)}>
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Edit
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      {(entry.approvalStatus === 'DRAFT' || entry.approvalStatus === 'REJECTED') && (
                                        <DropdownMenuItem onClick={() => handleSubmitForReview(entry)}>
                                          <SendHorizontal className="mr-2 h-4 w-4" />
                                          Submit for Review
                                        </DropdownMenuItem>
                                      )}
                                      {entry.approvalStatus === 'PENDING_FIRST_APPROVAL' && canApproveFirst && (
                                        <DropdownMenuItem onClick={() => handleApproval(entry)}>
                                          <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                          1st Level Approve
                                        </DropdownMenuItem>
                                      )}
                                      {entry.approvalStatus === 'PENDING_SECOND_APPROVAL' && canApproveSecond && (
                                        <DropdownMenuItem onClick={() => handleApproval(entry)}>
                                          <FileCheck className="mr-2 h-4 w-4 text-green-600" />
                                          2nd Level Approve
                                        </DropdownMenuItem>
                                      )}
                                      {['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'].includes(entry.approvalStatus) && canApprove && (
                                        <DropdownMenuItem onClick={() => handleReject(entry)}>
                                          <XCircle className="mr-2 h-4 w-4 text-red-600" />
                                          Reject
                                        </DropdownMenuItem>
                                      )}
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem onClick={() => {
                                        setSelectedEntry(entry)
                                        setIsVersionHistoryOpen(true)
                                      }}>
                                        <History className="mr-2 h-4 w-4" />
                                        Version History
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        {/* ============================================ */}
        {/* REVIEW & APPROVAL TAB                        */}
        {/* ============================================ */}
        <TabsContent value="approvals" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Review & Approval</CardTitle>
                  <CardDescription>SoA entries pending approval</CardDescription>
                </div>
                {stats.pendingApproval > 0 && (
                  <Button variant="outline" size="sm" onClick={() => bulkSubmitMutation.mutate()}>
                    <SendHorizontal className="mr-2 h-4 w-4" />
                    Submit All Drafts
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!pendingApprovals || pendingApprovals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No SoA entries pending approval</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Control No</TableHead>
                        <TableHead>Control Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Approval Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingApprovals.map((entry: any) => {
                        const approval = getApprovalConfig(entry.approvalStatus)
                        const statusOpt = getStatusOption(entry.status)
                        const catInfo = CATEGORIES.find(c => c.id === entry.control?.category)

                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="font-mono text-sm font-semibold">
                              {entry.control?.controlId}
                            </TableCell>
                            <TableCell className="font-medium">{entry.control?.name}</TableCell>
                            <TableCell className="text-sm">{catInfo?.name || entry.control?.category}</TableCell>
                            <TableCell>
                              <Badge className={cn('text-xs', statusOpt.color)}>{statusOpt.label}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{entry.controlOwner || '-'}</TableCell>
                            <TableCell>
                              <span className="font-mono text-xs">{entry.version?.toFixed(1)}</span>
                            </TableCell>
                            <TableCell>
                              <Badge className={cn('text-xs', approval.color)}>{approval.label}</Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {entry.approvalStatus === 'PENDING_FIRST_APPROVAL' && canApproveFirst && (
                                  <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleApproval(entry)}>
                                    <CheckCircle2 className="mr-1 h-3 w-3" />
                                    Approve
                                  </Button>
                                )}
                                {entry.approvalStatus === 'PENDING_SECOND_APPROVAL' && canApproveSecond && (
                                  <Button size="sm" variant="outline" className="text-green-600" onClick={() => handleApproval(entry)}>
                                    <FileCheck className="mr-1 h-3 w-3" />
                                    Final Approve
                                  </Button>
                                )}
                                {canApprove && (
                                  <Button size="sm" variant="outline" className="text-red-600" onClick={() => handleReject(entry)}>
                                    <XCircle className="mr-1 h-3 w-3" />
                                    Reject
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* VERSION HISTORY TAB                          */}
        {/* ============================================ */}
        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
              <CardDescription>
                Select an SoA entry from the main table to view its version history, or view all recent changes below.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Click "Version History" on any SoA entry to view its change log</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============================================ */}
      {/* EDIT DIALOG                                  */}
      {/* ============================================ */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedEntry?.control?.controlId} - {selectedEntry?.control?.name}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedEntry?.control?.description}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Applicability</Label>
                <Select
                  value={formData.isApplicable ? 'true' : 'false'}
                  onValueChange={(v) => setFormData({ ...formData, isApplicable: v === 'true' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Yes - Applicable</SelectItem>
                    <SelectItem value="false">No - Not Applicable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Implementation Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Control Owner</Label>
                <Input
                  value={formData.controlOwner}
                  onChange={(e) => setFormData({ ...formData, controlOwner: e.target.value })}
                  placeholder="e.g., CISO, Head of TechOps"
                />
              </div>
              <div className="grid gap-2">
                <Label>Control Source</Label>
                <Input
                  value={formData.controlSource}
                  onChange={(e) => setFormData({ ...formData, controlSource: e.target.value })}
                  placeholder="Annex A ISO 27001:2022"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Justification</Label>
              <Textarea
                value={formData.justification}
                onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                placeholder={
                  formData.isApplicable
                    ? 'Explain how this control applies and is implemented...'
                    : 'Explain why this control is not applicable...'
                }
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label>Documentation References</Label>
              <Textarea
                value={formData.documentationReferences}
                onChange={(e) => setFormData({ ...formData, documentationReferences: e.target.value })}
                placeholder="e.g., ISMS-POL-001, ISMS-PROC-003"
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label>Comments</Label>
              <Textarea
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                placeholder="Additional notes or comments..."
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label>Change Description</Label>
              <Input
                value={formData.changeDescription}
                onChange={(e) => setFormData({ ...formData, changeDescription: e.target.value })}
                placeholder="Describe what was changed and why..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* APPROVAL DIALOG                              */}
      {/* ============================================ */}
      <Dialog open={isApprovalOpen} onOpenChange={setIsApprovalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedEntry?.approvalStatus === 'PENDING_FIRST_APPROVAL'
                ? '1st Level Approval'
                : '2nd Level Approval (Final)'}
            </DialogTitle>
            <DialogDescription>
              Approve {selectedEntry?.control?.controlId} - {selectedEntry?.control?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Approval Comments (optional)</Label>
              <Textarea
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                placeholder="Add approval comments..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApprovalOpen(false)}>Cancel</Button>
            <Button onClick={submitApproval} className="bg-green-600 hover:bg-green-700">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* REJECT DIALOG                                */}
      {/* ============================================ */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject SoA Entry</DialogTitle>
            <DialogDescription>
              Reject {selectedEntry?.control?.controlId} - {selectedEntry?.control?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this entry is being rejected..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Cancel</Button>
            <Button
              onClick={submitRejection}
              disabled={!rejectReason.trim()}
              variant="destructive"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* VERSION HISTORY DIALOG                       */}
      {/* ============================================ */}
      <Dialog open={isVersionHistoryOpen} onOpenChange={setIsVersionHistoryOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Version History - {selectedEntry?.control?.controlId}
            </DialogTitle>
            <DialogDescription>
              {selectedEntry?.control?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {!versions || versions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No version history available</p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((version: any, idx: number) => (
                  <div key={version.id} className="flex gap-4 relative">
                    {idx < versions.length - 1 && (
                      <div className="absolute left-[15px] top-8 bottom-0 w-[2px] bg-border" />
                    )}
                    <div className="flex-shrink-0 mt-1">
                      <div className="w-[30px] h-[30px] rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {version.version.toFixed(1)}
                      </div>
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-sm">{version.action}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(version.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{version.changeDescription}</p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span>By: {version.actor}</span>
                        {version.actorDesignation && (
                          <Badge variant="outline" className="text-xs">{version.actorDesignation}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
