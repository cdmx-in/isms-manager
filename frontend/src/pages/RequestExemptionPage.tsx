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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useToast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  ArrowLeft,
  ShieldOff,
  ShieldAlert,
  AlertTriangle,
  Info,
  FileText,
  Calendar,
  Loader2,
  CheckCircle2,
  Shield,
  Scale,
  MessageSquare,
  Check,
  ChevronsUpDown,
} from 'lucide-react'

const EXEMPTION_TYPE_OPTIONS = [
  {
    value: 'FULL',
    label: 'Full Exemption',
    description: 'The control will be entirely excluded from compliance scope. Use when the control is completely inapplicable to your environment.',
    severity: 'high',
    icon: ShieldOff,
    color: 'border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30',
    iconColor: 'text-red-500',
    badgeColor: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  },
  {
    value: 'PARTIAL',
    label: 'Partial Deviation',
    description: 'The control will be partially implemented with documented deviations. Use when most aspects can be met but specific requirements cannot.',
    severity: 'medium',
    icon: ShieldAlert,
    color: 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/30',
    iconColor: 'text-amber-500',
    badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  },
]

export function RequestExemptionPage() {
  const navigate = useNavigate()
  const { currentOrganizationId } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    title: '',
    controlId: '',
    frameworkId: '',
    exemptionType: '',
    justification: '',
    riskAcceptance: '',
    compensatingControls: '',
    validFrom: '',
    validUntil: '',
    reviewDate: '',
    comments: '',
  })
  const [controlSelectOpen, setControlSelectOpen] = useState(false)

  const { data: controls } = useQuery({
    queryKey: ['controls-for-exemption', currentOrganizationId],
    queryFn: () => api.controls.list(currentOrganizationId!, { limit: 500 }),
    enabled: !!currentOrganizationId,
  })

  const { data: frameworks } = useQuery({
    queryKey: ['frameworks'],
    queryFn: () => api.frameworks.list(),
  })

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

  const selectedControl = useMemo(() => {
    if (!formData.controlId || !controls) return null
    return controls.find((c: any) => c.id === formData.controlId)
  }, [formData.controlId, controls])

  const selectedTypeConfig = EXEMPTION_TYPE_OPTIONS.find(t => t.value === formData.exemptionType)

  const createMutation = useMutation({
    mutationFn: (data: any) => api.exemptions.create(data),
    onSuccess: () => {
      toast({ title: 'Exemption request created', description: 'The exemption has been saved as a draft.' })
      queryClient.invalidateQueries({ queryKey: ['exemptions'] })
      queryClient.invalidateQueries({ queryKey: ['exemption-stats'] })
      navigate('/exemptions')
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err?.response?.data?.error || 'Failed to create exemption', variant: 'destructive' })
    },
  })

  const handleSubmit = () => {
    createMutation.mutate({
      ...formData,
      organizationId: currentOrganizationId,
      frameworkId: formData.frameworkId || undefined,
      validFrom: formData.validFrom || undefined,
      reviewDate: formData.reviewDate || undefined,
    })
  }

  const isValid = formData.title && formData.controlId && formData.exemptionType && formData.justification && formData.validUntil

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2 text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/exemptions')}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Exemptions
        </Button>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 shadow-sm">
            <ShieldOff className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Request Control Exemption</h1>
            <p className="text-sm text-muted-foreground">
              Submit a formal request to exempt or partially deviate from a compliance control. This will go through a two-level approval process.
            </p>
          </div>
        </div>
      </div>

      {/* Workflow notice */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30 p-4">
        <Info className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-blue-700 dark:text-blue-300">Approval Workflow</p>
          <p className="text-blue-600/80 dark:text-blue-400/80 mt-1">
            Exemptions follow a two-level approval process: <span className="font-medium">Draft</span> &rarr; <span className="font-medium">1st Level Approval</span> (Local Admin/Admin) &rarr; <span className="font-medium">2nd Level Approval</span> (Admin) &rarr; <span className="font-medium">Active</span>. You can save as draft and submit for review when ready.
          </p>
        </div>
      </div>

      {/* Section 1: Exemption Type */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Exemption Type</CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal">Required</Badge>
          </div>
          <CardDescription>
            Choose whether this is a complete exemption or a partial deviation from the control requirements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EXEMPTION_TYPE_OPTIONS.map((option) => {
              const Icon = option.icon
              const isSelected = formData.exemptionType === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, exemptionType: option.value })}
                  className={cn(
                    'relative flex flex-col items-start gap-3 rounded-xl border-2 p-5 text-left transition-all hover:shadow-sm',
                    isSelected
                      ? option.value === 'FULL'
                        ? 'border-red-400 bg-red-50/70 dark:border-red-600 dark:bg-red-950/40 shadow-sm ring-1 ring-red-200 dark:ring-red-800'
                        : 'border-amber-400 bg-amber-50/70 dark:border-amber-600 dark:bg-amber-950/40 shadow-sm ring-1 ring-amber-200 dark:ring-amber-800'
                      : 'border-muted-foreground/20 hover:border-muted-foreground/40'
                  )}
                >
                  {isSelected && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className={cn('h-5 w-5', option.iconColor)} />
                    </div>
                  )}
                  <div className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-lg',
                    option.value === 'FULL'
                      ? 'bg-red-100 dark:bg-red-900/50'
                      : 'bg-amber-100 dark:bg-amber-900/50'
                  )}>
                    <Icon className={cn('h-5 w-5', option.iconColor)} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{option.label}</span>
                      <Badge className={cn('text-[10px]', option.badgeColor)} variant="secondary">
                        {option.severity === 'high' ? 'High Impact' : 'Medium Impact'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                      {option.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Basic Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Exemption Details</CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal">Required</Badge>
          </div>
          <CardDescription>
            Provide a clear title and select the control you are requesting an exemption for.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              placeholder="e.g., Legacy system access control exemption for Building A"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Give a concise, descriptive title that identifies the scope and reason for the exemption.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="controlId">
              Control <span className="text-red-500">*</span>
            </Label>
            <Popover open={controlSelectOpen} onOpenChange={setControlSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={controlSelectOpen}
                  className="w-full justify-between h-10 font-normal"
                >
                  {formData.controlId ? (
                    <span className="truncate">
                      {(() => {
                        const c = controls?.find((c: any) => c.id === formData.controlId)
                        return c ? `${c.controlId} - ${c.name}` : 'Select control...'
                      })()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Search and select a control...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by control ID or name..." />
                  <CommandList>
                    <CommandEmpty>No control found.</CommandEmpty>
                    {Object.entries(controlsByFramework).map(([fw, ctrls]) => (
                      <CommandGroup key={fw} heading={fw}>
                        {(ctrls as any[]).map((c: any) => (
                          <CommandItem
                            key={c.id}
                            value={`${c.controlId} ${c.name}`}
                            onSelect={() => {
                              setFormData({
                                ...formData,
                                controlId: c.id,
                                frameworkId: c.frameworkId || formData.frameworkId,
                              })
                              setControlSelectOpen(false)
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.controlId === c.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="font-mono text-xs mr-2 px-1 py-0.5 rounded bg-muted border">{c.controlId}</span>
                            <span className="truncate">{c.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              Search and select the specific compliance control that cannot be fully implemented.
            </p>
          </div>

          {/* Selected control info card */}
          {selectedControl && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 shrink-0">
                  <Shield className="h-4 w-4 text-blue-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted border">{selectedControl.controlId}</span>
                    {selectedControl.framework?.shortName && (
                      <Badge variant="outline" className="text-[10px]">{selectedControl.framework.shortName}</Badge>
                    )}
                    {selectedControl.category && (
                      <Badge variant="secondary" className="text-[10px]">
                        {selectedControl.category.replace(/_/g, ' ').replace(/^A\d+\s/, (m: string) => m)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-1">{selectedControl.name}</p>
                  {selectedControl.description && (
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{selectedControl.description}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Justification */}
      <Card className={cn(
        selectedTypeConfig?.value === 'FULL' && 'border-red-200/50 dark:border-red-900/50',
        selectedTypeConfig?.value === 'PARTIAL' && 'border-amber-200/50 dark:border-amber-900/50',
      )}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className={cn(
              'h-4 w-4',
              selectedTypeConfig?.value === 'FULL' ? 'text-red-500' : selectedTypeConfig?.value === 'PARTIAL' ? 'text-amber-500' : 'text-muted-foreground'
            )} />
            <CardTitle className="text-base">Business Justification & Risk</CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal">Required</Badge>
          </div>
          <CardDescription>
            Provide a thorough justification. Stronger justifications with compensating controls are more likely to be approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="justification">
              Business Justification <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="justification"
              placeholder="Explain in detail why this control cannot be fully implemented. Include technical constraints, business requirements, or environmental factors that prevent compliance..."
              value={formData.justification}
              onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
              rows={4}
              className="resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Clearly explain why this control cannot be met. Include technical, operational, or business reasons.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="riskAcceptance">Risk Acceptance</Label>
              <Badge variant="outline" className="text-[10px] font-normal bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800">Recommended</Badge>
            </div>
            <Textarea
              id="riskAcceptance"
              placeholder="Describe the residual risk that will be accepted. Consider the impact on confidentiality, integrity, and availability..."
              value={formData.riskAcceptance}
              onChange={(e) => setFormData({ ...formData, riskAcceptance: e.target.value })}
              rows={3}
              className="resize-y border-orange-200/50 focus:border-orange-300 dark:border-orange-900/50"
            />
            <p className="text-xs text-muted-foreground">
              Document the risk being accepted. This helps approvers assess the security impact of granting the exemption.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="compensatingControls">Compensating Controls</Label>
              <Badge variant="outline" className="text-[10px] font-normal bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800">Recommended</Badge>
            </div>
            <Textarea
              id="compensatingControls"
              placeholder="List alternative security measures that partially mitigate the risk. For example: additional monitoring, restricted access, enhanced logging..."
              value={formData.compensatingControls}
              onChange={(e) => setFormData({ ...formData, compensatingControls: e.target.value })}
              rows={3}
              className="resize-y border-green-200/50 focus:border-green-300 dark:border-green-900/50"
            />
            <p className="text-xs text-muted-foreground">
              Compensating controls reduce the risk impact and significantly improve approval chances.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Validity Period */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Validity Period</CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal">Required</Badge>
          </div>
          <CardDescription>
            All exemptions must be time-bound. Set appropriate validity dates and a review date for periodic reassessment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="space-y-2">
              <Label htmlFor="validFrom">Valid From</Label>
              <Input
                id="validFrom"
                type="date"
                value={formData.validFrom}
                onChange={(e) => setFormData({ ...formData, validFrom: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                When the exemption takes effect. Defaults to approval date if left empty.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="validUntil">
                Valid Until <span className="text-red-500">*</span>
              </Label>
              <Input
                id="validUntil"
                type="date"
                value={formData.validUntil}
                onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                className="border-primary/30"
              />
              <p className="text-xs text-muted-foreground">
                Expiry date. The exemption will automatically expire after this date and require renewal.
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="reviewDate">Review Date</Label>
                <Badge variant="outline" className="text-[10px] font-normal bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800">Recommended</Badge>
              </div>
              <Input
                id="reviewDate"
                type="date"
                value={formData.reviewDate}
                onChange={(e) => setFormData({ ...formData, reviewDate: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Set a date to reassess whether the exemption is still needed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 5: Additional Notes */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Additional Notes</CardTitle>
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">Optional</Badge>
          </div>
          <CardDescription>
            Any additional information that may help reviewers understand the context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="comments"
            placeholder="Any additional context, references to related risk assessments, prior discussions, or supporting documentation..."
            value={formData.comments}
            onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
            rows={3}
            className="resize-y"
          />
        </CardContent>
      </Card>

      {/* Summary & Submit */}
      <Card className="border-2 border-dashed">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Ready to submit?</p>
              <p className="text-xs text-muted-foreground">
                The exemption will be saved as a <span className="font-medium">Draft</span>. You can submit it for review from the exemptions list.
              </p>
              {!isValid && (
                <div className="flex items-center gap-1.5 mt-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Please fill in all required fields: {[
                      !formData.exemptionType && 'Exemption Type',
                      !formData.title && 'Title',
                      !formData.controlId && 'Control',
                      !formData.justification && 'Justification',
                      !formData.validUntil && 'Valid Until',
                    ].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Button variant="outline" onClick={() => navigate('/exemptions')}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={!isValid || createMutation.isPending}
                className={cn(
                  selectedTypeConfig?.value === 'FULL' && 'bg-red-600 hover:bg-red-700',
                  selectedTypeConfig?.value === 'PARTIAL' && 'bg-amber-600 hover:bg-amber-700',
                )}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <ShieldOff className="mr-2 h-4 w-4" />
                Create Exemption Request
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
