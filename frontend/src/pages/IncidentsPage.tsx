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
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/utils'
import {
  Search,
  AlertCircle,
  Loader2,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  ExternalLink,
  Eye,
  ChevronLeft,
  ChevronRight,
  Info,
  User,
  Users,
  Phone,
  Shield,
  Zap,
  Tag,
  Brain,
  RefreshCw,
  MessageSquare,
  Sparkles,
  Send,
  Copy,
  Database,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

const incidentStatuses = [
  { value: 'REPORTED', label: 'Reported', icon: AlertCircle, color: 'text-blue-500', bgColor: 'bg-blue-500' },
  { value: 'INVESTIGATING', label: 'Investigating', icon: Activity, color: 'text-yellow-500', bgColor: 'bg-yellow-500' },
  { value: 'RESOLVED', label: 'Resolved', icon: CheckCircle2, color: 'text-green-500', bgColor: 'bg-green-500' },
  { value: 'CLOSED', label: 'Closed', icon: XCircle, color: 'text-gray-500', bgColor: 'bg-gray-500' },
]

const severityLevels = [
  { value: 'CRITICAL', label: 'Critical', color: 'destructive' },
  { value: 'HIGH', label: 'High', color: 'warning' },
  { value: 'MEDIUM', label: 'Medium', color: 'default' },
  { value: 'LOW', label: 'Low', color: 'success' },
]

const priorityLabels: Record<string, string> = {
  '1': 'Critical',
  '2': 'High',
  '3': 'Medium',
  '4': 'Low',
}

const impactLabels: Record<string, string> = {
  '1': 'High',
  '2': 'Medium',
  '3': 'Low',
}

const teamOptions = ['Security', 'TechOps', 'Tech Support', 'Administration']
const originOptions = [
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'portal', label: 'Portal' },
  { value: 'phone', label: 'Phone' },
  { value: 'mail', label: 'Email' },
  { value: 'chat', label: 'Chat' },
  { value: 'in_person', label: 'In Person' },
]

