import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  History,
  ShieldCheck,
  Archive,
  SendHorizontal,
  CheckCircle2,
  XCircle,
  Clock,
  FileCheck,
  AlertTriangle,
  SlidersHorizontal,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axiosInstance from '@/lib/api'

// ============================================
// CONSTANTS
// ============================================

const PROBABILITY_LABELS = [
  { value: 1, label: 'Rare', color: 'bg-green-100 text-green-800' },
  { value: 2, label: 'Unlikely', color: 'bg-blue-100 text-blue-800' },
  { value: 3, label: 'Possible', color: 'bg-yellow-100 text-yellow-800' },
  { value: 4, label: 'Likely', color: 'bg-orange-100 text-orange-800' },
  { value: 5, label: 'Frequent', color: 'bg-red-100 text-red-800' },
]

const IMPACT_LABELS = [
  { value: 1, label: 'Incidental', color: 'bg-green-100 text-green-800' },
  { value: 2, label: 'Minor', color: 'bg-blue-100 text-blue-800' },
  { value: 3, label: 'Moderate', color: 'bg-yellow-100 text-yellow-800' },
  { value: 4, label: 'Major', color: 'bg-orange-100 text-orange-800' },
  { value: 5, label: 'Catastrophic', color: 'bg-red-100 text-red-800' },
]

const RISK_RESPONSE_TYPES = ['MITIGATE', 'ACCEPT', 'TRANSFER', 'AVOID']

const APPROVAL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: Clock },
  PENDING_FIRST_APPROVAL: { label: 'Pending 1st Approval', color: 'bg-amber-100 text-amber-800', icon: Clock },
  PENDING_SECOND_APPROVAL: { label: 'Pending 2nd Approval', color: 'bg-blue-100 text-blue-800', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
}

// ============================================
// HELPERS
// ============================================

const getRiskLevel = (score: number) => {
  if (score >= 20) return { label: 'Critical', color: 'bg-red-700 text-white' }
  if (score >= 15) return { label: 'High', color: 'bg-orange-600 text-white' }
  if (score >= 6) return { label: 'Medium', color: 'bg-yellow-600 text-white' }
  if (score >= 2) return { label: 'Low', color: 'bg-green-600 text-white' }
  return { label: 'Negligible', color: 'bg-gray-500 text-white' }
}

const getProbabilityLabel = (value: number) =>
  PROBABILITY_LABELS.find(p => p.value === value) || PROBABILITY_LABELS[2]

const getImpactLabel = (value: number) =>
  IMPACT_LABELS.find(i => i.value === value) || IMPACT_LABELS[2]

const getApprovalConfig = (status: string) =>
  APPROVAL_STATUS_CONFIG[status] || APPROVAL_STATUS_CONFIG.DRAFT

// ============================================
// MAIN COMPONENT
// ============================================

