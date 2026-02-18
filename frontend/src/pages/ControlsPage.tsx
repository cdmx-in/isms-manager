import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
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
import { useToast } from '@/components/ui/use-toast'
import { formatDate } from '@/lib/utils'
import {
  Search,
  Shield,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Loader2,
  Filter,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const implementationStatuses = [
  { value: 'IMPLEMENTED', label: 'Implemented', icon: CheckCircle2, color: 'text-green-500' },
  { value: 'PARTIAL', label: 'Partially Implemented', icon: Clock, color: 'text-yellow-500' },
  { value: 'PLANNED', label: 'Planned', icon: AlertCircle, color: 'text-blue-500' },
  { value: 'NOT_IMPLEMENTED', label: 'Not Implemented', icon: XCircle, color: 'text-red-500' },
  { value: 'NOT_APPLICABLE', label: 'Not Applicable', icon: XCircle, color: 'text-gray-500' },
]

const categories = [
  { id: 'A.5', name: 'Organizational Controls', count: 37 },
  { id: 'A.6', name: 'People Controls', count: 8 },
  { id: 'A.7', name: 'Physical Controls', count: 14 },
  { id: 'A.8', name: 'Technological Controls', count: 34 },
]

export function ControlsPage() {
  const { currentOrganizationId } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedControl, setSelectedControl] = useState<any>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [formData, setFormData] = useState({
    implementationStatus: 'NOT_IMPLEMENTED',
    implementationNotes: '',
    evidence: '',
  })

  const { data: controls, isLoading } = useQuery({
    queryKey: ['controls', currentOrganizationId, search, categoryFilter, statusFilter],
    queryFn: () =>
      api.controls.list(currentOrganizationId!, {
        search,
        category: categoryFilter || undefined,
        status: statusFilter || undefined,
      }),
    enabled: !!currentOrganizationId,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.controls.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['controls'] })
      setIsDetailOpen(false)
      toast({ title: 'Control updated successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update control',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const handleControlClick = (control: any) => {
    setSelectedControl(control)
    setFormData({
      implementationStatus: control.implementationStatus || 'NOT_IMPLEMENTED',
      implementationNotes: control.implementationNotes || '',
      evidence: control.evidence || '',
    })
    setIsDetailOpen(true)
  }

  const handleUpdate = () => {
    if (selectedControl) {
      updateMutation.mutate({ id: selectedControl.id, data: formData })
    }
  }

  const getStatusInfo = (status: string) => {
    return implementationStatuses.find((s) => s.value === status) || implementationStatuses[3]
  }

  // Calculate category statistics
  const getCategoryStats = (categoryId: string) => {
    const categoryControls = controls?.filter((c: any) =>
      c.controlId.startsWith(categoryId)
    ) || []
    const implemented = categoryControls.filter(
      (c: any) => c.implementationStatus === 'IMPLEMENTED'
    ).length
    const total = categoryControls.length
    return { implemented, total, percentage: total > 0 ? Math.round((implemented / total) * 100) : 0 }
  }

  // Group controls by category
  const groupedControls = controls?.reduce((acc: any, control: any) => {
    const category = control.controlId.substring(0, 3)
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(control)
    return acc
  }, {}) || {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">ISO 27001:2022 Controls</h1>
          <p className="text-muted-foreground">
            Manage and track implementation of Annex A controls
          </p>
        </div>
      </div>

      {/* Category Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {categories.map((category) => {
          const stats = getCategoryStats(category.id)
          return (
            <Card
              key={category.id}
              className={cn(
                'cursor-pointer transition-colors hover:bg-accent',
                categoryFilter === category.id && 'border-primary'
              )}
              onClick={() =>
                setCategoryFilter(categoryFilter === category.id ? '' : category.id)
              }
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  {category.id} - {category.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold">{stats.percentage}%</span>
                  <span className="text-sm text-muted-foreground">
                    {stats.implemented}/{stats.total}
                  </span>
                </div>
                <Progress value={stats.percentage} className="h-2" />
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search controls..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter || 'all'} onValueChange={(v) => setStatusFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {implementationStatuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categoryFilter && (
              <Button variant="ghost" onClick={() => setCategoryFilter('')}>
                Clear Filter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Controls List */}
      <Card>
        <CardHeader>
          <CardTitle>Controls</CardTitle>
          <CardDescription>
            {controls?.length || 0} controls
            {categoryFilter && ` in ${categoryFilter}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedControls).map(([category, categoryControls]: [string, any]) => (
                <div key={category}>
                  <h3 className="text-lg font-semibold mb-3">
                    {category} - {categories.find((c) => c.id === category)?.name}
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[100px]">Control ID</TableHead>
                        <TableHead>Control</TableHead>
                        <TableHead className="w-[180px]">Status</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryControls.map((control: any) => {
                        const statusInfo = getStatusInfo(control.implementationStatus)
                        const StatusIcon = statusInfo.icon
                        return (
                          <TableRow
                            key={control.id}
                            className="cursor-pointer"
                            onClick={() => handleControlClick(control)}
                          >
                            <TableCell className="font-mono text-sm">
                              {control.controlId}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{control.name}</p>
                                <p className="text-sm text-muted-foreground line-clamp-1">
                                  {control.description}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <StatusIcon className={cn('h-4 w-4', statusInfo.color)} />
                                <span className="text-sm">{statusInfo.label}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Control Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {selectedControl?.controlId} - {selectedControl?.name}
            </DialogTitle>
            <DialogDescription>{selectedControl?.description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Tabs defaultValue="implementation">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="implementation">Implementation</TabsTrigger>
                <TabsTrigger value="guidance">Guidance</TabsTrigger>
                <TabsTrigger value="evidence">Evidence</TabsTrigger>
              </TabsList>

              <TabsContent value="implementation" className="space-y-4 mt-4">
                <div className="grid gap-2">
                  <Label>Implementation Status</Label>
                  <Select
                    value={formData.implementationStatus}
                    onValueChange={(value) =>
                      setFormData({ ...formData, implementationStatus: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {implementationStatuses.map((status) => {
                        const Icon = status.icon
                        return (
                          <SelectItem key={status.value} value={status.value}>
                            <div className="flex items-center gap-2">
                              <Icon className={cn('h-4 w-4', status.color)} />
                              {status.label}
                            </div>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Implementation Notes</Label>
                  <Textarea
                    value={formData.implementationNotes}
                    onChange={(e) =>
                      setFormData({ ...formData, implementationNotes: e.target.value })
                    }
                    placeholder="Describe how this control is implemented in your organization..."
                    rows={4}
                  />
                </div>
              </TabsContent>

              <TabsContent value="guidance" className="space-y-4 mt-4">
                <div className="rounded-lg border p-4 bg-muted/50">
                  <h4 className="font-medium mb-2">Control Objective</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedControl?.objective ||
                      'To ensure information security is implemented and operated in accordance with the organizational policies and procedures.'}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium mb-2">Implementation Guidance</h4>
                  <p className="text-sm text-muted-foreground">
                    {selectedControl?.guidance ||
                      'Organizations should establish appropriate controls to protect information assets. This includes defining responsibilities, implementing technical measures, and maintaining documentation of security activities.'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://www.iso.org/standard/27001`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      ISO 27001 Reference
                    </a>
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="evidence" className="space-y-4 mt-4">
                <div className="grid gap-2">
                  <Label>Evidence & Documentation</Label>
                  <Textarea
                    value={formData.evidence}
                    onChange={(e) =>
                      setFormData({ ...formData, evidence: e.target.value })
                    }
                    placeholder="List documents, procedures, or other evidence demonstrating control implementation..."
                    rows={4}
                  />
                </div>
                <div className="rounded-lg border-2 border-dashed p-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Drag and drop files here, or click to upload evidence documents
                  </p>
                  <Button variant="outline" size="sm" className="mt-2">
                    Upload Files
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
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
