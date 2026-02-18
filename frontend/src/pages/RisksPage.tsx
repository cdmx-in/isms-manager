import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
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
  DialogTrigger,
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/components/ui/use-toast'
import { formatDate, getRiskColor } from '@/lib/utils'
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  AlertTriangle,
  Loader2,
  Filter,
  Grid,
  List,
  Download,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const riskStatuses = ['IDENTIFIED', 'ANALYZING', 'TREATING', 'MONITORING', 'CLOSED']
const treatmentTypes = ['MITIGATE', 'ACCEPT', 'TRANSFER', 'AVOID']

// Risk Heat Map Component
function RiskHeatMap({ risks }: { risks: any[] }) {
  // Create 5x5 matrix for likelihood (y) vs impact (x)
  const matrix: any[][] = Array(5).fill(null).map(() => Array(5).fill(null).map(() => []))

  risks.forEach((risk) => {
    const likelihood = Math.min(Math.max(risk.likelihood, 1), 5) - 1
    const impact = Math.min(Math.max(risk.impact, 1), 5) - 1
    matrix[4 - likelihood][impact].push(risk)
  })

  const getCellColor = (likelihood: number, impact: number) => {
    const score = (likelihood + 1) * (impact + 1)
    if (score >= 16) return 'bg-red-500 hover:bg-red-600'
    if (score >= 10) return 'bg-orange-500 hover:bg-orange-600'
    if (score >= 5) return 'bg-yellow-500 hover:bg-yellow-600'
    return 'bg-green-500 hover:bg-green-600'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        {/* Y-axis label */}
        <div className="flex flex-col items-center justify-center h-[300px] -rotate-180" style={{ writingMode: 'vertical-rl' }}>
          <span className="text-sm font-medium text-muted-foreground">Likelihood →</span>
        </div>

        <div className="flex-1">
          {/* Matrix */}
          <div className="grid grid-cols-5 gap-1">
            {matrix.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className={cn(
                    'aspect-square flex items-center justify-center rounded-md text-white font-bold transition-colors cursor-pointer',
                    getCellColor(4 - rowIndex, colIndex)
                  )}
                  title={`Likelihood: ${5 - rowIndex}, Impact: ${colIndex + 1}, Risks: ${cell.length}`}
                >
                  {cell.length > 0 && (
                    <span className="text-lg">{cell.length}</span>
                  )}
                </div>
              ))
            )}
          </div>

          {/* X-axis label */}
          <div className="text-center mt-2">
            <span className="text-sm font-medium text-muted-foreground">Impact →</span>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-green-500" />
          <span>Low (1-4)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-500" />
          <span>Medium (5-9)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-500" />
          <span>High (10-15)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500" />
          <span>Critical (16-25)</span>
        </div>
      </div>
    </div>
  )
}

