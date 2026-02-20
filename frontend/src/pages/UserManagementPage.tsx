import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { organizationApi } from '@/lib/api'
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import {
  Users,
  Plus,
  Trash2,
  Loader2,
  Shield,
  Search,
} from 'lucide-react'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Admin',
  LOCAL_ADMIN: 'Local Admin',
  AUDITOR: 'Auditor',
  USER: 'User',
  VIEWER: 'Viewer',
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'destructive',
  LOCAL_ADMIN: 'default',
  AUDITOR: 'secondary',
  USER: 'outline',
  VIEWER: 'outline',
}

export function UserManagementPage() {
  const { user, currentOrganizationId } = useAuthStore()
  const { toast } = useToast()

  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [newMember, setNewMember] = useState({ email: '', role: 'USER' })
  const [searchQuery, setSearchQuery] = useState('')

  const currentOrg = user?.organizationMemberships.find(
    (m) => m.organizationId === currentOrganizationId
  )
  const isOrgAdmin = currentOrg?.role === 'ADMIN' || currentOrg?.role === 'LOCAL_ADMIN'

  // Fetch organization with members
  const { data: orgDetails, refetch: refetchOrg, isLoading } = useQuery({
    queryKey: ['organization', currentOrganizationId],
    queryFn: () => organizationApi.get(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const orgMembers = orgDetails?.data?.data?.members || []
  const orgName = orgDetails?.data?.data?.name || currentOrg?.organization?.name || ''

  // Filter members by search
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
    mutationFn: () =>
      organizationApi.addMember(currentOrganizationId!, {
        email: newMember.email,
        role: newMember.role,
      }),
    onSuccess: () => {
      refetchOrg()
      setAddMemberOpen(false)
      setNewMember({ email: '', role: 'USER' })
      toast({ title: 'Member added successfully' })
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || 'Failed to add member'
      toast({ title: msg, variant: 'destructive' })
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: string }) =>
      organizationApi.updateMemberRole(currentOrganizationId!, memberId, role),
    onSuccess: () => {
      refetchOrg()
      toast({ title: 'Role updated' })
    },
    onError: (error: any) => {
      const msg = error.response?.data?.error || 'Failed to update role'
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
      const msg = error.response?.data?.error || 'Failed to remove member'
      toast({ title: msg, variant: 'destructive' })
    },
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Manage team members and roles for {orgName}
          </p>
        </div>
        {isOrgAdmin && (
          <Button onClick={() => setAddMemberOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Member
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{orgMembers.length}</p>
                <p className="text-xs text-muted-foreground">Total Members</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold">
                  {orgMembers.filter((m: any) => m.role === 'ADMIN').length}
                </p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">
                  {orgMembers.filter((m: any) => m.role === 'LOCAL_ADMIN' || m.role === 'AUDITOR').length}
                </p>
                <p className="text-xs text-muted-foreground">Local Admins / Auditors</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">
                  {orgMembers.filter((m: any) => m.role === 'USER' || m.role === 'VIEWER').length}
                </p>
                <p className="text-xs text-muted-foreground">Users / Viewers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
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
                  {isOrgAdmin && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isOrgAdmin ? 4 : 3} className="text-center py-8 text-muted-foreground">
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
                          {isOrgAdmin && !isSelf ? (
                            <Select
                              value={member.role}
                              onValueChange={(role) =>
                                updateRoleMutation.mutate({ memberId: member.id, role })
                              }
                            >
                              <SelectTrigger className="w-[140px] h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ADMIN">Admin</SelectItem>
                                <SelectItem value="LOCAL_ADMIN">Local Admin</SelectItem>
                                <SelectItem value="AUDITOR">Auditor</SelectItem>
                                <SelectItem value="USER">User</SelectItem>
                                <SelectItem value="VIEWER">Viewer</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={ROLE_COLORS[member.role] as any}>
                              {ROLE_LABELS[member.role] || member.role}
                            </Badge>
                          )}
                        </TableCell>
                        {isOrgAdmin && (
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
            <div className="grid gap-2">
              <Label>Role</Label>
              <Select
                value={newMember.role}
                onValueChange={(role) => setNewMember({ ...newMember, role })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">Admin - Full access to all features</SelectItem>
                  <SelectItem value="LOCAL_ADMIN">Local Admin - Manage org resources</SelectItem>
                  <SelectItem value="AUDITOR">Auditor - Review and audit access</SelectItem>
                  <SelectItem value="USER">User - Standard access</SelectItem>
                  <SelectItem value="VIEWER">Viewer - Read-only access</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