export function IncidentsPage() {
  const { currentOrganizationId } = useAuthStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [severityFilter, setSeverityFilter] = useState<string>('')
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [originFilter, setOriginFilter] = useState<string>('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [selectedIncident, setSelectedIncident] = useState<any>(null)
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
  const [similarIncidents, setSimilarIncidents] = useState<any[]>([])
  const [loadingSimilar, setLoadingSimilar] = useState(false)

  const { data: response, isLoading } = useQuery({
    queryKey: ['incidents', currentOrganizationId, search, statusFilter, severityFilter, teamFilter, originFilter, page, limit],
    queryFn: () =>
      api.incidents.list(currentOrganizationId!, {
        search: search || undefined,
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
        team: teamFilter || undefined,
        origin: originFilter || undefined,
        page,
        limit,
      }),
    enabled: !!currentOrganizationId,
  })

  const { data: stats } = useQuery({
    queryKey: ['incident-stats', currentOrganizationId],
    queryFn: () => api.incidents.stats(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  // Knowledge Base status query
  const { data: kbStatus, refetch: refetchKbStatus } = useQuery({
    queryKey: ['kb-status', currentOrganizationId],
    queryFn: () => api.incidentKnowledge.status(currentOrganizationId!),
    enabled: !!currentOrganizationId,
    refetchInterval: syncJobId ? 3000 : false,
  })

  // Poll sync job progress
  const { data: syncJob } = useQuery({
    queryKey: ['sync-job', syncJobId],
    queryFn: () => api.incidentKnowledge.syncStatus(syncJobId!),
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

  const incidents = response?.data || []
  const pagination = response?.pagination

  const activeFilterCount = [statusFilter, severityFilter, teamFilter, originFilter, search].filter(Boolean).length

  const clearAllFilters = () => {
    setSearch('')
    setStatusFilter('')
    setSeverityFilter('')
    setTeamFilter('')
    setOriginFilter('')
    setPage(1)
  }

  const [syncError, setSyncError] = useState<string | null>(null)

  const handleSync = async (mode: string = 'incremental') => {
    if (!currentOrganizationId) return
    setSyncError(null)
    try {
      const result = await api.incidentKnowledge.sync(currentOrganizationId, mode)
      setSyncJobId(result.jobId)
    } catch (err: any) {
      const errorData = err?.response?.data?.error
      const message = (typeof errorData === 'string' ? errorData : errorData?.message) || err?.message || 'Sync failed'
      setSyncError(message)
      setTimeout(() => setSyncError(null), 10000)
    }
  }

  const handleKbSearch = async () => {
    if (!kbQuery.trim() || !currentOrganizationId) return
    setKbSearching(true)
    setKbSearchResults([])
    try {
      const results = await api.incidentKnowledge.search(currentOrganizationId, kbQuery, 10)
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
      const result = await api.incidentKnowledge.ask(currentOrganizationId, kbQuery)
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
    setSimilarIncidents([])
    try {
      const results = await api.incidentKnowledge.similar(currentOrganizationId, itopId, 5)
      setSimilarIncidents(results)
    } catch (err) {
      console.error('Find similar failed:', err)
    } finally {
      setLoadingSimilar(false)
    }
  }

  const getStatusInfo = (status: string) => {
    return incidentStatuses.find((s) => s.value === status) || incidentStatuses[0]
  }

  const getSeverityInfo = (severity: string) => {
    return severityLevels.find((s) => s.value === severity) || severityLevels[2]
  }

  const handleViewDetail = (incident: any) => {
    setSelectedIncident(incident)
    setIsDetailOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incident Management</h1>
          <p className="text-muted-foreground">
            Security incidents from iTop
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
            Incidents are fetched from iTop. This is a read-only view. To manage incidents, please use{' '}
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
            <CardTitle className="text-sm font-medium">Total Incidents</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
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
            <p className="text-xs text-muted-foreground">Requiring attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Open</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats?.critical || 0}</div>
            <p className="text-xs text-muted-foreground">High priority</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats?.byStatus?.RESOLVED?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Successfully resolved</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closed</CardTitle>
            <XCircle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{stats?.byStatus?.CLOSED?.toLocaleString() || 0}</div>
            <p className="text-xs text-muted-foreground">Completed &amp; closed</p>
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
                  {kbStatus?.indexedIncidents
                    ? `${kbStatus.indexedIncidents.toLocaleString()} incidents indexed`
                    : 'Semantic search & Q&A over incident history'}
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
                  {syncJob?.total > 0
                    ? `Syncing ${syncJob.progress.toLocaleString()}/${syncJob.total.toLocaleString()}`
                    : 'Syncing...'}
                </div>
              )}
              {syncError && (
                <span className="text-xs text-red-500 max-w-[250px] truncate" title={syncError}>
                  {syncError}
                </span>
              )}
              {(() => {
                const isSyncing = !!syncJobId || kbStatus?.lastSync?.status === 'running'
                return kbStatus?.indexedIncidents ? (
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
                        if (confirm('Full sync will re-index all incidents. This may take 20-30 minutes and uses OpenAI API credits. Continue?')) {
                          handleSync('full')
                        }
                      }}
                      disabled={isSyncing}
                      title="Full re-sync (re-index all incidents)"
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
                Processing {syncJob.progress.toLocaleString()} of {syncJob.total.toLocaleString()} incidents...
              </p>
            </div>
          )}
          {/* Incomplete sync warning */}
          {!syncJobId && kbStatus?.incompleteSync && (
            <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Knowledge base incomplete: {kbStatus.incompleteSync.progress.toLocaleString()} of {kbStatus.incompleteSync.total.toLocaleString()} incidents indexed.
                {' '}Click <strong>Sync New</strong> to automatically resume indexing the remaining incidents.
              </p>
            </div>
          )}
        </CardHeader>
        {kbExpanded && (
          <CardContent className="pt-0">
            {!kbStatus?.indexedIncidents ? (
              <div className="text-center py-6 text-muted-foreground">
                <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No incidents indexed yet. Click "Initial Sync" to start building the knowledge base.</p>
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
                      placeholder={kbTab === 'search' ? 'Search by meaning, e.g. "SQL injection attacks on portal"...' : 'Ask a question, e.g. "What types of monitoring incidents are most common?"...'}
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
                          {result.metadata?.severity && <span>Severity: {result.metadata.severity}</span>}
                          {result.metadata?.origin && <span>Origin: {result.metadata.origin}</span>}
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
          <div className="space-y-3">
            {/* Row 1: Search + Status + Severity */}
            <div className="flex gap-3">
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
                <SelectTrigger className="w-[160px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Status" />
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
              <Select
                value={severityFilter || 'all'}
                onValueChange={(v) => {
                  setSeverityFilter(v === 'all' ? '' : v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Severity" />
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
            {/* Row 2: Team + Origin + Clear */}
            <div className="flex gap-3 items-center">
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
                  {teamOptions.map((team) => (
                    <SelectItem key={team} value={team}>
                      {team}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={originFilter || 'all'}
                onValueChange={(v) => {
                  setOriginFilter(v === 'all' ? '' : v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Origin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Origins</SelectItem>
                  {originOptions.map((origin) => (
                    <SelectItem key={origin.value} value={origin.value}>
                      {origin.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-muted-foreground hover:text-foreground">
                  <XCircle className="mr-1.5 h-3.5 w-3.5" />
                  Clear filters ({activeFilterCount})
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Incidents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Incidents</CardTitle>
          <CardDescription>
            {pagination ? `${pagination.total.toLocaleString()} incidents found` : 'Loading...'}
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
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Origin</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        <p className="text-muted-foreground">No incidents found</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          {search || statusFilter || severityFilter
                            ? 'Try adjusting your filters'
                            : 'No incidents in iTop for this organization'}
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    incidents.map((incident: any) => {
                      const statusInfo = getStatusInfo(incident.status)
                      const severityInfo = getSeverityInfo(incident.severity)
                      const StatusIcon = statusInfo.icon
                      return (
                        <TableRow key={incident.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewDetail(incident)}>
                          <TableCell>
                            <span className="font-mono text-xs text-muted-foreground">
                              {incident.ref}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={cn('w-2 h-2 rounded-full flex-shrink-0', statusInfo.bgColor)} />
                              <span className="font-medium truncate max-w-[400px]">{incident.title}</span>
                            </div>
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
                          <TableCell className="text-sm">{incident.team || '-'}</TableCell>
                          <TableCell className="text-sm">{incident.agent || '-'}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">
                              {incident.origin || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {incident.startDate ? formatDateTime(incident.startDate) : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewDetail(incident)
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

      {/* Incident Detail Dialog - Wide Split View */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-[1100px] max-h-[90vh] overflow-hidden p-0" aria-describedby={undefined}>
          <DialogTitle className="sr-only">Incident Details</DialogTitle>
          {selectedIncident && (() => {
            const statusInfo = getStatusInfo(selectedIncident.status)
            const severityInfo = getSeverityInfo(selectedIncident.severity)
            const StatusIcon = statusInfo.icon
            return (
              <>
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b bg-muted/30">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted border">{selectedIncident.ref}</span>
                        <Badge variant="outline" className="capitalize text-xs">{selectedIncident.origin}</Badge>
                      </div>
                      <h2 className="text-lg font-semibold leading-tight">{selectedIncident.title}</h2>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {kbStatus?.indexedIncidents > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                          onClick={() => handleFindSimilar(selectedIncident.itopId)}
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
                      'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300': selectedIncident.status === 'REPORTED',
                      'bg-yellow-50 border-yellow-200 text-yellow-700 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-300': selectedIncident.status === 'INVESTIGATING',
                      'bg-green-50 border-green-200 text-green-700 dark:bg-green-950 dark:border-green-800 dark:text-green-300': selectedIncident.status === 'RESOLVED',
                      'bg-gray-50 border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300': selectedIncident.status === 'CLOSED',
                    })}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {statusInfo.label}
                    </div>
                    <Badge variant={severityInfo.color as any} className="text-xs">
                      P{selectedIncident.priority} - {severityInfo.label}
                    </Badge>
                  </div>
                </div>

                {/* Body - Split View */}
                <div className="grid grid-cols-5 divide-x max-h-[calc(90vh-160px)] overflow-hidden">

                  {/* Left Panel - Core Details (2/5) */}
                  <div className="col-span-2 p-5 overflow-y-auto space-y-5">
                    {/* Classification */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Classification</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950">
                            <Zap className="h-4 w-4 text-red-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Priority</p>
                            <p className="text-sm font-medium">{priorityLabels[selectedIncident.priority] || selectedIncident.priority} (P{selectedIncident.priority})</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950">
                            <AlertTriangle className="h-4 w-4 text-orange-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Impact</p>
                            <p className="text-sm font-medium">{impactLabels[selectedIncident.impact] || selectedIncident.impact}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-50 dark:bg-yellow-950">
                            <Activity className="h-4 w-4 text-yellow-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Urgency</p>
                            <p className="text-sm font-medium">{priorityLabels[selectedIncident.urgency] || selectedIncident.urgency}</p>
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
                            <p className="text-sm font-medium">{selectedIncident.team || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950">
                            <User className="h-4 w-4 text-indigo-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Agent</p>
                            <p className="text-sm font-medium">{selectedIncident.agent || '-'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950">
                            <Phone className="h-4 w-4 text-purple-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Caller</p>
                            <p className="text-sm font-medium">{selectedIncident.caller || '-'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Service */}
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Service</h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950">
                            <Shield className="h-4 w-4 text-teal-500" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Service</p>
                            <p className="text-sm font-medium">{selectedIncident.service || '-'}</p>
                          </div>
                        </div>
                        {selectedIncident.serviceSubcategory && (
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800">
                              <Tag className="h-4 w-4 text-gray-500" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Subcategory</p>
                              <p className="text-sm font-medium">{selectedIncident.serviceSubcategory}</p>
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
                          { label: 'Started', date: selectedIncident.startDate, color: 'bg-blue-500' },
                          { label: 'Assigned', date: selectedIncident.assignmentDate, color: 'bg-indigo-500' },
                          { label: 'Resolved', date: selectedIncident.resolutionDate, color: 'bg-green-500' },
                          { label: 'Closed', date: selectedIncident.closeDate, color: 'bg-gray-500' },
                          { label: 'Last Updated', date: selectedIncident.lastUpdate, color: 'bg-slate-400' },
                        ].map((item, idx, arr) => (
                          <div key={item.label} className="relative pb-4 last:pb-0">
                            {/* Vertical line */}
                            {idx < arr.length - 1 && (
                              <div className="absolute left-[-16px] top-[10px] bottom-0 w-px bg-border" />
                            )}
                            {/* Dot */}
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
                    {selectedIncident.description && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Description</h4>
                        <div
                          className="text-sm prose prose-sm dark:prose-invert max-w-none rounded-lg border p-4 bg-muted/20 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-0 [&_p]:text-sm [&_p]:leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: selectedIncident.description }}
                        />
                      </div>
                    )}

                    {/* Similar Incidents */}
                    {similarIncidents.length > 0 && (
                      <div>
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                          <Sparkles className="h-3.5 w-3.5 inline mr-1 text-purple-500" />
                          Similar Incidents
                        </h4>
                        <div className="space-y-2">
                          {similarIncidents.map((sim: any, idx: number) => (
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