export function RisksPage() {
  const { currentOrganizationId } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [view, setView] = useState<'list' | 'heatmap'>('list')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selectedRisk, setSelectedRisk] = useState<any>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    likelihood: 3,
    impact: 3,
    status: 'IDENTIFIED',
    treatmentType: 'MITIGATE',
    treatmentPlan: '',
    owner: '',
  })

  const { data: risks, isLoading } = useQuery({
    queryKey: ['risks', currentOrganizationId, search, statusFilter],
    queryFn: () =>
      api.risks.list(currentOrganizationId!, {
        search,
        status: statusFilter || undefined,
      }),
    enabled: !!currentOrganizationId,
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.risks.create(currentOrganizationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks'] })
      setIsCreateOpen(false)
      resetForm()
      toast({ title: 'Risk created successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to create risk',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.risks.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks'] })
      setIsEditOpen(false)
      setSelectedRisk(null)
      resetForm()
      toast({ title: 'Risk updated successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update risk',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.risks.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['risks'] })
      toast({ title: 'Risk deleted successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete risk',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      likelihood: 3,
      impact: 3,
      status: 'IDENTIFIED',
      treatmentType: 'MITIGATE',
      treatmentPlan: '',
      owner: '',
    })
  }

  const handleCreate = () => {
    createMutation.mutate(formData)
  }

  const handleEdit = (risk: any) => {
    setSelectedRisk(risk)
    setFormData({
      title: risk.title,
      description: risk.description || '',
      likelihood: risk.likelihood,
      impact: risk.impact,
      status: risk.status,
      treatmentType: risk.treatmentType || 'MITIGATE',
      treatmentPlan: risk.treatmentPlan || '',
      owner: risk.owner || '',
    })
    setIsEditOpen(true)
  }

  const handleUpdate = () => {
    if (selectedRisk) {
      updateMutation.mutate({ id: selectedRisk.id, data: formData })
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this risk?')) {
      deleteMutation.mutate(id)
    }
  }

  const getRiskScore = (likelihood: number, impact: number) => likelihood * impact

  const getRiskLevel = (score: number) => {
    if (score >= 16) return { label: 'Critical', variant: 'destructive' as const }
    if (score >= 10) return { label: 'High', variant: 'warning' as const }
    if (score >= 5) return { label: 'Medium', variant: 'default' as const }
    return { label: 'Low', variant: 'success' as const }
  }

  const handleExportPDF = async () => {
    try {
      const blob = await api.reports.riskRegister(currentOrganizationId!)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'risk-register.pdf'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast({ title: 'Risk register exported successfully' })
    } catch (error) {
      toast({
        title: 'Failed to export',
        description: 'An error occurred while generating the PDF',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Risk Register</h1>
          <p className="text-muted-foreground">
            Identify, assess, and manage information security risks
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportPDF}>
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="mr-2 h-4 w-4" />
                Add Risk
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Add New Risk</DialogTitle>
                <DialogDescription>
                  Identify and assess a new information security risk.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Risk Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="e.g., Unauthorized Data Access"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Describe the risk, its causes, and potential consequences..."
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="likelihood">Likelihood (1-5)</Label>
                    <Select
                      value={formData.likelihood.toString()}
                      onValueChange={(value) =>
                        setFormData({ ...formData, likelihood: parseInt(value) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 - Rare</SelectItem>
                        <SelectItem value="2">2 - Unlikely</SelectItem>
                        <SelectItem value="3">3 - Possible</SelectItem>
                        <SelectItem value="4">4 - Likely</SelectItem>
                        <SelectItem value="5">5 - Almost Certain</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="impact">Impact (1-5)</Label>
                    <Select
                      value={formData.impact.toString()}
                      onValueChange={(value) =>
                        setFormData({ ...formData, impact: parseInt(value) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 - Negligible</SelectItem>
                        <SelectItem value="2">2 - Minor</SelectItem>
                        <SelectItem value="3">3 - Moderate</SelectItem>
                        <SelectItem value="4">4 - Major</SelectItem>
                        <SelectItem value="5">5 - Catastrophic</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) =>
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {riskStatuses.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="treatmentType">Treatment</Label>
                    <Select
                      value={formData.treatmentType}
                      onValueChange={(value) =>
                        setFormData({ ...formData, treatmentType: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {treatmentTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="treatmentPlan">Treatment Plan</Label>
                  <Textarea
                    id="treatmentPlan"
                    value={formData.treatmentPlan}
                    onChange={(e) =>
                      setFormData({ ...formData, treatmentPlan: e.target.value })
                    }
                    placeholder="Describe the risk treatment approach..."
                    rows={2}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="owner">Risk Owner</Label>
                  <Input
                    id="owner"
                    value={formData.owner}
                    onChange={(e) =>
                      setFormData({ ...formData, owner: e.target.value })
                    }
                    placeholder="e.g., Security Manager"
                  />
                </div>
                {/* Risk Score Preview */}
                <div className="rounded-lg border p-4 bg-muted/50">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Risk Score</span>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold">
                        {getRiskScore(formData.likelihood, formData.impact)}
                      </span>
                      <Badge variant={getRiskLevel(getRiskScore(formData.likelihood, formData.impact)).variant as any}>
                        {getRiskLevel(getRiskScore(formData.likelihood, formData.impact)).label}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending || !formData.title}
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Risk
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* View Toggle & Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search risks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {riskStatuses.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex border rounded-md">
              <Button
                variant={view === 'list' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView('list')}
                className="rounded-r-none"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={view === 'heatmap' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView('heatmap')}
                className="rounded-l-none"
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : view === 'heatmap' ? (
        <Card>
          <CardHeader>
            <CardTitle>Risk Heat Map</CardTitle>
            <CardDescription>
              Visual representation of risks by likelihood and impact
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RiskHeatMap risks={risks || []} />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Risk List</CardTitle>
            <CardDescription>
              {risks?.length || 0} risks identified
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-center">L</TableHead>
                  <TableHead className="text-center">I</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Treatment</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {risks?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <p className="text-muted-foreground">No risks found</p>
                      <Button
                        variant="link"
                        onClick={() => setIsCreateOpen(true)}
                      >
                        Add your first risk
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  risks?.map((risk: any) => {
                    const score = getRiskScore(risk.likelihood, risk.impact)
                    const level = getRiskLevel(score)
                    return (
                      <TableRow key={risk.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className={cn('h-4 w-4', getRiskColor(score))} />
                            <div>
                              <p className="font-medium">{risk.title}</p>
                              {risk.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {risk.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">{risk.likelihood}</TableCell>
                        <TableCell className="text-center">{risk.impact}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={level.variant as any}>{score}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{risk.status}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{risk.treatmentType || '-'}</Badge>
                        </TableCell>
                        <TableCell>{risk.owner || '-'}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleEdit(risk)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
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
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog - Similar to Create */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit Risk</DialogTitle>
            <DialogDescription>
              Update the risk assessment and treatment plan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Risk Title</Label>
              <Input
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Likelihood (1-5)</Label>
                <Select
                  value={formData.likelihood.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, likelihood: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Rare</SelectItem>
                    <SelectItem value="2">2 - Unlikely</SelectItem>
                    <SelectItem value="3">3 - Possible</SelectItem>
                    <SelectItem value="4">4 - Likely</SelectItem>
                    <SelectItem value="5">5 - Almost Certain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Impact (1-5)</Label>
                <Select
                  value={formData.impact.toString()}
                  onValueChange={(value) =>
                    setFormData({ ...formData, impact: parseInt(value) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 - Negligible</SelectItem>
                    <SelectItem value="2">2 - Minor</SelectItem>
                    <SelectItem value="3">3 - Moderate</SelectItem>
                    <SelectItem value="4">4 - Major</SelectItem>
                    <SelectItem value="5">5 - Catastrophic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {riskStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Treatment</Label>
                <Select
                  value={formData.treatmentType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, treatmentType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {treatmentTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Treatment Plan</Label>
              <Textarea
                value={formData.treatmentPlan}
                onChange={(e) =>
                  setFormData({ ...formData, treatmentPlan: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="grid gap-2">
              <Label>Risk Owner</Label>
              <Input
                value={formData.owner}
                onChange={(e) =>
                  setFormData({ ...formData, owner: e.target.value })
                }
              />
            </div>
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Risk Score</span>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">
                    {getRiskScore(formData.likelihood, formData.impact)}
                  </span>
                  <Badge variant={getRiskLevel(getRiskScore(formData.likelihood, formData.impact)).variant as any}>
                    {getRiskLevel(getRiskScore(formData.likelihood, formData.impact)).label}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !formData.title}
            >
              {updateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
