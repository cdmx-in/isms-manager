import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Upload,
  Link2,
  StickyNote,
  Trash2,
  Plus,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  MinusCircle,
  Info,
  Eye,
  Search,
  BarChart3,
  Sparkles,
  Bot,
  Send,
  Loader2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ============================================
// Constants
// ============================================

const STATUS_ICON: Record<string, any> = {
  NOT_STARTED: Circle,
  IN_PROGRESS: Clock,
  COMPLIANT: CheckCircle2,
  PARTIALLY_COMPLIANT: AlertTriangle,
  NON_COMPLIANT: XCircle,
  NOT_APPLICABLE: MinusCircle,
}

const STATUS_COLOR: Record<string, string> = {
  NOT_STARTED: 'text-gray-400',
  IN_PROGRESS: 'text-blue-500',
  COMPLIANT: 'text-green-500',
  PARTIALLY_COMPLIANT: 'text-yellow-500',
  NON_COMPLIANT: 'text-red-500',
  NOT_APPLICABLE: 'text-gray-400',
}

const STATUS_BADGE: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLIANT: 'bg-green-100 text-green-700',
  PARTIALLY_COMPLIANT: 'bg-yellow-100 text-yellow-700',
  NON_COMPLIANT: 'bg-red-100 text-red-700',
  NOT_APPLICABLE: 'bg-gray-100 text-gray-500',
}

const STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLIANT: 'Compliant',
  PARTIALLY_COMPLIANT: 'Partially Compliant',
  NON_COMPLIANT: 'Non-Compliant',
  NOT_APPLICABLE: 'Not Applicable',
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-100 text-red-800',
  HIGH: 'bg-orange-100 text-orange-800',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  LOW: 'bg-blue-100 text-blue-700',
  INFORMATIONAL: 'bg-gray-100 text-gray-600',
}

const FINDING_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-red-100 text-red-700',
  IN_REMEDIATION: 'bg-yellow-100 text-yellow-700',
  REMEDIATED: 'bg-green-100 text-green-700',
  ACCEPTED: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-gray-100 text-gray-600',
}

const PHASE_LABELS = [
  'Kick-off & Documentation',
  'Interviews & Workshops',
  'Analysis & Risk Identification',
  'Review & Final Report',
]

const FRAMEWORK_COLORS: Record<string, string> = {
  'fca-operational-resilience': 'border-l-indigo-500',
  'fca-safeguarding': 'border-l-purple-500',
  'fca-rep018': 'border-l-red-500',
  'iso27001-assessment': 'border-l-blue-500',
  'dora': 'border-l-emerald-500',
  'iso42001-assessment': 'border-l-violet-500',
  'dpdpa-assessment': 'border-l-amber-500',
}

const FRAMEWORK_BG: Record<string, string> = {
  'fca-operational-resilience': 'bg-indigo-50',
  'fca-safeguarding': 'bg-purple-50',
  'fca-rep018': 'bg-red-50',
  'iso27001-assessment': 'bg-blue-50',
  'dora': 'bg-emerald-50',
  'iso42001-assessment': 'bg-violet-50',
  'dpdpa-assessment': 'bg-amber-50',
}

// ============================================
// Simple Markdown Renderer
// ============================================

function renderMarkdown(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    // Headers
    if (line.startsWith('### ')) {
      return <h3 key={i} className="text-sm font-semibold mt-3 mb-1 text-foreground">{line.replace('### ', '')}</h3>
    }
    if (line.startsWith('## ')) {
      return <h2 key={i} className="text-base font-semibold mt-4 mb-2 text-foreground">{line.replace('## ', '')}</h2>
    }
    if (line.startsWith('# ')) {
      return <h2 key={i} className="text-lg font-bold mt-4 mb-2 text-foreground">{line.replace('# ', '')}</h2>
    }
    // Bold bullet points
    if (line.match(/^[-*]\s+\*\*/)) {
      const content = line.replace(/^[-*]\s*/, '')
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-violet-400 mt-0.5 flex-shrink-0">{'\u2022'}</span>
          <span dangerouslySetInnerHTML={{
            __html: content
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-violet-100 rounded text-xs font-mono">$1</code>')
          }} />
        </div>
      )
    }
    // Regular bullet points
    if (line.match(/^[-*]\s+/)) {
      const content = line.replace(/^[-*]\s*/, '')
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-violet-400 mt-0.5 flex-shrink-0">{'\u2022'}</span>
          <span dangerouslySetInnerHTML={{
            __html: content
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-violet-100 rounded text-xs font-mono">$1</code>')
          }} />
        </div>
      )
    }
    // Numbered list items
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\./)?.[1]
      const content = line.replace(/^\d+\.\s*/, '')
      return (
        <div key={i} className="flex gap-2 ml-2 my-0.5">
          <span className="text-violet-500 font-semibold min-w-[20px] flex-shrink-0">{num}.</span>
          <span dangerouslySetInnerHTML={{
            __html: content
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-violet-100 rounded text-xs font-mono">$1</code>')
          }} />
        </div>
      )
    }
    // Empty lines
    if (!line.trim()) return <div key={i} className="h-2" />
    // Regular paragraphs with inline formatting
    return (
      <p key={i} className="my-0.5" dangerouslySetInnerHTML={{
        __html: line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 bg-violet-100 rounded text-xs font-mono">$1</code>')
      }} />
    )
  })
}

// ============================================
// Main Component
// ============================================

