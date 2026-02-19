import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Input } from '@/components/ui/input'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatDateTime } from '@/lib/utils'
import {
  Search,
  Filter,
  History,
  Loader2,
  User,
  Plus,
  Pencil,
  Trash2,
  Eye,
  LogIn,
  LogOut,
  Settings,
  Shield,
  FileText,
  AlertTriangle,
  Server,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const actionIcons: Record<string, React.ElementType> = {
  CREATE: Plus,
  UPDATE: Pencil,
  DELETE: Trash2,
  VIEW: Eye,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  SETTINGS_CHANGE: Settings,
  CONTROL_UPDATE: Shield,
  POLICY_CHANGE: FileText,
  RISK_UPDATE: AlertTriangle,
  ASSET_CHANGE: Server,
}

const actionColors: Record<string, string> = {
  CREATE: 'text-green-500',
  UPDATE: 'text-blue-500',
  DELETE: 'text-red-500',
  VIEW: 'text-gray-500',
  LOGIN: 'text-green-500',
  LOGOUT: 'text-yellow-500',
}

const entityTypes = [
  'USER',
  'ASSET',
  'RISK',
  'CONTROL',
  'POLICY',
  'INCIDENT',
  'SOA',
  'ORGANIZATION',
]

const actionTypes = ['CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN', 'LOGOUT']

export function AuditLogPage() {
  const { currentOrganizationId } = useAuthStore()

  const [search, setSearch] = useState('')
  const [entityFilter, setEntityFilter] = useState<string>('')
  const [actionFilter, setActionFilter] = useState<string>('')

  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ['audit-logs', currentOrganizationId, search, entityFilter, actionFilter],
    queryFn: () =>
      api.audit.list(currentOrganizationId!, {
        search,
        entityType: entityFilter || undefined,
        action: actionFilter || undefined,
      }),
    enabled: !!currentOrganizationId,
  })

  const getActionIcon = (action: string) => {
    return actionIcons[action] || History
  }

  const getActionColor = (action: string) => {
    return actionColors[action] || 'text-muted-foreground'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground">
          Track all changes and activities in your compliance system
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search audit logs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={entityFilter || 'all'} onValueChange={(v) => setEntityFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entityTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter || 'all'} onValueChange={(v) => setActionFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionTypes.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle>Activity History</CardTitle>
          <CardDescription>
            Complete audit trail of all system activities
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
                  <TableHead className="w-[50px]"></TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLogs?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <History className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No audit logs found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  (auditLogs || [
                    // Sample data for display
                    {
                      id: '1',
                      action: 'UPDATE',
                      entityType: 'CONTROL',
                      entityId: 'ctrl-123',
                      entityName: 'A.8.2 Privileged Access Rights',
                      userId: 'user-1',
                      userName: 'John Doe',
                      details: 'Changed status from PLANNED to IMPLEMENTED',
                      ipAddress: '192.168.1.1',
                      createdAt: new Date().toISOString(),
                    },
                    {
                      id: '2',
                      action: 'CREATE',
                      entityType: 'RISK',
                      entityId: 'risk-456',
                      entityName: 'Data Breach Risk',
                      userId: 'user-2',
                      userName: 'Jane Smith',
                      details: 'Created new risk assessment',
                      ipAddress: '192.168.1.2',
                      createdAt: new Date(Date.now() - 3600000).toISOString(),
                    },
                    {
                      id: '3',
                      action: 'LOGIN',
                      entityType: 'USER',
                      entityId: 'user-1',
                      entityName: 'John Doe',
                      userId: 'user-1',
                      userName: 'John Doe',
                      details: 'Successful login',
                      ipAddress: '192.168.1.1',
                      createdAt: new Date(Date.now() - 7200000).toISOString(),
                    },
                    {
                      id: '4',
                      action: 'DELETE',
                      entityType: 'ASSET',
                      entityId: 'asset-789',
                      entityName: 'Old Server',
                      userId: 'user-2',
                      userName: 'Jane Smith',
                      details: 'Removed decommissioned asset',
                      ipAddress: '192.168.1.2',
                      createdAt: new Date(Date.now() - 86400000).toISOString(),
                    },
                  ]).map((log: any) => {
                    const ActionIcon = getActionIcon(log.action)
                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          <div className="flex items-center justify-center">
                            <ActionIcon
                              className={cn('h-4 w-4', getActionColor(log.action))}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              log.action === 'DELETE'
                                ? 'destructive'
                                : log.action === 'CREATE'
                                ? 'success'
                                : 'secondary'
                            }
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{log.entityType}</p>
                            <p className="text-xs text-muted-foreground">
                              {log.entityName}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <span>{log.userName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="text-sm text-muted-foreground truncate">
                            {log.details}
                          </p>
                          {log.ipAddress && (
                            <p className="text-xs text-muted-foreground">
                              IP: {log.ipAddress}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(log.createdAt)}
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
    </div>
  )
}
