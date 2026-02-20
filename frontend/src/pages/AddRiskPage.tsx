import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { useToast } from '@/components/ui/use-toast'
import {
  AlertTriangle,
  ArrowLeft,
  Shield,
  Target,
  FileText,
  Loader2,
  Save,
  Info,
  Gauge,
  ShieldCheck,
  Zap,
  TrendingUp,
  BookOpen,
  ChevronsUpDown,
  Check,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axiosInstance from '@/lib/api'

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

const getRiskLevel = (score: number) => {
  if (score >= 20) return { label: 'Critical', color: 'bg-red-700 text-white', ringColor: 'ring-red-500', bgLight: 'bg-red-50 border-red-200' }
  if (score >= 15) return { label: 'High', color: 'bg-orange-600 text-white', ringColor: 'ring-orange-500', bgLight: 'bg-orange-50 border-orange-200' }
  if (score >= 6) return { label: 'Medium', color: 'bg-yellow-600 text-white', ringColor: 'ring-yellow-500', bgLight: 'bg-yellow-50 border-yellow-200' }
  if (score >= 2) return { label: 'Low', color: 'bg-green-600 text-white', ringColor: 'ring-green-500', bgLight: 'bg-green-50 border-green-200' }
  return { label: 'Negligible', color: 'bg-gray-500 text-white', ringColor: 'ring-gray-400', bgLight: 'bg-gray-50 border-gray-200' }
}

export function AddRiskPage() {
  const navigate = useNavigate()
  const { currentOrganizationId } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    inherentProbability: 3,
    inherentImpact: 3,
    controlDescription: '',
  })
  const [selectedControls, setSelectedControls] = useState<string[]>([])
  const [controlSearchOpen, setControlSearchOpen] = useState(false)

  // Fetch ISO 27001 controls for the multi-select
  const { data: controlsData } = useQuery({
    queryKey: ['controls', currentOrganizationId, 'iso27001'],
    queryFn: () =>
      axiosInstance.get('/controls', {
        params: { organizationId: currentOrganizationId, frameworkSlug: 'iso27001', limit: 200 },
      }),
    enabled: !!currentOrganizationId,
  })
  const controls: any[] = controlsData?.data?.data || []

  const createMutation = useMutation({
    mutationFn: async (data: any) =>
      axiosInstance.post('/risks', { ...data, organizationId: currentOrganizationId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks'] })
      toast({ title: 'Risk created successfully (v0.1 Draft)' })
      navigate('/risks')
    },
    onError: () => toast({ title: 'Failed to create risk', variant: 'destructive' }),
  })

  const handleCreate = () => {
    if (!formData.title || !formData.description) return
    const controlsReference = selectedControls
      .map(cid => {
        const ctrl = controls.find((c: any) => c.controlId === cid)
        return ctrl ? `${ctrl.controlId} ${ctrl.name}` : cid
      })
      .join(', ')
    createMutation.mutate({
      title: formData.title,
      description: formData.description,
      likelihood: formData.inherentProbability,
      impact: formData.inherentImpact,
      controlDescription: formData.controlDescription,
      controlsReference,
      category: 'OPERATIONAL',
    })
  }

  const score = formData.inherentProbability * formData.inherentImpact
  const riskLevel = getRiskLevel(score)
  const probLabel = PROBABILITY_LABELS.find(p => p.value === formData.inherentProbability)!
  const impactLabel = IMPACT_LABELS.find(i => i.value === formData.inherentImpact)!

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/risks')}
          className="mb-3 -ml-2 text-muted-foreground hover:text-foreground gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Risk Register
        </Button>
        <div className="flex items-start gap-4">
          <div className="bg-gradient-to-br from-red-500 to-orange-500 rounded-xl p-3 shadow-lg shadow-red-500/20">
            <AlertTriangle className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Add New Risk</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Identify and assess a new information security risk per ISO/IEC 27001:2022 requirements.
              The risk will be created as <span className="mx-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold">v0.1 Draft</span> and can be submitted for approval later.
            </p>
          </div>
        </div>
      </div>

      {/* Section 1: Risk Identification */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-3 flex items-center gap-2.5">
          <Target className="h-4 w-4 text-white" />
          <h2 className="text-sm font-semibold text-white">Risk Identification</h2>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              Risk Title <span className="text-red-500">*</span>
            </Label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., Flawed candidate reference check leading to unvetted personnel access"
              className="h-10"
            />
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
              Provide a concise, descriptive title that clearly identifies the risk scenario. Include the threat source, vulnerability, and potential impact.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Risk Description <span className="text-red-500">*</span>
            </Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="resize-none"
              placeholder="Describe the risk in detail: what is the threat, what vulnerability does it exploit, what assets are affected, and what are the potential consequences if the risk materializes..."
            />
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
              Include threat source, affected assets, exploited vulnerability, and potential business consequences. Reference the risk scenario's context within your ISMS scope.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Inherent Risk Assessment */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-3 flex items-center gap-2.5">
          <Gauge className="h-4 w-4 text-white" />
          <h2 className="text-sm font-semibold text-white">Inherent Risk Assessment</h2>
          <span className="text-amber-100 text-xs ml-auto">Before controls</span>
        </div>
        <CardContent className="p-5 space-y-5">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              Assess the <strong>inherent risk</strong> — the level of risk <em>before</em> any controls or mitigation measures are applied. Consider the worst-case scenario based on current threat landscape.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Probability */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
                Probability <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.inherentProbability.toString()}
                onValueChange={(value) => setFormData({ ...formData, inherentProbability: parseInt(value) })}
              >
                <SelectTrigger className={cn('h-10', probLabel.color, 'border')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROBABILITY_LABELS.map((prob) => (
                    <SelectItem key={prob.value} value={prob.value.toString()}>
                      <span className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', {
                          'bg-green-500': prob.value === 1,
                          'bg-blue-500': prob.value === 2,
                          'bg-yellow-500': prob.value === 3,
                          'bg-orange-500': prob.value === 4,
                          'bg-red-500': prob.value === 5,
                        })} />
                        {prob.value} - {prob.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground italic">
                {probLabel.description}
              </p>
            </div>

            {/* Impact */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                Impact <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.inherentImpact.toString()}
                onValueChange={(value) => setFormData({ ...formData, inherentImpact: parseInt(value) })}
              >
                <SelectTrigger className={cn('h-10', impactLabel.color, 'border')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMPACT_LABELS.map((impact) => (
                    <SelectItem key={impact.value} value={impact.value.toString()}>
                      <span className="flex items-center gap-2">
                        <span className={cn('h-2.5 w-2.5 rounded-full', {
                          'bg-green-500': impact.value === 1,
                          'bg-blue-500': impact.value === 2,
                          'bg-yellow-500': impact.value === 3,
                          'bg-orange-500': impact.value === 4,
                          'bg-red-500': impact.value === 5,
                        })} />
                        {impact.value} - {impact.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground italic">
                {impactLabel.description}
              </p>
            </div>
          </div>

          {/* Risk Score Preview - Live */}
          <div className={cn('rounded-xl border-2 p-4 transition-all', riskLevel.bgLight)}>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Calculated Inherent Risk</p>
                <p className="text-xs text-muted-foreground">
                  {probLabel.label} ({formData.inherentProbability}) x {impactLabel.label} ({formData.inherentImpact})
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={cn('text-4xl font-bold tabular-nums', {
                  'text-green-700': score < 6,
                  'text-yellow-700': score >= 6 && score < 15,
                  'text-orange-700': score >= 15 && score < 20,
                  'text-red-700': score >= 20,
                })}>
                  {score}
                </span>
                <Badge className={cn('text-sm px-3 py-1', riskLevel.color)}>
                  {riskLevel.label}
                </Badge>
              </div>
            </div>

            {/* Mini 5x5 indicator */}
            <div className="mt-3 flex gap-0.5">
              {[1, 2, 3, 4, 5].map(l => (
                <div key={l} className="flex-1 flex flex-col gap-0.5">
                  {[5, 4, 3, 2, 1].map(i => {
                    const cellScore = l * i
                    const isActive = l === formData.inherentProbability && i === formData.inherentImpact
                    return (
                      <div
                        key={`${l}-${i}`}
                        className={cn(
                          'h-1.5 rounded-sm transition-all',
                          cellScore >= 20 ? 'bg-red-400' :
                          cellScore >= 15 ? 'bg-orange-400' :
                          cellScore >= 6 ? 'bg-yellow-400' : 'bg-green-400',
                          isActive && 'ring-2 ring-offset-1 ring-foreground h-2.5 -my-0.5',
                          !isActive && 'opacity-30'
                        )}
                      />
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Controls & Mitigation */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3 flex items-center gap-2.5">
          <ShieldCheck className="h-4 w-4 text-white" />
          <h2 className="text-sm font-semibold text-white">Existing Controls</h2>
          <span className="text-emerald-100 text-xs ml-auto">Optional</span>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Control Description
            </Label>
            <Textarea
              value={formData.controlDescription}
              onChange={(e) => setFormData({ ...formData, controlDescription: e.target.value })}
              rows={3}
              className="resize-none"
              placeholder="Describe any existing controls that currently address this risk (e.g., access controls, policies, monitoring)..."
            />
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
              List the controls already in place. This helps determine the gap between inherent and residual risk during treatment planning.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              Control Reference (ISO 27001 Annex A)
            </Label>
            <Popover open={controlSearchOpen} onOpenChange={setControlSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={controlSearchOpen}
                  className="w-full justify-between h-auto min-h-[40px] font-normal"
                >
                  {selectedControls.length > 0 ? (
                    <div className="flex flex-wrap gap-1 py-0.5">
                      {selectedControls.map((cid) => {
                        const ctrl = controls.find((c: any) => c.controlId === cid)
                        return (
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
                                setSelectedControls(selectedControls.filter((id) => id !== cid))
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.stopPropagation()
                                  setSelectedControls(selectedControls.filter((id) => id !== cid))
                                }
                              }}
                            >
                              <X className="h-3 w-3" />
                            </span>
                          </Badge>
                        )
                      })}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Search and select controls...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search controls (e.g., A 5.1, Screening, Access)..." />
                  <CommandList>
                    <CommandEmpty>No controls found.</CommandEmpty>
                    <CommandGroup className="max-h-[250px] overflow-y-auto">
                      {controls.map((ctrl: any) => {
                        const isSelected = selectedControls.includes(ctrl.controlId)
                        return (
                          <CommandItem
                            key={ctrl.controlId}
                            value={`${ctrl.controlId} ${ctrl.name}`}
                            onSelect={() => {
                              setSelectedControls(
                                isSelected
                                  ? selectedControls.filter((id) => id !== ctrl.controlId)
                                  : [...selectedControls, ctrl.controlId]
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
            {selectedControls.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {selectedControls.length} control{selectedControls.length !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => setSelectedControls([])}
                >
                  Clear all
                </Button>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0 text-blue-400" />
              Map to relevant ISO 27001:2022 Annex A controls. Search by control number or name and select multiple.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          onClick={() => navigate('/risks')}
          className="text-muted-foreground"
        >
          Cancel
        </Button>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Risk will be created as <strong>v0.1 Draft</strong>
          </p>
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !formData.title || !formData.description}
            size="lg"
            className="gap-2 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Create Risk
          </Button>
        </div>
      </div>
    </div>
  )
}