export default function AssessmentConductPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [activeTab, setActiveTab] = useState('requirements')
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null)
  const [expandedFrameworks, setExpandedFrameworks] = useState<Set<string>>(new Set())
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set())

  // Finding dialog
  const [showFindingDialog, setShowFindingDialog] = useState(false)
  const [editingFinding, setEditingFinding] = useState<any>(null)
  const [findingForm, setFindingForm] = useState({
    title: '', description: '', frameworkSlug: '', requirementId: '',
    severity: 'MEDIUM', likelihood: 3, impact: 3,
    recommendation: '', remediationPlan: '', targetDate: '', ownerId: '',
  })

  // Evidence dialog
  const [showEvidenceDialog, setShowEvidenceDialog] = useState(false)
  const [evidenceForm, setEvidenceForm] = useState({
    title: '', description: '', evidenceType: 'link', link: '',
  })

  // Finding filter
  const [findingFilter, setFindingFilter] = useState({ severity: '', status: '', framework: '' })

  // AI Assistant state
  const [aiRequirementResponse, setAiRequirementResponse] = useState<string | null>(null)
  const [aiRequirementLoading, setAiRequirementLoading] = useState(false)
  const [aiAssistOpen, setAiAssistOpen] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false)

  // AI Finding guidance state
  const [aiFindingGuidance, setAiFindingGuidance] = useState<string | null>(null)
  const [aiFindingGuidanceLoading, setAiFindingGuidanceLoading] = useState(false)

  // Save timer ref for auto-save
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)

  // ============================================
  // Data Fetching
  // ============================================

  const { data: assessment, isLoading: loadingAssessment } = useQuery({
    queryKey: ['assessment', id],
    queryFn: () => api.assessments.get(id!),
    enabled: !!id,
  })

  const { data: requirements = [], isLoading: loadingReqs } = useQuery({
    queryKey: ['assessment-requirements', id],
    queryFn: () => api.assessments.getRequirements(id!),
    enabled: !!id,
  })

  const { data: findings = [] } = useQuery({
    queryKey: ['assessment-findings', id],
    queryFn: () => api.assessments.getFindings(id!),
    enabled: !!id,
  })

  const { data: progress } = useQuery({
    queryKey: ['assessment-progress', id],
    queryFn: () => api.assessments.getProgress(id!),
    enabled: !!id,
  })

  // ============================================
  // Mutations
  // ============================================

  const updateRequirementMutation = useMutation({
    mutationFn: ({ reqId, data }: { reqId: string; data: any }) =>
      api.assessments.updateRequirement(id!, reqId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-requirements', id] })
      queryClient.invalidateQueries({ queryKey: ['assessment-progress', id] })
    },
  })

  const updateAssessmentMutation = useMutation({
    mutationFn: (data: any) => api.assessments.update(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment', id] })
    },
  })

  const addEvidenceFileMutation = useMutation({
    mutationFn: ({ reqId, formData }: { reqId: string; formData: FormData }) =>
      api.assessments.addEvidence(id!, reqId, formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-requirements', id] })
      toast({ title: 'Evidence uploaded' })
    },
    onError: () => {
      toast({ title: 'Upload failed', variant: 'destructive' })
    },
  })

  const addEvidenceLinkMutation = useMutation({
    mutationFn: ({ reqId, data }: { reqId: string; data: any }) =>
      api.assessments.addEvidenceLink(id!, reqId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-requirements', id] })
      setShowEvidenceDialog(false)
      toast({ title: 'Evidence added' })
    },
  })

  const removeEvidenceMutation = useMutation({
    mutationFn: (evidenceId: string) => api.assessments.removeEvidence(id!, evidenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-requirements', id] })
    },
  })

  const createFindingMutation = useMutation({
    mutationFn: (data: any) => api.assessments.createFinding(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-findings', id] })
      queryClient.invalidateQueries({ queryKey: ['assessment-progress', id] })
      setShowFindingDialog(false)
      toast({ title: 'Finding created' })
    },
  })

  const updateFindingMutation = useMutation({
    mutationFn: ({ findingId, data }: { findingId: string; data: any }) =>
      api.assessments.updateFinding(id!, findingId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-findings', id] })
      queryClient.invalidateQueries({ queryKey: ['assessment-progress', id] })
      setShowFindingDialog(false)
    },
  })

  const deleteFindingMutation = useMutation({
    mutationFn: (findingId: string) => api.assessments.deleteFinding(id!, findingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessment-findings', id] })
      queryClient.invalidateQueries({ queryKey: ['assessment-progress', id] })
    },
  })

  // ============================================
  // Build tree structure
  // ============================================

  type FrameworkTree = {
    slug: string;
    name: string;
    domains: { code: string; name: string; requirements: any[] }[];
  }

  const frameworkTree: FrameworkTree[] = (() => {
    const map = new Map<string, Map<string, any[]>>()
    const fwNames = new Map<string, string>()
    const domainNames = new Map<string, string>()

    for (const r of requirements) {
      if (!map.has(r.frameworkSlug)) map.set(r.frameworkSlug, new Map())
      const domains = map.get(r.frameworkSlug)!
      if (!domains.has(r.domainCode)) domains.set(r.domainCode, [])
      domains.get(r.domainCode)!.push(r)
      domainNames.set(`${r.frameworkSlug}:${r.domainCode}`, r.domainName)

      // Use framework short name from progress data or slug
      const fw = progress?.frameworks?.find((f: any) => f.slug === r.frameworkSlug)
      fwNames.set(r.frameworkSlug, fw?.shortName || r.frameworkSlug)
    }

    return Array.from(map.entries()).map(([slug, domains]) => ({
      slug,
      name: fwNames.get(slug) || slug,
      domains: Array.from(domains.entries()).map(([code, reqs]) => ({
        code,
        name: domainNames.get(`${slug}:${code}`) || code,
        requirements: reqs.sort((a: any, b: any) => a.sortOrder - b.sortOrder),
      })),
    }))
  })()

  // Select first requirement on load
  useEffect(() => {
    if (requirements.length > 0 && !selectedReqId) {
      setSelectedReqId(requirements[0].id)
    }
  }, [requirements, selectedReqId])

  const selectedReq = requirements.find((r: any) => r.id === selectedReqId)

  // Flat list for prev/next navigation
  const flatReqs = requirements.sort((a: any, b: any) => a.sortOrder - b.sortOrder)
  const currentIdx = flatReqs.findIndex((r: any) => r.id === selectedReqId)

  const goNext = () => {
    if (currentIdx < flatReqs.length - 1) {
      setSelectedReqId(flatReqs[currentIdx + 1].id)
    }
  }
  const goPrev = () => {
    if (currentIdx > 0) {
      setSelectedReqId(flatReqs[currentIdx - 1].id)
    }
  }

  // ============================================
  // Auto-save handler
  // ============================================

  const debouncedSave = useCallback((reqId: string, field: string, value: any) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      updateRequirementMutation.mutate({ reqId, data: { [field]: value } })
    }, 800)
  }, [id])

  // ============================================
  // Handlers
  // ============================================

  const handleStatusChange = (reqId: string, status: string) => {
    updateRequirementMutation.mutate({ reqId, data: { status } })
  }

  const handleFileUpload = (reqId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('title', file.name)
    formData.append('evidenceType', 'document')
    addEvidenceFileMutation.mutate({ reqId, formData })
  }

  const handleAddEvidenceLink = () => {
    if (!selectedReqId || !evidenceForm.title) return
    addEvidenceLinkMutation.mutate({
      reqId: selectedReqId,
      data: evidenceForm,
    })
    setEvidenceForm({ title: '', description: '', evidenceType: 'link', link: '' })
  }

  const handleSaveFinding = () => {
    const data = {
      ...findingForm,
      likelihood: Number(findingForm.likelihood),
      impact: Number(findingForm.impact),
    }
    if (editingFinding) {
      updateFindingMutation.mutate({ findingId: editingFinding.id, data })
    } else {
      createFindingMutation.mutate(data)
    }
  }

  const openNewFinding = (fromReq?: any) => {
    setEditingFinding(null)
    setAiFindingGuidance(null)
    setFindingForm({
      title: fromReq ? `Finding: ${fromReq.title}` : '',
      description: fromReq ? `Non-compliance identified for ${fromReq.requirementCode}: ${fromReq.title}\n\nDetails: ` : '',
      frameworkSlug: fromReq?.frameworkSlug || '',
      requirementId: fromReq?.id || '',
      severity: 'MEDIUM',
      likelihood: 3,
      impact: 3,
      recommendation: '',
      remediationPlan: '',
      targetDate: '',
      ownerId: '',
    })
    setShowFindingDialog(true)
  }

  const openEditFinding = (finding: any) => {
    setEditingFinding(finding)
    setAiFindingGuidance(null)
    setFindingForm({
      title: finding.title,
      description: finding.description,
      frameworkSlug: finding.frameworkSlug || '',
      requirementId: finding.requirementId || '',
      severity: finding.severity,
      likelihood: finding.likelihood,
      impact: finding.impact,
      recommendation: finding.recommendation || '',
      remediationPlan: finding.remediationPlan || '',
      targetDate: finding.targetDate ? new Date(finding.targetDate).toISOString().split('T')[0] : '',
      ownerId: finding.ownerId || '',
    })
    setShowFindingDialog(true)
  }

  const handleDownloadReport = async () => {
    try {
      const blob = await api.assessments.getReport(id!)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `assessment-report-${id?.substring(0, 8)}.pdf`
      a.click()
      window.URL.revokeObjectURL(url)
      toast({ title: 'Report downloaded' })
    } catch {
      toast({ title: 'Failed to generate report', variant: 'destructive' })
    }
  }

  // ============================================
  // AI Assistant handlers
  // ============================================

  const handleAiAssistRequirement = async (reqId: string, question?: string) => {
    setAiRequirementLoading(true)
    setAiRequirementResponse(null)
    setAiAssistOpen(true)
    try {
      const result = await api.assessments.aiAssistRequirement(id!, reqId, question || undefined)
      setAiRequirementResponse(result.response)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to get AI assistance. Ensure OpenAI API key is configured.'
      setAiRequirementResponse(`Error: ${msg}`)
    } finally {
      setAiRequirementLoading(false)
    }
  }

  const handleAiAnalyzeAssessment = async () => {
    setAiAnalysisLoading(true)
    setAiAnalysis(null)
    try {
      const result = await api.assessments.aiAnalyze(id!)
      setAiAnalysis(result.analysis)
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to generate AI analysis. Ensure OpenAI API key is configured.'
      setAiAnalysis(`Error: ${msg}`)
    } finally {
      setAiAnalysisLoading(false)
    }
  }

  const handleAiFindingGuidance = async () => {
    setAiFindingGuidanceLoading(true)
    setAiFindingGuidance(null)
    try {
      // Build context from the finding form + related requirement
      const relatedReq = requirements.find((r: any) => r.id === findingForm.requirementId)
      const context = {
        title: findingForm.title,
        description: findingForm.description,
        severity: findingForm.severity,
        likelihood: findingForm.likelihood,
        impact: findingForm.impact,
        framework: findingForm.frameworkSlug,
        relatedRequirement: relatedReq ? `${relatedReq.requirementCode}: ${relatedReq.title}` : undefined,
        relatedGuidance: relatedReq?.guidance,
      }
      const result = await api.assessments.aiAssistRequirement(
        id!,
        findingForm.requirementId || requirements[0]?.id || '',
        `I'm creating a finding with this context: ${JSON.stringify(context)}. Please provide:\n1. A recommended severity justification\n2. Suggested remediation steps\n3. Recommended target timeline\n4. Key evidence to collect`
      )
      setAiFindingGuidance(result.response)
    } catch (err: any) {
      setAiFindingGuidance('AI guidance unavailable. Ensure OpenAI API key is configured.')
    } finally {
      setAiFindingGuidanceLoading(false)
    }
  }

  // ============================================
  // Filter findings
  // ============================================

  const filteredFindings = findings.filter((f: any) => {
    if (findingFilter.severity && f.severity !== findingFilter.severity) return false
    if (findingFilter.status && f.status !== findingFilter.status) return false
    if (findingFilter.framework && f.frameworkSlug !== findingFilter.framework) return false
    return true
  })

  // ============================================
  // Loading state
  // ============================================

  if (loadingAssessment || loadingReqs) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!assessment) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Assessment not found.</p>
        <Button onClick={() => navigate('/assessments')} className="mt-4">Back to Assessments</Button>
      </div>
    )
  }

  // ============================================
  // Render
  // ============================================

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <Button variant="ghost" size="icon" onClick={() => navigate('/assessments')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" />
            {assessment.title}
          </h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            {assessment.clientName && <span>Client: {assessment.clientName}</span>}
            {assessment.assessorName && <span>Assessor: {assessment.assessorName}</span>}
            <Badge variant="secondary" className={STATUS_BADGE[assessment.status] || 'bg-gray-100'}>
              {STATUS_LABELS[assessment.status] || assessment.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(assessment.currentPhase)}
            onValueChange={v => updateAssessmentMutation.mutate({ currentPhase: Number(v) })}
          >
            <SelectTrigger className="w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PHASE_LABELS.map((label, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  Phase {i + 1}: {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={assessment.status}
            onValueChange={v => updateAssessmentMutation.mutate({ status: v })}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Phase Progress Bar */}
      <div className="flex items-center gap-1 flex-shrink-0 mt-4">
        {PHASE_LABELS.map((label, i) => (
          <div key={i} className="flex-1">
            <div
              className={`h-2 rounded-full ${
                i + 1 <= assessment.currentPhase ? 'bg-primary' : 'bg-gray-200'
              }`}
            />
            <p className={`text-xs mt-1 ${i + 1 <= assessment.currentPhase ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col mt-4">
        <TabsList className="flex-shrink-0">
          <TabsTrigger value="requirements" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Requirements
            {progress && (
              <Badge variant="secondary" className="ml-1 text-xs">
                {progress.overall?.progressPercent || 0}%
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="findings" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Findings
            {findings.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs bg-orange-100 text-orange-700">
                {findings.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="summary" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Summary & Report
          </TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* TAB 1: REQUIREMENTS (Guided Walkthrough) */}
        {/* ============================================ */}
        <TabsContent value="requirements" className="mt-2 flex-1 min-h-0">
          <div className="flex gap-4">
            {/* Left Sidebar - Framework Navigation Tree */}
            <div className="w-72 flex-shrink-0 border rounded-lg bg-card overflow-y-auto">
              <div className="p-3 border-b bg-muted/30">
                <p className="text-sm font-medium">Frameworks & Requirements</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {progress?.overall?.assessed || 0} of {progress?.overall?.total || 0} assessed
                </p>
                {/* Overall progress bar */}
                <div className="h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${progress?.overall?.progressPercent || 0}%` }}
                  />
                </div>
              </div>

              <div className="p-1">
                {frameworkTree.map(fw => {
                  const fwProgress = progress?.frameworks?.find((f: any) => f.slug === fw.slug)
                  const isExpanded = expandedFrameworks.has(fw.slug)

                  return (
                    <div key={fw.slug} className={`border-l-4 ${FRAMEWORK_COLORS[fw.slug] || 'border-l-gray-300'} mb-1 rounded-r`}>
                      {/* Framework header */}
                      <button
                        className={`w-full flex items-center gap-2 p-2 text-left text-sm font-medium hover:bg-muted/50 rounded-r ${FRAMEWORK_BG[fw.slug] || ''}`}
                        onClick={() => {
                          const next = new Set(expandedFrameworks)
                          isExpanded ? next.delete(fw.slug) : next.add(fw.slug)
                          setExpandedFrameworks(next)
                        }}
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
                        <span className="flex-1 truncate">{fw.name}</span>
                        <span className="text-xs text-muted-foreground">{fwProgress?.progressPercent || 0}%</span>
                      </button>

                      {/* Domains */}
                      {isExpanded && fw.domains.map(domain => {
                        const domKey = `${fw.slug}:${domain.code}`
                        const isDomExpanded = expandedDomains.has(domKey)
                        const domAssessed = domain.requirements.filter((r: any) => r.status !== 'NOT_STARTED').length

                        return (
                          <div key={domKey} className="ml-3">
                            <button
                              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/30 rounded"
                              onClick={() => {
                                const next = new Set(expandedDomains)
                                isDomExpanded ? next.delete(domKey) : next.add(domKey)
                                setExpandedDomains(next)
                              }}
                            >
                              {isDomExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              <span className="flex-1 truncate">{domain.name}</span>
                              <span className="text-[10px]">{domAssessed}/{domain.requirements.length}</span>
                            </button>

                            {/* Requirements */}
                            {isDomExpanded && domain.requirements.map((r: any) => {
                              const Icon = STATUS_ICON[r.status] || Circle
                              const isSelected = r.id === selectedReqId

                              return (
                                <button
                                  key={r.id}
                                  className={`w-full flex items-center gap-2 px-3 py-1.5 ml-2 text-left text-xs rounded transition-colors ${
                                    isSelected ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted/30 text-foreground'
                                  }`}
                                  onClick={() => setSelectedReqId(r.id)}
                                >
                                  <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${STATUS_COLOR[r.status]}`} />
                                  <span className="truncate">{r.requirementCode}</span>
                                  {r.evidence?.length > 0 && (
                                    <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Main Content - Selected Requirement */}
            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto pr-1 space-y-4">
              {selectedReq ? (
                <>
                  {/* Requirement Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{selectedReq.frameworkSlug}</Badge>
                        <Badge variant="outline" className="text-xs">{selectedReq.domainCode}</Badge>
                        <span className="font-mono text-sm font-bold text-primary">{selectedReq.requirementCode}</span>
                      </div>
                      <h2 className="text-lg font-semibold mt-1">{selectedReq.title}</h2>
                      {selectedReq.description && (
                        <p className="text-sm text-muted-foreground mt-1">{selectedReq.description}</p>
                      )}
                    </div>
                    <Badge className={STATUS_BADGE[selectedReq.status] || ''}>
                      {STATUS_LABELS[selectedReq.status] || selectedReq.status}
                    </Badge>
                  </div>

                  {/* Guidance Card */}
                  {selectedReq.guidance && (
                    <Card className="border-blue-200 bg-blue-50/50">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2 text-blue-700">
                          <Info className="h-4 w-4" />
                          Verification Guidance
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-sm whitespace-pre-line text-blue-900/80 leading-relaxed">
                          {selectedReq.guidance}
                        </div>
                        {selectedReq.evidenceHint && (
                          <div className="mt-3 pt-3 border-t border-blue-200">
                            <p className="text-xs font-medium text-blue-700 mb-1">Expected Evidence:</p>
                            <p className="text-xs text-blue-800/70">{selectedReq.evidenceHint}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Assessment Section */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Assessment</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Compliance Status</label>
                          <Select
                            value={selectedReq.status}
                            onValueChange={v => handleStatusChange(selectedReq.id, v)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_LABELS).map(([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  <span className="flex items-center gap-2">
                                    {(() => { const I = STATUS_ICON[key]; return <I className={`h-3.5 w-3.5 ${STATUS_COLOR[key]}`} /> })()}
                                    {label}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Risk Level</label>
                          <Select
                            value={selectedReq.riskLevel || ''}
                            onValueChange={v => updateRequirementMutation.mutate({ reqId: selectedReq.id, data: { riskLevel: v } })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select risk level" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Critical">Critical</SelectItem>
                              <SelectItem value="High">High</SelectItem>
                              <SelectItem value="Medium">Medium</SelectItem>
                              <SelectItem value="Low">Low</SelectItem>
                              <SelectItem value="Informational">Informational</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Assessor Notes</label>
                        <Textarea
                          className="mt-1"
                          rows={3}
                          placeholder="Document your observations, what was verified, and any issues found..."
                          defaultValue={selectedReq.assessorNotes || ''}
                          onBlur={e => {
                            if (e.target.value !== (selectedReq.assessorNotes || '')) {
                              updateRequirementMutation.mutate({ reqId: selectedReq.id, data: { assessorNotes: e.target.value } })
                            }
                          }}
                          key={selectedReq.id + '-notes'}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Findings / Issues</label>
                        <Textarea
                          className="mt-1"
                          rows={2}
                          placeholder="Record any specific findings or gaps identified..."
                          defaultValue={selectedReq.findings || ''}
                          onBlur={e => {
                            if (e.target.value !== (selectedReq.findings || '')) {
                              updateRequirementMutation.mutate({ reqId: selectedReq.id, data: { findings: e.target.value } })
                            }
                          }}
                          key={selectedReq.id + '-findings'}
                        />
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Create finding from this requirement */}
                        {(selectedReq.status === 'NON_COMPLIANT' || selectedReq.status === 'PARTIALLY_COMPLIANT') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-orange-700 border-orange-200 hover:bg-orange-50"
                            onClick={() => openNewFinding(selectedReq)}
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Create Finding
                          </Button>
                        )}
                        {/* AI Assist button */}
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-violet-700 border-violet-200 hover:bg-violet-50"
                          onClick={() => handleAiAssistRequirement(selectedReq.id)}
                          disabled={aiRequirementLoading}
                        >
                          {aiRequirementLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          AI Assist
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* AI Assistant Panel */}
                  {aiAssistOpen && (
                    <Card className="border-violet-200 bg-gradient-to-r from-violet-50/50 to-purple-50/30">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center justify-between">
                          <span className="flex items-center gap-2 text-violet-700">
                            <Bot className="h-4 w-4" />
                            AI Compliance Assistant
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground"
                            onClick={() => { setAiAssistOpen(false); setAiRequirementResponse(null); setAiQuestion('') }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {aiRequirementLoading ? (
                          <div className="flex items-center gap-3 py-6 justify-center text-violet-600">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span className="text-sm">Analyzing requirement...</span>
                          </div>
                        ) : aiRequirementResponse ? (
                          <div className="text-sm leading-relaxed text-foreground/90 bg-white/60 p-3 rounded-lg border border-violet-100">
                            {renderMarkdown(aiRequirementResponse)}
                          </div>
                        ) : null}

                        {/* Ask a follow-up question */}
                        <div className="flex items-center gap-2">
                          <Input
                            placeholder="Ask a follow-up question about this requirement..."
                            value={aiQuestion}
                            onChange={e => setAiQuestion(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && aiQuestion.trim()) {
                                handleAiAssistRequirement(selectedReq.id, aiQuestion)
                                setAiQuestion('')
                              }
                            }}
                            className="bg-white/80 border-violet-200"
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            className="flex-shrink-0 border-violet-200 hover:bg-violet-100"
                            disabled={!aiQuestion.trim() || aiRequirementLoading}
                            onClick={() => {
                              if (aiQuestion.trim()) {
                                handleAiAssistRequirement(selectedReq.id, aiQuestion)
                                setAiQuestion('')
                              }
                            }}
                          >
                            <Send className="h-4 w-4 text-violet-600" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Evidence Section */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Evidence ({selectedReq.evidence?.length || 0})
                        </span>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs h-7"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="h-3 w-3" />
                            Upload File
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs h-7"
                            onClick={() => {
                              setEvidenceForm({ title: '', description: '', evidenceType: 'link', link: '' })
                              setShowEvidenceDialog(true)
                            }}
                          >
                            <Link2 className="h-3 w-3" />
                            Add Link/Note
                          </Button>
                          <input
                            ref={fileInputRef}
                            type="file"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0]
                              if (file && selectedReqId) {
                                handleFileUpload(selectedReqId, file)
                                e.target.value = ''
                              }
                            }}
                          />
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {selectedReq.evidence?.length > 0 ? (
                        <div className="space-y-2">
                          {selectedReq.evidence.map((ev: any) => (
                            <div key={ev.id} className="flex items-center gap-3 p-2 border rounded-lg bg-muted/20">
                              {ev.evidenceType === 'document' ? (
                                <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                              ) : ev.evidenceType === 'link' ? (
                                <Link2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                              ) : (
                                <StickyNote className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{ev.title}</p>
                                {ev.description && <p className="text-xs text-muted-foreground truncate">{ev.description}</p>}
                                {ev.link && (
                                  <a href={ev.link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                                    {ev.link}
                                  </a>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(ev.collectedAt).toLocaleDateString()}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removeEvidenceMutation.mutate(ev.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No evidence collected yet. Upload files or add links to document your findings.
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Navigation */}
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="outline"
                      onClick={goPrev}
                      disabled={currentIdx <= 0}
                      className="gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {currentIdx + 1} of {flatReqs.length}
                    </span>
                    <Button
                      onClick={goNext}
                      disabled={currentIdx >= flatReqs.length - 1}
                      className="gap-2"
                    >
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  Select a requirement from the navigation tree to begin assessment.
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 2: FINDINGS REGISTER */}
        {/* ============================================ */}
        <TabsContent value="findings" className="mt-2 flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => openNewFinding()} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Finding
              </Button>
              <Select value={findingFilter.severity} onValueChange={v => setFindingFilter(prev => ({ ...prev, severity: v === 'all' ? '' : v }))}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severities</SelectItem>
                  <SelectItem value="CRITICAL">Critical</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="INFORMATIONAL">Informational</SelectItem>
                </SelectContent>
              </Select>
              <Select value={findingFilter.status} onValueChange={v => setFindingFilter(prev => ({ ...prev, status: v === 'all' ? '' : v }))}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="IN_REMEDIATION">In Remediation</SelectItem>
                  <SelectItem value="REMEDIATED">Remediated</SelectItem>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="CLOSED">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Findings Table */}
            {filteredFindings.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">No findings recorded yet.</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Findings are created during the assessment when non-compliant or partially compliant requirements are identified.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/50 border-b">
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Ref</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Title</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Framework</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Severity</th>
                      <th className="text-center p-3 text-xs font-medium text-muted-foreground">L</th>
                      <th className="text-center p-3 text-xs font-medium text-muted-foreground">I</th>
                      <th className="text-center p-3 text-xs font-medium text-muted-foreground">Score</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 text-xs font-medium text-muted-foreground">Target</th>
                      <th className="p-3 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFindings.map((finding: any) => (
                      <tr key={finding.id} className="border-b hover:bg-muted/20">
                        <td className="p-3 text-sm font-mono font-medium">{finding.findingRef}</td>
                        <td className="p-3 text-sm max-w-[200px] truncate">{finding.title}</td>
                        <td className="p-3">
                          <Badge variant="secondary" className="text-xs">
                            {finding.frameworkSlug || '-'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge className={`text-xs ${SEVERITY_COLORS[finding.severity] || ''}`}>
                            {finding.severity}
                          </Badge>
                        </td>
                        <td className="p-3 text-center text-sm">{finding.likelihood}</td>
                        <td className="p-3 text-center text-sm">{finding.impact}</td>
                        <td className="p-3 text-center">
                          <span className={`text-sm font-bold ${
                            (finding.riskScore || 0) >= 15 ? 'text-red-600' :
                            (finding.riskScore || 0) >= 10 ? 'text-orange-600' :
                            (finding.riskScore || 0) >= 5 ? 'text-yellow-600' : 'text-green-600'
                          }`}>
                            {finding.riskScore || finding.likelihood * finding.impact}
                          </span>
                        </td>
                        <td className="p-3">
                          <Select
                            value={finding.status}
                            onValueChange={v => updateFindingMutation.mutate({ findingId: finding.id, data: { status: v } })}
                          >
                            <SelectTrigger className="h-7 text-xs w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="OPEN">Open</SelectItem>
                              <SelectItem value="IN_REMEDIATION">In Remediation</SelectItem>
                              <SelectItem value="REMEDIATED">Remediated</SelectItem>
                              <SelectItem value="ACCEPTED">Accepted</SelectItem>
                              <SelectItem value="CLOSED">Closed</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {finding.targetDate ? new Date(finding.targetDate).toLocaleDateString() : '-'}
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openEditFinding(finding)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => deleteFindingMutation.mutate(finding.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 3: SUMMARY & REPORT */}
        {/* ============================================ */}
        <TabsContent value="summary" className="mt-2 flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-6">
            {/* Overall Progress */}
            <div className="grid grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-primary">{progress?.overall?.progressPercent || 0}%</p>
                  <p className="text-xs text-muted-foreground mt-1">Overall Progress</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-green-600">{progress?.overall?.compliant || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Compliant</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{progress?.overall?.partiallyCompliant || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Partially Compliant</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-red-600">{progress?.overall?.nonCompliant || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Non-Compliant</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-gray-400">{progress?.overall?.notStarted || 0}</p>
                  <p className="text-xs text-muted-foreground mt-1">Not Started</p>
                </CardContent>
              </Card>
            </div>

            {/* Per-Framework Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Framework Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(progress?.frameworks || []).map((fw: any) => (
                  <div key={fw.slug}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{fw.shortName || fw.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {fw.assessed}/{fw.total} assessed ({fw.progressPercent}%)
                      </span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                      {fw.compliant > 0 && (
                        <div className="bg-green-500 h-full" style={{ width: `${(fw.compliant / fw.total) * 100}%` }} />
                      )}
                      {fw.partiallyCompliant > 0 && (
                        <div className="bg-yellow-400 h-full" style={{ width: `${(fw.partiallyCompliant / fw.total) * 100}%` }} />
                      )}
                      {fw.nonCompliant > 0 && (
                        <div className="bg-red-500 h-full" style={{ width: `${(fw.nonCompliant / fw.total) * 100}%` }} />
                      )}
                      {fw.inProgress > 0 && (
                        <div className="bg-blue-400 h-full" style={{ width: `${(fw.inProgress / fw.total) * 100}%` }} />
                      )}
                      {fw.notApplicable > 0 && (
                        <div className="bg-gray-300 h-full" style={{ width: `${(fw.notApplicable / fw.total) * 100}%` }} />
                      )}
                    </div>
                    <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-green-500 rounded-full" />{fw.compliant} Compliant</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-yellow-400 rounded-full" />{fw.partiallyCompliant} Partial</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-red-500 rounded-full" />{fw.nonCompliant} Non-Compliant</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-400 rounded-full" />{fw.inProgress} In Progress</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 bg-gray-300 rounded-full" />{fw.notApplicable} N/A</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Findings Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Findings Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <p className="text-2xl font-bold text-red-700">{progress?.findings?.critical || 0}</p>
                    <p className="text-xs text-red-600">Critical</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <p className="text-2xl font-bold text-orange-700">{progress?.findings?.high || 0}</p>
                    <p className="text-xs text-orange-600">High</p>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-700">{progress?.findings?.medium || 0}</p>
                    <p className="text-xs text-yellow-600">Medium</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-700">{progress?.findings?.low || 0}</p>
                    <p className="text-xs text-blue-600">Low</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-2xl font-bold text-gray-600">{progress?.findings?.informational || 0}</p>
                    <p className="text-xs text-gray-500">Info</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-4 text-sm">
                  <span>Open: <strong>{progress?.findings?.open || 0}</strong></span>
                  <span>In Remediation: <strong>{progress?.findings?.inRemediation || 0}</strong></span>
                  <span>Closed: <strong>{progress?.findings?.closed || 0}</strong></span>
                </div>
              </CardContent>
            </Card>

            {/* AI Analysis */}
            <Card className="border-violet-200">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  AI-Powered Assessment Review
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Get an AI-generated expert review of your completed assessment. The analysis will identify key strengths,
                  critical gaps, and provide actionable recommendations for improving your compliance posture.
                </p>
                <Button
                  onClick={handleAiAnalyzeAssessment}
                  disabled={aiAnalysisLoading}
                  className="gap-2 bg-violet-600 hover:bg-violet-700"
                >
                  {aiAnalysisLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing Assessment...
                    </>
                  ) : (
                    <>
                      <Bot className="h-4 w-4" />
                      Generate AI Analysis
                    </>
                  )}
                </Button>

                {aiAnalysisLoading && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="relative">
                      <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                      <Sparkles className="h-4 w-4 text-violet-400 absolute -top-1 -right-1 animate-pulse" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-violet-700">Analyzing your assessment...</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        The AI is reviewing all requirements, findings, and evidence across frameworks.
                      </p>
                    </div>
                  </div>
                )}

                {aiAnalysis && !aiAnalysisLoading && (
                  <div className="bg-gradient-to-r from-violet-50/50 to-purple-50/30 border border-violet-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Bot className="h-4 w-4 text-violet-600" />
                      <h4 className="text-sm font-semibold text-violet-700">AI Expert Analysis</h4>
                      <span className="text-[10px] text-muted-foreground ml-auto">Generated just now</span>
                    </div>
                    <div className="text-sm leading-relaxed text-foreground/90">
                      {renderMarkdown(aiAnalysis)}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Report Download */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Generate Report</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Download a comprehensive PDF report including executive summary, framework-by-framework assessment results, and findings register.
                </p>
                <Button onClick={handleDownloadReport} className="gap-2">
                  <Download className="h-4 w-4" />
                  Download PDF Report
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ============================================ */}
      {/* Finding Dialog - Split View with AI Guidance */}
      {/* ============================================ */}
      <Dialog open={showFindingDialog} onOpenChange={setShowFindingDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0 flex flex-col">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-orange-50 to-amber-50 flex-shrink-0">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <DialogTitle className="text-xl">
                    {editingFinding ? 'Edit Finding' : 'Create New Finding'}
                  </DialogTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Document non-compliance issues with risk assessment and remediation plans
                  </p>
                </div>
              </div>
            </DialogHeader>
          </div>

          {/* Split View Body */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* LEFT SIDE - Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 border-r">
              {/* Finding Details Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-1 rounded-full bg-orange-500" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Finding Details</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      Title <span className="text-red-500">*</span>
                      <span className="text-xs font-normal text-muted-foreground ml-1">A concise name for this finding</span>
                    </label>
                    <Input
                      value={findingForm.title}
                      onChange={e => setFindingForm(prev => ({ ...prev, title: e.target.value }))}
                      className="mt-1.5"
                      placeholder="e.g., Missing access control policy documentation"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      Description <span className="text-red-500">*</span>
                      <span className="text-xs font-normal text-muted-foreground ml-1">Detailed explanation of the issue found</span>
                    </label>
                    <Textarea
                      rows={3}
                      value={findingForm.description}
                      onChange={e => setFindingForm(prev => ({ ...prev, description: e.target.value }))}
                      className="mt-1.5"
                      placeholder="Describe the non-compliance or gap identified during the assessment..."
                    />
                  </div>
                </div>
              </div>

              {/* Risk Assessment Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-1 rounded-full bg-red-500" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Risk Assessment</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-sm font-medium">Severity</label>
                    <p className="text-xs text-muted-foreground mb-1">Business impact level</p>
                    <Select value={findingForm.severity} onValueChange={v => setFindingForm(prev => ({ ...prev, severity: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CRITICAL"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-red-600" /> Critical</span></SelectItem>
                        <SelectItem value="HIGH"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-orange-500" /> High</span></SelectItem>
                        <SelectItem value="MEDIUM"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-yellow-500" /> Medium</span></SelectItem>
                        <SelectItem value="LOW"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /> Low</span></SelectItem>
                        <SelectItem value="INFORMATIONAL"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-gray-400" /> Informational</span></SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Likelihood</label>
                    <p className="text-xs text-muted-foreground mb-1">How likely to occur</p>
                    <Select value={String(findingForm.likelihood)} onValueChange={v => setFindingForm(prev => ({ ...prev, likelihood: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} - {['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'][n - 1]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Impact</label>
                    <p className="text-xs text-muted-foreground mb-1">If materialized</p>
                    <Select value={String(findingForm.impact)} onValueChange={v => setFindingForm(prev => ({ ...prev, impact: Number(v) }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} - {['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'][n - 1]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Risk Score Visual */}
                <div className={`mt-3 p-3 rounded-lg border-2 flex items-center justify-between ${
                  findingForm.likelihood * findingForm.impact >= 15 ? 'bg-red-50 border-red-200' :
                  findingForm.likelihood * findingForm.impact >= 10 ? 'bg-orange-50 border-orange-200' :
                  findingForm.likelihood * findingForm.impact >= 5 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex items-center gap-2">
                    <BarChart3 className={`h-4 w-4 ${
                      findingForm.likelihood * findingForm.impact >= 15 ? 'text-red-600' :
                      findingForm.likelihood * findingForm.impact >= 10 ? 'text-orange-600' :
                      findingForm.likelihood * findingForm.impact >= 5 ? 'text-yellow-600' : 'text-green-600'
                    }`} />
                    <span className="text-sm font-medium">Calculated Risk Score</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{findingForm.likelihood} x {findingForm.impact} =</span>
                    <span className={`text-2xl font-bold ${
                      findingForm.likelihood * findingForm.impact >= 15 ? 'text-red-600' :
                      findingForm.likelihood * findingForm.impact >= 10 ? 'text-orange-600' :
                      findingForm.likelihood * findingForm.impact >= 5 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {findingForm.likelihood * findingForm.impact}
                    </span>
                    <Badge className={`${
                      findingForm.likelihood * findingForm.impact >= 15 ? 'bg-red-100 text-red-700' :
                      findingForm.likelihood * findingForm.impact >= 10 ? 'bg-orange-100 text-orange-700' :
                      findingForm.likelihood * findingForm.impact >= 5 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {findingForm.likelihood * findingForm.impact >= 15 ? 'Critical' :
                       findingForm.likelihood * findingForm.impact >= 10 ? 'High' :
                       findingForm.likelihood * findingForm.impact >= 5 ? 'Medium' : 'Low'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Remediation Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-5 w-1 rounded-full bg-blue-500" />
                  <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">Remediation</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      Recommendation
                      <span className="text-xs font-normal text-muted-foreground ml-1">What action should be taken</span>
                    </label>
                    <Textarea
                      rows={2}
                      value={findingForm.recommendation}
                      onChange={e => setFindingForm(prev => ({ ...prev, recommendation: e.target.value }))}
                      className="mt-1.5"
                      placeholder="e.g., Develop and implement a formal access control policy aligned with ISO 27001 A.5.15..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      Remediation Plan
                      <span className="text-xs font-normal text-muted-foreground ml-1">Step-by-step resolution</span>
                    </label>
                    <Textarea
                      rows={2}
                      value={findingForm.remediationPlan}
                      onChange={e => setFindingForm(prev => ({ ...prev, remediationPlan: e.target.value }))}
                      className="mt-1.5"
                      placeholder="1. Draft policy document\n2. Review with stakeholders\n3. Obtain board approval\n4. Implement and communicate..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium flex items-center gap-1.5">
                      Target Remediation Date
                      <span className="text-xs font-normal text-muted-foreground ml-1">Deadline for resolution</span>
                    </label>
                    <Input
                      type="date"
                      value={findingForm.targetDate}
                      onChange={e => setFindingForm(prev => ({ ...prev, targetDate: e.target.value }))}
                      className="mt-1.5"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT SIDE - AI Guidance & Help */}
            <div className="w-[380px] flex-shrink-0 overflow-y-auto bg-gradient-to-b from-violet-50/50 to-blue-50/30 p-5 space-y-4">
              {/* Quick Reference Card */}
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="h-4 w-4 text-blue-500" />
                  <h4 className="text-sm font-semibold">Finding Guide</h4>
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">1.</span>
                    <span>Describe the <strong className="text-foreground">specific gap</strong> or non-compliance found</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">2.</span>
                    <span>Assess <strong className="text-foreground">severity</strong> based on regulatory/business impact</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">3.</span>
                    <span>Rate <strong className="text-foreground">likelihood</strong> and <strong className="text-foreground">impact</strong> to calculate risk</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold mt-0.5">4.</span>
                    <span>Provide <strong className="text-foreground">actionable remediation</strong> steps with a target date</span>
                  </div>
                </div>
              </div>

              {/* Severity Reference */}
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <h4 className="text-sm font-semibold mb-2">Severity Reference</h4>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-600 flex-shrink-0" />
                    <span className="font-medium text-red-700 w-20">Critical</span>
                    <span className="text-muted-foreground">Immediate regulatory breach, data loss risk</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-orange-500 flex-shrink-0" />
                    <span className="font-medium text-orange-700 w-20">High</span>
                    <span className="text-muted-foreground">Significant control gap, FCA attention risk</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-500 flex-shrink-0" />
                    <span className="font-medium text-yellow-700 w-20">Medium</span>
                    <span className="text-muted-foreground">Partial compliance, improvement needed</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                    <span className="font-medium text-blue-700 w-20">Low</span>
                    <span className="text-muted-foreground">Minor gap, best practice enhancement</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full bg-gray-400 flex-shrink-0" />
                    <span className="font-medium text-gray-600 w-20">Info</span>
                    <span className="text-muted-foreground">Observation, no action required</span>
                  </div>
                </div>
              </div>

              {/* Risk Matrix Mini */}
              <div className="rounded-lg border bg-white p-4 shadow-sm">
                <h4 className="text-sm font-semibold mb-2">Risk Matrix</h4>
                <div className="grid grid-cols-6 gap-0.5 text-[10px] text-center">
                  <div className="p-1" />
                  {['1', '2', '3', '4', '5'].map(i => (
                    <div key={i} className="p-1 font-medium text-muted-foreground">I{i}</div>
                  ))}
                  {[5, 4, 3, 2, 1].map(l => (
                    <React.Fragment key={`row-${l}`}>
                      <div className="p-1 font-medium text-muted-foreground">L{l}</div>
                      {[1, 2, 3, 4, 5].map(i => {
                        const score = l * i
                        const isActive = findingForm.likelihood === l && findingForm.impact === i
                        return (
                          <div
                            key={`${l}-${i}`}
                            className={`p-1 rounded-sm font-medium ${
                              isActive ? 'ring-2 ring-foreground ring-offset-1' : ''
                            } ${
                              score >= 15 ? 'bg-red-200 text-red-800' :
                              score >= 10 ? 'bg-orange-200 text-orange-800' :
                              score >= 5 ? 'bg-yellow-200 text-yellow-800' : 'bg-green-200 text-green-800'
                            }`}
                          >
                            {score}
                          </div>
                        )
                      })}
                    </React.Fragment>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground justify-center">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-green-200" /> 1-4 Low</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-yellow-200" /> 5-9 Med</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange-200" /> 10-14 High</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-red-200" /> 15-25 Crit</span>
                </div>
              </div>

              {/* AI Guidance */}
              <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gradient-to-r from-violet-100 to-purple-100 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-violet-600" />
                      <h4 className="text-sm font-semibold text-violet-900">AI Guidance</h4>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 bg-white/80 text-violet-700 border-violet-200 hover:bg-violet-50"
                      onClick={handleAiFindingGuidance}
                      disabled={aiFindingGuidanceLoading || (!findingForm.title && !findingForm.description)}
                    >
                      {aiFindingGuidanceLoading ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> Analyzing...</>
                      ) : (
                        <><Bot className="h-3 w-3" /> Get Suggestions</>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-violet-700 mt-1">
                    Fill in the title/description, then click for AI-powered recommendations
                  </p>
                </div>
                <div className="p-4 max-h-[300px] overflow-y-auto">
                  {aiFindingGuidanceLoading && (
                    <div className="flex flex-col items-center justify-center py-6 text-violet-500">
                      <Loader2 className="h-6 w-6 animate-spin mb-2" />
                      <span className="text-xs">Analyzing finding context...</span>
                    </div>
                  )}
                  {aiFindingGuidance && !aiFindingGuidanceLoading && (
                    <div className="text-xs leading-relaxed">
                      {renderMarkdown(aiFindingGuidance)}
                    </div>
                  )}
                  {!aiFindingGuidance && !aiFindingGuidanceLoading && (
                    <div className="text-center py-4 text-xs text-muted-foreground">
                      <Bot className="h-8 w-8 mx-auto mb-2 text-violet-300" />
                      <p>Enter finding details and click <strong>"Get Suggestions"</strong> for AI-powered guidance on severity classification, remediation steps, and recommended timelines.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t bg-muted/30 flex items-center justify-between flex-shrink-0">
            <p className="text-xs text-muted-foreground">
              {findingForm.frameworkSlug && (
                <Badge variant="outline" className="mr-2 text-xs">{findingForm.frameworkSlug}</Badge>
              )}
              Fields marked with <span className="text-red-500">*</span> are required
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setShowFindingDialog(false)}>Cancel</Button>
              <Button
                onClick={handleSaveFinding}
                disabled={!findingForm.title || !findingForm.description || createFindingMutation.isPending || updateFindingMutation.isPending}
                className="gap-1.5 bg-orange-600 hover:bg-orange-700"
              >
                {(createFindingMutation.isPending || updateFindingMutation.isPending) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                {editingFinding ? 'Update' : 'Create'} Finding
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================ */}
      {/* Evidence Link/Note Dialog */}
      {/* ============================================ */}
      <Dialog open={showEvidenceDialog} onOpenChange={setShowEvidenceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Evidence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium">Type</label>
              <Select value={evidenceForm.evidenceType} onValueChange={v => setEvidenceForm(prev => ({ ...prev, evidenceType: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">Link / URL</SelectItem>
                  <SelectItem value="note">Note / Reference</SelectItem>
                  <SelectItem value="screenshot">Screenshot Reference</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={evidenceForm.title}
                onChange={e => setEvidenceForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="e.g., Information Security Policy v2.1"
                className="mt-1"
              />
            </div>
            {evidenceForm.evidenceType === 'link' && (
              <div>
                <label className="text-sm font-medium">URL</label>
                <Input
                  value={evidenceForm.link}
                  onChange={e => setEvidenceForm(prev => ({ ...prev, link: e.target.value }))}
                  placeholder="https://..."
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                rows={2}
                value={evidenceForm.description}
                onChange={e => setEvidenceForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this evidence..."
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEvidenceDialog(false)}>Cancel</Button>
            <Button onClick={handleAddEvidenceLink} disabled={!evidenceForm.title}>
              Add Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
