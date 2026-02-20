import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, soaApi, organizationApi, reportApi } from '@/lib/api'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import {
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FileDown,
  Pencil,
  SendHorizontal,
  FileCheck,
  AlertTriangle,
  Shield,
  FileText,
  User,
  ShieldCheck,
  Activity,
  UserCog,
  BookOpen,
  FileSymlink,
  MessageSquareText,
  Info,
  Save,
  X,
  CircleDot,
  Trash2,
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

const VERSION_ACTION_COLORS: Record<string, string> = {
  'Draft & Review': 'bg-gray-100 text-gray-800',
  'Submitted for Review': 'bg-blue-100 text-blue-800',
  '1st Level Approval': 'bg-green-100 text-green-800',
  '2nd Level Approval': 'bg-green-100 text-green-800',
  'Updation': 'bg-amber-100 text-amber-800',
  'Rejected': 'bg-red-100 text-red-800',
}

// ============================================
// MAIN COMPONENT
// ============================================

export function SoAPage() {
  const { user, currentOrganizationId } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  // User role
  const userMembership = user?.organizationMemberships?.find(
    (m: any) => m.organizationId === currentOrganizationId
  )
  const userOrgRole = userMembership?.role || user?.role || 'USER'
  const isGlobalAdmin = user?.role === 'ADMIN'
  const canEdit = ['ADMIN', 'LOCAL_ADMIN', 'AUDITOR'].includes(userOrgRole)

  // State
  const [activeTab, setActiveTab] = useState('soa')
  const [activeCategory, setActiveCategory] = useState('A5_ORGANIZATIONAL')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedEntry, setSelectedEntry] = useState<any>(null)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isApprovalOpen, setIsApprovalOpen] = useState(false)
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [isSubmitOpen, setIsSubmitOpen] = useState(false)
  const [isNewRevisionOpen, setIsNewRevisionOpen] = useState(false)
  const [isDiscardRevisionOpen, setIsDiscardRevisionOpen] = useState(false)
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null)
  const [editingDescription, setEditingDescription] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [submitChangeDescription, setSubmitChangeDescription] = useState('')
  const [submitVersionBump, setSubmitVersionBump] = useState<'none' | 'minor' | 'major'>('none')
  const [revisionChangeDescription, setRevisionChangeDescription] = useState('')
  const [revisionVersionBump, setRevisionVersionBump] = useState<'minor' | 'major'>('minor')

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
    queryKey: ['soa', currentOrganizationId, search, statusFilter],
    queryFn: () =>
      api.soa.list(currentOrganizationId!, {
        search: search || undefined,
        status: statusFilter || undefined,
      }),
    enabled: !!currentOrganizationId,
  })

  const soaEntries = soaResponse?.data || []
  const stats = soaResponse?.stats || {}

  const { data: soaDoc } = useQuery({
    queryKey: ['soa-document', currentOrganizationId],
    queryFn: () => api.soa.getDocument(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const { data: docVersions } = useQuery({
    queryKey: ['soa-document-versions', currentOrganizationId],
    queryFn: () => api.soa.getDocumentVersions(currentOrganizationId!),
    enabled: !!currentOrganizationId && (activeTab === 'versions' || activeTab === 'approvals'),
  })

  // Get org members for reviewer/approver assignment
  const { data: orgMembers } = useQuery({
    queryKey: ['org-members-for-soa', currentOrganizationId],
    queryFn: async () => {
      const response = await organizationApi.get(currentOrganizationId!)
      return response.data?.data?.members?.map((m: any) => ({
        id: m.user.id,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        email: m.user.email,
        avatar: m.user.avatar,
        role: m.role,
        designation: m.user.designation,
      })) || []
    },
    enabled: !!currentOrganizationId && activeTab === 'approvals',
  })

  // ============================================
  // MUTATIONS
  // ============================================

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['soa'] })
    queryClient.invalidateQueries({ queryKey: ['soa-document'] })
    queryClient.invalidateQueries({ queryKey: ['soa-document-versions'] })
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

  const updateDocMutation = useMutation({
    mutationFn: (data: any) => api.soa.updateDocument(currentOrganizationId!, data),
    onSuccess: () => {
      invalidateAll()
      toast({ title: 'Document settings updated' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || err.response?.data?.message || 'Failed to update', variant: 'destructive' }),
  })

  const submitForReviewMutation = useMutation({
    mutationFn: (params: { changeDescription: string; versionBump: 'none' | 'minor' | 'major' }) =>
      api.soa.submitForReview(currentOrganizationId!, params.changeDescription, params.versionBump),
    onSuccess: (res) => {
      invalidateAll()
      setIsSubmitOpen(false)
      setSubmitChangeDescription('')
      setSubmitVersionBump('none')
      toast({ title: res.message || 'Submitted for 1st level approval' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || err.response?.data?.message || 'Failed to submit', variant: 'destructive' }),
  })

  const firstApprovalMutation = useMutation({
    mutationFn: (comments?: string) =>
      api.soa.firstApproval(currentOrganizationId!, comments),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.message || '1st level approval granted' })
      setIsApprovalOpen(false)
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || err.response?.data?.message || 'Failed to approve', variant: 'destructive' }),
  })

  const secondApprovalMutation = useMutation({
    mutationFn: (comments?: string) =>
      api.soa.secondApproval(currentOrganizationId!, comments),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.message || 'SoA fully approved' })
      setIsApprovalOpen(false)
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || err.response?.data?.message || 'Failed to approve', variant: 'destructive' }),
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      api.soa.reject(currentOrganizationId!, reason),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.message || 'SoA rejected' })
      setIsRejectOpen(false)
      setRejectReason('')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || err.response?.data?.message || 'Failed to reject', variant: 'destructive' }),
  })

  const newRevisionMutation = useMutation({
    mutationFn: (params: { changeDescription: string; versionBump: 'minor' | 'major' }) =>
      api.soa.newRevision(currentOrganizationId!, params.changeDescription, params.versionBump),
    onSuccess: (res) => {
      invalidateAll()
      setIsNewRevisionOpen(false)
      setRevisionChangeDescription('')
      setRevisionVersionBump('minor')
      toast({ title: res.message || 'New revision started' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || err.response?.data?.message || 'Failed to create revision', variant: 'destructive' }),
  })

  const updateVersionDescriptionMutation = useMutation({
    mutationFn: ({ versionId, changeDescription }: { versionId: string; changeDescription: string }) =>
      api.soa.updateVersionDescription(versionId, changeDescription),
    onSuccess: () => {
      invalidateAll()
      setEditingVersionId(null)
      toast({ title: 'Description updated' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || err.response?.data?.message || 'Failed to update description', variant: 'destructive' }),
  })

  const discardRevisionMutation = useMutation({
    mutationFn: () => api.soa.discardRevision(currentOrganizationId!),
    onSuccess: (res) => {
      invalidateAll()
      setIsDiscardRevisionOpen(false)
      toast({ title: res.message || 'Revision discarded' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || err.response?.data?.message || 'Failed to discard revision', variant: 'destructive' }),
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

  const handleExportPDF = async () => {
    try {
      const blob = await reportApi.soa(currentOrganizationId!, 'pdf')
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'statement-of-applicability.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast({ title: 'SoA exported as PDF' })
    } catch {
      toast({ title: 'Failed to export PDF', variant: 'destructive' })
    }
  }

  const submitApproval = () => {
    if (soaDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL') {
      firstApprovalMutation.mutate(undefined)
    } else if (soaDoc?.approvalStatus === 'PENDING_SECOND_APPROVAL') {
      secondApprovalMutation.mutate(undefined)
    }
  }

  const submitRejection = () => {
    if (!rejectReason) return
    rejectMutation.mutate(rejectReason)
  }

  // Group entries by category
  const groupedEntries = soaEntries.reduce((acc: any, entry: any) => {
    const cat = entry.control?.category || 'Unknown'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(entry)
    return acc
  }, {})

  const implementedPct = stats.applicable > 0
    ? Math.round((stats.implemented / stats.applicable) * 100)
    : 0

  const docApproval = getApprovalConfig(soaDoc?.approvalStatus || 'DRAFT')
  const DocApprovalIcon = docApproval.icon

  // Group versions by version number for merged display
  const groupedVersions: { version: number; entries: any[] }[] = []
  if (docVersions) {
    const versionMap = new Map<number, any[]>()
    docVersions.forEach((v: any) => {
      const key = v.version
      if (!versionMap.has(key)) versionMap.set(key, [])
      versionMap.get(key)!.push(v)
    })
    versionMap.forEach((entries, version) => {
      groupedVersions.push({ version, entries })
    })
    groupedVersions.sort((a, b) => b.version - a.version)
  }

  const canDiscardRevision = useMemo(() => {
    if (soaDoc?.approvalStatus !== 'DRAFT') return false
    if (!docVersions || docVersions.length === 0) return false
    const sorted = [...docVersions].sort((a: any, b: any) => b.version - a.version)
    const latest = sorted[0]
    if (latest.action !== 'Draft & Review') return false
    return sorted.some((v: any) => v.version < latest.version)
  }, [soaDoc, docVersions])

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
      <div className="flex items-center justify-between pr-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Statement of Applicability</h1>
          <p className="text-muted-foreground">
            ISO/IEC 27001:2022 Annex A Controls - Statement of Applicability
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={handleExportCSV}>
            <FileDown className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Document Info Bar */}
      {soaDoc && (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Identification</p>
                  <p className="text-sm font-mono font-semibold mt-1.5">{soaDoc.identification}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Version</p>
                <p className="text-sm font-mono font-bold mt-1.5">{soaDoc.version?.toFixed(1)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</p>
                <Badge className={cn('text-xs mt-1.5', docApproval.color)}>
                  <DocApprovalIcon className="mr-1 h-3 w-3" />
                  {docApproval.label}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Reviewer (1st Level)</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {soaDoc.reviewer ? (
                    <>
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={soaDoc.reviewer.avatar} />
                        <AvatarFallback className="text-[10px]">
                          {soaDoc.reviewer.firstName?.[0]}{soaDoc.reviewer.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{soaDoc.reviewer.firstName} {soaDoc.reviewer.lastName}</span>
                      {soaDoc.reviewer.designation && <span className="text-xs text-muted-foreground">({soaDoc.reviewer.designation})</span>}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Not assigned</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Approver (2nd Level)</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {soaDoc.approver ? (
                    <>
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={soaDoc.approver.avatar} />
                        <AvatarFallback className="text-[10px]">
                          {soaDoc.approver.firstName?.[0]}{soaDoc.approver.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{soaDoc.approver.firstName} {soaDoc.approver.lastName}</span>
                      {soaDoc.approver.designation && <span className="text-xs text-muted-foreground">({soaDoc.approver.designation})</span>}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Not assigned</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Classification</p>
                <Badge variant="outline" className={cn('text-xs mt-1.5',
                  soaDoc.classification === 'Confidential' ? 'bg-red-50 text-red-700 border-red-200' :
                  soaDoc.classification === 'Internal' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  soaDoc.classification === 'Public' ? 'bg-green-50 text-green-700 border-green-200' :
                  soaDoc.classification === 'Restricted' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                  'bg-gray-50 text-gray-700 border-gray-200'
                )}>
                  {soaDoc.classification}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Last Updated</p>
                <p className="text-sm mt-1.5">{formatDate(soaDoc.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="soa">Statement of Applicability</TabsTrigger>
          <TabsTrigger value="approvals">Review & Approval</TabsTrigger>
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
              </div>
            </CardContent>
          </Card>

          {/* Category Tabs */}
          <Tabs value={activeCategory} onValueChange={setActiveCategory}>
            <TabsList>
              {CATEGORIES.map((category) => {
                const entries = groupedEntries[category.id] || []
                const catImplemented = entries.filter((e: any) => e.isApplicable && e.status === 'IMPLEMENTED').length
                const catTotal = entries.length

                return (
                  <TabsTrigger key={category.id} value={category.id}>
                    {category.prefix} - {category.name}
                    <Badge variant="secondary" className="ml-2 text-xs font-mono px-1.5 py-0">
                      {catImplemented}/{catTotal}
                    </Badge>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            {CATEGORIES.map((category) => {
              const entries = groupedEntries[category.id] || []

              return (
                <TabsContent key={category.id} value={category.id} className="mt-4">
                  {entries.length === 0 ? (
                    <Card className="py-12">
                      <div className="text-center text-muted-foreground">
                        <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
                        <p>No controls found matching your filters</p>
                      </div>
                    </Card>
                  ) : (
                    <div className="overflow-x-auto relative border rounded-lg">
                      <div className="overflow-auto">
                            <table className="w-full text-sm border-collapse table-fixed" style={{ minWidth: '1400px' }}>
                              <thead>
                                <tr className="border-b bg-muted/50">
                                  <th className="sticky top-0 left-0 z-30 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium border-r" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                                    Control No
                                  </th>
                                  <th className="sticky top-0 z-30 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', left: '90px' }}>
                                    Control Name
                                  </th>
                                  <th className="sticky top-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[250px]">Control</th>
                                  <th className="sticky top-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[100px]">Source</th>
                                  <th className="sticky top-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[100px]">Applicable</th>
                                  <th className="sticky top-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[120px]">Status</th>
                                  <th className="sticky top-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[140px]">Control Owner</th>
                                  <th className="sticky top-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[200px]">Justification</th>
                                  <th className="sticky top-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[180px]">Documentation Ref</th>
                                  <th className="sticky top-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[150px]">Comments</th>
                                  <th className="sticky top-0 right-0 z-30 bg-muted/95 backdrop-blur px-3 py-3 text-right font-medium border-l shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]" style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {entries.map((entry: any) => {
                                  const statusOpt = getStatusOption(entry.status)

                                  return (
                                    <tr key={entry.id} className="border-b hover:bg-muted/30 transition-colors">
                                      <td className="sticky left-0 z-10 bg-background px-3 py-2.5 font-mono text-xs font-semibold border-r" style={{ width: '90px', minWidth: '90px', maxWidth: '90px' }}>
                                        {entry.control?.controlId}
                                      </td>
                                      <td className="sticky z-10 bg-background px-3 py-2.5 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" style={{ width: '200px', minWidth: '200px', maxWidth: '200px', left: '90px' }}>
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
                                        {canEdit ? (
                                          <Select
                                            value={entry.status}
                                            onValueChange={(v) => updateMutation.mutate({ id: entry.id, data: { status: v } })}
                                          >
                                            <SelectTrigger className={cn('h-6 text-[11px] w-[120px] border-0 shadow-none px-1.5 py-0 gap-0.5 rounded-full font-medium', statusOpt.color)}>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {STATUS_OPTIONS.map((opt) => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          <Badge className={cn('text-xs', statusOpt.color)}>
                                            {statusOpt.label}
                                          </Badge>
                                        )}
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
                                      <td className="sticky right-0 z-10 bg-background px-3 py-2.5 text-center border-l shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]" style={{ width: '60px', minWidth: '60px', maxWidth: '60px' }}>
                                        {canEdit && (
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEntryClick(entry)}>
                                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                      </div>
                    </div>
                  )}
                </TabsContent>
              )
            })}
          </Tabs>
        </TabsContent>

        {/* ============================================ */}
        {/* REVIEW & APPROVAL TAB                        */}
        {/* ============================================ */}
        <TabsContent value="approvals" className="space-y-4">
          {/* Document Approval Status */}
          <Card>
            <CardHeader>
              <CardTitle>Document Approval</CardTitle>
              <CardDescription>Manage the SoA document approval workflow and assign reviewer/approver</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current status */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Current Status</p>
                  <Badge className={cn('text-sm mt-1', docApproval.color)}>
                    <DocApprovalIcon className="mr-1.5 h-3.5 w-3.5" />
                    {docApproval.label}
                  </Badge>
                </div>
                <div className="border-l pl-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Version</p>
                  <p className="text-lg font-mono font-bold mt-0.5">{soaDoc?.version?.toFixed(1) || '0.1'}</p>
                </div>
              </div>

              {/* Reviewer / Approver assignment */}
              {canEdit && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reviewer (1st Level Approver)</Label>
                    <Select
                      value={soaDoc?.reviewerId || 'none'}
                      onValueChange={(v) => updateDocMutation.mutate({ reviewerId: v === 'none' ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Assign reviewer..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not assigned</SelectItem>
                        {(orgMembers || []).map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={m.avatar} />
                                <AvatarFallback className="text-[10px]">
                                  {(m.firstName?.[0] || '')}{(m.lastName?.[0] || '')}
                                </AvatarFallback>
                              </Avatar>
                              <span>{m.firstName} {m.lastName}</span>
                              <span className="text-muted-foreground text-xs">({m.designation || m.role})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Responsible for 1st level approval (typically COO/Local Admin)</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Approver (2nd Level Approver)</Label>
                    <Select
                      value={soaDoc?.approverId || 'none'}
                      onValueChange={(v) => updateDocMutation.mutate({ approverId: v === 'none' ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Assign approver..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not assigned</SelectItem>
                        {(orgMembers || []).map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={m.avatar} />
                                <AvatarFallback className="text-[10px]">
                                  {(m.firstName?.[0] || '')}{(m.lastName?.[0] || '')}
                                </AvatarFallback>
                              </Avatar>
                              <span>{m.firstName} {m.lastName}</span>
                              <span className="text-muted-foreground text-xs">({m.designation || m.role})</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Responsible for final approval (typically CEO/Admin)</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3 pt-2">
                {canEdit && (soaDoc?.approvalStatus === 'DRAFT' || soaDoc?.approvalStatus === 'REJECTED') && (
                  <Button
                    onClick={() => { setSubmitChangeDescription(''); setSubmitVersionBump('none'); setIsSubmitOpen(true) }}
                  >
                    <SendHorizontal className="mr-2 h-4 w-4" />
                    Submit for Review
                  </Button>
                )}

                {(isGlobalAdmin || user?.id === soaDoc?.reviewerId) && soaDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL' && (
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => setIsApprovalOpen(true)}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve (1st Level)
                  </Button>
                )}

                {(isGlobalAdmin || user?.id === soaDoc?.approverId) && soaDoc?.approvalStatus === 'PENDING_SECOND_APPROVAL' && (
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => setIsApprovalOpen(true)}
                  >
                    <FileCheck className="mr-2 h-4 w-4" />
                    Approve (2nd Level - Final)
                  </Button>
                )}

                {((soaDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL' && (isGlobalAdmin || user?.id === soaDoc?.reviewerId)) ||
                  (soaDoc?.approvalStatus === 'PENDING_SECOND_APPROVAL' && (isGlobalAdmin || user?.id === soaDoc?.approverId))) && (
                  <Button
                    variant="destructive"
                    onClick={() => { setRejectReason(''); setIsRejectOpen(true) }}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                )}

                {canEdit && soaDoc?.approvalStatus === 'APPROVED' && (
                  <Button
                    onClick={() => { setRevisionChangeDescription(''); setRevisionVersionBump('minor'); setIsNewRevisionOpen(true) }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Create New Revision
                  </Button>
                )}

                {canEdit && canDiscardRevision && (
                  <Button
                    variant="destructive"
                    onClick={() => setIsDiscardRevisionOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Discard Revision
                  </Button>
                )}
              </div>

              {/* Workflow diagram */}
              <div className="pt-2">
                <p className="text-xs font-medium text-muted-foreground mb-3">Approval Workflow</p>
                <div className="flex items-center gap-2 text-xs">
                  {['DRAFT', 'PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL', 'APPROVED'].map((step, i) => {
                    const cfg = getApprovalConfig(step)
                    const isActive = soaDoc?.approvalStatus === step
                    const isPast = ['DRAFT', 'PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL', 'APPROVED']
                      .indexOf(soaDoc?.approvalStatus || 'DRAFT') > i

                    return (
                      <div key={step} className="flex items-center gap-2">
                        {i > 0 && <span className={cn('text-muted-foreground', isPast && 'text-green-500')}>→</span>}
                        <span className={cn(
                          'px-2.5 py-1 rounded-full font-medium border',
                          isActive ? cn(cfg.color, 'ring-2 ring-offset-1 ring-primary/30') : isPast ? 'bg-green-50 text-green-700 border-green-200' : 'text-muted-foreground border-muted'
                        )}>
                          {cfg.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* VERSION HISTORY TAB                          */}
        {/* ============================================ */}
        <TabsContent value="versions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Version History</CardTitle>
                  <CardDescription>
                    Complete audit trail of changes and approvals for the SoA document
                  </CardDescription>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Current Version</p>
                  <p className="text-lg font-mono font-bold">{soaDoc?.version?.toFixed(1) || '0.1'}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!docVersions || docVersions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>No version history available yet.</p>
                  <p className="text-sm mt-1">Version entries are created when the SoA is edited or goes through approval.</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-blue-600 text-white">
                        <th className="px-4 py-3 text-left font-semibold w-[120px]">Version Number</th>
                        <th className="px-4 py-3 text-left font-semibold w-[120px]">Date</th>
                        <th className="px-4 py-3 text-left font-semibold">Description of Change</th>
                        <th className="px-4 py-3 text-left font-semibold w-[180px]">Actor</th>
                        <th className="px-4 py-3 text-left font-semibold w-[160px]">Action</th>
                        <th className="px-4 py-3 text-left font-semibold w-[140px]">Designation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedVersions.map((group) => (
                        group.entries.map((v: any, idx: number) => (
                          <tr key={v.id} className="border-b hover:bg-muted/30">
                            {idx === 0 ? (
                              <td
                                className="px-4 py-3 text-left font-mono font-bold align-top border-r"
                                rowSpan={group.entries.length}
                              >
                                {group.version.toFixed(1)}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-left text-muted-foreground whitespace-nowrap">
                              {formatDate(v.createdAt)}
                            </td>
                            <td className="px-4 py-3 text-left">
                              {editingVersionId === v.id ? (
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={editingDescription}
                                    onChange={(e) => setEditingDescription(e.target.value)}
                                    className="h-8 text-sm"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') updateVersionDescriptionMutation.mutate({ versionId: v.id, changeDescription: editingDescription })
                                      if (e.key === 'Escape') setEditingVersionId(null)
                                    }}
                                  />
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => updateVersionDescriptionMutation.mutate({ versionId: v.id, changeDescription: editingDescription })} disabled={!editingDescription.trim()}>
                                    <Save className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingVersionId(null)}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 group">
                                  <span>{v.changeDescription}</span>
                                  {canEdit && (
                                    <button
                                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                                      onClick={() => { setEditingVersionId(v.id); setEditingDescription(v.changeDescription) }}
                                    >
                                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-left font-medium">
                              {v.actor}
                            </td>
                            <td className="px-4 py-3 text-left">
                              <Badge className={cn('text-xs', VERSION_ACTION_COLORS[v.action] || 'bg-gray-100 text-gray-800')}>
                                {v.action}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-left text-muted-foreground">
                              {v.actorDesignation || '-'}
                            </td>
                          </tr>
                        ))
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============================================ */}
      {/* EDIT DIALOG                                  */}
      {/* ============================================ */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col p-0 gap-0">
          {/* Header with colored accent */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 rounded-t-lg">
            <div className="flex items-start gap-3">
              <div className="bg-white/20 rounded-lg p-2 mt-0.5">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-white text-lg font-semibold">
                    {selectedEntry?.control?.controlId} - {selectedEntry?.control?.name}
                  </DialogTitle>
                  <DialogDescription className="text-blue-100 text-xs leading-relaxed">
                    {selectedEntry?.control?.description}
                  </DialogDescription>
                </DialogHeader>
              </div>
            </div>
          </div>

          {/* Scrollable form content */}
          <div className="overflow-y-auto flex-1 px-6 py-5">
            <div className="space-y-6">

              {/* Section 1: Assessment */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="bg-emerald-100 rounded-md p-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Assessment</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 pl-8">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <CircleDot className="h-3 w-3 text-muted-foreground" />
                      Applicability
                    </Label>
                    <Select
                      value={formData.isApplicable ? 'true' : 'false'}
                      onValueChange={(v) => setFormData({ ...formData, isApplicable: v === 'true' })}
                    >
                      <SelectTrigger className={cn(
                        'h-9',
                        formData.isApplicable
                          ? 'border-green-200 bg-green-50/50'
                          : 'border-red-200 bg-red-50/50'
                      )}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">
                          <span className="flex items-center gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            Yes - Applicable
                          </span>
                        </SelectItem>
                        <SelectItem value="false">
                          <span className="flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                            No - Not Applicable
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Whether this control is relevant to your organization
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      Implementation Status
                    </Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) => setFormData({ ...formData, status: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="flex items-center gap-2">
                              <span className={cn('h-2 w-2 rounded-full', {
                                'bg-gray-400': opt.value === 'NOT_STARTED',
                                'bg-blue-500': opt.value === 'IN_PROGRESS',
                                'bg-green-500': opt.value === 'IMPLEMENTED',
                                'bg-slate-400': opt.value === 'NOT_APPLICABLE',
                              })} />
                              {opt.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Current implementation progress of this control
                    </p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed" />

              {/* Section 2: Ownership & Source */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="bg-violet-100 rounded-md p-1.5">
                    <UserCog className="h-3.5 w-3.5 text-violet-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Ownership & Source</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 pl-8">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      Control Owner
                    </Label>
                    <Input
                      className="h-9"
                      value={formData.controlOwner}
                      onChange={(e) => setFormData({ ...formData, controlOwner: e.target.value })}
                      placeholder="e.g., CISO, Head of TechOps"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Person or role responsible for this control
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <BookOpen className="h-3 w-3 text-muted-foreground" />
                      Control Source
                    </Label>
                    <Input
                      className="h-9"
                      value={formData.controlSource}
                      onChange={(e) => setFormData({ ...formData, controlSource: e.target.value })}
                      placeholder="Annex A ISO 27001:2022"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Standard or framework reference for this control
                    </p>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed" />

              {/* Section 3: Justification */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className={cn(
                    'rounded-md p-1.5',
                    formData.isApplicable ? 'bg-blue-100' : 'bg-amber-100'
                  )}>
                    <FileText className={cn(
                      'h-3.5 w-3.5',
                      formData.isApplicable ? 'text-blue-600' : 'text-amber-600'
                    )} />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Justification</h3>
                  {!formData.isApplicable && (
                    <Badge variant="outline" className="text-[10px] h-5 border-amber-300 bg-amber-50 text-amber-700">
                      Required for exclusions
                    </Badge>
                  )}
                </div>
                <div className="pl-8 space-y-1.5">
                  <Textarea
                    value={formData.justification}
                    onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                    placeholder={
                      formData.isApplicable
                        ? 'Explain how this control applies and how it is implemented in your organization...'
                        : 'Provide rationale for why this control is not applicable to your organization...'
                    }
                    rows={3}
                    className="resize-none"
                  />
                  <p className="text-[10px] text-muted-foreground flex items-start gap-1">
                    <Info className="h-3 w-3 mt-0.5 shrink-0" />
                    {formData.isApplicable
                      ? 'Describe the implementation approach, tools, and processes used to satisfy this control.'
                      : 'Auditors will review this justification. Provide clear reasoning for the exclusion.'}
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed" />

              {/* Section 4: Documentation & Notes */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="bg-sky-100 rounded-md p-1.5">
                    <FileSymlink className="h-3.5 w-3.5 text-sky-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground">Documentation & Notes</h3>
                </div>
                <div className="space-y-4 pl-8">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      Documentation References
                    </Label>
                    <Textarea
                      value={formData.documentationReferences}
                      onChange={(e) => setFormData({ ...formData, documentationReferences: e.target.value })}
                      placeholder="e.g., ISMS-POL-001, ISMS-PROC-003, Information Security Policy v2.1"
                      rows={2}
                      className="resize-none"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Reference IDs or names of policies, procedures, and supporting documents
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <MessageSquareText className="h-3 w-3 text-muted-foreground" />
                      Comments
                    </Label>
                    <Textarea
                      value={formData.comments}
                      onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                      placeholder="Additional notes, observations, or audit remarks..."
                      rows={2}
                      className="resize-none"
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-dashed" />

              {/* Section 5: Change Tracking */}
              <div className="bg-slate-50 rounded-lg p-4 -mx-1">
                <div className="flex items-center gap-2 mb-2">
                  <Pencil className="h-3.5 w-3.5 text-slate-500" />
                  <Label className="text-xs font-medium">Change Description</Label>
                </div>
                <Input
                  className="h-9 bg-white"
                  value={formData.changeDescription}
                  onChange={(e) => setFormData({ ...formData, changeDescription: e.target.value })}
                  placeholder="Briefly describe what was changed and why..."
                />
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  This will be recorded in the SoA version history for audit trail
                </p>
              </div>

            </div>
          </div>

          {/* Fixed footer */}
          <DialogFooter className="border-t bg-muted/30 px-6 py-3 flex-shrink-0 rounded-b-lg">
            <Button variant="outline" onClick={() => setIsEditOpen(false)} className="gap-1.5">
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="gap-1.5 bg-blue-600 hover:bg-blue-700">
              {updateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
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
              {soaDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL'
                ? '1st Level Approval'
                : '2nd Level Approval (Final)'}
            </DialogTitle>
            <DialogDescription>
              {soaDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL'
                ? 'Grant first level approval for the Statement of Applicability.'
                : 'Grant final approval. The SoA document will be marked as Approved.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Document</p>
              <p className="text-sm font-medium">{soaDoc?.identification} - {soaDoc?.title}</p>
              <p className="text-xs text-muted-foreground mt-1">Current version: {soaDoc?.version?.toFixed(1)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApprovalOpen(false)}>Cancel</Button>
            <Button
              onClick={submitApproval}
              className="bg-green-600 hover:bg-green-700"
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
      {/* REJECT DIALOG                                */}
      {/* ============================================ */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject SoA Document</DialogTitle>
            <DialogDescription>
              Reject the Statement of Applicability and send it back for revision.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Document</p>
              <p className="text-sm font-medium">{soaDoc?.identification} - {soaDoc?.title}</p>
            </div>
            <div className="grid gap-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why the SoA is being rejected..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Cancel</Button>
            <Button
              onClick={submitRejection}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              variant="destructive"
            >
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* SUBMIT FOR REVIEW DIALOG                     */}
      {/* ============================================ */}
      <Dialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit for Review</DialogTitle>
            <DialogDescription>
              Submit the SoA (v{soaDoc?.version?.toFixed(1)}) for the approval workflow. Provide a description of changes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Version Bump</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['none', 'minor', 'major'] as const).map((opt) => (
                  <Button
                    key={opt}
                    type="button"
                    variant={submitVersionBump === opt ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSubmitVersionBump(opt)}
                  >
                    {opt === 'none' ? 'Keep Current' : opt === 'minor' ? 'Minor' : 'Major'}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Current: v{soaDoc?.version?.toFixed(1)}
                {submitVersionBump !== 'none' && ` → ${submitVersionBump} bump`}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Description of Change *</Label>
              <Textarea
                value={submitChangeDescription}
                onChange={(e) => setSubmitChangeDescription(e.target.value)}
                placeholder="Describe what changed in this version..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitOpen(false)}>Cancel</Button>
            <Button
              onClick={() => submitForReviewMutation.mutate({ changeDescription: submitChangeDescription, versionBump: submitVersionBump })}
              disabled={!submitChangeDescription.trim() || submitForReviewMutation.isPending}
            >
              {submitForReviewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <SendHorizontal className="mr-2 h-4 w-4" />
              Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* NEW REVISION DIALOG                          */}
      {/* ============================================ */}
      <Dialog open={isNewRevisionOpen} onOpenChange={setIsNewRevisionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Revision</DialogTitle>
            <DialogDescription>
              Start a new revision of the approved SoA. Choose the version increment.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Current Approved Version</p>
              <p className="text-sm font-mono font-bold">{soaDoc?.version?.toFixed(1)}</p>
            </div>
            <div className="grid gap-2">
              <Label>Version Increment *</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRevisionVersionBump('minor')}
                  className={cn(
                    'rounded-lg border-2 p-3 text-left transition-all',
                    revisionVersionBump === 'minor'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-muted hover:border-muted-foreground/30'
                  )}
                >
                  <p className="text-sm font-medium">Minor</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {soaDoc?.version?.toFixed(1)} → {soaDoc ? (Math.floor(soaDoc.version) + (Math.round((soaDoc.version - Math.floor(soaDoc.version)) * 10) + 1) / 10).toFixed(1) : ''}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setRevisionVersionBump('major')}
                  className={cn(
                    'rounded-lg border-2 p-3 text-left transition-all',
                    revisionVersionBump === 'major'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-muted hover:border-muted-foreground/30'
                  )}
                >
                  <p className="text-sm font-medium">Major</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {soaDoc?.version?.toFixed(1)} → {soaDoc ? (Math.floor(soaDoc.version) + 1).toFixed(1) : ''}
                  </p>
                </button>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Description of Change *</Label>
              <Textarea
                value={revisionChangeDescription}
                onChange={(e) => setRevisionChangeDescription(e.target.value)}
                placeholder="Describe the reason for this new revision..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewRevisionOpen(false)}>Cancel</Button>
            <Button
              onClick={() => newRevisionMutation.mutate({ changeDescription: revisionChangeDescription, versionBump: revisionVersionBump })}
              disabled={!revisionChangeDescription.trim() || newRevisionMutation.isPending}
            >
              {newRevisionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Pencil className="mr-2 h-4 w-4" />
              Create Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* DISCARD REVISION DIALOG                      */}
      {/* ============================================ */}
      <Dialog open={isDiscardRevisionOpen} onOpenChange={setIsDiscardRevisionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard Revision?</DialogTitle>
            <DialogDescription>
              This will delete the current draft revision (v{soaDoc?.version?.toFixed(1)}) and revert the SoA document back to its previous APPROVED state.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3">
            <p className="text-sm text-destructive">
              The draft version entry will be removed from the version history. Changes made to individual SoA control entries will not be reverted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDiscardRevisionOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => discardRevisionMutation.mutate()}
              disabled={discardRevisionMutation.isPending}
            >
              {discardRevisionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Trash2 className="mr-2 h-4 w-4" />
              Discard Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
