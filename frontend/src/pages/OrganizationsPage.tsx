import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { organizationApi } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/components/ui/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
  Building2,
  Plus,
  Pencil,
  Trash2,
  Users,
  Server,
  AlertTriangle,
  Shield,
  Loader2,
  Search,
  RefreshCw,
} from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

export function OrganizationsPage() {
  const { user, currentOrganizationId, setCurrentOrganization, checkAuth, hasPermission } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const canEdit = hasPermission('settings', 'edit')

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editOrg, setEditOrg] = useState<any>(null)
  const [deleteOrg, setDeleteOrg] = useState<any>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const res = await organizationApi.list()
      return res.data?.data || []
    },
  })

  const organizations = (data || []).filter((org: any) =>
    !search || org.name.toLowerCase().includes(search.toLowerCase()) || org.slug?.toLowerCase().includes(search.toLowerCase())
  )

  const createMutation = useMutation({
    mutationFn: () => organizationApi.create({ name: formName.trim(), description: formDesc.trim() || undefined }),
    onSuccess: async () => {
      toast({ title: 'Organization created', description: `"${formName.trim()}" has been created.` })
      setShowCreate(false)
      setFormName('')
      setFormDesc('')
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      await checkAuth()
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create', description: err?.response?.data?.message || err.message, variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: () => organizationApi.update(editOrg.id, { name: formName.trim(), description: formDesc.trim() }),
    onSuccess: () => {
      toast({ title: 'Organization updated', description: 'Changes saved.' })
      setEditOrg(null)
      setFormName('')
      setFormDesc('')
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      checkAuth()
    },
    onError: (err: any) => {
      toast({ title: 'Failed to update', description: err?.response?.data?.message || err.message, variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => organizationApi.delete(deleteOrg.id),
    onSuccess: () => {
      toast({ title: 'Organization deleted', description: `"${deleteOrg.name}" has been removed.` })
      setDeleteOrg(null)
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      checkAuth()
    },
    onError: (err: any) => {
      toast({ title: 'Failed to delete', description: err?.response?.data?.message || err.message, variant: 'destructive' })
    },
  })

  const openEdit = (org: any) => {
    setFormName(org.name)
    setFormDesc(org.description || '')
    setEditOrg(org)
  }

  const openCreate = () => {
    setFormName('')
    setFormDesc('')
    setShowCreate(true)
  }

  const switchTo = (orgId: string) => {
    setCurrentOrganization(orgId)
    window.location.reload()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Organizations</h1>
            <p className="text-muted-foreground">Manage organizations and their settings</p>
          </div>
        </div>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Create Organization
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Organizations table */}
      <Card>
        <CardContent className="p-0">
          {organizations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium">No organizations found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? 'Try a different search term' : 'Create your first organization to get started'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead className="w-[100px] text-center">Members</TableHead>
                  <TableHead className="w-[100px] text-center">Assets</TableHead>
                  <TableHead className="w-[100px] text-center">Risks</TableHead>
                  <TableHead className="w-[100px] text-center">Controls</TableHead>
                  <TableHead className="w-[150px]">Created</TableHead>
                  <TableHead className="w-[120px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organizations.map((org: any) => {
                  const isCurrent = org.id === currentOrganizationId
                  return (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            <Building2 className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{org.name}</span>
                              {isCurrent && <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-green-50 text-green-700 border-green-200">Active</Badge>}
                            </div>
                            {org.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{org.description}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {org._count?.members || 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <Server className="h-3.5 w-3.5 text-muted-foreground" />
                          {org._count?.assets || 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                          {org._count?.risks || 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          {org._count?.controls || 0}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">{formatDateTime(org.createdAt)}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {!isCurrent && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => switchTo(org.id)}>
                              Switch
                            </Button>
                          )}
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(org)} title="Edit">
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              {!isCurrent && (
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700" onClick={() => setDeleteOrg(org)} title="Delete">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>Create a new organization. You will be added as admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Acme Corp"
                onKeyDown={(e) => e.key === 'Enter' && formName.trim() && createMutation.mutate()}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !formName.trim()}>
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editOrg} onOpenChange={() => setEditOrg(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>Update organization details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Organization name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrg(null)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending || !formName.trim()}>
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteOrg} onOpenChange={() => setDeleteOrg(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Organization</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteOrg?.name}</strong>? This will remove all associated data and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOrg(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
