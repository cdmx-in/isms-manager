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
  CheckCircle,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const actionIcons: Record<string, React.ElementType> = {
  CREATE: Plus,
  UPDATE: Pencil,
  DELETE: Trash2,
  VIEW: Eye,
  LOGIN: LogIn,
  LOGOUT: LogOut,
  APPROVE: CheckCircle,
  REJECT: XCircle,
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
  APPROVE: 'text-green-600',
  REJECT: 'text-red-600',
}

const entityTypes = [
  'User',
  'Asset',
  'Risk',
  'Control',
  'SoA',
  'SoADocument',
  'Organization',
  'OrganizationMember',
  'Exemption',
  'Incident',
]

const entityLabels: Record<string, string> = {
  SoADocument: 'SoA Document',
  SoA: 'SoA Entry',
  OrganizationMember: 'Org Member',
}

const actionTypes = ['CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT']

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
                  (auditLogs || []).map((log: any) => {
                    const ActionIcon = getActionIcon(log.action)
                    const userName = log.user
                      ? `${log.user.firstName} ${log.user.lastName}`
                      : log.userName || '—'
                    const entityLabel = entityLabels[log.entityType] || log.entityType
                    // Build details from oldValues/newValues
                    const details = (() => {
                      const parts: string[] = []
                      if (log.oldValues && typeof log.oldValues === 'object') {
                        Object.entries(log.oldValues).forEach(([key, val]) => {
                          const newVal = log.newValues?.[key]
                          if (newVal !== undefined && newVal !== val) {
                            parts.push(`${key}: ${val} → ${newVal}`)
                          }
                        })
                      }
                      if (parts.length === 0 && log.newValues && typeof log.newValues === 'object') {
                        Object.entries(log.newValues).forEach(([key, val]) => {
                          parts.push(`${key}: ${val}`)
                        })
                      }
                      return parts.join(', ') || log.details || ''
                    })()
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
                              log.action === 'DELETE' || log.action === 'REJECT'
                                ? 'destructive'
                                : log.action === 'CREATE' || log.action === 'APPROVE'
                                ? 'success'
                                : 'secondary'
                            }
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{entityLabel}</p>
                            {log.entityId && (
                              <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                                {log.entityId}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <span className="text-sm">{userName}</span>
                              {log.user?.email && (
                                <p className="text-xs text-muted-foreground">{log.user.email}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <p className="text-sm text-muted-foreground truncate">
                            {details}
                          </p>
                          {log.ipAddress && (
                            <p className="text-xs text-muted-foreground">
                              IP: {log.ipAddress}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
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
