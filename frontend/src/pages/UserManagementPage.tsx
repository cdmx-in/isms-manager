import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { organizationApi, roleApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  Shield,
  Search,
  Pencil,
  Lock,
  KeyRound,
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'

// ============================================
// MEMBERS TAB
// ============================================

function MembersTab() {
  const { user, currentOrganizationId } = useAuthStore()
  const { toast } = useToast()
  const canEdit = usePermission('users', 'edit')

  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [newMember, setNewMember] = useState({ email: '', orgRoleId: '' })
  const [searchQuery, setSearchQuery] = useState('')

  const { data: orgDetails, refetch: refetchOrg, isLoading } = useQuery({
    queryKey: ['organization', currentOrganizationId],
    queryFn: () => organizationApi.get(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const { data: rolesData } = useQuery({
    queryKey: ['org-roles', currentOrganizationId],
    queryFn: () => roleApi.list(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const orgMembers = orgDetails?.data?.data?.members || []
  const orgRoles = rolesData?.data?.data || []

  const filteredMembers = orgMembers.filter((member: any) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      member.user?.email?.toLowerCase().includes(q) ||
      member.user?.firstName?.toLowerCase().includes(q) ||
      member.user?.lastName?.toLowerCase().includes(q) ||
      member.role?.toLowerCase().includes(q)
    )
  })

  const addMemberMutation = useMutation({
    mutationFn: () => {
      // First add member, then assign org role if selected
      return organizationApi.addMember(currentOrganizationId!, {
        email: newMember.email,
        role: 'USER', // Default legacy role
      }).then(async (res) => {
        if (newMember.orgRoleId && res.data?.data?.id) {
          await organizationApi.updateMemberOrgRole(
            currentOrganizationId!, res.data.data.id, newMember.orgRoleId
          )
        }
        return res
      })
    },
    onSuccess: () => {
      refetchOrg()
      setAddMemberOpen(false)
      setNewMember({ email: '', orgRoleId: '' })
      toast({ title: 'Member added successfully' })
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error?.message || error.response?.data?.error || 'Failed to add member'
      toast({ title: msg, variant: 'destructive' })
    },
  })

  const assignRoleMutation = useMutation({
    mutationFn: ({ memberId, orgRoleId }: { memberId: string; orgRoleId: string | null }) =>
      organizationApi.updateMemberOrgRole(currentOrganizationId!, memberId, orgRoleId),
    onSuccess: () => {
      refetchOrg()
      toast({ title: 'Role updated' })
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error?.message || error.response?.data?.error || 'Failed to update role'
      toast({ title: msg, variant: 'destructive' })
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: string) =>
      organizationApi.removeMember(currentOrganizationId!, memberId),
    onSuccess: () => {
      refetchOrg()
      toast({ title: 'Member removed' })
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error?.message || error.response?.data?.error || 'Failed to remove member'
      toast({ title: msg, variant: 'destructive' })
    },
  })

  const getMemberRoleName = (member: any) => {
    const assignedRole = orgRoles.find((r: any) => r.id === member.orgRoleId)
    if (assignedRole) return assignedRole.name
    const legacyLabels: Record<string, string> = {
      ADMIN: 'Admin',
      LOCAL_ADMIN: 'Local Admin',
      AUDITOR: 'Auditor',
      USER: 'User',
      VIEWER: 'Viewer',
    }
    return legacyLabels[member.role] || member.role
  }

  return (
    <div className="space-y-4">
      {/* Members Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                {orgMembers.length} member{orgMembers.length !== 1 ? 's' : ''} in this organization
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search members..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {canEdit && (
                <Button onClick={() => setAddMemberOpen(true)} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Member
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 4 : 3} className="text-center py-8 text-muted-foreground">
                      {searchQuery ? 'No members match your search' : 'No members found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMembers.map((member: any) => {
                    const isSelf = member.user?.id === user?.id
                    const memberInitials = member.user
                      ? `${(member.user.firstName || '')[0] || ''}${(member.user.lastName || '')[0] || ''}`
                      : '?'

                    return (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={member.user?.avatar} />
                              <AvatarFallback className="text-xs">{memberInitials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm">
                                {member.user?.firstName} {member.user?.lastName}
                                {isSelf && (
                                  <span className="text-muted-foreground ml-1 text-xs">(you)</span>
                                )}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {member.user?.email}
                        </TableCell>
                        <TableCell>
                          {canEdit && !isSelf && orgRoles.length > 0 ? (
                            <Select
                              value={member.orgRoleId || `legacy:${member.role}`}
                              onValueChange={(val) => {
                                if (val.startsWith('legacy:')) {
                                  // Not assigning custom role, keep legacy
                                  return
                                }
                                assignRoleMutation.mutate({ memberId: member.id, orgRoleId: val })
                              }}
                            >
                              <SelectTrigger className="w-[180px] h-8 text-xs">
                                <SelectValue>{getMemberRoleName(member)}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {orgRoles.map((role: any) => (
                                  <SelectItem key={role.id} value={role.id}>
                                    {role.name}
                                    {role.isSystem && ' (System)'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant="outline">
                              {getMemberRoleName(member)}
                            </Badge>
                          )}
                        </TableCell>
                        {canEdit && (
                          <TableCell className="text-right">
                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Remove ${member.user?.firstName} ${member.user?.lastName} from the organization?`
                                    )
                                  ) {
                                    removeMemberMutation.mutate(member.id)
                                  }
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Add an existing user to your organization by their email address.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid gap-2">
              <Label htmlFor="memberEmail">Email Address</Label>
              <Input
                id="memberEmail"
                type="email"
                placeholder="user@example.com"
                value={newMember.email}
                onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                The user must have already signed in at least once.
              </p>
            </div>
            {orgRoles.length > 0 && (
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select
                  value={newMember.orgRoleId}
                  onValueChange={(orgRoleId) => setNewMember({ ...newMember, orgRoleId })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgRoles.map((role: any) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.name} {role.description ? `- ${role.description}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => addMemberMutation.mutate()}
                disabled={addMemberMutation.isPending || !newMember.email}
              >
                {addMemberMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================
// ROLES TAB
// ============================================

function RolesTab() {
  const { currentOrganizationId } = useAuthStore()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const canEdit = usePermission('users', 'edit')

  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<any>(null)
  const [roleName, setRoleName] = useState('')
  const [roleDescription, setRoleDescription] = useState('')
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([])

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['org-roles', currentOrganizationId],
    queryFn: () => roleApi.list(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const { data: modulesData } = useQuery({
    queryKey: ['permission-modules'],
    queryFn: () => roleApi.modules(),
  })

  const roles = rolesData?.data?.data || []
  const modules = modulesData?.data?.data || []

  const seedMutation = useMutation({
    mutationFn: () => roleApi.seed(currentOrganizationId!, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-roles'] })
      toast({ title: 'System roles seeded successfully' })
    },
    onError: (error: any) => {
      toast({ title: error.response?.data?.error?.message || 'Failed to seed roles', variant: 'destructive' })
    },
  })

  const createMutation = useMutation({
    mutationFn: () =>
      roleApi.create(currentOrganizationId!, {
        name: roleName,
        description: roleDescription || undefined,
        permissions: selectedPermissions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-roles'] })
      closeDialog()
      toast({ title: 'Role created' })
    },
    onError: (error: any) => {
      toast({ title: error.response?.data?.error?.message || 'Failed to create role', variant: 'destructive' })
    },
  })

  const updateMutation = useMutation({
    mutationFn: () =>
      roleApi.update(currentOrganizationId!, editingRole.id, {
        name: roleName,
        description: roleDescription || undefined,
        permissions: selectedPermissions,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-roles'] })
      closeDialog()
      toast({ title: 'Role updated' })
    },
    onError: (error: any) => {
      toast({ title: error.response?.data?.error?.message || 'Failed to update role', variant: 'destructive' })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => roleApi.delete(currentOrganizationId!, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-roles'] })
      toast({ title: 'Role deleted' })
    },
    onError: (error: any) => {
      toast({ title: error.response?.data?.error?.message || 'Failed to delete role', variant: 'destructive' })
    },
  })

  const openCreateDialog = () => {
    setEditingRole(null)
    setRoleName('')
    setRoleDescription('')
    setSelectedPermissions([])
    setRoleDialogOpen(true)
  }

  const openEditDialog = (role: any) => {
    setEditingRole(role)
    setRoleName(role.name)
    setRoleDescription(role.description || '')
    setSelectedPermissions([...role.permissions])
    setRoleDialogOpen(true)
  }

  const closeDialog = () => {
    setRoleDialogOpen(false)
    setEditingRole(null)
    setRoleName('')
    setRoleDescription('')
    setSelectedPermissions([])
  }

  const togglePermission = (permission: string) => {
    const [mod, action] = permission.split(':')
    setSelectedPermissions(prev => {
      let next = [...prev]
      if (next.includes(permission)) {
        // Removing: also remove dependent actions
        next = next.filter(p => p !== permission)
        if (action === 'view') {
          next = next.filter(p => !p.startsWith(`${mod}:`))
        }
        if (action === 'edit') {
          next = next.filter(p => p !== `${mod}:approve`)
        }
      } else {
        // Adding: also add prerequisite actions
        next.push(permission)
        if (action === 'edit' && !next.includes(`${mod}:view`)) {
          next.push(`${mod}:view`)
        }
        if (action === 'approve') {
          if (!next.includes(`${mod}:view`)) next.push(`${mod}:view`)
          if (!next.includes(`${mod}:edit`)) next.push(`${mod}:edit`)
        }
      }
      return next
    })
  }

  const selectAllView = () => {
    setSelectedPermissions(prev => {
      const viewPerms = modules.map((m: any) => `${m.key}:view`)
      const newPerms = new Set([...prev, ...viewPerms])
      return [...newPerms]
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5" />
                Roles & Permissions
              </CardTitle>
              <CardDescription>
                Manage roles and their module-level permissions
              </CardDescription>
            </div>
            {canEdit && (
              <div className="flex gap-2">
                {roles.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => seedMutation.mutate()}
                    disabled={seedMutation.isPending}
                  >
                    {seedMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Initialize System Roles
                  </Button>
                )}
                <Button size="sm" onClick={openCreateDialog}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Role
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {rolesLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : roles.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <KeyRound className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="mb-2">No roles configured yet.</p>
              {canEdit && (
                <p className="text-sm">
                  Click "Initialize System Roles" to create the default roles, or "Create Role" for a custom one.
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead className="text-center">Members</TableHead>
                  {canEdit && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role: any) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {role.isSystem && <Lock className="h-3 w-3 text-muted-foreground" />}
                        <span className="font-medium text-sm">{role.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {role.description || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.length > 6 ? (
                          <Badge variant="secondary" className="text-xs">
                            {role.permissions.length} permissions
                          </Badge>
                        ) : (
                          role.permissions.map((p: string) => (
                            <Badge key={p} variant="outline" className="text-xs font-mono">
                              {p}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{role._count?.members || 0}</Badge>
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!(role.isSystem && role.name === 'Super Admin') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditDialog(role)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {!role.isSystem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => {
                                if (confirm(`Delete role "${role.name}"?`)) {
                                  deleteMutation.mutate(role.id)
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Role Dialog */}
      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRole ? 'Edit Role' : 'Create Role'}</DialogTitle>
            <DialogDescription>
              {editingRole
                ? 'Update the role name, description, and permissions.'
                : 'Define a custom role with specific module permissions.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Role Name</Label>
                <Input
                  value={roleName}
                  onChange={(e) => setRoleName(e.target.value)}
                  placeholder="e.g. Change Manager"
                />
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Input
                  value={roleDescription}
                  onChange={(e) => setRoleDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
            </div>

            {/* Permission Matrix */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Permissions</Label>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={selectAllView}>
                  Select all view
                </Button>
              </div>
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Module</TableHead>
                      <TableHead className="text-center w-[80px]">View</TableHead>
                      <TableHead className="text-center w-[80px]">Edit</TableHead>
                      <TableHead className="text-center w-[80px]">Approve</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modules.map((mod: any) => (
                      <TableRow key={mod.key}>
                        <TableCell className="font-medium text-sm">{mod.label}</TableCell>
                        {['view', 'edit', 'approve'].map((action) => {
                          const perm = `${mod.key}:${action}`
                          const supported = mod.actions.includes(action)
                          const checked = selectedPermissions.includes(perm)
                          return (
                            <TableCell key={action} className="text-center">
                              {supported ? (
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => togglePermission(perm)}
                                />
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                          )
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedPermissions.length} permission{selectedPermissions.length !== 1 ? 's' : ''} selected.
                Edit auto-selects View. Approve auto-selects View and Edit.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                onClick={() => (editingRole ? updateMutation : createMutation).mutate()}
                disabled={
                  (editingRole ? updateMutation.isPending : createMutation.isPending) ||
                  !roleName ||
                  selectedPermissions.length === 0
                }
              >
                {(editingRole ? updateMutation.isPending : createMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editingRole ? 'Update Role' : 'Create Role'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================
// MAIN PAGE
// ============================================

export function UserManagementPage() {
  const { user, currentOrganizationId } = useAuthStore()

  const currentOrg = user?.organizationMemberships.find(
    (m) => m.organizationId === currentOrganizationId
  )
  const orgName = currentOrg?.organization?.name || ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground">
          Manage team members and roles for {orgName}
        </p>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </TabsTrigger>
          <TabsTrigger value="roles" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Roles & Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <MembersTab />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <RolesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
