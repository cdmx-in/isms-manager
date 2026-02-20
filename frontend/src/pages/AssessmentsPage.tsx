import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { useToast } from '@/components/ui/use-toast'
import {
  ClipboardList,
  Plus,
  Trash2,
  ChevronRight,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Shield,
  Landmark,
  Scale,
  Globe,
  Server,
  ArrowRight,
  Info,
  BookOpen,
  Target,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  Building,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  DRAFT: { color: 'bg-slate-100 text-slate-700 border-slate-200', icon: FileText, label: 'Draft' },
  IN_PROGRESS: { color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Clock, label: 'In Progress' },
  UNDER_REVIEW: { color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Target, label: 'Under Review' },
  COMPLETED: { color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2, label: 'Completed' },
  ARCHIVED: { color: 'bg-gray-100 text-gray-500 border-gray-200', icon: FileText, label: 'Archived' },
}

const FRAMEWORK_CONFIG: Record<string, { icon: any; color: string; bgGradient: string; borderColor: string; description: string }> = {
  'fca-operational-resilience': {
    icon: Shield,
    color: 'text-indigo-700',
    bgGradient: 'from-indigo-50 to-indigo-100/50',
    borderColor: 'border-indigo-200 hover:border-indigo-300',
    description: 'Important Business Services, impact tolerances, scenario testing, and governance self-assessment',
  },
  'fca-safeguarding': {
    icon: Landmark,
    color: 'text-purple-700',
    bgGradient: 'from-purple-50 to-purple-100/50',
    borderColor: 'border-purple-200 hover:border-purple-300',
    description: 'Safeguarding methods, reconciliation, wind-down planning, and governance oversight for EMIs',
  },
  'fca-rep018': {
    icon: Server,
    color: 'text-rose-700',
    bgGradient: 'from-rose-50 to-rose-100/50',
    borderColor: 'border-rose-200 hover:border-rose-300',
    description: 'ICT governance, risk management, information security, logical security, operations, and BCM',
  },
  'iso27001-assessment': {
    icon: ShieldCheck,
    color: 'text-sky-700',
    bgGradient: 'from-sky-50 to-sky-100/50',
    borderColor: 'border-sky-200 hover:border-sky-300',
    description: 'Organizational, people, physical, and technological controls for information security management',
  },
  'dora': {
    icon: Globe,
    color: 'text-emerald-700',
    bgGradient: 'from-emerald-50 to-emerald-100/50',
    borderColor: 'border-emerald-200 hover:border-emerald-300',
    description: 'ICT risk management, incident management, resilience testing, third-party risk, and information sharing',
  },
  'iso42001-assessment': {
    icon: Sparkles,
    color: 'text-violet-700',
    bgGradient: 'from-violet-50 to-violet-100/50',
    borderColor: 'border-violet-200 hover:border-violet-300',
    description: 'AI governance, risk management, data quality, responsible AI development, and operational oversight',
  },
  'dpdpa-assessment': {
    icon: Scale,
    color: 'text-amber-700',
    bgGradient: 'from-amber-50 to-amber-100/50',
    borderColor: 'border-amber-200 hover:border-amber-300',
    description: 'Consent management, data principal rights, fiduciary obligations, cross-border transfers, and compliance',
  },
}

const FRAMEWORK_BADGE_COLORS: Record<string, string> = {
  'fca-operational-resilience': 'bg-indigo-100 text-indigo-700',
  'fca-safeguarding': 'bg-purple-100 text-purple-700',
  'fca-rep018': 'bg-rose-100 text-rose-700',
  'iso27001-assessment': 'bg-sky-100 text-sky-700',
  'dora': 'bg-emerald-100 text-emerald-700',
  'iso42001-assessment': 'bg-violet-100 text-violet-700',
  'dpdpa-assessment': 'bg-amber-100 text-amber-700',
}

