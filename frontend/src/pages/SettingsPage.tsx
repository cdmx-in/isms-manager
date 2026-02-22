import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/auth.store'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import {
  User,
  Building2,
  Shield,
  Bell,
  Key,
  Loader2,
  Upload,
  Mail,
  Lock,
  AlertTriangle,
  FolderOpen,
  Trash2,
  Plus,
  HardDrive,
  RefreshCw,
  Users,
  Radio,
  CheckCircle2,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { organizationApi } from '@/lib/api'
import { CloudflareLogo, GoogleWorkspaceLogo, AzureLogo } from '@/components/icons/ServiceLogos'

const INFRA_SERVICES = [
  { slug: 'cloudflare', name: 'Cloudflare', description: 'DNS, CDN & origin exposure monitoring', icon: CloudflareLogo, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  { slug: 'google_workspace', name: 'Google Workspace', description: 'Users, groups, OAuth apps & CIS benchmarks', icon: GoogleWorkspaceLogo, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  { slug: 'azure', name: 'Azure', description: 'Entra ID, Defender & conditional access', icon: AzureLogo, color: 'text-sky-600', bg: 'bg-sky-50 border-sky-200' },
]

export function SettingsPage() {
  const { user, currentOrganizationId, checkAuth } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [profileData, setProfileData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    designation: (user as any)?.designation || '',
    email: user?.email || '',
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const [newFolder, setNewFolder] = useState({ driveId: '', name: '', folderType: 'POLICIES' })

  const currentOrg = user?.organizationMemberships.find(
    (m) => m.organizationId === currentOrganizationId
  )

  const [enabledServices, setEnabledServices] = useState<string[]>(
    currentOrg?.organization?.enabledServices || ['cloudflare', 'google_workspace', 'azure']
  )
  const [servicesSaving, setServicesSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)

  const toggleService = (slug: string) => {
    setEnabledServices(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    )
  }

  const saveServices = async () => {
    if (!currentOrganizationId) return
    setServicesSaving(true)
    try {
      await organizationApi.update(currentOrganizationId, { enabledServices })
      await checkAuth()
      toast({ title: 'Services updated', description: 'Infrastructure service settings saved. Sidebar updated.' })
    } catch (err: any) {
      toast({ title: 'Failed to save', description: err?.response?.data?.message || 'Could not update services', variant: 'destructive' })
    } finally {
      setServicesSaving(false)
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentOrganizationId) return
    setLogoUploading(true)
    try {
      await organizationApi.uploadLogo(currentOrganizationId, file)
      await checkAuth()
      toast({ title: 'Logo updated', description: 'Organization logo has been uploaded successfully.' })
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err?.response?.data?.message || 'Could not upload logo', variant: 'destructive' })
    } finally {
      setLogoUploading(false)
      e.target.value = ''
    }
  }

  // Drive folders query
  const { data: foldersData, refetch: refetchFolders } = useQuery({
    queryKey: ['drive-folders', currentOrganizationId],
    queryFn: () => api.drive.listFolders(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const driveFolders = foldersData?.data || []
  const driveConfigured = foldersData?.driveConfigured ?? false

  const addFolderMutation = useMutation({
    mutationFn: () =>
      api.drive.addFolder({
        organizationId: currentOrganizationId!,
        driveId: newFolder.driveId,
        name: newFolder.name,
        folderType: newFolder.folderType,
      }),
    onSuccess: () => {
      refetchFolders()
      setNewFolder({ driveId: '', name: '', folderType: 'POLICIES' })
      toast({ title: 'Folder added successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to add folder',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const removeFolderMutation = useMutation({
    mutationFn: (id: string) => api.drive.removeFolder(id),
    onSuccess: () => {
      refetchFolders()
      toast({ title: 'Folder removed' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to remove folder',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const syncMutation = useMutation({
    mutationFn: () => api.drive.sync(currentOrganizationId!),
    onSuccess: (data: any) => {
      refetchFolders()
      toast({ title: 'Sync completed', description: data.message })
    },
    onError: (error: any) => {
      toast({
        title: 'Sync failed',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => api.users.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth'] })
      toast({ title: 'Profile updated successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update profile',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const changePasswordMutation = useMutation({
    mutationFn: (data: any) => api.auth.changePassword(data),
    onSuccess: () => {
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      toast({ title: 'Password changed successfully' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to change password',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const handleProfileUpdate = () => {
    updateProfileMutation.mutate(profileData)
  }

  const handlePasswordChange = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: 'Passwords do not match',
        variant: 'destructive',
      })
      return
    }
    if (passwordData.newPassword.length < 8) {
      toast({
        title: 'Password must be at least 8 characters',
        variant: 'destructive',
      })
      return
    }
    changePasswordMutation.mutate({
      currentPassword: passwordData.currentPassword,
      newPassword: passwordData.newPassword,
    })
  }

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`
    : 'U'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and organization settings
        </p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />
            Security
          </TabsTrigger>
          <TabsTrigger value="organization" className="gap-2">
            <Building2 className="h-4 w-4" />
            Organization
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <HardDrive className="h-4 w-4" />
            Integrations
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-6">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
                  </Avatar>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Photo
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={profileData.firstName}
                      onChange={(e) =>
                        setProfileData({ ...profileData, firstName: e.target.value })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profileData.lastName}
                      onChange={(e) =>
                        setProfileData({ ...profileData, lastName: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="designation">Designation</Label>
                  <Input
                    id="designation"
                    value={profileData.designation}
                    onChange={(e) =>
                      setProfileData({ ...profileData, designation: e.target.value })
                    }
                    placeholder="e.g., CISO, CTO, Security Manager, COO"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your job title or role designation. This is displayed in version history and approval trails.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileData.email}
                    onChange={(e) =>
                      setProfileData({ ...profileData, email: e.target.value })
                    }
                  />
                </div>

                <Button
                  onClick={handleProfileUpdate}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Change Password</CardTitle>
                <CardDescription>
                  Update your password to keep your account secure
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, currentPassword: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, newPassword: e.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters with uppercase, lowercase, number, and special character
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value })
                    }
                  />
                </div>
                <Button
                  onClick={handlePasswordChange}
                  disabled={changePasswordMutation.isPending}
                >
                  {changePasswordMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Change Password
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Two-Factor Authentication</CardTitle>
                <CardDescription>
                  Add an extra layer of security to your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Key className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <p className="font-medium">Authenticator App</p>
                      <p className="text-sm text-muted-foreground">
                        Use an authenticator app to generate verification codes
                      </p>
                    </div>
                  </div>
                  <Button variant="outline">Enable</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Sessions</CardTitle>
                <CardDescription>
                  Manage your active login sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">Current Session</p>
                      <p className="text-sm text-muted-foreground">
                        Linux • Chrome • Last active now
                      </p>
                    </div>
                    <Badge variant="success">Active</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Organization Tab */}
        <TabsContent value="organization">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>
                  Manage your organization settings
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-6">
                  <div className="shrink-0">
                    <Label className="text-xs text-muted-foreground mb-1 block">Logo</Label>
                    <div className="relative group">
                      <div className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center overflow-hidden bg-muted/30">
                        {currentOrg?.organization?.logo ? (
                          <img
                            src={currentOrg.organization.logo}
                            alt="Org logo"
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <Building2 className="h-8 w-8 text-muted-foreground/50" />
                        )}
                      </div>
                      <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 rounded-lg cursor-pointer transition-opacity">
                        {logoUploading ? (
                          <Loader2 className="h-5 w-5 text-white animate-spin" />
                        ) : (
                          <Upload className="h-5 w-5 text-white" />
                        )}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="sr-only"
                          onChange={handleLogoUpload}
                          disabled={logoUploading}
                        />
                      </label>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 text-center">Hover to change</p>
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="grid gap-2">
                      <Label>Organization Name</Label>
                      <Input
                        value={currentOrg?.organization.name || ''}
                        disabled
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Your Role</Label>
                      <div>
                        <Badge>{currentOrg?.role}</Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  Add, remove, and manage user roles for your organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={() => window.location.href = '/users'}>
                  <Users className="mr-2 h-4 w-4" />
                  Manage Users
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="h-5 w-5" />
                  Infrastructure Services
                </CardTitle>
                <CardDescription>
                  Choose which infrastructure monitoring services are enabled for this organization. Disabled services will be hidden from the sidebar.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {INFRA_SERVICES.map(svc => {
                  const Icon = svc.icon
                  const checked = enabledServices.includes(svc.slug)
                  return (
                    <div
                      key={svc.slug}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${checked ? svc.bg : 'bg-muted/30 border-transparent opacity-60'}`}
                      onClick={() => toggleService(svc.slug)}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleService(svc.slug)}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      />
                      <Icon className="h-5 w-5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{svc.name}</p>
                        <p className="text-xs text-muted-foreground">{svc.description}</p>
                      </div>
                      {checked && <CheckCircle2 className={`h-4 w-4 shrink-0 ${svc.color}`} />}
                    </div>
                  )
                })}
                <div className="pt-2">
                  <Button
                    onClick={saveServices}
                    disabled={servicesSaving}
                    size="sm"
                  >
                    {servicesSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    Save Services
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Google Drive Integration
                </CardTitle>
                <CardDescription>
                  Configure Google Drive folders to sync compliance policies and procedures.
                  {!driveConfigured && (
                    <span className="block mt-1 text-yellow-600">
                      Google Drive service account is not configured. Add the service account key file to enable this feature.
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Configured Folders */}
                <div>
                  <Label className="text-sm font-medium">Configured Folders</Label>
                  <div className="mt-2 space-y-2">
                    {driveFolders.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                        No folders configured yet. Add a Google Drive folder below.
                      </p>
                    ) : (
                      driveFolders.map((folder: any) => (
                        <div
                          key={folder.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex items-center gap-3">
                            <FolderOpen className="h-5 w-5 text-yellow-500" />
                            <div>
                              <p className="font-medium text-sm">{folder.name}</p>
                              <p className="text-xs text-muted-foreground">
                                ID: {folder.driveId} | Type: {folder.folderType?.replace(/_/g, ' ')}
                                {folder._count?.documents > 0 && ` | ${folder._count.documents} files`}
                              </p>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Remove this folder configuration?')) {
                                removeFolderMutation.mutate(folder.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Add New Folder */}
                <div className="border-t pt-4">
                  <Label className="text-sm font-medium">Add Drive Folder</Label>
                  <div className="mt-2 grid gap-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Folder Name</Label>
                        <Input
                          placeholder="e.g., Compliance Policies"
                          value={newFolder.name}
                          onChange={(e) => setNewFolder({ ...newFolder, name: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Google Drive Folder ID</Label>
                        <Input
                          placeholder="e.g., 1abc...xyz"
                          value={newFolder.driveId}
                          onChange={(e) => setNewFolder({ ...newFolder, driveId: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-xs text-muted-foreground">Folder Type</Label>
                        <Select
                          value={newFolder.folderType}
                          onValueChange={(v) => setNewFolder({ ...newFolder, folderType: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="POLICIES">Policies</SelectItem>
                            <SelectItem value="PROCEDURES">Procedures</SelectItem>
                            <SelectItem value="DOCUMENTS">Documents</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => addFolderMutation.mutate()}
                        disabled={addFolderMutation.isPending || !newFolder.name || !newFolder.driveId}
                      >
                        {addFolderMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Add Folder
                      </Button>
                      {driveFolders.length > 0 && (
                        <Button
                          variant="outline"
                          onClick={() => syncMutation.mutate()}
                          disabled={syncMutation.isPending || !driveConfigured}
                        >
                          {syncMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Sync All Folders
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  To find a folder's ID, open it in Google Drive. The ID is the last part of the URL:
                  drive.google.com/drive/folders/<strong>FOLDER_ID_HERE</strong>
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>
                Configure how you receive notifications
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">
                      Receive updates via email
                    </p>
                  </div>
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All notifications</SelectItem>
                    <SelectItem value="important">Important only</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Risk Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified about high-risk items
                    </p>
                  </div>
                </div>
                <Select defaultValue="high">
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All risks</SelectItem>
                    <SelectItem value="high">High & Critical</SelectItem>
                    <SelectItem value="critical">Critical only</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Lock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Security Alerts</p>
                    <p className="text-sm text-muted-foreground">
                      Get notified about security incidents
                    </p>
                  </div>
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All incidents</SelectItem>
                    <SelectItem value="high">High severity</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