export default function RisksPage() {
  const { user, currentOrganizationId } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // Get user's org role
  const userOrgRole = user?.organizationMemberships?.find(
    m => m.organizationId === currentOrganizationId
  )?.role || user?.role || 'USER'

  const canApproveFirst = ['LOCAL_ADMIN', 'ADMIN'].includes(userOrgRole)
  const canApproveSecond = userOrgRole === 'ADMIN'
  const canApprove = canApproveFirst || canApproveSecond

  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('register')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isTreatmentOpen, setIsTreatmentOpen] = useState(false)
  const [isRetireOpen, setIsRetireOpen] = useState(false)
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false)
  const [isApprovalOpen, setIsApprovalOpen] = useState(false)
  const [isRejectOpen, setIsRejectOpen] = useState(false)
  const [selectedRisk, setSelectedRisk] = useState<any>(null)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    inherentProbability: 3,
    inherentImpact: 3,
    controlDescription: '',
    controlsReference: '',
    comments: '',
    changeDescription: '',
  })

  const [treatmentData, setTreatmentData] = useState({
    residualProbability: 3,
    residualImpact: 3,
    riskResponse: 'MITIGATE',
    controlDescription: '',
    controlImplementationDate: '',
    comments: '',
  })

  const [retireData, setRetireData] = useState({ reason: '' })
  const [approvalComments, setApprovalComments] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [submitDescription, setSubmitDescription] = useState('')

  // Column visibility toggles
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    riskId: true,
    title: true,
    owner: true,
    version: true,
    approval: true,
    inherentProb: false,
    inherentImpact: false,
    inherentRisk: true,
    treatment: true,
    controlDesc: false,
    residualProb: false,
    residualImpact: false,
    residualRisk: true,
    lastReviewed: false,
    actions: true,
  })

  const COLUMN_DEFS = useMemo(() => [
    { key: 'riskId', label: 'Risk ID', frozen: true, alwaysVisible: true },
    { key: 'title', label: 'Risk Item', frozen: true, alwaysVisible: true },
    { key: 'owner', label: 'Owner' },
    { key: 'version', label: 'Version' },
    { key: 'approval', label: 'Approval' },
    { key: 'inherentProb', label: 'Inherent Prob.' },
    { key: 'inherentImpact', label: 'Inherent Impact' },
    { key: 'inherentRisk', label: 'Inherent Risk' },
    { key: 'treatment', label: 'Treatment' },
    { key: 'controlDesc', label: 'Control Description' },
    { key: 'residualProb', label: 'Residual Prob.' },
    { key: 'residualImpact', label: 'Residual Impact' },
    { key: 'residualRisk', label: 'Residual Risk' },
    { key: 'lastReviewed', label: 'Last Reviewed' },
    { key: 'actions', label: 'Actions', alwaysVisible: true },
  ], [])

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ============================================
  // QUERIES
  // ============================================

  const { data: risks, isLoading } = useQuery({
    queryKey: ['risks', currentOrganizationId],
    queryFn: async () => {
      const response = await axiosInstance.get(`/risks?organizationId=${currentOrganizationId}&limit=200`)
      return response.data.data
    },
    enabled: !!currentOrganizationId,
  })

  const { data: treatments } = useQuery({
    queryKey: ['risk-treatments', selectedRisk?.id],
    queryFn: async () => {
      const response = await axiosInstance.get(`/risks/${selectedRisk.id}/treatment`)
      return response.data.data
    },
    enabled: !!selectedRisk?.id,
  })

  const { data: retiredRisks } = useQuery({
    queryKey: ['retired-risks', currentOrganizationId],
    queryFn: async () => {
      const response = await axiosInstance.get(`/risks/retired/list?organizationId=${currentOrganizationId}`)
      return response.data.data
    },
    enabled: !!currentOrganizationId,
  })

  const { data: versions } = useQuery({
    queryKey: ['risk-versions', selectedRisk?.id],
    queryFn: async () => {
      const response = await axiosInstance.get(`/risks/${selectedRisk.id}/versions`)
      return response.data.data
    },
    enabled: !!selectedRisk?.id && isVersionHistoryOpen,
  })

  const { data: pendingApprovals } = useQuery({
    queryKey: ['pending-approvals', currentOrganizationId],
    queryFn: async () => {
      const response = await axiosInstance.get(`/risks/pending-approvals/list?organizationId=${currentOrganizationId}`)
      return response.data.data
    },
    enabled: !!currentOrganizationId,
  })

  // ============================================
  // MUTATIONS
  // ============================================

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['risks'] })
    queryClient.invalidateQueries({ queryKey: ['pending-approvals'] })
    queryClient.invalidateQueries({ queryKey: ['risk-versions'] })
  }

  const createMutation = useMutation({
    mutationFn: async (data: any) => axiosInstance.post('/risks', { ...data, organizationId: currentOrganizationId }),
    onSuccess: () => {
      invalidateAll()
      toast({ title: 'Risk created successfully (v0.1 Draft)' })
      setIsCreateOpen(false)
      resetForm()
    },
    onError: () => toast({ title: 'Failed to create risk', variant: 'destructive' }),
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => axiosInstance.patch(`/risks/${id}`, data),
    onSuccess: () => {
      invalidateAll()
      toast({ title: 'Risk updated successfully' })
      setIsEditOpen(false)
    },
    onError: () => toast({ title: 'Failed to update risk', variant: 'destructive' }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => axiosInstance.delete(`/risks/${id}`),
    onSuccess: () => {
      invalidateAll()
      toast({ title: 'Risk deleted successfully' })
    },
    onError: () => toast({ title: 'Failed to delete risk', variant: 'destructive' }),
  })

  const treatmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => axiosInstance.post(`/risks/${id}/treatment`, data),
    onSuccess: () => {
      invalidateAll()
      queryClient.invalidateQueries({ queryKey: ['risk-treatments'] })
      toast({ title: 'Risk treatment created successfully' })
      setIsTreatmentOpen(false)
    },
    onError: () => toast({ title: 'Failed to create risk treatment', variant: 'destructive' }),
  })

  const retireMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => axiosInstance.post(`/risks/${id}/retire`, data),
    onSuccess: () => {
      invalidateAll()
      queryClient.invalidateQueries({ queryKey: ['retired-risks'] })
      toast({ title: 'Risk retired successfully' })
      setIsRetireOpen(false)
    },
    onError: () => toast({ title: 'Failed to retire risk', variant: 'destructive' }),
  })

  // Approval workflow mutations
  const submitForReviewMutation = useMutation({
    mutationFn: async ({ id, changeDescription }: { id: string; changeDescription: string }) =>
      axiosInstance.post(`/risks/${id}/submit-for-review`, { changeDescription }),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data.message || 'Risk submitted for 1st level approval' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to submit for review', variant: 'destructive' }),
  })

  const firstApprovalMutation = useMutation({
    mutationFn: async ({ id, comments }: { id: string; comments: string }) =>
      axiosInstance.post(`/risks/${id}/first-approval`, { comments }),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data.message || '1st level approval granted' })
      setIsApprovalOpen(false)
      setApprovalComments('')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to approve', variant: 'destructive' }),
  })

  const secondApprovalMutation = useMutation({
    mutationFn: async ({ id, comments }: { id: string; comments: string }) =>
      axiosInstance.post(`/risks/${id}/second-approval`, { comments }),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data.message || 'Risk fully approved' })
      setIsApprovalOpen(false)
      setApprovalComments('')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to approve', variant: 'destructive' }),
  })

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      axiosInstance.post(`/risks/${id}/reject`, { reason }),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data.message || 'Risk rejected' })
      setIsRejectOpen(false)
      setRejectReason('')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to reject', variant: 'destructive' }),
  })

  // ============================================
  // HANDLERS
  // ============================================

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      inherentProbability: 3,
      inherentImpact: 3,
      controlDescription: '',
      controlsReference: '',
      comments: '',
      changeDescription: '',
    })
  }

  const handleCreate = () => {
    createMutation.mutate({
      title: formData.title,
      description: formData.description,
      likelihood: formData.inherentProbability,
      impact: formData.inherentImpact,
      controlDescription: formData.controlDescription,
      controlsReference: formData.controlsReference,
      category: 'OPERATIONAL',
    })
  }

  const handleEdit = (risk: any) => {
    setSelectedRisk(risk)
    setFormData({
      title: risk.title,
      description: risk.description || '',
      inherentProbability: risk.likelihood || 3,
      inherentImpact: risk.impact || 3,
      controlDescription: risk.controlDescription || '',
      controlsReference: risk.controlsReference || '',
      comments: risk.comments || '',
      changeDescription: '',
    })
    setIsEditOpen(true)
  }

  const handleUpdate = () => {
    if (!selectedRisk) return
    updateMutation.mutate({
      id: selectedRisk.id,
      data: {
        title: formData.title,
        description: formData.description,
        likelihood: formData.inherentProbability,
        impact: formData.inherentImpact,
        controlDescription: formData.controlDescription,
        controlsReference: formData.controlsReference,
        comments: formData.comments,
        changeDescription: formData.changeDescription,
      },
    })
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this risk?')) {
      deleteMutation.mutate(id)
    }
  }

  const handleSubmitForReview = (risk: any) => {
    setSelectedRisk(risk)
    setSubmitDescription('')
    const desc = `Submitting ${risk.riskId} for review`
    submitForReviewMutation.mutate({ id: risk.id, changeDescription: desc })
  }

  const handleApproval = (risk: any) => {
    setSelectedRisk(risk)
    setApprovalComments('')
    setIsApprovalOpen(true)
  }

  const handleReject = (risk: any) => {
    setSelectedRisk(risk)
    setRejectReason('')
    setIsRejectOpen(true)
  }

  const submitApproval = () => {
    if (!selectedRisk) return
    if (selectedRisk.approvalStatus === 'PENDING_FIRST_APPROVAL') {
      firstApprovalMutation.mutate({ id: selectedRisk.id, comments: approvalComments })
    } else if (selectedRisk.approvalStatus === 'PENDING_SECOND_APPROVAL') {
      secondApprovalMutation.mutate({ id: selectedRisk.id, comments: approvalComments })
    }
  }

  const submitRejection = () => {
    if (!selectedRisk || !rejectReason) return
    rejectMutation.mutate({ id: selectedRisk.id, reason: rejectReason })
  }

  const filteredRisks = risks?.filter((risk: any) =>
    risk.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    risk.riskId.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const filteredTreatments = treatments?.map((treatment: any) => {
    const risk = risks?.find((r: any) => r.id === treatment.riskId)
    return { ...treatment, risk }
  }) || []

  const pendingCount = pendingApprovals?.length || 0

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
          <h1 className="text-3xl font-bold">Risk Register</h1>
          <p className="text-muted-foreground">
            ISO/IEC 27001:2022 - Organization Level Risk Register
          </p>
          <p className="text-sm text-muted-foreground">
            Classification: Internal | ISMS-R-004 | Date: {formatDate(new Date())}
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Risk
        </Button>
      </div>

      {/* Approval Summary Banner */}
      {canApprove && pendingCount > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 px-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">
              {pendingCount} risk{pendingCount > 1 ? 's' : ''} pending your approval
            </span>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setActiveTab('approvals')}
            >
              Review Now
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="register">Risk Assessment</TabsTrigger>
          <TabsTrigger value="treatment">Treatment Plan</TabsTrigger>
          <TabsTrigger value="approvals" className="relative">
            Review & Approval
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-xs w-5 h-5">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="versions">Version History</TabsTrigger>
          <TabsTrigger value="retirement">Retired Risks</TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* RISK ASSESSMENT TAB                          */}
        {/* ============================================ */}
        <TabsContent value="register" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Risk Assessment</CardTitle>
                  <CardDescription>Identification, assessment and treatment of organization-level risks</CardDescription>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Columns
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Toggle Columns</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {COLUMN_DEFS.filter(c => !c.alwaysVisible).map((col) => (
                      <DropdownMenuCheckboxItem
                        key={col.key}
                        checked={visibleColumns[col.key]}
                        onCheckedChange={() => toggleColumn(col.key)}
                      >
                        {col.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="px-6 pb-4">
                <Input
                  placeholder="Search risks by ID or title..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
              </div>

              <div className="overflow-x-auto relative">
                <div className="max-h-[65vh] overflow-auto">
                  <table className="w-full text-sm border-collapse" style={{ minWidth: '900px' }}>
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {/* Frozen: Risk ID */}
                        <th className="sticky left-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[90px] border-r">
                          Risk ID
                        </th>
                        {/* Frozen: Risk Item */}
                        <th className="sticky left-[90px] z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[200px] border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          Risk Item
                        </th>
                        {visibleColumns.owner && <th className="px-3 py-3 text-left font-medium">Owner</th>}
                        {visibleColumns.version && <th className="px-3 py-3 text-left font-medium w-[80px]">Version</th>}
                        {visibleColumns.approval && <th className="px-3 py-3 text-left font-medium w-[140px]">Approval</th>}
                        {visibleColumns.inherentProb && <th className="px-3 py-3 text-left font-medium">Inherent Prob.</th>}
                        {visibleColumns.inherentImpact && <th className="px-3 py-3 text-left font-medium">Inherent Impact</th>}
                        {visibleColumns.inherentRisk && <th className="px-3 py-3 text-left font-medium">Inherent Risk</th>}
                        {visibleColumns.treatment && <th className="px-3 py-3 text-left font-medium">Treatment</th>}
                        {visibleColumns.controlDesc && <th className="px-3 py-3 text-left font-medium">Control Description</th>}
                        {visibleColumns.residualProb && <th className="px-3 py-3 text-left font-medium">Residual Prob.</th>}
                        {visibleColumns.residualImpact && <th className="px-3 py-3 text-left font-medium">Residual Impact</th>}
                        {visibleColumns.residualRisk && <th className="px-3 py-3 text-left font-medium">Residual Risk</th>}
                        {visibleColumns.lastReviewed && <th className="px-3 py-3 text-left font-medium">Last Reviewed</th>}
                        <th className="px-3 py-3 text-right font-medium w-[60px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRisks.length === 0 ? (
                        <tr>
                          <td colSpan={15} className="text-center text-muted-foreground py-8">
                            No risks found
                          </td>
                        </tr>
                      ) : (
                        filteredRisks.map((risk: any) => {
                          const inherentScore = risk.inherentRisk || (risk.likelihood * risk.impact)
                          const residualScore = risk.residualRisk || 0
                          const inherentLevel = getRiskLevel(inherentScore)
                          const residualLevel = getRiskLevel(residualScore)
                          const inherentProb = getProbabilityLabel(risk.likelihood)
                          const inherentImp = getImpactLabel(risk.impact)
                          const residualProb = risk.residualProbability ? getProbabilityLabel(risk.residualProbability) : null
                          const residualImp = risk.residualImpact ? getImpactLabel(risk.residualImpact) : null
                          const approval = getApprovalConfig(risk.approvalStatus)

                          return (
                            <tr key={risk.id} className="border-b hover:bg-muted/30 transition-colors">
                              {/* Frozen: Risk ID */}
                              <td className="sticky left-0 z-10 bg-background px-3 py-2.5 font-mono text-xs font-semibold border-r">
                                {risk.riskId}
                              </td>
                              {/* Frozen: Risk Item */}
                              <td className="sticky left-[90px] z-10 bg-background px-3 py-2.5 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                <span className="font-medium text-sm line-clamp-2">{risk.title}</span>
                              </td>
                              {visibleColumns.owner && (
                                <td className="px-3 py-2.5 text-sm">
                                  {risk.owner ? `${risk.owner.firstName} ${risk.owner.lastName}` : '-'}
                                </td>
                              )}
                              {visibleColumns.version && (
                                <td className="px-3 py-2.5">
                                  <span className="font-mono text-xs">{risk.version?.toFixed(1) || '0.1'}</span>
                                </td>
                              )}
                              {visibleColumns.approval && (
                                <td className="px-3 py-2.5">
                                  <Badge className={cn('text-xs', approval.color)}>
                                    {approval.label}
                                  </Badge>
                                </td>
                              )}
                              {visibleColumns.inherentProb && (
                                <td className="px-3 py-2.5">
                                  <Badge className={cn('font-medium', inherentProb.color)}>
                                    {inherentProb.label}
                                  </Badge>
                                </td>
                              )}
                              {visibleColumns.inherentImpact && (
                                <td className="px-3 py-2.5">
                                  <Badge className={cn('font-medium', inherentImp.color)}>
                                    {inherentImp.label}
                                  </Badge>
                                </td>
                              )}
                              {visibleColumns.inherentRisk && (
                                <td className="px-3 py-2.5">
                                  <Badge className={inherentLevel.color}>
                                    {inherentLevel.label} ({inherentScore})
                                  </Badge>
                                </td>
                              )}
                              {visibleColumns.treatment && (
                                <td className="px-3 py-2.5">
                                  {risk.treatment && risk.treatment !== 'PENDING' ? (
                                    <Badge variant="outline">{risk.treatment}</Badge>
                                  ) : '-'}
                                </td>
                              )}
                              {visibleColumns.controlDesc && (
                                <td className="px-3 py-2.5 max-w-[200px]">
                                  <span className="text-xs text-muted-foreground line-clamp-2">
                                    {risk.controlDescription || risk.treatmentPlan || '-'}
                                  </span>
                                </td>
                              )}
                              {visibleColumns.residualProb && (
                                <td className="px-3 py-2.5">
                                  {residualProb ? (
                                    <Badge className={cn('font-medium', residualProb.color)}>
                                      {residualProb.label}
                                    </Badge>
                                  ) : '-'}
                                </td>
                              )}
                              {visibleColumns.residualImpact && (
                                <td className="px-3 py-2.5">
                                  {residualImp ? (
                                    <Badge className={cn('font-medium', residualImp.color)}>
                                      {residualImp.label}
                                    </Badge>
                                  ) : '-'}
                                </td>
                              )}
                              {visibleColumns.residualRisk && (
                                <td className="px-3 py-2.5">
                                  {residualScore > 0 ? (
                                    <Badge className={residualLevel.color}>
                                      {residualLevel.label} ({residualScore})
                                    </Badge>
                                  ) : '-'}
                                </td>
                              )}
                              {visibleColumns.lastReviewed && (
                                <td className="px-3 py-2.5 text-sm">
                                  {risk.reviewedAt ? formatDate(risk.reviewedAt) : '-'}
                                </td>
                              )}
                              <td className="px-3 py-2.5 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleEdit(risk)}>
                                      <Pencil className="mr-2 h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      setSelectedRisk(risk)
                                      setIsTreatmentOpen(true)
                                    }}>
                                      <ShieldCheck className="mr-2 h-4 w-4" />
                                      Add Treatment
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />

                                    {(risk.approvalStatus === 'DRAFT' || risk.approvalStatus === 'REJECTED') && (
                                      <DropdownMenuItem onClick={() => handleSubmitForReview(risk)}>
                                        <SendHorizontal className="mr-2 h-4 w-4" />
                                        Submit for Review
                                      </DropdownMenuItem>
                                    )}
                                    {risk.approvalStatus === 'PENDING_FIRST_APPROVAL' && canApproveFirst && (
                                      <DropdownMenuItem onClick={() => handleApproval(risk)}>
                                        <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                                        1st Level Approve
                                      </DropdownMenuItem>
                                    )}
                                    {risk.approvalStatus === 'PENDING_SECOND_APPROVAL' && canApproveSecond && (
                                      <DropdownMenuItem onClick={() => handleApproval(risk)}>
                                        <FileCheck className="mr-2 h-4 w-4 text-green-600" />
                                        2nd Level Approve
                                      </DropdownMenuItem>
                                    )}
                                    {['PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL'].includes(risk.approvalStatus) && canApprove && (
                                      <DropdownMenuItem onClick={() => handleReject(risk)}>
                                        <XCircle className="mr-2 h-4 w-4 text-red-600" />
                                        Reject
                                      </DropdownMenuItem>
                                    )}

                                    <DropdownMenuSeparator />

                                    <DropdownMenuItem onClick={() => {
                                      setSelectedRisk(risk)
                                      setIsVersionHistoryOpen(true)
                                    }}>
                                      <History className="mr-2 h-4 w-4" />
                                      Version History
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      setSelectedRisk(risk)
                                      setIsRetireOpen(true)
                                    }}>
                                      <Archive className="mr-2 h-4 w-4" />
                                      Retire Risk
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDelete(risk.id)}
                                      className="text-destructive"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* RISK TREATMENT TAB                           */}
        {/* ============================================ */}
        <TabsContent value="treatment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Risk Treatment Plan</CardTitle>
              <CardDescription>Track risk treatment activities and control implementations</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sl No</TableHead>
                    <TableHead>Risk ID</TableHead>
                    <TableHead>Risk Item</TableHead>
                    <TableHead>Risk Owner</TableHead>
                    <TableHead>Risk Description</TableHead>
                    <TableHead>Identification Date</TableHead>
                    <TableHead>Residual Risk</TableHead>
                    <TableHead>Risk Response</TableHead>
                    <TableHead>Control Description</TableHead>
                    <TableHead>Implementation Date</TableHead>
                    <TableHead>Comments</TableHead>
                    <TableHead>Treatment Time (days)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTreatments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground">
                        No treatments found. Select a risk to view its treatments.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTreatments.map((treatment: any, index: number) => {
                      const residualLevel = getRiskLevel(treatment.residualRisk)
                      return (
                        <TableRow key={treatment.id}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell className="font-medium">{treatment.risk?.riskId}</TableCell>
                          <TableCell>{treatment.risk?.title}</TableCell>
                          <TableCell>
                            {treatment.risk?.owner ? `${treatment.risk.owner.firstName} ${treatment.risk.owner.lastName}` : '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px] text-sm">
                            {treatment.risk?.description}
                          </TableCell>
                          <TableCell>{treatment.risk?.createdAt ? formatDate(treatment.risk.createdAt) : '-'}</TableCell>
                          <TableCell>
                            <Badge className={residualLevel.color}>
                              {residualLevel.label} ({treatment.residualRisk})
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{treatment.riskResponse}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] text-sm">
                            {treatment.controlDescription}
                          </TableCell>
                          <TableCell>{treatment.controlImplementationDate ? formatDate(treatment.controlImplementationDate) : '-'}</TableCell>
                          <TableCell className="max-w-[200px] text-sm">{treatment.comments}</TableCell>
                          <TableCell>{treatment.treatmentTimeInDays}</TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* REVIEW & APPROVAL TAB                        */}
        {/* ============================================ */}
        <TabsContent value="approvals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review & Approval Queue</CardTitle>
              <CardDescription>
                Two-level approval workflow: 1st Level (COO/Local Admin) then 2nd Level (CEO/Admin)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!pendingApprovals || pendingApprovals.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CheckCircle2 className="mx-auto h-12 w-12 mb-3 text-green-500" />
                  <p className="text-lg font-medium">All caught up!</p>
                  <p className="text-sm">No risks pending approval at this time.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pendingApprovals.map((risk: any) => {
                    const approval = getApprovalConfig(risk.approvalStatus)
                    const inherentScore = risk.inherentRisk || (risk.likelihood * risk.impact)
                    const inherentLevel = getRiskLevel(inherentScore)
                    const residualScore = risk.residualRisk || 0

                    return (
                      <Card key={risk.id} className="border-l-4 border-l-amber-400">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-3">
                                <span className="font-mono font-bold text-sm">{risk.riskId}</span>
                                <Badge className={cn('text-xs', approval.color)}>
                                  {approval.label}
                                </Badge>
                                <Badge className={inherentLevel.color}>
                                  Inherent: {inherentLevel.label} ({inherentScore})
                                </Badge>
                                {residualScore > 0 && (
                                  <Badge className={getRiskLevel(residualScore).color}>
                                    Residual: {getRiskLevel(residualScore).label} ({residualScore})
                                  </Badge>
                                )}
                                <span className="text-xs text-muted-foreground font-mono">v{risk.version?.toFixed(1)}</span>
                              </div>
                              <h4 className="font-semibold">{risk.title}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-2">{risk.description}</p>
                              <div className="flex gap-4 text-xs text-muted-foreground">
                                <span>Owner: {risk.owner ? `${risk.owner.firstName} ${risk.owner.lastName}` : 'Unassigned'}</span>
                                <span>Created by: {risk.createdBy ? `${risk.createdBy.firstName} ${risk.createdBy.lastName}` : '-'}</span>
                                <span>Updated: {formatDate(risk.updatedAt)}</span>
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {risk.approvalStatus === 'PENDING_FIRST_APPROVAL' && canApproveFirst && (
                                <Button size="sm" onClick={() => handleApproval(risk)} className="bg-green-600 hover:bg-green-700">
                                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                                  1st Approve
                                </Button>
                              )}
                              {risk.approvalStatus === 'PENDING_SECOND_APPROVAL' && canApproveSecond && (
                                <Button size="sm" onClick={() => handleApproval(risk)} className="bg-green-600 hover:bg-green-700">
                                  <FileCheck className="mr-1.5 h-4 w-4" />
                                  2nd Approve
                                </Button>
                              )}
                              {canApprove && (
                                <Button size="sm" variant="destructive" onClick={() => handleReject(risk)}>
                                  <XCircle className="mr-1.5 h-4 w-4" />
                                  Reject
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => {
                                setSelectedRisk(risk)
                                setIsVersionHistoryOpen(true)
                              }}>
                                <History className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
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
                Document version control and approval trail. Select a risk to view its history.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <Select
                  value={selectedRisk?.id || ''}
                  onValueChange={(value) => {
                    const risk = risks?.find((r: any) => r.id === value)
                    setSelectedRisk(risk)
                    setIsVersionHistoryOpen(true) // trigger version fetch
                  }}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Select a risk to view version history" />
                  </SelectTrigger>
                  <SelectContent>
                    {risks?.map((risk: any) => (
                      <SelectItem key={risk.id} value={risk.id}>
                        {risk.riskId} - {risk.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedRisk && isVersionHistoryOpen ? (
                <div className="overflow-x-auto">
                  <Table className="min-w-[800px] text-sm">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Version</TableHead>
                        <TableHead className="w-[120px]">Date</TableHead>
                        <TableHead>Description of Change</TableHead>
                        <TableHead>Actor</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Designation</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!versions || versions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No version history available
                          </TableCell>
                        </TableRow>
                      ) : (
                        versions.map((version: any) => {
                          const isApproval = version.action?.includes('Approval')
                          const isRejection = version.action === 'Rejected'
                          const isMajor = version.version === Math.floor(version.version)

                          return (
                            <TableRow key={version.id} className={cn(
                              isMajor && 'bg-green-50',
                              isRejection && 'bg-red-50'
                            )}>
                              <TableCell className="font-mono font-bold">
                                {version.version.toFixed(1)}
                              </TableCell>
                              <TableCell>{formatDate(version.createdAt)}</TableCell>
                              <TableCell className="max-w-[300px]">{version.changeDescription}</TableCell>
                              <TableCell>{version.actor}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    isApproval && 'border-green-500 text-green-700',
                                    isRejection && 'border-red-500 text-red-700'
                                  )}
                                >
                                  {version.action}
                                </Badge>
                              </TableCell>
                              <TableCell>{version.actorDesignation || '-'}</TableCell>
                            </TableRow>
                          )
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="mx-auto h-12 w-12 mb-3" />
                  <p>Select a risk above to view its version history</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* RETIRED RISKS TAB                            */}
        {/* ============================================ */}
        <TabsContent value="retirement" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Retired Risks</CardTitle>
              <CardDescription>Risks that have been retired from the active register</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sl No</TableHead>
                    <TableHead>Risk ID</TableHead>
                    <TableHead>Risk Item</TableHead>
                    <TableHead>Risk Owner</TableHead>
                    <TableHead>Risk Description</TableHead>
                    <TableHead>Retirement Date</TableHead>
                    <TableHead>Retired By</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!retiredRisks || retiredRisks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No retired risks found
                      </TableCell>
                    </TableRow>
                  ) : (
                    retiredRisks.map((retired: any, index: number) => (
                      <TableRow key={retired.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{retired.risk.riskId}</TableCell>
                        <TableCell>{retired.risk.title}</TableCell>
                        <TableCell>
                          {retired.risk.owner ? `${retired.risk.owner.firstName} ${retired.risk.owner.lastName}` : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] text-sm">
                          {retired.risk.description}
                        </TableCell>
                        <TableCell>{formatDate(retired.retiredAt)}</TableCell>
                        <TableCell>
                          {retired.retiredBy ? `${retired.retiredBy.firstName} ${retired.retiredBy.lastName}` : '-'}
                        </TableCell>
                        <TableCell className="max-w-[200px] text-sm">{retired.reason}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============================================ */}
      {/* DIALOGS                                       */}
      {/* ============================================ */}

      {/* Create Risk Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[900px] w-full mx-2 max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Create New Risk</DialogTitle>
            <DialogDescription>Add a new risk to the register. It will be created as v0.1 Draft.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-auto max-h-[65vh]">
            <div className="grid gap-2">
              <Label htmlFor="title">Risk Item *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Flawed candidate reference check"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Risk Description *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Describe the risk in detail"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Inherent Probability *</Label>
                <Select
                  value={formData.inherentProbability.toString()}
                  onValueChange={(value) => setFormData({ ...formData, inherentProbability: parseInt(value) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROBABILITY_LABELS.map((prob) => (
                      <SelectItem key={prob.value} value={prob.value.toString()}>
                        {prob.value} - {prob.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Inherent Impact *</Label>
                <Select
                  value={formData.inherentImpact.toString()}
                  onValueChange={(value) => setFormData({ ...formData, inherentImpact: parseInt(value) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMPACT_LABELS.map((impact) => (
                      <SelectItem key={impact.value} value={impact.value.toString()}>
                        {impact.value} - {impact.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Control Description</Label>
              <Textarea
                value={formData.controlDescription}
                onChange={(e) => setFormData({ ...formData, controlDescription: e.target.value })}
                rows={2}
                placeholder="Describe the controls to mitigate this risk"
              />
            </div>
            <div className="grid gap-2">
              <Label>Control Reference (ISO 27001 Annex A)</Label>
              <Input
                value={formData.controlsReference}
                onChange={(e) => setFormData({ ...formData, controlsReference: e.target.value })}
                placeholder="e.g., A 6.1 Screening, A 8.12 Data Leakage Prevention"
              />
            </div>
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Inherent Risk Score</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {formData.inherentProbability * formData.inherentImpact}
                  </span>
                  <Badge className={getRiskLevel(formData.inherentProbability * formData.inherentImpact).color}>
                    {getRiskLevel(formData.inherentProbability * formData.inherentImpact).label}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !formData.title || !formData.description}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Risk (Draft)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Risk Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[900px] w-full mx-2 max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Edit Risk - {selectedRisk?.riskId}</DialogTitle>
            <DialogDescription>
              Update risk information. Changes will create a new version entry.
              {selectedRisk?.approvalStatus === 'APPROVED' && (
                <span className="block text-amber-600 mt-1">
                  Note: Editing an approved risk will reset its approval status back to Draft.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-auto max-h-[65vh]">
            <div className="grid gap-2">
              <Label>Risk Item</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Risk Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Inherent Probability</Label>
                <Select
                  value={formData.inherentProbability.toString()}
                  onValueChange={(value) => setFormData({ ...formData, inherentProbability: parseInt(value) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROBABILITY_LABELS.map((prob) => (
                      <SelectItem key={prob.value} value={prob.value.toString()}>
                        {prob.value} - {prob.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Inherent Impact</Label>
                <Select
                  value={formData.inherentImpact.toString()}
                  onValueChange={(value) => setFormData({ ...formData, inherentImpact: parseInt(value) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMPACT_LABELS.map((impact) => (
                      <SelectItem key={impact.value} value={impact.value.toString()}>
                        {impact.value} - {impact.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Control Description</Label>
              <Textarea
                value={formData.controlDescription}
                onChange={(e) => setFormData({ ...formData, controlDescription: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label>Control Reference (ISO 27001 Annex A)</Label>
              <Input
                value={formData.controlsReference}
                onChange={(e) => setFormData({ ...formData, controlsReference: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Comments</Label>
              <Textarea
                value={formData.comments}
                onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label>Change Description (for version history)</Label>
              <Input
                value={formData.changeDescription}
                onChange={(e) => setFormData({ ...formData, changeDescription: e.target.value })}
                placeholder="e.g., Updated risk scoring after re-assessment"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Risk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Treatment Dialog */}
      <Dialog open={isTreatmentOpen} onOpenChange={setIsTreatmentOpen}>
        <DialogContent className="sm:max-w-[900px] w-full mx-2 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Add Risk Treatment</DialogTitle>
            <DialogDescription>
              Record risk treatment activities for {selectedRisk?.riskId} - {selectedRisk?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-auto max-h-[65vh]">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Residual Probability</Label>
                <Select
                  value={treatmentData.residualProbability.toString()}
                  onValueChange={(value) => setTreatmentData({ ...treatmentData, residualProbability: parseInt(value) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROBABILITY_LABELS.map((prob) => (
                      <SelectItem key={prob.value} value={prob.value.toString()}>
                        {prob.value} - {prob.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Residual Impact</Label>
                <Select
                  value={treatmentData.residualImpact.toString()}
                  onValueChange={(value) => setTreatmentData({ ...treatmentData, residualImpact: parseInt(value) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IMPACT_LABELS.map((impact) => (
                      <SelectItem key={impact.value} value={impact.value.toString()}>
                        {impact.value} - {impact.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Risk Response</Label>
              <Select
                value={treatmentData.riskResponse}
                onValueChange={(value) => setTreatmentData({ ...treatmentData, riskResponse: value })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_RESPONSE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Control Description</Label>
              <Textarea
                value={treatmentData.controlDescription}
                onChange={(e) => setTreatmentData({ ...treatmentData, controlDescription: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label>Control Implementation Date</Label>
              <Input
                type="date"
                value={treatmentData.controlImplementationDate}
                onChange={(e) => setTreatmentData({ ...treatmentData, controlImplementationDate: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>Comments</Label>
              <Textarea
                value={treatmentData.comments}
                onChange={(e) => setTreatmentData({ ...treatmentData, comments: e.target.value })}
                rows={2}
              />
            </div>
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Residual Risk Score</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {treatmentData.residualProbability * treatmentData.residualImpact}
                  </span>
                  <Badge className={getRiskLevel(treatmentData.residualProbability * treatmentData.residualImpact).color}>
                    {getRiskLevel(treatmentData.residualProbability * treatmentData.residualImpact).label}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTreatmentOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!selectedRisk) return
              treatmentMutation.mutate({ id: selectedRisk.id, data: treatmentData })
            }} disabled={treatmentMutation.isPending}>
              {treatmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Treatment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={isApprovalOpen} onOpenChange={setIsApprovalOpen}>
        <DialogContent className="sm:max-w-[600px] w-full mx-2">
          <DialogHeader>
            <DialogTitle>
              {selectedRisk?.approvalStatus === 'PENDING_FIRST_APPROVAL'
                ? '1st Level Approval (COO)'
                : '2nd Level Approval (CEO)'}
            </DialogTitle>
            <DialogDescription>
              Approve {selectedRisk?.riskId} - {selectedRisk?.title}
              {selectedRisk?.approvalStatus === 'PENDING_SECOND_APPROVAL' && (
                <span className="block mt-1 text-green-600">
                  This is the final approval. Version will be bumped to the next major version.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="rounded-lg border p-3 bg-muted/50 text-sm space-y-1">
              <div><strong>Risk:</strong> {selectedRisk?.title}</div>
              <div><strong>Current Version:</strong> {selectedRisk?.version?.toFixed(1)}</div>
              <div><strong>Inherent Risk:</strong> {selectedRisk?.inherentRisk}</div>
              {selectedRisk?.residualRisk && (
                <div><strong>Residual Risk:</strong> {selectedRisk.residualRisk}</div>
              )}
            </div>
            <div className="grid gap-2">
              <Label>Approval Comments (optional)</Label>
              <Textarea
                value={approvalComments}
                onChange={(e) => setApprovalComments(e.target.value)}
                rows={3}
                placeholder="Add any comments for this approval..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApprovalOpen(false)}>Cancel</Button>
            <Button
              onClick={submitApproval}
              disabled={firstApprovalMutation.isPending || secondApprovalMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {(firstApprovalMutation.isPending || secondApprovalMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectOpen} onOpenChange={setIsRejectOpen}>
        <DialogContent className="sm:max-w-[600px] w-full mx-2">
          <DialogHeader>
            <DialogTitle>Reject Risk</DialogTitle>
            <DialogDescription>
              Reject {selectedRisk?.riskId} - {selectedRisk?.title}. The risk will be sent back for revision.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Rejection Reason *</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                placeholder="Explain why this risk is being rejected and what changes are needed..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={submitRejection}
              disabled={rejectMutation.isPending || !rejectReason}
            >
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retire Dialog */}
      <Dialog open={isRetireOpen} onOpenChange={setIsRetireOpen}>
        <DialogContent className="sm:max-w-[700px] w-full mx-2 max-h-[60vh]">
          <DialogHeader>
            <DialogTitle>Retire Risk</DialogTitle>
            <DialogDescription>
              Retire {selectedRisk?.riskId} - {selectedRisk?.title}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-auto max-h-[48vh]">
            <div className="grid gap-2">
              <Label>Reason for Retirement</Label>
              <Textarea
                value={retireData.reason}
                onChange={(e) => setRetireData({ reason: e.target.value })}
                rows={4}
                placeholder="Explain why this risk is being retired"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRetireOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedRisk) return
                retireMutation.mutate({ id: selectedRisk.id, data: retireData })
              }}
              disabled={retireMutation.isPending || !retireData.reason}
              variant="destructive"
            >
              {retireMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retire Risk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog (opened from actions dropdown) */}
      <Dialog open={isVersionHistoryOpen && activeTab !== 'versions'} onOpenChange={setIsVersionHistoryOpen}>
        <DialogContent className="sm:max-w-[900px] w-full mx-2 max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              {selectedRisk?.riskId} - {selectedRisk?.title} (Current: v{selectedRisk?.version?.toFixed(1)})
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 overflow-auto max-h-[65vh]">
            <Table className="min-w-[700px] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Version</TableHead>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead>Description of Change</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Designation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!versions || versions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No version history available
                    </TableCell>
                  </TableRow>
                ) : (
                  versions.map((version: any) => {
                    const isApproval = version.action?.includes('Approval')
                    const isRejection = version.action === 'Rejected'
                    const isMajor = version.version === Math.floor(version.version)

                    return (
                      <TableRow key={version.id} className={cn(
                        isMajor && 'bg-green-50',
                        isRejection && 'bg-red-50'
                      )}>
                        <TableCell className="font-mono font-bold">{version.version.toFixed(1)}</TableCell>
                        <TableCell>{formatDate(version.createdAt)}</TableCell>
                        <TableCell className="max-w-[250px]">{version.changeDescription}</TableCell>
                        <TableCell>{version.actor}</TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              isApproval && 'border-green-500 text-green-700',
                              isRejection && 'border-red-500 text-red-700'
                            )}
                          >
                            {version.action}
                          </Badge>
                        </TableCell>
                        <TableCell>{version.actorDesignation || '-'}</TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsVersionHistoryOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