export function AssessmentsPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const currentOrganizationId = useAuthStore(s => s.currentOrganizationId)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    clientName: '',
    assessorName: '',
    frameworkSlugs: [] as string[],
    startDate: '',
    targetEndDate: '',
  })

  // Fetch assessments
  const { data: assessments = [], isLoading } = useQuery({
    queryKey: ['assessments', currentOrganizationId],
    queryFn: () => api.assessments.list(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  // Fetch available frameworks
  const { data: frameworks = [] } = useQuery({
    queryKey: ['assessment-frameworks'],
    queryFn: () => api.assessments.frameworks(),
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: any) => api.assessments.create(data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] })
      setShowCreateForm(false)
      setForm({ title: '', description: '', clientName: '', assessorName: '', frameworkSlugs: [], startDate: '', targetEndDate: '' })
      toast({ title: 'Assessment created successfully', description: `${data.requirementCount || 0} requirements initialized across selected frameworks.` })
      if (data?.id) navigate(`/assessments/${data.id}`)
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to create assessment. Please try again.', variant: 'destructive' })
    },
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.assessments.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assessments'] })
      setShowDeleteDialog(null)
      toast({ title: 'Assessment deleted' })
    },
  })

  const handleCreate = () => {
    if (!form.title || form.frameworkSlugs.length === 0) {
      toast({ title: 'Required fields missing', description: 'Please provide a title and select at least one framework.', variant: 'destructive' })
      return
    }
    createMutation.mutate({
      ...form,
      organizationId: currentOrganizationId,
    })
  }

  const toggleFramework = (slug: string) => {
    setForm(prev => ({
      ...prev,
      frameworkSlugs: prev.frameworkSlugs.includes(slug)
        ? prev.frameworkSlugs.filter(s => s !== slug)
        : [...prev.frameworkSlugs, slug],
    }))
  }

  // Stats
  const stats = {
    total: assessments.length,
    inProgress: assessments.filter((a: any) => a.status === 'IN_PROGRESS').length,
    completed: assessments.filter((a: any) => a.status === 'COMPLETED').length,
    totalFindings: assessments.reduce((sum: number, a: any) => sum + (a.findingsCount || 0), 0),
  }

  // Filter
  const filtered = assessments.filter((a: any) => {
    const matchesSearch = !search || a.title.toLowerCase().includes(search.toLowerCase()) || a.clientName?.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const totalRequirements = form.frameworkSlugs.reduce((sum, slug) => {
    const fw = frameworks.find((f: any) => f.slug === slug)
    return sum + (fw?.requirementCount || 0)
  }, 0)

  // ── Inline Create Assessment View ──
  if (showCreateForm) {
    return (
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => setShowCreateForm(false)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          Back to Assessments
        </button>

        {/* Create Header */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-xl p-6 border border-primary/20">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Create New Regulatory Assessment</h1>
              <p className="text-muted-foreground mt-1 max-w-2xl">
                Set up a guided assessment to evaluate compliance across regulatory frameworks.
                Select the frameworks relevant to your organization and we'll generate a complete
                checklist of requirements with step-by-step guidance for each.
              </p>
            </div>
          </div>
        </div>

        {/* Step 1: Basic Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">1</div>
              Assessment Details
            </CardTitle>
            <p className="text-sm text-muted-foreground ml-9">
              Provide the basic information about this assessment engagement.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 ml-9">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  Assessment Title <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="e.g., MNI Group Annual Risk Assessment 2026"
                  value={form.title}
                  onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Building className="h-3.5 w-3.5 text-muted-foreground" />
                  Client / Organization Name
                </label>
                <Input
                  placeholder="e.g., MNI Group Ltd"
                  value={form.clientName}
                  onChange={e => setForm(prev => ({ ...prev, clientName: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Lead Assessor
                </label>
                <Input
                  placeholder="e.g., John Smith"
                  value={form.assessorName}
                  onChange={e => setForm(prev => ({ ...prev, assessorName: e.target.value }))}
                  className="mt-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Start Date
                  </label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(prev => ({ ...prev, startDate: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    Target End Date
                  </label>
                  <Input
                    type="date"
                    value={form.targetEndDate}
                    onChange={e => setForm(prev => ({ ...prev, targetEndDate: e.target.value }))}
                    className="mt-1.5"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
                Description / Scope
              </label>
              <Textarea
                placeholder="Describe the scope and objectives of this assessment..."
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                className="mt-1.5"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Framework Selection */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold">2</div>
              Select Regulatory Frameworks <span className="text-destructive text-sm font-normal">*</span>
            </CardTitle>
            <p className="text-sm text-muted-foreground ml-9">
              Choose the frameworks to include. Each framework will generate a set of guided requirements
              with step-by-step instructions on what to verify and what evidence to collect.
            </p>
          </CardHeader>
          <CardContent className="ml-9">
            <div className="grid grid-cols-1 gap-3">
              {frameworks.map((fw: any) => {
                const config = FRAMEWORK_CONFIG[fw.slug] || { icon: Shield, color: 'text-gray-700', bgGradient: 'from-gray-50 to-gray-100/50', borderColor: 'border-gray-200', description: '' }
                const Icon = config.icon
                const isSelected = form.frameworkSlugs.includes(fw.slug)
                return (
                  <div
                    key={fw.slug}
                    className={`
                      relative flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200
                      ${isSelected
                        ? `bg-gradient-to-r ${config.bgGradient} ${config.borderColor} shadow-sm ring-1 ring-primary/10`
                        : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50/50'
                      }
                    `}
                    onClick={() => toggleFramework(fw.slug)}
                  >
                    {/* Selection indicator */}
                    <div className={`
                      mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all
                      ${isSelected ? 'bg-primary border-primary' : 'border-gray-300 bg-white'}
                    `}>
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                    </div>

                    {/* Framework icon */}
                    <div className={`p-2.5 rounded-lg flex-shrink-0 ${isSelected ? 'bg-white/80' : 'bg-gray-50'}`}>
                      <Icon className={`h-5 w-5 ${config.color}`} />
                    </div>

                    {/* Framework info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm">{fw.name}</h3>
                        <Badge variant="secondary" className={`text-xs ${FRAMEWORK_BADGE_COLORS[fw.slug] || 'bg-gray-100'}`}>
                          {fw.shortName}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {config.description || fw.description}
                      </p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{fw.domainCount}</span> domains
                        </span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{fw.requirementCount}</span> requirements
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Selection summary */}
            {form.frameworkSlugs.length > 0 && (
              <div className="mt-4 p-3 bg-primary/5 border border-primary/15 rounded-lg flex items-center gap-3">
                <Info className="h-4 w-4 text-primary flex-shrink-0" />
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{form.frameworkSlugs.length}</span> framework{form.frameworkSlugs.length !== 1 ? 's' : ''} selected
                  {' \u2014 '}
                  <span className="font-medium text-foreground">{totalRequirements}</span> total requirements will be generated with step-by-step guidance.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Action bar */}
        <div className="flex items-center justify-between p-4 bg-card border rounded-xl sticky bottom-4 shadow-lg">
          <Button variant="outline" onClick={() => setShowCreateForm(false)} className="gap-2">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <div className="flex items-center gap-3">
            {form.frameworkSlugs.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {totalRequirements} requirements across {form.frameworkSlugs.length} framework{form.frameworkSlugs.length !== 1 ? 's' : ''}
              </p>
            )}
            <Button
              size="lg"
              onClick={handleCreate}
              disabled={createMutation.isPending || !form.title || form.frameworkSlugs.length === 0}
              className="gap-2"
            >
              {createMutation.isPending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Create Assessment & Start
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // ── Main List View ──
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <div className="p-2 bg-primary/10 rounded-lg">
              <ClipboardList className="h-6 w-6 text-primary" />
            </div>
            Regulatory Assessments
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Conduct guided regulatory compliance assessments with step-by-step verification
            checklists, evidence collection, and findings tracking across FCA, ISO 27001, and DORA frameworks.
          </p>
        </div>
        <Button onClick={() => setShowCreateForm(true)} size="lg" className="gap-2 shadow-sm">
          <Plus className="h-4 w-4" />
          New Assessment
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-100 rounded-xl">
                <FileText className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-400">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-xl">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.inProgress}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">In Progress</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-400">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 rounded-xl">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.completed}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-400">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-orange-100 rounded-xl">
                <AlertTriangle className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalFindings}</p>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Findings</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Getting started / guide (show when no assessments) */}
      {!isLoading && assessments.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="py-10">
            <div className="text-center max-w-2xl mx-auto">
              <div className="inline-flex p-4 bg-primary/10 rounded-2xl mb-4">
                <BookOpen className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-xl font-bold mb-2">Get Started with Regulatory Assessments</h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                This module helps you conduct thorough regulatory compliance assessments with guided walkthroughs.
                Each assessment covers specific regulatory frameworks and provides step-by-step instructions on
                what to verify, what evidence to collect, and how to document your findings.
              </p>

              <div className="grid grid-cols-3 gap-4 mb-8 text-left">
                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-indigo-100 rounded-lg">
                      <Target className="h-4 w-4 text-indigo-600" />
                    </div>
                    <h3 className="font-semibold text-sm text-indigo-900">1. Select Frameworks</h3>
                  </div>
                  <p className="text-xs text-indigo-700/80 leading-relaxed">
                    Choose which regulatory frameworks apply to your organization (FCA, ISO 27001, DORA).
                  </p>
                </div>
                <div className="p-4 bg-sky-50 rounded-xl border border-sky-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-sky-100 rounded-lg">
                      <ClipboardList className="h-4 w-4 text-sky-600" />
                    </div>
                    <h3 className="font-semibold text-sm text-sky-900">2. Walk Through Requirements</h3>
                  </div>
                  <p className="text-xs text-sky-700/80 leading-relaxed">
                    Follow guided checklists with instructions on what to verify and evidence to collect.
                  </p>
                </div>
                <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 bg-emerald-100 rounded-lg">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-sm text-emerald-900">3. Document & Report</h3>
                  </div>
                  <p className="text-xs text-emerald-700/80 leading-relaxed">
                    Record findings, attach evidence, and generate comprehensive assessment reports.
                  </p>
                </div>
              </div>

              <Button size="lg" onClick={() => setShowCreateForm(true)} className="gap-2 shadow-sm">
                <Plus className="h-4 w-4" />
                Create Your First Assessment
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available frameworks preview (show when no assessments) */}
      {!isLoading && assessments.length === 0 && frameworks.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Scale className="h-5 w-5 text-muted-foreground" />
            Available Regulatory Frameworks
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {frameworks.map((fw: any) => {
              const config = FRAMEWORK_CONFIG[fw.slug] || { icon: Shield, color: 'text-gray-700', bgGradient: 'from-gray-50 to-gray-100/50', borderColor: 'border-gray-200', description: '' }
              const Icon = config.icon
              return (
                <Card key={fw.slug} className={`bg-gradient-to-br ${config.bgGradient} border ${config.borderColor.split(' ')[0]}`}>
                  <CardContent className="pt-5 pb-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-white/80 rounded-lg shadow-sm">
                        <Icon className={`h-5 w-5 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm">{fw.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
                          {config.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs bg-white/80">
                            {fw.domainCount} domains
                          </Badge>
                          <Badge variant="secondary" className="text-xs bg-white/80">
                            {fw.requirementCount} requirements
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Assessments List (when there are assessments) */}
      {!isLoading && assessments.length > 0 && (
        <>
          {/* Search and Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or client..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {['all', 'DRAFT', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED'].map(s => (
                <Button
                  key={s}
                  variant={statusFilter === s ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(s)}
                  className="text-xs"
                >
                  {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label || s}
                </Button>
              ))}
            </div>
          </div>

          {/* Assessment cards list */}
          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <Search className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
                <h3 className="text-lg font-medium">No matching assessments</h3>
                <p className="text-muted-foreground text-sm mt-1">Try adjusting your search or filter criteria.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((assessment: any) => {
                const statusCfg = STATUS_CONFIG[assessment.status] || STATUS_CONFIG.DRAFT
                const StatusIcon = statusCfg.icon
                return (
                  <Card
                    key={assessment.id}
                    className="hover:shadow-md transition-all duration-200 cursor-pointer group"
                    onClick={() => navigate(`/assessments/${assessment.id}`)}
                  >
                    <CardContent className="py-4 px-5">
                      <div className="flex items-center gap-4">
                        {/* Status icon */}
                        <div className={`p-2.5 rounded-xl ${statusCfg.color.split(' ').slice(0, 1).join(' ')}`}>
                          <StatusIcon className={`h-5 w-5 ${statusCfg.color.split(' ').slice(1, 2).join(' ')}`} />
                        </div>

                        {/* Main info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5">
                            <h3 className="font-semibold group-hover:text-primary transition-colors truncate">
                              {assessment.title}
                            </h3>
                            <Badge variant="secondary" className={`text-xs border ${statusCfg.color}`}>
                              {statusCfg.label}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
                            {assessment.clientName && (
                              <span className="flex items-center gap-1">
                                <Building className="h-3 w-3" />
                                {assessment.clientName}
                              </span>
                            )}
                            {assessment.assessorName && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {assessment.assessorName}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(assessment.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        {/* Frameworks */}
                        <div className="flex flex-wrap gap-1.5">
                          {((assessment.frameworkSlugs as string[]) || []).map((slug: string) => {
                            const fw = frameworks.find((f: any) => f.slug === slug)
                            const fwConfig = FRAMEWORK_CONFIG[slug]
                            const FwIcon = fwConfig?.icon || Shield
                            return (
                              <Badge
                                key={slug}
                                variant="secondary"
                                className={`text-xs gap-1 ${FRAMEWORK_BADGE_COLORS[slug] || 'bg-gray-100'}`}
                              >
                                <FwIcon className="h-3 w-3" />
                                {fw?.shortName || slug}
                              </Badge>
                            )
                          })}
                        </div>

                        {/* Progress */}
                        <div className="flex items-center gap-3 min-w-[140px]">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Progress</span>
                              <span className="text-xs font-semibold">{assessment.progressPercent || 0}%</span>
                            </div>
                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${
                                  (assessment.progressPercent || 0) >= 100
                                    ? 'bg-emerald-500'
                                    : (assessment.progressPercent || 0) >= 50
                                    ? 'bg-primary'
                                    : 'bg-blue-400'
                                }`}
                                style={{ width: `${assessment.progressPercent || 0}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Findings count */}
                        {assessment.findingsCount > 0 && (
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200 gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {assessment.findingsCount}
                          </Badge>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={e => { e.stopPropagation(); setShowDeleteDialog(assessment.id) }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4" />
          <p className="text-sm text-muted-foreground">Loading assessments...</p>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete Assessment
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this assessment? This will permanently remove all requirements,
            evidence, and findings. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => showDeleteDialog && deleteMutation.mutate(showDeleteDialog)}
              disabled={deleteMutation.isPending}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              {deleteMutation.isPending ? 'Deleting...' : 'Delete Assessment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
