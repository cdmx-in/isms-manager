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
import { formatDate, formatDateTime } from '@/lib/utils'
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
  AlertCircle,
  Loader2,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const incidentStatuses = [
  { value: 'REPORTED', label: 'Reported', icon: AlertCircle, color: 'text-blue-500', bgColor: 'bg-blue-500' },
  { value: 'INVESTIGATING', label: 'Investigating', icon: Activity, color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  { value: 'CONTAINED', label: 'Contained', icon: AlertTriangle, color: 'text-orange-500', bgColor: 'bg-orange-500' },
  { value: 'RESOLVED', label: 'Resolved', icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500' },
  { value: 'CLOSED', label: 'Closed', icon: XCircle, color: 'text-gray-500', bgColor: 'bg-gray-500' },
]

const severityLevels = [
  { value: 'CRITICAL', label: 'Critical', color: 'destructive' },
  { value: 'HIGH', label: 'High', color: 'warning' },
  { value: 'MEDIUM', label: 'Medium', color: 'default' },
  { value: 'LOW', label: 'Low', color: 'success' },
]

const incidentTypes = [
  'DATA_BREACH',
  'MALWARE',
  'PHISHING',
  'UNAUTHORIZED_ACCESS',
  'DENIAL_OF_SERVICE',
  'POLICY_VIOLATION',
  'PHYSICAL_SECURITY',
  'OTHER',
]

export function IncidentsPage() {
  const { currentOrganizationId } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selectedIncident, setSelectedIncident] = useState<any>(null)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'OTHER',
    severity: 'MEDIUM',
    status: 'REPORTED',
    reportedBy: '',
    affectedSystems: '',
    immediateActions: '',
    rootCause: '',
    lessonsLearned: '',
  })

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents', currentOrganizationId, search, statusFilter, severityFilter],
    queryFn: () =>
      api.incidents.list(currentOrganizationId!, {
        search,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
      }),
    enabled: !!currentOrganizationId,
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => api.incidents.create(currentOrganizationId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      setIsCreateOpen(false)
      resetForm()
      toast({ title: 'Incident reported successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to report incident',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      api.incidents.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      setIsEditOpen(false)
      setSelectedIncident(null)
      toast({ title: 'Incident updated successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update incident',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.incidents.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] })
      toast({ title: 'Incident deleted successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to delete incident',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      type: 'OTHER',
      severity: 'MEDIUM',
      status: 'REPORTED',
      reportedBy: '',
      affectedSystems: '',
      immediateActions: '',
      rootCause: '',
      lessonsLearned: '',
    })
  }

  const handleCreate = () => {
    createMutation.mutate(formData)
  }

  const handleEdit = (incident: any) => {
    setSelectedIncident(incident)
    setFormData({
      title: incident.title,
      description: incident.description || '',
      type: incident.type,
      severity: incident.severity,
      status: incident.status,
      reportedBy: incident.reportedBy || '',
      affectedSystems: incident.affectedSystems || '',
      immediateActions: incident.immediateActions || '',
      rootCause: incident.rootCause || '',
      lessonsLearned: incident.lessonsLearned || '',
    })
    setIsEditOpen(true)
  }

  const handleUpdate = () => {
    if (selectedIncident) {
      updateMutation.mutate({ id: selectedIncident.id, data: formData })
    }
  }

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this incident?')) {
      deleteMutation.mutate(id)
    }
  }

  const getStatusInfo = (status: string) => {
    return incidentStatuses.find((s) => s.value === status) || incidentStatuses[0]
  }

  const getSeverityInfo = (severity: string) => {
    return severityLevels.find((s) => s.value === severity) || severityLevels[2]
  }

  // Stats
  const stats = {
    total: incidents?.length || 0,
    open: incidents?.filter((i: any) => !['RESOLVED', 'CLOSED'].includes(i.status)).length || 0,
    critical: incidents?.filter((i: any) => i.severity === 'CRITICAL' && !['RESOLVED', 'CLOSED'].includes(i.status)).length || 0,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incident Management</h1>
          <p className="text-muted-foreground">
            Track and manage security incidents
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="mr-2 h-4 w-4" />
              Report Incident
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Report New Incident</DialogTitle>
              <DialogDescription>
                Document a new security incident for investigation and tracking.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Incident Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Suspicious login attempts detected"
                />
              </div>

              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Describe what happened, when it was discovered, and initial observations..."
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, type: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {incidentTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Severity</Label>
                  <Select
                    value={formData.severity}
                    onValueChange={(value) =>
                      setFormData({ ...formData, severity: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {severityLevels.map((level) => (
                        <SelectItem key={level.value} value={level.value}>
                          {level.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                      {incidentStatuses.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Reported By</Label>
                  <Input
                    value={formData.reportedBy}
                    onChange={(e) =>
                      setFormData({ ...formData, reportedBy: e.target.value })
                    }
                    placeholder="Name or department"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Affected Systems</Label>
                  <Input
                    value={formData.affectedSystems}
                    onChange={(e) =>
                      setFormData({ ...formData, affectedSystems: e.target.value })
                    }
                    placeholder="e.g., Email server, CRM system"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Immediate Actions Taken</Label>
                <Textarea
                  value={formData.immediateActions}
                  onChange={(e) =>
                    setFormData({ ...formData, immediateActions: e.target.value })
                  }
                  placeholder="Describe any immediate containment or mitigation actions..."
                  rows={2}
                />
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
                Report Incident
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Incidents</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">All time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Incidents</CardTitle>
            <Activity className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.open}</div>
            <p className="text-xs text-muted-foreground">Requiring attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Open</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
            <p className="text-xs text-muted-foreground">High priority</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search incidents..."
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
                {incidentStatuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter || 'all'} onValueChange={(v) => setSeverityFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                {severityLevels.map((level) => (
                  <SelectItem key={level.value} value={level.value}>
                    {level.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Incidents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Incidents</CardTitle>
          <CardDescription>
            {incidents?.length || 0} incidents logged
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Incident</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reported</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <p className="text-muted-foreground">No incidents found</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Good news! No security incidents have been reported.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  incidents?.map((incident: any) => {
                    const statusInfo = getStatusInfo(incident.status)
                    const severityInfo = getSeverityInfo(incident.severity)
                    const StatusIcon = statusInfo.icon
                    return (
                      <TableRow key={incident.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={cn('w-2 h-2 rounded-full', statusInfo.bgColor)} />
                            <div>
                              <p className="font-medium">{incident.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {incident.incidentNumber || `INC-${incident.id.substring(0, 8)}`}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {incident.type.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={severityInfo.color as any}>
                            {severityInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <StatusIcon className={cn('h-4 w-4', statusInfo.color)} />
                            <span className="text-sm">{statusInfo.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(incident.createdAt)}
                        </TableCell>
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
                              <DropdownMenuItem onClick={() => handleEdit(incident)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                View / Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(incident.id)}
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
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Incident Details</DialogTitle>
            <DialogDescription>
              {selectedIncident?.incidentNumber || `INC-${selectedIncident?.id?.substring(0, 8)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Incident Title</Label>
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

            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData({ ...formData, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {incidentTypes.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Severity</Label>
                <Select
                  value={formData.severity}
                  onValueChange={(value) =>
                    setFormData({ ...formData, severity: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {severityLevels.map((level) => (
                      <SelectItem key={level.value} value={level.value}>
                        {level.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                    {incidentStatuses.map((status) => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Immediate Actions Taken</Label>
              <Textarea
                value={formData.immediateActions}
                onChange={(e) =>
                  setFormData({ ...formData, immediateActions: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="grid gap-2">
              <Label>Root Cause Analysis</Label>
              <Textarea
                value={formData.rootCause}
                onChange={(e) =>
                  setFormData({ ...formData, rootCause: e.target.value })
                }
                placeholder="Identify the root cause of the incident..."
                rows={3}
              />
            </div>

            <div className="grid gap-2">
              <Label>Lessons Learned</Label>
              <Textarea
                value={formData.lessonsLearned}
                onChange={(e) =>
                  setFormData({ ...formData, lessonsLearned: e.target.value })
                }
                placeholder="Document lessons learned and preventive measures..."
                rows={3}
              />
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
