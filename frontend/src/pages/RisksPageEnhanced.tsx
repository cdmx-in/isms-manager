import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { riskApi, organizationApi } from '@/lib/api'
import api from '@/lib/api'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  ShieldCheck,
  Archive,
  SlidersHorizontal,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  SendHorizontal,
  FileCheck,
  Save,
  X,
  Target,
  Gauge,
  Shield,
  Info,
  TrendingUp,
  Zap,
  MessageSquare,
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Calendar,
  Sparkles,
  Bot,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axiosInstance from '@/lib/api'

// ============================================
// CONSTANTS
// ============================================

const PROBABILITY_LABELS = [
  { value: 1, label: 'Rare', description: 'May occur only in exceptional circumstances', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 2, label: 'Unlikely', description: 'Could occur but not expected', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 3, label: 'Possible', description: 'Might occur at some time', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 4, label: 'Likely', description: 'Will probably occur in most circumstances', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 5, label: 'Frequent', description: 'Expected to occur in most circumstances', color: 'bg-red-100 text-red-800 border-red-200' },
]

const IMPACT_LABELS = [
  { value: 1, label: 'Incidental', description: 'Minimal impact, easily absorbed', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 2, label: 'Minor', description: 'Some impact, manageable with existing resources', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 3, label: 'Moderate', description: 'Significant impact requiring management attention', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 4, label: 'Major', description: 'Major impact on operations or compliance', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { value: 5, label: 'Catastrophic', description: 'Severe or irreversible damage to organization', color: 'bg-red-100 text-red-800 border-red-200' },
]

const RISK_RESPONSE_TYPES = ['MITIGATE', 'ACCEPT', 'TRANSFER', 'AVOID']

const APPROVAL_STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  DRAFT: { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: Clock },
  PENDING_FIRST_APPROVAL: { label: 'Pending 1st Approval', color: 'bg-amber-100 text-amber-800', icon: Clock },
  PENDING_SECOND_APPROVAL: { label: 'Pending 2nd Approval', color: 'bg-blue-100 text-blue-800', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
}

const VERSION_ACTION_COLORS: Record<string, string> = {
  'Draft & Review': 'bg-gray-100 text-gray-800',
  'Submitted for Review': 'bg-blue-100 text-blue-800',
  '1st Level Approval': 'bg-green-100 text-green-800',
  '2nd Level Approval': 'bg-green-100 text-green-800',
  'Updation': 'bg-amber-100 text-amber-800',
  'Rejected': 'bg-red-100 text-red-800',
}

// ============================================
// HELPERS
// ============================================

const getRiskLevel = (score: number) => {
  if (score >= 20) return { label: 'Critical', color: 'bg-red-700 text-white', bgLight: 'bg-red-50 border-red-200' }
  if (score >= 15) return { label: 'High', color: 'bg-orange-600 text-white', bgLight: 'bg-orange-50 border-orange-200' }
  if (score >= 6) return { label: 'Medium', color: 'bg-yellow-600 text-white', bgLight: 'bg-yellow-50 border-yellow-200' }
  if (score >= 2) return { label: 'Low', color: 'bg-green-600 text-white', bgLight: 'bg-green-50 border-green-200' }
  return { label: 'Negligible', color: 'bg-gray-500 text-white', bgLight: 'bg-gray-50 border-gray-200' }
}

const getProbabilityLabel = (value: number) =>
  PROBABILITY_LABELS.find(p => p.value === value) || PROBABILITY_LABELS[2]

const getImpactLabel = (value: number) =>
  IMPACT_LABELS.find(i => i.value === value) || IMPACT_LABELS[2]

const getApprovalConfig = (status: string) =>
  APPROVAL_STATUS_CONFIG[status] || APPROVAL_STATUS_CONFIG.DRAFT

// ============================================
// MARKDOWN RENDERER (for AI responses)
// ============================================

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('### ')) return <h3 key={i} className="text-sm font-semibold mt-3 mb-1 text-foreground">{line.replace('### ', '')}</h3>
    if (line.startsWith('## ')) return <h2 key={i} className="text-base font-semibold mt-4 mb-2 text-foreground">{line.replace('## ', '')}</h2>
    if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-bold mt-4 mb-2 text-foreground">{line.replace('# ', '')}</h2>
    if (line.match(/^[-*]\s+\*\*/)) {
      const content = line.replace(/^[-*]\s*/, '')
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-violet-400 mt-0.5 flex-shrink-0">{'\u2022'}</span>
          <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-violet-100 rounded text-xs font-mono">$1</code>') }} />
        </div>
      )
    }
    if (line.match(/^[-*]\s+/)) {
      const content = line.replace(/^[-*]\s*/, '')
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-violet-400 mt-0.5 flex-shrink-0">{'\u2022'}</span>
          <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-violet-100 rounded text-xs font-mono">$1</code>') }} />
        </div>
      )
    }
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)?.[1]
      const content = line.replace(/^\d+\.\s*/, '')
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-violet-500 font-semibold min-w-[20px] flex-shrink-0">{num}.</span>
          <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-violet-100 rounded text-xs font-mono">$1</code>') }} />
        </div>
      )
    }
    if (!line.trim()) return <div key={i} className="h-2" />
    return (
      <p key={i} className="my-0.5" dangerouslySetInnerHTML={{
        __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-violet-100 rounded text-xs font-mono">$1</code>')
      }} />
    )
  })
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function RisksPage() {
  const navigate = useNavigate()
  const { user, currentOrganizationId } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  // User role
  const userMembership = user?.organizationMemberships?.find(
    (m: any) => m.organizationId === currentOrganizationId
  )
  const userOrgRole = userMembership?.role || user?.role || 'USER'
  const isGlobalAdmin = user?.role === 'ADMIN'
  const canEdit = ['ADMIN', 'LOCAL_ADMIN', 'AUDITOR'].includes(userOrgRole)

  // Core state
  const [searchTerm, setSearchTerm] = useState('')
  const [activeTab, setActiveTab] = useState('register')
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isTreatmentOpen, setIsTreatmentOpen] = useState(false)
  const [isRetireOpen, setIsRetireOpen] = useState(false)
  const [selectedRisk, setSelectedRisk] = useState<any>(null)

  // Document-level version control state
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

  const [editSelectedControls, setEditSelectedControls] = useState<string[]>([])
  const [editControlSearchOpen, setEditControlSearchOpen] = useState(false)
  const [treatmentSelectedControls, setTreatmentSelectedControls] = useState<string[]>([])
  const [treatmentControlSearchOpen, setTreatmentControlSearchOpen] = useState(false)

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    inherentProbability: 3,
    inherentImpact: 3,
    controlDescription: '',
    controlsReference: '',
    comments: '',
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

  // AI state
  const [aiReviewRiskId, setAiReviewRiskId] = useState<string | null>(null)
  const [aiReviewResult, setAiReviewResult] = useState<string | null>(null)
  const [aiReviewLoading, setAiReviewLoading] = useState(false)
  const [aiRegisterAnalysis, setAiRegisterAnalysis] = useState<string | null>(null)
  const [aiRegisterLoading, setAiRegisterLoading] = useState(false)
  const [isAiRegisterOpen, setIsAiRegisterOpen] = useState(false)

  // Column visibility toggles
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    riskId: true,
    title: true,
    owner: true,
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

  const { data: allTreatments } = useQuery({
    queryKey: ['all-risk-treatments', currentOrganizationId],
    queryFn: async () => {
      const response = await axiosInstance.get(`/risks/treatments/all?organizationId=${currentOrganizationId}`)
      return response.data.data
    },
    enabled: !!currentOrganizationId,
  })

  const { data: retiredRisks } = useQuery({
    queryKey: ['retired-risks', currentOrganizationId],
    queryFn: async () => {
      const response = await axiosInstance.get(`/risks/retired/list?organizationId=${currentOrganizationId}`)
      return response.data.data
    },
    enabled: !!currentOrganizationId,
  })

  // Document-level queries
  const { data: riskDoc } = useQuery({
    queryKey: ['risk-register-document', currentOrganizationId],
    queryFn: async () => {
      const response = await riskApi.getDocument(currentOrganizationId!)
      return response.data?.data
    },
    enabled: !!currentOrganizationId,
  })

  const { data: docVersions } = useQuery({
    queryKey: ['risk-register-versions', currentOrganizationId],
    queryFn: async () => {
      const response = await riskApi.getDocumentVersions(currentOrganizationId!)
      return response.data?.data || []
    },
    enabled: !!currentOrganizationId && (activeTab === 'versions' || activeTab === 'approvals'),
  })

  const { data: orgMembers } = useQuery({
    queryKey: ['org-members-for-risks', currentOrganizationId],
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
    enabled: !!currentOrganizationId && (activeTab === 'approvals'),
  })

  // Fetch ISO 27001 controls for multi-select in edit dialog
  const { data: iso27001Controls } = useQuery({
    queryKey: ['controls-for-risk-edit', currentOrganizationId],
    queryFn: async () => {
      const response = await axiosInstance.get('/controls', {
        params: { organizationId: currentOrganizationId, frameworkSlug: 'iso27001', limit: 200 },
      })
      return response.data?.data || []
    },
    enabled: !!currentOrganizationId,
  })
  const availableControls: any[] = iso27001Controls || []

  // ============================================
  // MUTATIONS
  // ============================================

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['risks'] })
    queryClient.invalidateQueries({ queryKey: ['risk-register-document'] })
    queryClient.invalidateQueries({ queryKey: ['risk-register-versions'] })
    queryClient.invalidateQueries({ queryKey: ['all-risk-treatments'] })
  }

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

  // Document-level mutations
  const updateDocMutation = useMutation({
    mutationFn: async (data: any) => riskApi.updateDocument(currentOrganizationId!, data),
    onSuccess: () => {
      invalidateAll()
      toast({ title: 'Document updated' })
    },
    onError: () => toast({ title: 'Failed to update document', variant: 'destructive' }),
  })

  const submitForReviewMutation = useMutation({
    mutationFn: async () => riskApi.submitForReview(currentOrganizationId!, submitChangeDescription, submitVersionBump),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data?.message || 'Risk Register submitted for review' })
      setIsSubmitOpen(false)
      setSubmitChangeDescription('')
      setSubmitVersionBump('none')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to submit', variant: 'destructive' }),
  })

  const firstApprovalMutation = useMutation({
    mutationFn: async () => riskApi.firstApproval(currentOrganizationId!),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data?.message || '1st level approval granted' })
      setIsApprovalOpen(false)
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to approve', variant: 'destructive' }),
  })

  const secondApprovalMutation = useMutation({
    mutationFn: async () => riskApi.secondApproval(currentOrganizationId!),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data?.message || 'Risk Register fully approved' })
      setIsApprovalOpen(false)
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to approve', variant: 'destructive' }),
  })

  const rejectMutation = useMutation({
    mutationFn: async () => riskApi.reject(currentOrganizationId!, rejectReason),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data?.message || 'Risk Register rejected' })
      setIsRejectOpen(false)
      setRejectReason('')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to reject', variant: 'destructive' }),
  })

  const newRevisionMutation = useMutation({
    mutationFn: async () => riskApi.newRevision(currentOrganizationId!, revisionChangeDescription, revisionVersionBump),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data?.message || 'New revision started' })
      setIsNewRevisionOpen(false)
      setRevisionChangeDescription('')
      setRevisionVersionBump('minor')
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to create revision', variant: 'destructive' }),
  })

  const discardRevisionMutation = useMutation({
    mutationFn: async () => riskApi.discardRevision(currentOrganizationId!),
    onSuccess: (res) => {
      invalidateAll()
      toast({ title: res.data?.message || 'Revision discarded' })
      setIsDiscardRevisionOpen(false)
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to discard', variant: 'destructive' }),
  })

  const updateVersionDescriptionMutation = useMutation({
    mutationFn: ({ versionId, changeDescription }: { versionId: string; changeDescription: string }) =>
      riskApi.updateVersionDescription(versionId, changeDescription),
    onSuccess: () => {
      invalidateAll()
      setEditingVersionId(null)
      toast({ title: 'Description updated' })
    },
    onError: (err: any) => toast({ title: err.response?.data?.error?.message || 'Failed to update', variant: 'destructive' }),
  })

  // ============================================
  // HANDLERS
  // ============================================

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
    })
    // Parse existing controlsReference into selected control IDs
    const refStr = risk.controlsReference || ''
    const parsed = refStr
      .split(',')
      .map((s: string) => s.trim().split(' ')[0]) // "A.5.1 Policies..." → "A.5.1"
      .filter((s: string) => s && /^A\.\d/.test(s))
    setEditSelectedControls(parsed)
    setIsEditOpen(true)
  }

  const handleUpdate = () => {
    if (!selectedRisk) return
    const controlsReference = editSelectedControls
      .map(cid => {
        const ctrl = availableControls.find((c: any) => c.controlId === cid)
        return ctrl ? `${ctrl.controlId} ${ctrl.name}` : cid
      })
      .join(', ')
    updateMutation.mutate({
      id: selectedRisk.id,
      data: {
        title: formData.title,
        description: formData.description,
        likelihood: formData.inherentProbability,
        impact: formData.inherentImpact,
        controlDescription: formData.controlDescription,
        controlsReference,
        comments: formData.comments,
      },
    })
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this risk?')) {
      deleteMutation.mutate(id)
    }
  }

  const submitApproval = () => {
    if (riskDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL') {
      firstApprovalMutation.mutate()
    } else if (riskDoc?.approvalStatus === 'PENDING_SECOND_APPROVAL') {
      secondApprovalMutation.mutate()
    }
  }

  // AI handlers
  const handleAiReview = async (riskId: string) => {
    setAiReviewRiskId(riskId)
    setAiReviewLoading(true)
    setAiReviewResult(null)
    try {
      const result = await riskApi.aiReview(riskId)
      setAiReviewResult(result.data?.data?.analysis || result.data?.analysis)
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.error || 'Failed to get AI review. Ensure OpenAI API key is configured.'
      setAiReviewResult(`**Error:** ${msg}`)
    } finally {
      setAiReviewLoading(false)
    }
  }

  const handleAiAnalyzeRegister = async () => {
    setAiRegisterLoading(true)
    setAiRegisterAnalysis(null)
    setIsAiRegisterOpen(true)
    try {
      const result = await riskApi.aiAnalyzeRegister(currentOrganizationId!)
      setAiRegisterAnalysis(result.data?.data?.analysis || result.data?.analysis)
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.error || 'Failed to generate analysis. Ensure OpenAI API key is configured.'
      setAiRegisterAnalysis(`**Error:** ${msg}`)
    } finally {
      setAiRegisterLoading(false)
    }
  }

  const filteredRisks = risks?.filter((risk: any) =>
    risk.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    risk.riskId.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const filteredTreatments = (allTreatments || []).filter((t: any) =>
    !searchTerm || t.risk?.title?.toLowerCase().includes(searchTerm.toLowerCase()) || t.risk?.riskId?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Document version grouping
  const docApproval = getApprovalConfig(riskDoc?.approvalStatus || 'DRAFT')
  const DocApprovalIcon = docApproval.icon

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
    if (riskDoc?.approvalStatus !== 'DRAFT') return false
    if (!docVersions || docVersions.length === 0) return false
    const sorted = [...docVersions].sort((a: any, b: any) => b.version - a.version)
    const latest = sorted[0]
    if (latest.action !== 'Draft & Review') return false
    return sorted.some((v: any) => v.version < latest.version)
  }, [riskDoc, docVersions])

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
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleAiAnalyzeRegister}
            disabled={aiRegisterLoading}
            className="gap-2 border-violet-200 text-violet-700 hover:bg-violet-50"
          >
            {aiRegisterLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI Analysis
          </Button>
          <Button onClick={() => navigate('/risks/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Add Risk
          </Button>
        </div>
      </div>

      {/* Document Info Bar */}
      {riskDoc && (
        <Card className="border-l-4 border-l-primary">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Identification</p>
                  <p className="text-sm font-mono font-semibold mt-1.5">{riskDoc.identification}</p>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Version</p>
                <p className="text-sm font-mono font-bold mt-1.5">{riskDoc.version?.toFixed(1)}</p>
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
                  {riskDoc.reviewer ? (
                    <>
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={riskDoc.reviewer.avatar} />
                        <AvatarFallback className="text-[10px]">
                          {riskDoc.reviewer.firstName?.[0]}{riskDoc.reviewer.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{riskDoc.reviewer.firstName} {riskDoc.reviewer.lastName}</span>
                      {riskDoc.reviewer.designation && <span className="text-xs text-muted-foreground">({riskDoc.reviewer.designation})</span>}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Not assigned</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Approver (2nd Level)</p>
                <div className="flex items-center gap-2 mt-1.5">
                  {riskDoc.approver ? (
                    <>
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={riskDoc.approver.avatar} />
                        <AvatarFallback className="text-[10px]">
                          {riskDoc.approver.firstName?.[0]}{riskDoc.approver.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{riskDoc.approver.firstName} {riskDoc.approver.lastName}</span>
                      {riskDoc.approver.designation && <span className="text-xs text-muted-foreground">({riskDoc.approver.designation})</span>}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">Not assigned</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Classification</p>
                <Badge variant="outline" className={cn('text-xs mt-1.5',
                  riskDoc.classification === 'Confidential' ? 'bg-red-50 text-red-700 border-red-200' :
                  riskDoc.classification === 'Internal' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  riskDoc.classification === 'Public' ? 'bg-green-50 text-green-700 border-green-200' :
                  'bg-gray-50 text-gray-700 border-gray-200'
                )}>
                  {riskDoc.classification}
                </Badge>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Last Updated</p>
                <p className="text-sm mt-1.5">{formatDate(riskDoc.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Register Analysis Panel */}
      {isAiRegisterOpen && (
        <Card className="border-violet-200 bg-gradient-to-r from-violet-50/30 to-purple-50/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span className="flex items-center gap-2 text-violet-700">
                <Bot className="h-4 w-4" />
                AI Risk Register Analysis
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setIsAiRegisterOpen(false); setAiRegisterAnalysis(null) }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {aiRegisterLoading ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <div className="relative">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  <Sparkles className="h-4 w-4 text-violet-400 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <p className="text-sm font-medium text-violet-700">Analyzing your risk register...</p>
                <p className="text-xs text-muted-foreground">Reviewing all {risks?.length || 0} risks, treatments, and control coverage.</p>
              </div>
            ) : aiRegisterAnalysis ? (
              <div className="bg-white/60 border border-violet-100 rounded-lg p-4 max-h-[50vh] overflow-y-auto">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-violet-100">
                  <Sparkles className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-xs font-medium text-violet-600">Generated by AI</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">Review all recommendations before acting</span>
                </div>
                <div className="text-sm leading-relaxed">{renderMarkdown(aiRegisterAnalysis)}</div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="register">Risk Assessment</TabsTrigger>
          <TabsTrigger value="treatment">Treatment Plan</TabsTrigger>
          <TabsTrigger value="approvals">Review & Approval</TabsTrigger>
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
                        <th className="sticky left-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[90px] border-r">Risk ID</th>
                        <th className="sticky left-[90px] z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[200px] border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Risk Item</th>
                        {visibleColumns.owner && <th className="px-3 py-3 text-left font-medium">Owner</th>}
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
                        <tr><td colSpan={15} className="text-center text-muted-foreground py-8">No risks found</td></tr>
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

                          return (
                            <tr key={risk.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="sticky left-0 z-10 bg-background px-3 py-2.5 font-mono text-xs font-semibold border-r">{risk.riskId}</td>
                              <td className="sticky left-[90px] z-10 bg-background px-3 py-2.5 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                <span className="font-medium text-sm line-clamp-2">{risk.title}</span>
                              </td>
                              {visibleColumns.owner && <td className="px-3 py-2.5 text-sm">{risk.owner ? `${risk.owner.firstName} ${risk.owner.lastName}` : '-'}</td>}
                              {visibleColumns.inherentProb && <td className="px-3 py-2.5"><Badge className={cn('font-medium', inherentProb.color)}>{inherentProb.label}</Badge></td>}
                              {visibleColumns.inherentImpact && <td className="px-3 py-2.5"><Badge className={cn('font-medium', inherentImp.color)}>{inherentImp.label}</Badge></td>}
                              {visibleColumns.inherentRisk && <td className="px-3 py-2.5"><Badge className={inherentLevel.color}>{inherentLevel.label} ({inherentScore})</Badge></td>}
                              {visibleColumns.treatment && <td className="px-3 py-2.5">{risk.treatment && risk.treatment !== 'PENDING' ? <Badge variant="outline">{risk.treatment}</Badge> : '-'}</td>}
                              {visibleColumns.controlDesc && <td className="px-3 py-2.5 max-w-[200px]"><span className="text-xs text-muted-foreground line-clamp-2">{risk.controlDescription || risk.treatmentPlan || '-'}</span></td>}
                              {visibleColumns.residualProb && <td className="px-3 py-2.5">{residualProb ? <Badge className={cn('font-medium', residualProb.color)}>{residualProb.label}</Badge> : '-'}</td>}
                              {visibleColumns.residualImpact && <td className="px-3 py-2.5">{residualImp ? <Badge className={cn('font-medium', residualImp.color)}>{residualImp.label}</Badge> : '-'}</td>}
                              {visibleColumns.residualRisk && <td className="px-3 py-2.5">{residualScore > 0 ? <Badge className={residualLevel.color}>{residualLevel.label} ({residualScore})</Badge> : '-'}</td>}
                              {visibleColumns.lastReviewed && <td className="px-3 py-2.5 text-sm">{risk.reviewedAt ? formatDate(risk.reviewedAt) : '-'}</td>}
                              <td className="px-3 py-2.5 text-right">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><MoreHorizontal className="h-4 w-4" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => handleEdit(risk)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleAiReview(risk.id)} className="text-violet-700"><Sparkles className="mr-2 h-4 w-4" />AI Review</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setSelectedRisk(risk); setTreatmentSelectedControls([]); setTreatmentData({ residualProbability: 3, residualImpact: 3, riskResponse: 'MITIGATE', controlDescription: '', controlImplementationDate: '', comments: '' }); setIsTreatmentOpen(true) }}><ShieldCheck className="mr-2 h-4 w-4" />Add Treatment</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => { setSelectedRisk(risk); setIsRetireOpen(true) }}><Archive className="mr-2 h-4 w-4" />Retire Risk</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleDelete(risk.id)} className="text-destructive"><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
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
            <CardContent className="p-0">
              <div className="overflow-x-auto relative">
                <div className="max-h-[65vh] overflow-auto">
                  <table className="w-full text-sm border-collapse" style={{ minWidth: '1400px' }}>
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="sticky left-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[50px] border-r text-xs">Sl</th>
                        <th className="sticky left-[50px] z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[70px] border-r">Risk ID</th>
                        <th className="sticky left-[120px] z-20 bg-muted/95 backdrop-blur px-3 py-3 text-left font-medium w-[160px] border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Risk Item</th>
                        <th className="px-3 py-3 text-left font-medium w-[120px]">Risk Owner</th>
                        <th className="px-3 py-3 text-left font-medium w-[200px]">Risk Description</th>
                        <th className="px-3 py-3 text-left font-medium w-[100px] whitespace-nowrap">Ident. Date</th>
                        <th className="px-3 py-3 text-left font-medium w-[110px] whitespace-nowrap">Residual Risk</th>
                        <th className="px-3 py-3 text-left font-medium w-[100px]">Response</th>
                        <th className="px-3 py-3 text-left font-medium w-[220px]">Control Description</th>
                        <th className="px-3 py-3 text-left font-medium w-[100px] whitespace-nowrap">Impl. Date</th>
                        <th className="px-3 py-3 text-left font-medium w-[180px]">Comments</th>
                        <th className="px-3 py-3 text-center font-medium w-[60px] whitespace-nowrap">Days</th>
                        <th className="sticky right-0 z-20 bg-muted/95 backdrop-blur px-3 py-3 text-center font-medium w-[60px] border-l shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">Edit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTreatments.length === 0 ? (
                        <tr><td colSpan={13} className="text-center text-muted-foreground py-12">
                          <div className="flex flex-col items-center gap-2">
                            <ShieldCheck className="h-10 w-10 text-muted-foreground/40" />
                            <p>No risk treatments found</p>
                            <p className="text-xs">Add treatments from the Risk Assessment tab using the row actions menu</p>
                          </div>
                        </td></tr>
                      ) : (
                        filteredTreatments.map((treatment: any, index: number) => {
                          const residualLevel = getRiskLevel(treatment.residualRisk)
                          const responseColor = {
                            'MITIGATE': 'bg-blue-50 text-blue-700 border-blue-200',
                            'ACCEPT': 'bg-green-50 text-green-700 border-green-200',
                            'TRANSFER': 'bg-purple-50 text-purple-700 border-purple-200',
                            'AVOID': 'bg-red-50 text-red-700 border-red-200',
                          }[treatment.riskResponse] || 'bg-gray-50 text-gray-700 border-gray-200'
                          return (
                            <tr key={treatment.id} className="border-b hover:bg-muted/30 transition-colors">
                              <td className="sticky left-0 z-10 bg-background px-3 py-2.5 text-center text-xs text-muted-foreground border-r">{index + 1}</td>
                              <td className="sticky left-[50px] z-10 bg-background px-3 py-2.5 font-mono text-xs font-semibold border-r">{treatment.risk?.riskId}</td>
                              <td className="sticky left-[120px] z-10 bg-background px-3 py-2.5 border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                <span className="font-medium text-sm line-clamp-2">{treatment.risk?.title}</span>
                              </td>
                              <td className="px-3 py-2.5 text-sm truncate max-w-[120px]">{treatment.risk?.owner ? `${treatment.risk.owner.firstName} ${treatment.risk.owner.lastName}` : '-'}</td>
                              <td className="px-3 py-2.5">
                                <span className="text-xs text-muted-foreground line-clamp-2">{treatment.risk?.description || '-'}</span>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{treatment.risk?.createdAt ? formatDate(treatment.risk.createdAt) : '-'}</td>
                              <td className="px-3 py-2.5"><Badge className={cn('text-xs', residualLevel.color)}>{residualLevel.label} ({treatment.residualRisk})</Badge></td>
                              <td className="px-3 py-2.5"><Badge variant="outline" className={cn('text-xs', responseColor)}>{treatment.riskResponse}</Badge></td>
                              <td className="px-3 py-2.5">
                                <span className="text-xs text-muted-foreground line-clamp-2">{treatment.controlDescription || '-'}</span>
                              </td>
                              <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{treatment.controlImplementationDate ? formatDate(treatment.controlImplementationDate) : '-'}</td>
                              <td className="px-3 py-2.5">
                                <span className="text-xs text-muted-foreground line-clamp-2">{treatment.comments || '-'}</span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <span className="text-xs font-mono font-medium">{treatment.treatmentTimeInDays ?? '-'}</span>
                              </td>
                              <td className="sticky right-0 z-10 bg-background px-3 py-2.5 text-center border-l shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => {
                                    const risk = risks?.find((r: any) => r.id === treatment.riskId)
                                    if (risk) handleEdit(risk)
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
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
        {/* REVIEW & APPROVAL TAB                        */}
        {/* ============================================ */}
        <TabsContent value="approvals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Review & Approval</CardTitle>
              <CardDescription>
                Two-level document approval workflow: 1st Level (Reviewer) then 2nd Level (Approver)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Current Status */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 border">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase">Current Status</p>
                  <Badge className={cn('text-sm mt-1', docApproval.color)}>
                    <DocApprovalIcon className="mr-1.5 h-3.5 w-3.5" />
                    {docApproval.label}
                  </Badge>
                </div>
                <div className="border-l pl-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Version</p>
                  <p className="text-lg font-mono font-bold mt-0.5">{riskDoc?.version?.toFixed(1)}</p>
                </div>
              </div>

              {/* Reviewer / Approver Assignment */}
              {canEdit && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label>Reviewer (1st Level Approval)</Label>
                    <Select
                      value={riskDoc?.reviewerId || 'none'}
                      onValueChange={(v) => updateDocMutation.mutate({ reviewerId: v === 'none' ? null : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select reviewer" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not assigned</SelectItem>
                        {orgMembers?.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.firstName} {m.lastName} ({m.role}){m.designation ? ` - ${m.designation}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Approver (2nd Level Approval)</Label>
                    <Select
                      value={riskDoc?.approverId || 'none'}
                      onValueChange={(v) => updateDocMutation.mutate({ approverId: v === 'none' ? null : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select approver" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not assigned</SelectItem>
                        {orgMembers?.map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.firstName} {m.lastName} ({m.role}){m.designation ? ` - ${m.designation}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                {canEdit && (riskDoc?.approvalStatus === 'DRAFT' || riskDoc?.approvalStatus === 'REJECTED') && (
                  <Button onClick={() => setIsSubmitOpen(true)}>
                    <SendHorizontal className="mr-2 h-4 w-4" />
                    Submit for Review
                  </Button>
                )}

                {(isGlobalAdmin || user?.id === riskDoc?.reviewerId) && riskDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL' && (
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => setIsApprovalOpen(true)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Approve (1st Level)
                  </Button>
                )}

                {(isGlobalAdmin || user?.id === riskDoc?.approverId) && riskDoc?.approvalStatus === 'PENDING_SECOND_APPROVAL' && (
                  <Button className="bg-green-600 hover:bg-green-700" onClick={() => setIsApprovalOpen(true)}>
                    <FileCheck className="mr-2 h-4 w-4" />
                    Approve (2nd Level - Final)
                  </Button>
                )}

                {(riskDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL' || riskDoc?.approvalStatus === 'PENDING_SECOND_APPROVAL') &&
                  (isGlobalAdmin || user?.id === riskDoc?.reviewerId || user?.id === riskDoc?.approverId) && (
                  <Button variant="destructive" onClick={() => setIsRejectOpen(true)}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                )}

                {canEdit && riskDoc?.approvalStatus === 'APPROVED' && (
                  <Button onClick={() => setIsNewRevisionOpen(true)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Create New Revision
                  </Button>
                )}

                {canEdit && canDiscardRevision && (
                  <Button variant="destructive" onClick={() => setIsDiscardRevisionOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Discard Revision
                  </Button>
                )}
              </div>

              {/* Workflow Diagram */}
              <div className="rounded-lg border p-4 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground mb-3 uppercase">Approval Workflow</p>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {['DRAFT', 'PENDING_FIRST_APPROVAL', 'PENDING_SECOND_APPROVAL', 'APPROVED'].map((step, i) => {
                    const config = getApprovalConfig(step)
                    const isActive = riskDoc?.approvalStatus === step
                    return (
                      <div key={step} className="flex items-center gap-2">
                        {i > 0 && <span className="text-muted-foreground">→</span>}
                        <Badge className={cn('text-xs', isActive ? config.color : 'bg-muted text-muted-foreground')}>
                          {config.label}
                        </Badge>
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
              <CardTitle>Version History</CardTitle>
              <CardDescription>Document version control and approval trail for the Risk Register</CardDescription>
            </CardHeader>
            <CardContent>
              {groupedVersions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="mx-auto h-12 w-12 mb-3" />
                  <p>No version history available yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-blue-600 text-white">
                        <th className="px-4 py-3 text-left w-[120px]">Version Number</th>
                        <th className="px-4 py-3 text-left w-[120px]">Date</th>
                        <th className="px-4 py-3 text-left">Description of Change</th>
                        <th className="px-4 py-3 text-left w-[180px]">Actor</th>
                        <th className="px-4 py-3 text-left w-[160px]">Action</th>
                        <th className="px-4 py-3 text-left w-[140px]">Designation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupedVersions.map((group) => (
                        group.entries.map((v: any, idx: number) => (
                          <tr key={v.id} className="border-b hover:bg-muted/30">
                            {idx === 0 ? (
                              <td className="px-4 py-3 font-mono font-bold" rowSpan={group.entries.length}>
                                {group.version.toFixed(1)}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {formatDate(v.createdAt)}
                            </td>
                            <td className="px-4 py-3">
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
                            <td className="px-4 py-3 font-medium">{v.actor}</td>
                            <td className="px-4 py-3">
                              <Badge className={cn('text-xs', VERSION_ACTION_COLORS[v.action] || 'bg-gray-100 text-gray-800')}>
                                {v.action}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{v.actorDesignation || '-'}</td>
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
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">No retired risks found</TableCell></TableRow>
                  ) : (
                    retiredRisks.map((retired: any, index: number) => (
                      <TableRow key={retired.id}>
                        <TableCell>{index + 1}</TableCell>
                        <TableCell className="font-medium">{retired.risk.riskId}</TableCell>
                        <TableCell>{retired.risk.title}</TableCell>
                        <TableCell>{retired.risk.owner ? `${retired.risk.owner.firstName} ${retired.risk.owner.lastName}` : '-'}</TableCell>
                        <TableCell className="max-w-[200px] text-sm">{retired.risk.description}</TableCell>
                        <TableCell>{formatDate(retired.retiredAt)}</TableCell>
                        <TableCell>{retired.retiredBy ? `${retired.retiredBy.firstName} ${retired.retiredBy.lastName}` : '-'}</TableCell>
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

      {/* Edit Risk Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[900px] w-full mx-2 max-h-[90vh] p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/10 rounded-lg p-2">
                <Pencil className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg">Edit Risk — {selectedRisk?.riskId}</DialogTitle>
                <DialogDescription className="text-slate-300 text-xs mt-0.5">
                  Update risk assessment details. Changes will create a new version requiring re-approval.
                </DialogDescription>
              </div>
              {selectedRisk && (
                <Badge className={cn('ml-auto text-xs', getRiskLevel(selectedRisk.inherentRisk || 0).color)}>
                  {getRiskLevel(selectedRisk.inherentRisk || 0).label} ({selectedRisk.inherentRisk || 0})
                </Badge>
              )}
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="overflow-auto max-h-[calc(90vh-160px)] px-6 py-5 space-y-5">

            {/* Section 1: Risk Identification */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b">
                <Target className="h-4 w-4 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-700">Risk Identification</h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  Risk Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="h-10"
                  placeholder="e.g., Unauthorized Data Access via Compromised Credentials"
                />
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
                  Concise title identifying the threat source, vulnerability, and potential impact.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Risk Description
                </Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="resize-none"
                  placeholder="Detailed description of the risk scenario..."
                />
              </div>
            </div>

            {/* Section 2: Inherent Risk Assessment */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b">
                <Gauge className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-slate-700">Inherent Risk Assessment</h3>
                <span className="text-xs text-muted-foreground ml-auto">Before controls</span>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {/* Probability */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    Probability <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.inherentProbability.toString()}
                    onValueChange={(value) => setFormData({ ...formData, inherentProbability: parseInt(value) })}
                  >
                    <SelectTrigger className={cn('h-10', getProbabilityLabel(formData.inherentProbability).color, 'border')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROBABILITY_LABELS.map((prob) => (
                        <SelectItem key={prob.value} value={prob.value.toString()}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', {
                              'bg-green-500': prob.value === 1, 'bg-blue-500': prob.value === 2,
                              'bg-yellow-500': prob.value === 3, 'bg-orange-500': prob.value === 4, 'bg-red-500': prob.value === 5,
                            })} />
                            {prob.value} - {prob.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground italic">{getProbabilityLabel(formData.inherentProbability).description}</p>
                </div>

                {/* Impact */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    Impact <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.inherentImpact.toString()}
                    onValueChange={(value) => setFormData({ ...formData, inherentImpact: parseInt(value) })}
                  >
                    <SelectTrigger className={cn('h-10', getImpactLabel(formData.inherentImpact).color, 'border')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMPACT_LABELS.map((impact) => (
                        <SelectItem key={impact.value} value={impact.value.toString()}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', {
                              'bg-green-500': impact.value === 1, 'bg-blue-500': impact.value === 2,
                              'bg-yellow-500': impact.value === 3, 'bg-orange-500': impact.value === 4, 'bg-red-500': impact.value === 5,
                            })} />
                            {impact.value} - {impact.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground italic">{getImpactLabel(formData.inherentImpact).description}</p>
                </div>
              </div>

              {/* Live Risk Score */}
              {(() => {
                const editScore = formData.inherentProbability * formData.inherentImpact
                const editLevel = getRiskLevel(editScore)
                const editProbLabel = getProbabilityLabel(formData.inherentProbability)
                const editImpactLabel = getImpactLabel(formData.inherentImpact)
                return (
                  <div className={cn('rounded-xl border-2 p-3.5 transition-all', editLevel.bgLight)}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Calculated Inherent Risk</p>
                        <p className="text-xs text-muted-foreground">
                          {editProbLabel.label} ({formData.inherentProbability}) x {editImpactLabel.label} ({formData.inherentImpact})
                        </p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className={cn('text-3xl font-bold tabular-nums', {
                          'text-green-700': editScore < 6, 'text-yellow-700': editScore >= 6 && editScore < 15,
                          'text-orange-700': editScore >= 15 && editScore < 20, 'text-red-700': editScore >= 20,
                        })}>{editScore}</span>
                        <Badge className={cn('text-xs px-2.5 py-0.5', editLevel.color)}>{editLevel.label}</Badge>
                      </div>
                    </div>
                    {/* Mini 5x5 heatmap */}
                    <div className="mt-2.5 flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(l => (
                        <div key={l} className="flex-1 flex flex-col gap-0.5">
                          {[5, 4, 3, 2, 1].map(i => {
                            const cs = l * i
                            const active = l === formData.inherentProbability && i === formData.inherentImpact
                            return (
                              <div key={`${l}-${i}`} className={cn(
                                'h-1.5 rounded-sm transition-all',
                                cs >= 20 ? 'bg-red-400' : cs >= 15 ? 'bg-orange-400' : cs >= 6 ? 'bg-yellow-400' : 'bg-green-400',
                                active && 'ring-2 ring-offset-1 ring-foreground h-2.5 -my-0.5',
                                !active && 'opacity-30'
                              )} />
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Section 3: Controls & Mitigation */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-700">Controls & Mitigation</h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Control Description
                </Label>
                <Textarea
                  value={formData.controlDescription}
                  onChange={(e) => setFormData({ ...formData, controlDescription: e.target.value })}
                  rows={2}
                  className="resize-none"
                  placeholder="Describe existing controls that address this risk..."
                />
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
                  List controls already in place. This helps determine the gap between inherent and residual risk.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  Control Reference (ISO 27001 Annex A)
                </Label>
                <Popover open={editControlSearchOpen} onOpenChange={setEditControlSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={editControlSearchOpen}
                      className="w-full justify-between h-auto min-h-[40px] font-normal"
                    >
                      {editSelectedControls.length > 0 ? (
                        <div className="flex flex-wrap gap-1 py-0.5">
                          {editSelectedControls.map((cid) => (
                            <Badge
                              key={cid}
                              variant="secondary"
                              className="text-xs gap-1 pr-1"
                            >
                              {cid}
                              <span
                                role="button"
                                tabIndex={0}
                                className="ml-0.5 hover:bg-muted-foreground/20 rounded-full p-0.5 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setEditSelectedControls(editSelectedControls.filter((id) => id !== cid))
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation()
                                    setEditSelectedControls(editSelectedControls.filter((id) => id !== cid))
                                  }
                                }}
                              >
                                <X className="h-3 w-3" />
                              </span>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Search and select controls...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search controls (e.g., A.5.1, Access, Screening)..." />
                      <CommandList>
                        <CommandEmpty>No controls found.</CommandEmpty>
                        <CommandGroup className="max-h-[250px] overflow-y-auto">
                          {availableControls.map((ctrl: any) => {
                            const isSelected = editSelectedControls.includes(ctrl.controlId)
                            return (
                              <CommandItem
                                key={ctrl.controlId}
                                value={`${ctrl.controlId} ${ctrl.name}`}
                                onSelect={() => {
                                  setEditSelectedControls(
                                    isSelected
                                      ? editSelectedControls.filter((id) => id !== ctrl.controlId)
                                      : [...editSelectedControls, ctrl.controlId]
                                  )
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    isSelected ? 'opacity-100 text-emerald-600' : 'opacity-0'
                                  )}
                                />
                                <span className="font-mono text-xs text-muted-foreground mr-2 w-12 shrink-0">
                                  {ctrl.controlId}
                                </span>
                                <span className="text-sm truncate">{ctrl.name}</span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {editSelectedControls.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {editSelectedControls.length} control{editSelectedControls.length !== 1 ? 's' : ''} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                      onClick={() => setEditSelectedControls([])}
                    >
                      Clear all
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
                  Map to relevant ISO 27001:2022 Annex A controls. Search by control number or name.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Comments
                </Label>
                <Textarea
                  value={formData.comments}
                  onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
                  rows={2}
                  className="resize-none"
                  placeholder="Additional notes, context, or review remarks..."
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t bg-muted/30 px-6 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                Editing will reset approval status to <strong>Draft</strong>
              </p>
              {selectedRisk && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setIsEditOpen(false); handleAiReview(selectedRisk.id) }}
                  className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50 hover:text-violet-800"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Review
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={handleUpdate}
                disabled={updateMutation.isPending || !formData.title}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-sm"
              >
                {updateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Update Risk
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Treatment Dialog */}
      <Dialog open={isTreatmentOpen} onOpenChange={setIsTreatmentOpen}>
        <DialogContent className="sm:max-w-[900px] w-full mx-2 max-h-[90vh] p-0 gap-0 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-700 to-teal-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/10 rounded-lg p-2">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg">Add Risk Treatment</DialogTitle>
                <DialogDescription className="text-emerald-100 text-xs mt-0.5">
                  Record treatment activities for {selectedRisk?.riskId} — {selectedRisk?.title}
                </DialogDescription>
              </div>
              {selectedRisk && (
                <Badge className={cn('ml-auto text-xs', getRiskLevel(selectedRisk.inherentRisk || 0).color)}>
                  Inherent: {getRiskLevel(selectedRisk.inherentRisk || 0).label} ({selectedRisk.inherentRisk || 0})
                </Badge>
              )}
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="overflow-auto max-h-[calc(90vh-160px)] px-6 py-5 space-y-5">

            {/* Section 1: Residual Risk Assessment */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b">
                <Gauge className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-slate-700">Residual Risk Assessment</h3>
                <span className="text-xs text-muted-foreground ml-auto">After controls</span>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {/* Residual Probability */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                    Residual Probability <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={treatmentData.residualProbability.toString()}
                    onValueChange={(value) => setTreatmentData({ ...treatmentData, residualProbability: parseInt(value) })}
                  >
                    <SelectTrigger className={cn('h-10', getProbabilityLabel(treatmentData.residualProbability).color, 'border')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PROBABILITY_LABELS.map((prob) => (
                        <SelectItem key={prob.value} value={prob.value.toString()}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', {
                              'bg-green-500': prob.value === 1, 'bg-blue-500': prob.value === 2,
                              'bg-yellow-500': prob.value === 3, 'bg-orange-500': prob.value === 4, 'bg-red-500': prob.value === 5,
                            })} />
                            {prob.value} - {prob.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground italic">{getProbabilityLabel(treatmentData.residualProbability).description}</p>
                </div>

                {/* Residual Impact */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                    Residual Impact <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={treatmentData.residualImpact.toString()}
                    onValueChange={(value) => setTreatmentData({ ...treatmentData, residualImpact: parseInt(value) })}
                  >
                    <SelectTrigger className={cn('h-10', getImpactLabel(treatmentData.residualImpact).color, 'border')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMPACT_LABELS.map((impact) => (
                        <SelectItem key={impact.value} value={impact.value.toString()}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', {
                              'bg-green-500': impact.value === 1, 'bg-blue-500': impact.value === 2,
                              'bg-yellow-500': impact.value === 3, 'bg-orange-500': impact.value === 4, 'bg-red-500': impact.value === 5,
                            })} />
                            {impact.value} - {impact.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground italic">{getImpactLabel(treatmentData.residualImpact).description}</p>
                </div>
              </div>

              {/* Live Residual Risk Score with heatmap */}
              {(() => {
                const tScore = treatmentData.residualProbability * treatmentData.residualImpact
                const tLevel = getRiskLevel(tScore)
                const tProbLabel = getProbabilityLabel(treatmentData.residualProbability)
                const tImpactLabel = getImpactLabel(treatmentData.residualImpact)
                const inherentScore = selectedRisk?.inherentRisk || (selectedRisk?.likelihood * selectedRisk?.impact) || 0
                const reduction = inherentScore > 0 ? Math.round(((inherentScore - tScore) / inherentScore) * 100) : 0
                return (
                  <div className={cn('rounded-xl border-2 p-3.5 transition-all', tLevel.bgLight)}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Calculated Residual Risk</p>
                        <p className="text-xs text-muted-foreground">
                          {tProbLabel.label} ({treatmentData.residualProbability}) x {tImpactLabel.label} ({treatmentData.residualImpact})
                        </p>
                        {reduction > 0 && (
                          <p className="text-xs text-emerald-600 font-medium">
                            {reduction}% risk reduction from inherent score ({inherentScore})
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className={cn('text-3xl font-bold tabular-nums', {
                          'text-green-700': tScore < 6, 'text-yellow-700': tScore >= 6 && tScore < 15,
                          'text-orange-700': tScore >= 15 && tScore < 20, 'text-red-700': tScore >= 20,
                        })}>{tScore}</span>
                        <Badge className={cn('text-xs px-2.5 py-0.5', tLevel.color)}>{tLevel.label}</Badge>
                      </div>
                    </div>
                    {/* Mini 5x5 heatmap */}
                    <div className="mt-2.5 flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(l => (
                        <div key={l} className="flex-1 flex flex-col gap-0.5">
                          {[5, 4, 3, 2, 1].map(i => {
                            const cs = l * i
                            const active = l === treatmentData.residualProbability && i === treatmentData.residualImpact
                            return (
                              <div key={`${l}-${i}`} className={cn(
                                'h-1.5 rounded-sm transition-all',
                                cs >= 20 ? 'bg-red-400' : cs >= 15 ? 'bg-orange-400' : cs >= 6 ? 'bg-yellow-400' : 'bg-green-400',
                                active && 'ring-2 ring-offset-1 ring-foreground h-2.5 -my-0.5',
                                !active && 'opacity-30'
                              )} />
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Section 2: Treatment Details */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b">
                <Target className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-700">Treatment Details</h3>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                    Risk Response <span className="text-red-500">*</span>
                  </Label>
                  <Select value={treatmentData.riskResponse} onValueChange={(value) => setTreatmentData({ ...treatmentData, riskResponse: value })}>
                    <SelectTrigger className={cn('h-10', {
                      'bg-blue-50 text-blue-800 border-blue-200': treatmentData.riskResponse === 'MITIGATE',
                      'bg-green-50 text-green-800 border-green-200': treatmentData.riskResponse === 'ACCEPT',
                      'bg-purple-50 text-purple-800 border-purple-200': treatmentData.riskResponse === 'TRANSFER',
                      'bg-red-50 text-red-800 border-red-200': treatmentData.riskResponse === 'AVOID',
                    })}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_RESPONSE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          <span className="flex items-center gap-2">
                            <span className={cn('h-2.5 w-2.5 rounded-full', {
                              'bg-blue-500': type === 'MITIGATE', 'bg-green-500': type === 'ACCEPT',
                              'bg-purple-500': type === 'TRANSFER', 'bg-red-500': type === 'AVOID',
                            })} />
                            {type}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
                    How the organization plans to address this risk.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Control Implementation Date
                  </Label>
                  <Input
                    type="date"
                    value={treatmentData.controlImplementationDate}
                    onChange={(e) => setTreatmentData({ ...treatmentData, controlImplementationDate: e.target.value })}
                    className="h-10"
                  />
                  <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                    <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
                    Target or actual date when treatment controls are implemented.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Control Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  value={treatmentData.controlDescription}
                  onChange={(e) => setTreatmentData({ ...treatmentData, controlDescription: e.target.value })}
                  rows={3}
                  className="resize-none"
                  placeholder="Describe the controls being implemented to treat this risk..."
                />
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
                  Detail the specific controls and measures being implemented to reduce this risk.
                </p>
              </div>
            </div>

            {/* Section 3: Control Reference & Comments */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-1 border-b">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-slate-700">Controls & Notes</h3>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  Control Reference (ISO 27001 Annex A)
                </Label>
                <Popover open={treatmentControlSearchOpen} onOpenChange={setTreatmentControlSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={treatmentControlSearchOpen}
                      className="w-full justify-between h-auto min-h-[40px] font-normal"
                    >
                      {treatmentSelectedControls.length > 0 ? (
                        <div className="flex flex-wrap gap-1 py-0.5">
                          {treatmentSelectedControls.map((cid) => (
                            <Badge
                              key={cid}
                              variant="secondary"
                              className="text-xs gap-1 pr-1"
                            >
                              {cid}
                              <span
                                role="button"
                                tabIndex={0}
                                className="ml-0.5 hover:bg-muted-foreground/20 rounded-full p-0.5 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTreatmentSelectedControls(treatmentSelectedControls.filter((id) => id !== cid))
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.stopPropagation()
                                    setTreatmentSelectedControls(treatmentSelectedControls.filter((id) => id !== cid))
                                  }
                                }}
                              >
                                <X className="h-3 w-3" />
                              </span>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Search and select controls...</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search controls (e.g., A.5.1, Access, Screening)..." />
                      <CommandList>
                        <CommandEmpty>No controls found.</CommandEmpty>
                        <CommandGroup className="max-h-[250px] overflow-y-auto">
                          {availableControls.map((ctrl: any) => {
                            const isSelected = treatmentSelectedControls.includes(ctrl.controlId)
                            return (
                              <CommandItem
                                key={ctrl.controlId}
                                value={`${ctrl.controlId} ${ctrl.name}`}
                                onSelect={() => {
                                  setTreatmentSelectedControls(
                                    isSelected
                                      ? treatmentSelectedControls.filter((id) => id !== ctrl.controlId)
                                      : [...treatmentSelectedControls, ctrl.controlId]
                                  )
                                }}
                              >
                                <Check
                                  className={cn(
                                    'mr-2 h-4 w-4',
                                    isSelected ? 'opacity-100 text-emerald-600' : 'opacity-0'
                                  )}
                                />
                                <span className="font-mono text-xs text-muted-foreground mr-2 w-12 shrink-0">
                                  {ctrl.controlId}
                                </span>
                                <span className="text-sm truncate">{ctrl.name}</span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {treatmentSelectedControls.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {treatmentSelectedControls.length} control{treatmentSelectedControls.length !== 1 ? 's' : ''} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                      onClick={() => setTreatmentSelectedControls([])}
                    >
                      Clear all
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
                  Map to relevant ISO 27001:2022 Annex A controls used in this treatment.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  Comments
                </Label>
                <Textarea
                  value={treatmentData.comments}
                  onChange={(e) => setTreatmentData({ ...treatmentData, comments: e.target.value })}
                  rows={2}
                  className="resize-none"
                  placeholder="Additional notes, review remarks, or follow-up actions..."
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t bg-muted/30 px-6 py-3.5 flex items-center justify-between">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-blue-500" />
              Treatment records are tracked in the Risk Treatment Plan tab
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsTreatmentOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  if (!selectedRisk) return
                  const controlsReference = treatmentSelectedControls
                    .map(cid => {
                      const ctrl = availableControls.find((c: any) => c.controlId === cid)
                      return ctrl ? `${ctrl.controlId} ${ctrl.name}` : cid
                    })
                    .join(', ')
                  treatmentMutation.mutate({ id: selectedRisk.id, data: { ...treatmentData, controlsReference } })
                }}
                disabled={treatmentMutation.isPending || !treatmentData.controlDescription}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 shadow-sm"
              >
                {treatmentMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                Save Treatment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Retire Dialog */}
      <Dialog open={isRetireOpen} onOpenChange={setIsRetireOpen}>
        <DialogContent className="sm:max-w-[700px] w-full mx-2 max-h-[60vh]">
          <DialogHeader>
            <DialogTitle>Retire Risk</DialogTitle>
            <DialogDescription>Retire {selectedRisk?.riskId} - {selectedRisk?.title}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-auto max-h-[48vh]">
            <div className="grid gap-2">
              <Label>Reason for Retirement</Label>
              <Textarea value={retireData.reason} onChange={(e) => setRetireData({ reason: e.target.value })} rows={4} placeholder="Explain why this risk is being retired" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRetireOpen(false)}>Cancel</Button>
            <Button onClick={() => { if (!selectedRisk) return; retireMutation.mutate({ id: selectedRisk.id, data: retireData }) }} disabled={retireMutation.isPending || !retireData.reason} variant="destructive">
              {retireMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Retire Risk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit for Review Dialog */}
      <Dialog open={isSubmitOpen} onOpenChange={setIsSubmitOpen}>
        <DialogContent className="sm:max-w-[600px] w-full mx-2">
          <DialogHeader>
            <DialogTitle>Submit Risk Register for Review</DialogTitle>
            <DialogDescription>Submit the Risk Register document for the approval workflow.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Version Bump</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['none', 'minor', 'major'] as const).map((opt) => (
                  <Button key={opt} type="button" variant={submitVersionBump === opt ? 'default' : 'outline'} size="sm" onClick={() => setSubmitVersionBump(opt)}>
                    {opt === 'none' ? 'Keep Current' : opt === 'minor' ? 'Minor' : 'Major'}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Current: v{riskDoc?.version?.toFixed(1)}
                {submitVersionBump !== 'none' && ` → ${submitVersionBump} bump`}
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Description of Change *</Label>
              <Textarea value={submitChangeDescription} onChange={(e) => setSubmitChangeDescription(e.target.value)} rows={3} placeholder="Describe the changes being submitted for review..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmitOpen(false)}>Cancel</Button>
            <Button onClick={() => submitForReviewMutation.mutate()} disabled={submitForReviewMutation.isPending || !submitChangeDescription}>
              {submitForReviewMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <SendHorizontal className="mr-2 h-4 w-4" />
              Submit for Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approval Dialog */}
      <Dialog open={isApprovalOpen} onOpenChange={setIsApprovalOpen}>
        <DialogContent className="sm:max-w-[600px] w-full mx-2">
          <DialogHeader>
            <DialogTitle>
              {riskDoc?.approvalStatus === 'PENDING_FIRST_APPROVAL' ? '1st Level Approval' : '2nd Level Approval (Final)'}
            </DialogTitle>
            <DialogDescription>
              Approve the Risk Register document (v{riskDoc?.version?.toFixed(1)}).
              {riskDoc?.approvalStatus === 'PENDING_SECOND_APPROVAL' && (
                <span className="block mt-1 text-green-600">This is the final approval.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border p-3 bg-muted/50 text-sm space-y-1">
            <div><strong>Document:</strong> {riskDoc?.title}</div>
            <div><strong>Version:</strong> {riskDoc?.version?.toFixed(1)}</div>
            <div><strong>Classification:</strong> {riskDoc?.classification}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApprovalOpen(false)}>Cancel</Button>
            <Button onClick={submitApproval} disabled={firstApprovalMutation.isPending || secondApprovalMutation.isPending} className="bg-green-600 hover:bg-green-700">
              {(firstApprovalMutation.isPending || secondApprovalMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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
            <DialogTitle>Reject Risk Register</DialogTitle>
            <DialogDescription>Reject the Risk Register document. It will be sent back for revision.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Rejection Reason *</Label>
              <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} placeholder="Explain why the Risk Register is being rejected and what changes are needed..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending || !rejectReason}>
              {rejectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <XCircle className="mr-2 h-4 w-4" />
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Revision Dialog */}
      <Dialog open={isNewRevisionOpen} onOpenChange={setIsNewRevisionOpen}>
        <DialogContent className="sm:max-w-[600px] w-full mx-2">
          <DialogHeader>
            <DialogTitle>Create New Revision</DialogTitle>
            <DialogDescription>
              Start a new revision of the Risk Register. Current approved version: v{riskDoc?.version?.toFixed(1)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Version Increment</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['minor', 'major'] as const).map((opt) => (
                  <Button key={opt} type="button" variant={revisionVersionBump === opt ? 'default' : 'outline'} size="sm" onClick={() => setRevisionVersionBump(opt)}>
                    {opt === 'minor' ? `Minor (e.g., ${riskDoc?.version?.toFixed(1)} → next minor)` : `Major (e.g., → ${(Math.floor(riskDoc?.version || 0) + 1)}.0)`}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Description of Change *</Label>
              <Textarea value={revisionChangeDescription} onChange={(e) => setRevisionChangeDescription(e.target.value)} rows={3} placeholder="Describe what changes will be made in this revision..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewRevisionOpen(false)}>Cancel</Button>
            <Button onClick={() => newRevisionMutation.mutate()} disabled={newRevisionMutation.isPending || !revisionChangeDescription}>
              {newRevisionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Pencil className="mr-2 h-4 w-4" />
              Start New Revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Risk Review Dialog */}
      <Dialog open={!!aiReviewRiskId} onOpenChange={(open) => { if (!open) { setAiReviewRiskId(null); setAiReviewResult(null) } }}>
        <DialogContent className="sm:max-w-[750px] max-h-[85vh] p-0 gap-0 overflow-hidden">
          <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="bg-white/10 rounded-lg p-2">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <DialogTitle className="text-white text-lg">AI Risk Review</DialogTitle>
                <DialogDescription className="text-violet-200 text-xs mt-0.5">
                  AI-generated analysis of this risk assessment
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="overflow-auto max-h-[calc(85vh-80px)] p-6">
            {aiReviewLoading ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <div className="relative">
                  <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  <Sparkles className="h-4 w-4 text-violet-400 absolute -top-1 -right-1 animate-pulse" />
                </div>
                <p className="text-sm font-medium text-violet-700">Reviewing risk assessment...</p>
                <p className="text-xs text-muted-foreground">Analyzing description, scoring, controls, and treatment strategy.</p>
              </div>
            ) : aiReviewResult ? (
              <div className="bg-gradient-to-r from-violet-50/50 to-purple-50/30 border border-violet-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-violet-100">
                  <Bot className="h-3.5 w-3.5 text-violet-500" />
                  <span className="text-xs font-medium text-violet-600">AI Expert Review</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">Review all recommendations before acting</span>
                </div>
                <div className="text-sm leading-relaxed">{renderMarkdown(aiReviewResult)}</div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Discard Revision Dialog */}
      <Dialog open={isDiscardRevisionOpen} onOpenChange={setIsDiscardRevisionOpen}>
        <DialogContent className="sm:max-w-[500px] w-full mx-2">
          <DialogHeader>
            <DialogTitle>Discard Revision</DialogTitle>
            <DialogDescription>
              Are you sure you want to discard the current draft revision (v{riskDoc?.version?.toFixed(1)})? This will revert the document to its previous approved version.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDiscardRevisionOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => discardRevisionMutation.mutate()} disabled={discardRevisionMutation.isPending}>
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
