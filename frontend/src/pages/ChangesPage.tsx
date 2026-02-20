import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import {
  Search,
  Loader2,
  Filter,
  CheckCircle2,
  XCircle,
  Activity,
  ExternalLink,
  Eye,
  ChevronLeft,
  ChevronRight,
  Info,
  User,
  Users,
  Brain,
  RefreshCw,
  MessageSquare,
  Sparkles,
  Send,
  Copy,
  Database,
  GitBranch,
  Clock,
  ShieldCheck,
  ArrowUpCircle,
  CircleDot,
  PauseCircle,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

const changeStatuses = [
  { value: 'NEW', label: 'New', icon: CircleDot, color: 'text-blue-500', bgColor: 'bg-blue-500' },
  { value: 'PLANNED', label: 'Planned', icon: Clock, color: 'text-indigo-500', bgColor: 'bg-indigo-500' },
  { value: 'APPROVED', label: 'Approved', icon: ShieldCheck, color: 'text-emerald-500', bgColor: 'bg-emerald-500' },
  { value: 'IMPLEMENTED', label: 'Implemented', icon: ArrowUpCircle, color: 'text-orange-500', bgColor: 'bg-orange-500' },
  { value: 'MONITORED', label: 'Monitored', icon: Activity, color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  { value: 'CLOSED', label: 'Closed', icon: CheckCircle2, color: 'text-gray-500', bgColor: 'bg-gray-500' },
  { value: 'REJECTED', label: 'Rejected', icon: XCircle, color: 'text-red-500', bgColor: 'bg-red-500' },
]

const changeTypeLabels: Record<string, string> = {
  'NormalChange': 'Normal',
  'RoutineChange': 'Routine',
  'EmergencyChange': 'Emergency',
}

export function ChangesPage() {
  const { currentOrganizationId } = useAuthStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [selectedChange, setSelectedChange] = useState<any>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  // Knowledge Base state
  const [kbExpanded, setKbExpanded] = useState(false)
  const [kbTab, setKbTab] = useState<'search' | 'ask'>('search')
  const [kbQuery, setKbQuery] = useState('')
  const [kbSearchResults, setKbSearchResults] = useState<any[]>([])
  const [kbAnswer, setKbAnswer] = useState<any>(null)
  const [kbSearching, setKbSearching] = useState(false)
  const [kbAsking, setKbAsking] = useState(false)
  const [syncJobId, setSyncJobId] = useState<string | null>(null)
  const [similarChanges, setSimilarChanges] = useState<any[]>([])
  const [loadingSimilar, setLoadingSimilar] = useState(false)

  const { data: response, isLoading } = useQuery({
    queryKey: ['changes', currentOrganizationId, search, statusFilter, teamFilter, page, limit],
    queryFn: () =>
      api.changes.list(currentOrganizationId!, {
        search: search || undefined,
        status: statusFilter || undefined,
        team: teamFilter || undefined,
        page,
        limit,
      }),
    enabled: !!currentOrganizationId,
  })

  const { data: stats } = useQuery({
    queryKey: ['change-stats', currentOrganizationId],
    queryFn: () => api.changes.stats(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  // Knowledge Base status query
  const { data: kbStatus, refetch: refetchKbStatus } = useQuery({
    queryKey: ['change-kb-status', currentOrganizationId],
    queryFn: () => api.changeKnowledge.status(currentOrganizationId!),
    enabled: !!currentOrganizationId,
    refetchInterval: syncJobId ? 3000 : false,
  })

  // Poll sync job progress
  const { data: syncJob } = useQuery({
    queryKey: ['change-sync-job', syncJobId],
    queryFn: () => api.changeKnowledge.syncStatus(syncJobId!),
    enabled: !!syncJobId,
    refetchInterval: 2000,
  })

  // Stop polling when sync is complete
  useEffect(() => {
    if (syncJob && (syncJob.status === 'completed' || syncJob.status === 'failed')) {
      setSyncJobId(null)
      refetchKbStatus()
    }
  }, [syncJob?.status])

  const changes = response?.data || []
  const pagination = response?.pagination

  const activeFilterCount = [statusFilter, teamFilter, search].filter(Boolean).length

  const clearAllFilters = () => {
    setSearch('')
    setStatusFilter('')
    setTeamFilter('')
    setPage(1)
  }

  const [syncError, setSyncError] = useState<string | null>(null)

  const handleSync = async (mode: string = 'incremental') => {
    if (!currentOrganizationId) return
    setSyncError(null)
    try {
      const result = await api.changeKnowledge.sync(currentOrganizationId, mode)
      setSyncJobId(result.jobId)
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Sync failed'
      setSyncError(message)
      setTimeout(() => setSyncError(null), 10000)
    }
  }

  const handleKbSearch = async () => {
    if (!kbQuery.trim() || !currentOrganizationId) return
    setKbSearching(true)
    setKbSearchResults([])
    try {
      const results = await api.changeKnowledge.search(currentOrganizationId, kbQuery, 10)
      setKbSearchResults(results)
    } catch (err) {
      console.error('KB search failed:', err)
    } finally {
      setKbSearching(false)
    }
  }

  const handleKbAsk = async () => {
    if (!kbQuery.trim() || !currentOrganizationId) return
    setKbAsking(true)
    setKbAnswer(null)
    try {
      const result = await api.changeKnowledge.ask(currentOrganizationId, kbQuery)
      setKbAnswer(result)
    } catch (err) {
      console.error('KB ask failed:', err)
    } finally {
      setKbAsking(false)
    }
  }

  const handleFindSimilar = async (itopId: string) => {
    if (!currentOrganizationId) return
    setLoadingSimilar(true)
    setSimilarChanges([])
    try {
      const results = await api.changeKnowledge.similar(currentOrganizationId, itopId, 5)
      setSimilarChanges(results)
    } catch (err) {
      console.error('Find similar failed:', err)
    } finally {
      setLoadingSimilar(false)
    }
  }

  const getStatusInfo = (status: string) => {
    return changeStatuses.find((s) => s.value === status) || changeStatuses[0]
  }

  const handleViewDetail = (change: any) => {
    setSelectedChange(change)
    setSimilarChanges([])
    setIsDetailOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Change Management</h1>
          <p className="text-muted-foreground">
            Change requests from iTop
          </p>
        </div>
        <a
          href="https://help.cdmx.in"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
          Open iTop
        </a>
      </div>

      {/* iTop Notice */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
        <div className="flex items-center gap-2">
          <Info className="h-5 w-5 text-blue-500" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Changes are fetched from iTop. This is a read-only view. To manage changes, please use{' '}
            <a href="https://help.cdmx.in" target="_blank" rel="noopener noreferrer" className="font-medium underline">
              iTop (help.cdmx.in)
            </a>{' '}
            directly.
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Changes</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">All time from iTop</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
            <Activity className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats?.open?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved</CardTitle>
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{stats?.byStatus?.APPROVED || 0}</div>
            <p className="text-xs text-muted-foreground">Ready for implementation</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Implemented</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats?.byStatus?.IMPLEMENTED || 0}</div>
            <p className="text-xs text-muted-foreground">Deployed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats?.byStatus?.CLOSED?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* AI Knowledge Base */}
      <Card className="border-purple-200 dark:border-purple-900">
        <CardHeader
          className="cursor-pointer select-none"
          onClick={() => setKbExpanded(!kbExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-950">
                <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-base">AI Knowledge Base</CardTitle>
                <CardDescription>
                  {kbStatus?.indexedChanges
                    ? `${kbStatus.indexedChanges.toLocaleString()} changes indexed`
                    : 'Semantic search & Q&A over change history'}
                  {kbStatus?.lastSync?.completedAt && (
                    <span className="ml-2 text-xs">
                      Last synced: {new Date(kbStatus.lastSync.completedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(syncJobId || kbStatus?.lastSync?.status === 'running') && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Syncing {syncJob ? `${syncJob.progress}/${syncJob.total}` : '...'}
                </div>
              )}
              {syncError && (
                <span className="text-xs text-red-500 max-w-[250px] truncate" title={syncError}>
                  {syncError}
                </span>
              )}
              {(() => {
                const isSyncing = !!syncJobId || kbStatus?.lastSync?.status === 'running'
                return kbStatus?.indexedChanges ? (
                  <div className="flex items-center">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-r-none border-r-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleSync('incremental')
                      }}
                      disabled={isSyncing}
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isSyncing && 'animate-spin')} />
                      Sync New
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-l-none px-2"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm('Full sync will re-index all changes. This uses OpenAI API credits. Continue?')) {
                          handleSync('full')
                        }
                      }}
                      disabled={isSyncing}
                      title="Full re-sync (re-index all changes)"
                    >
                      <Database className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleSync('full')
                    }}
                    disabled={isSyncing}
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isSyncing && 'animate-spin')} />
                    Initial Sync
                  </Button>
                )
              })()}
              <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', kbExpanded && 'rotate-90')} />
            </div>
          </div>
          {/* Sync progress bar */}
          {syncJob && syncJob.status === 'running' && syncJob.total > 0 && (
            <div className="mt-3">
              <Progress value={(syncJob.progress / syncJob.total) * 100} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                Processing {syncJob.progress.toLocaleString()} of {syncJob.total.toLocaleString()} changes...
              </p>
            </div>
          )}
        </CardHeader>
        {kbExpanded && (
          <CardContent className="pt-0">
            {!kbStatus?.indexedChanges ? (
              <div className="text-center py-6 text-muted-foreground">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No changes indexed yet. Click "Initial Sync" to start building the knowledge base.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Tab Toggle */}
                <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                  <button
                    onClick={() => { setKbTab('search'); setKbAnswer(null) }}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-md transition-colors',
                      kbTab === 'search' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Search className="h-3.5 w-3.5 inline mr-1.5" />
                    Semantic Search
                  </button>
                  <button
                    onClick={() => { setKbTab('ask'); setKbSearchResults([]) }}
                    className={cn(
                      'px-3 py-1.5 text-sm rounded-md transition-colors',
                      kbTab === 'ask' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <MessageSquare className="h-3.5 w-3.5 inline mr-1.5" />
                    Ask AI
                  </button>
                </div>

                {/* Search/Ask Input */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Sparkles className="absolute left-3 top-3 h-4 w-4 text-purple-400" />
                    <Input
                      placeholder={kbTab === 'search' ? 'Search by meaning, e.g. "vulnerability patching changes"...' : 'Ask a question, e.g. "What types of changes require outage windows?"...'}
                      value={kbQuery}
                      onChange={(e) => setKbQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          kbTab === 'search' ? handleKbSearch() : handleKbAsk()
                        }
                      }}
                      className="pl-10"
                    />
                  </div>
                  <Button
                    onClick={kbTab === 'search' ? handleKbSearch : handleKbAsk}
                    disabled={!kbQuery.trim() || kbSearching || kbAsking}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {(kbSearching || kbAsking) ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : kbTab === 'search' ? (
                      <Search className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Search Results */}
                {kbTab === 'search' && kbSearchResults.length > 0 && (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    <p className="text-xs text-muted-foreground">{kbSearchResults.length} results found</p>
                    {kbSearchResults.map((result: any, idx: number) => (
                      <div key={idx} className="rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{result.ref}</span>
                            <Badge variant="outline" className="text-xs">
                              {(result.similarity * 100).toFixed(1)}% match
                            </Badge>
                          </div>
                          <Badge variant="outline" className="text-xs capitalize">
                            {result.metadata?.status || '-'}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium line-clamp-1">{result.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.content?.substring(0, 200)}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          {result.metadata?.team && <span>Team: {result.metadata.team}</span>}
                          {result.metadata?.changeType && <span>Type: {changeTypeLabels[result.metadata.changeType] || result.metadata.changeType}</span>}
                          {result.metadata?.impact && <span>Impact: {result.metadata.impact}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Q&A Answer */}
                {kbTab === 'ask' && kbAnswer && (
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-purple-50 dark:bg-purple-950/30 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="h-4 w-4 text-purple-600" />
                        <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">AI Answer</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-auto h-7"
                          onClick={() => navigator.clipboard.writeText(kbAnswer.answer)}
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </div>
                      <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{kbAnswer.answer}</ReactMarkdown>
                      </div>
                    </div>
                    {kbAnswer.sources?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Sources</p>
                        <div className="space-y-1.5">
                          {kbAnswer.sources.map((src: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 text-xs">
                              <Badge variant="outline" className="text-xs font-mono">{src.ref}</Badge>
                              <span className="truncate text-muted-foreground">{src.title}</span>
                              <Badge variant="secondary" className="text-xs ml-auto shrink-0">
                                {(src.similarity * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or reference..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="pl-10"
              />
            </div>
            <Select
              value={statusFilter || 'all'}
              onValueChange={(v) => {
                setStatusFilter(v === 'all' ? '' : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[170px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {changeStatuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={teamFilter || 'all'}
              onValueChange={(v) => {
                setTeamFilter(v === 'all' ? '' : v)
                setPage(1)
              }}
            >
              <SelectTrigger className="w-[160px]">
                <Users className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                <SelectItem value="techops@cdmx.in">TechOps</SelectItem>
                <SelectItem value="Security">Security</SelectItem>
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground hover:text-foreground">
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                Clear ({activeFilterCount})
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Changes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Changes</CardTitle>
          <CardDescription>
            {pagination ? `${pagination.total.toLocaleString()} changes found` : 'Loading...'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead className="min-w-[300px]">Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <p className="text-muted-foreground">No changes found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {search || statusFilter || teamFilter
                            ? 'Try adjusting your filters'
                            : 'No changes in iTop for this organization'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    changes.map((change: any) => {
                      const statusInfo = getStatusInfo(change.status)
                      const StatusIcon = statusInfo.icon
                      return (
                        <TableRow key={change.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewDetail(change)}>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">
                              {change.ref}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={cn('w-2 h-2 rounded-full flex-shrink-0', statusInfo.bgColor)} />
                              <span className="font-medium truncate max-w-[400px]">{change.title}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {changeTypeLabels[change.changeType] || change.changeType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <StatusIcon className={cn('h-4 w-4', statusInfo.color)} />
                              <span className="text-sm">{statusInfo.label}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{change.impact || '-'}</TableCell>
                          <TableCell className="text-sm">{change.team || '-'}</TableCell>
                          <TableCell className="text-sm">{change.agent || '-'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {change.startDate ? formatDateTime(change.startDate) : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewDetail(change)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination && (
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      Page {pagination.page} of {pagination.totalPages} ({pagination.total.toLocaleString()} total)
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">Rows:</span>
                      <Select
                        value={String(limit)}
                        onValueChange={(v) => {
                          setLimit(Number(v))
                          setPage(1)
                        }}
                      >
                        <SelectTrigger className="w-[70px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[20, 50, 100].map((size) => (
                            <SelectItem key={size} value={String(size)}>
                              {size}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= pagination.totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Change Detail Dialog */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Change Details</DialogTitle>
          {selectedChange && (() => {
            const statusInfo = getStatusInfo(selectedChange.status)
            const StatusIcon = statusInfo.icon
            return (
              <>
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted border">{selectedChange.ref}</span>
                        <Badge variant="outline" className="capitalize text-xs">
                          {changeTypeLabels[selectedChange.changeType] || selectedChange.changeType}
                        </Badge>
                      </div>
                      <h2 className="text-lg font-semibold leading-tight">{selectedChange.title}</h2>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {kbStatus?.indexedChanges > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                          onClick={() => handleFindSimilar(selectedChange.itopId)}
                          disabled={loadingSimilar}
                        >
                          {loadingSimilar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-purple-500" />}
                          Find Similar
                        </Button>
                      )}
                      <a
                        href="https://help.cdmx.in"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 border rounded-md px-2.5 py-1.5 hover:bg-muted transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open in iTop
                      </a>
                    </div>
                  </div>
                  {/* Status badges row */}
                  <div className="flex items-center gap-3 mt-3">
                    <div className={cn('inline-flex items-center gap-1.5 text-sm font-medium px-2.5 py-1 rounded-full border', {
                      'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300': selectedChange.status === 'NEW',
                      'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300': selectedChange.status === 'PLANNED',
                      'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300': selectedChange.status === 'APPROVED',
                      'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300': selectedChange.status === 'IMPLEMENTED',
                      'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300': selectedChange.status === 'MONITORED',
                      'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300': selectedChange.status === 'CLOSED',
                      'bg-red-50 border-red-200 text-red-700 dark:bg-red-950 dark:border-red-800 dark:text-red-300': selectedChange.status === 'REJECTED',
                    })}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusInfo.label}
                    </div>
                    {selectedChange.outage !== 'no' && (
                      <Badge variant="destructive" className="text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Outage
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Body - Split View */}
                <div className="grid grid-cols-5 divide-x max-h-[calc(90vh-160px)] overflow-hidden">

                  {/* Left Panel - Core Details (2/5) */}
                  <div className="col-span-2 p-5 overflow-y-auto space-y-5">
                    {/* Classification */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Details</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950">
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Impact</p>
                            <p className="text-sm font-medium">{selectedChange.impact || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950">
                            <PauseCircle className="h-4 w-4 text-red-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Outage</p>
                            <p className="text-sm font-medium capitalize">{selectedChange.outage || 'No'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950">
                            <GitBranch className="h-4 w-4 text-purple-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Change Type</p>
                            <p className="text-sm font-medium">{changeTypeLabels[selectedChange.changeType] || selectedChange.changeType}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Assignment */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Assignment</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950">
                            <Users className="h-4 w-4 text-blue-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Team</p>
                            <p className="text-sm font-medium">{selectedChange.team || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950">
                            <User className="h-4 w-4 text-indigo-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Agent</p>
                            <p className="text-sm font-medium">{selectedChange.agent || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950">
                            <User className="h-4 w-4 text-teal-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Caller</p>
                            <p className="text-sm font-medium">{selectedChange.caller || '-'}</p>
                          </div>
                        </div>
                        {selectedChange.supervisor && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950">
                              <ShieldCheck className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Supervisor</p>
                              <p className="text-sm font-medium">{selectedChange.supervisor}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Panel - Timeline & Description (3/5) */}
                  <div className="col-span-3 p-5 overflow-y-auto space-y-5">
                    {/* Timeline */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Timeline</h4>
                      <div className="relative pl-6 space-y-0">
                        {[
                          { label: 'Created', date: selectedChange.creationDate, color: 'bg-blue-500' },
                          { label: 'Start', date: selectedChange.startDate, color: 'bg-indigo-500' },
                          { label: 'End', date: selectedChange.endDate, color: 'bg-orange-500' },
                          { label: 'Closed', date: selectedChange.closeDate, color: 'bg-gray-500' },
                          { label: 'Last Updated', date: selectedChange.lastUpdate, color: 'bg-slate-400' },
                        ].map((item, idx, arr) => (
                          <div key={item.label} className="relative pb-4 last:pb-0">
                            {idx < arr.length - 1 && (
                              <div className="absolute left-[-16px] top-[10px] bottom-0 w-px bg-border" />
                            )}
                            <div className={cn(
                              'absolute left-[-20px] top-[6px] w-[9px] h-[9px] rounded-full border-2 border-background',
                              item.date ? item.color : 'bg-muted border-muted-foreground/20'
                            )} />
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                              <span className={cn('text-xs tabular-nums', item.date ? 'text-foreground' : 'text-muted-foreground')}>
                                {item.date ? formatDateTime(item.date) : '-'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Description */}
                    {selectedChange.description && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Description</h4>
                        <div
                          className="text-sm prose prose-sm dark:prose-invert max-w-none rounded-lg border p-4 bg-muted/20 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-0 [&_p]:text-sm [&_p]:leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: selectedChange.description }}
                        />
                      </div>
                    )}

                    {/* Fallback Plan */}
                    {selectedChange.fallback && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          <FileText className="h-3.5 w-3.5 inline mr-1" />
                          Fallback Plan
                        </h4>
                        <div className="text-sm rounded-lg border p-4 bg-yellow-50/50 dark:bg-yellow-950/20">
                          {selectedChange.fallback}
                        </div>
                      </div>
                    )}

                    {/* Similar Changes */}
                    {similarChanges.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          <Sparkles className="h-3.5 w-3.5 inline mr-1 text-purple-500" />
                          Similar Changes
                        </h4>
                        <div className="space-y-2">
                          {similarChanges.map((sim: any, idx: number) => (
                            <div key={idx} className="rounded-lg border p-3 text-sm hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-mono text-xs text-muted-foreground">{sim.ref}</span>
                                <Badge variant="secondary" className="text-xs">
                                  {(sim.similarity * 100).toFixed(1)}% similar
                                </Badge>
                              </div>
                              <p className="font-medium line-clamp-2">{sim.title}</p>
                              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                {sim.metadata?.status && <span>{sim.metadata.status}</span>}
                                {sim.metadata?.team && <span>| {sim.metadata.team}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
