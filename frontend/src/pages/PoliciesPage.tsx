import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { useToast } from '@/components/ui/use-toast'
import {
  Search,
  FileText,
  Loader2,
  FolderOpen,
  RefreshCw,
  ExternalLink,
  Brain,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  Database,
  File,
  FileSpreadsheet,
  FileImage,
  HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

const formatFileSize = (bytes?: number | null) => {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDate = (date?: string | null) => {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const getFileIcon = (mimeType?: string) => {
  if (!mimeType) return File
  if (mimeType === 'application/pdf') return FileText
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet
  if (mimeType.includes('image')) return FileImage
  if (mimeType.includes('folder')) return FolderOpen
  return File
}

const getMimeLabel = (mimeType?: string) => {
  if (!mimeType) return 'File'
  if (mimeType === 'application/pdf') return 'PDF'
  if (mimeType === 'application/vnd.google-apps.folder') return 'Folder'
  if (mimeType.includes('document') || mimeType.includes('word')) return 'Document'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'Spreadsheet'
  if (mimeType.includes('presentation')) return 'Presentation'
  if (mimeType.includes('image')) return 'Image'
  return 'File'
}

export function PoliciesPage() {
  const { currentOrganizationId } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState('documents')
  const [search, setSearch] = useState('')
  const [folderFilter, setFolderFilter] = useState<string>('')

  // Drive browser state
  const [browseFolderId, setBrowseFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([])

  // RAG state
  const [ragQuery, setRagQuery] = useState('')
  const [ragMode, setRagMode] = useState<'search' | 'ask'>('ask')
  const [ragAnswer, setRagAnswer] = useState<any>(null)
  const [ragResults, setRagResults] = useState<any[]>([])

  // Fetch configured folders
  const { data: foldersData } = useQuery({
    queryKey: ['drive-folders', currentOrganizationId],
    queryFn: () => api.drive.listFolders(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  const folders = foldersData?.data || []
  const driveConfigured = foldersData?.driveConfigured ?? false

  // Fetch synced documents from DB
  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['drive-documents', currentOrganizationId, folderFilter, search],
    queryFn: () =>
      api.drive.listDocuments(currentOrganizationId!, {
        folderId: folderFilter || undefined,
        search: search || undefined,
      }),
    enabled: !!currentOrganizationId,
  })

  // Fetch folder contents from Google Drive (live browsing)
  const { data: folderContents, isLoading: browseLoading } = useQuery({
    queryKey: ['drive-folder-contents', browseFolderId],
    queryFn: () => api.drive.listFolderContents(browseFolderId!),
    enabled: !!browseFolderId && driveConfigured,
  })

  // RAG indexing status
  const { data: ragStatus } = useQuery({
    queryKey: ['rag-status', currentOrganizationId],
    queryFn: () => api.rag.status(currentOrganizationId!),
    enabled: !!currentOrganizationId,
  })

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => api.drive.sync(currentOrganizationId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['drive-documents'] })
      queryClient.invalidateQueries({ queryKey: ['drive-folders'] })
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

  // RAG index all mutation
  const indexAllMutation = useMutation({
    mutationFn: () => api.rag.indexAll(currentOrganizationId!),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rag-status'] })
      queryClient.invalidateQueries({ queryKey: ['drive-documents'] })
      toast({ title: 'Indexing completed', description: data.message })
    },
    onError: (error: any) => {
      toast({
        title: 'Indexing failed',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  // RAG search mutation
  const ragSearchMutation = useMutation({
    mutationFn: async () => {
      if (ragMode === 'ask') {
        const result = await api.rag.ask(currentOrganizationId!, ragQuery)
        setRagAnswer(result)
        setRagResults([])
      } else {
        const results = await api.rag.search(currentOrganizationId!, ragQuery)
        setRagResults(results)
        setRagAnswer(null)
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Search failed',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const handleBrowseFolder = (folderId: string, folderName: string) => {
    setBreadcrumbs(prev => [...prev, { id: folderId, name: folderName }])
    setBrowseFolderId(folderId)
  }

  const handleBreadcrumbClick = (index: number) => {
    if (index < 0) {
      setBrowseFolderId(null)
      setBreadcrumbs([])
    } else {
      const crumb = breadcrumbs[index]
      setBreadcrumbs(prev => prev.slice(0, index + 1))
      setBrowseFolderId(crumb.id)
    }
  }

  const handleRagSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ragQuery.trim()) return
    ragSearchMutation.mutate()
  }

  const browseFiles = folderContents?.data || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Policies & Procedures</h1>
          <p className="text-muted-foreground">
            Compliance documents from Google Drive with AI-powered knowledge base
          </p>
        </div>
        <div className="flex gap-2">
          {ragStatus && ragStatus.pendingDocuments > 0 && (
            <Button
              onClick={() => indexAllMutation.mutate()}
              disabled={indexAllMutation.isPending}
            >
              {indexAllMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Brain className="mr-2 h-4 w-4" />
              )}
              Index {ragStatus.pendingDocuments} Documents
            </Button>
          )}
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
            Sync Drive
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="documents" className="gap-2">
            <HardDrive className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="browse" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Browse Drive
          </TabsTrigger>
          <TabsTrigger value="knowledge" className="gap-2">
            <Brain className="h-4 w-4" />
            AI Knowledge Base
          </TabsTrigger>
        </TabsList>

        {/* ================================================ */}
        {/* TAB 1: Synced Documents (from DB)                */}
        {/* ================================================ */}
        <TabsContent value="documents" className="space-y-4">
          {/* Indexing banner */}
          {ragStatus && ragStatus.pendingDocuments > 0 && documents?.length > 0 && (
            <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <Brain className="h-5 w-5 text-purple-600 flex-shrink-0" />
              <p className="text-sm flex-1">
                <strong>{ragStatus.pendingDocuments}</strong> of {ragStatus.totalDocuments} documents are not yet indexed for AI search.
                {ragStatus.indexedDocuments > 0 && ` (${ragStatus.indexedDocuments} already indexed)`}
              </p>
              <Button
                size="sm"
                onClick={() => indexAllMutation.mutate()}
                disabled={indexAllMutation.isPending}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {indexAllMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Brain className="mr-2 h-4 w-4" />
                )}
                Index All
              </Button>
            </div>
          )}

          {/* Folder filter cards */}
          {folders.length > 0 && (
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              <Card
                className={cn(
                  'cursor-pointer transition-colors hover:bg-accent',
                  !folderFilter && 'ring-2 ring-primary'
                )}
                onClick={() => setFolderFilter('')}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <FolderOpen className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="font-medium text-sm">All Documents</p>
                    <p className="text-xs text-muted-foreground">{documents?.length || 0} files</p>
                  </div>
                </CardContent>
              </Card>
              {folders.map((folder: any) => (
                <Card
                  key={folder.id}
                  className={cn(
                    'cursor-pointer transition-colors hover:bg-accent',
                    folderFilter === folder.id && 'ring-2 ring-primary'
                  )}
                  onClick={() => setFolderFilter(folder.id === folderFilter ? '' : folder.id)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-yellow-500" />
                    <div>
                      <p className="font-medium text-sm truncate">{folder.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {folder._count?.documents || 0} files
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documents by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Documents Table */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Synced Documents</CardTitle>
              <CardDescription>
                {documents?.length || 0} documents synced from Google Drive
              </CardDescription>
            </CardHeader>
            <CardContent>
              {docsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : !documents?.length ? (
                <div className="text-center py-12">
                  <HardDrive className="mx-auto h-12 w-12 text-muted-foreground/50" />
                  <p className="mt-4 text-muted-foreground">No documents synced yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {driveConfigured
                      ? 'Configure folders in Settings, then click "Sync Drive" to fetch documents.'
                      : 'Google Drive is not configured. Add your service account key and configure folders in Settings.'}
                  </p>
                  {driveConfigured && folders.length > 0 && (
                    <Button
                      className="mt-4"
                      variant="outline"
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Sync Now
                    </Button>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-[100px]">Type</TableHead>
                      <TableHead className="w-[120px]">Folder</TableHead>
                      <TableHead className="w-[100px]">Size</TableHead>
                      <TableHead className="w-[130px]">Last Modified</TableHead>
                      <TableHead className="w-[90px]">Indexed</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc: any) => {
                      const Icon = getFileIcon(doc.mimeType)
                      return (
                        <TableRow key={doc.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <span className="font-medium truncate max-w-[300px]">{doc.name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {getMimeLabel(doc.mimeType)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground truncate">
                              {doc.folder?.name || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatFileSize(doc.size)}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatDate(doc.driveModifiedAt)}
                          </TableCell>
                          <TableCell>
                            {doc.isIndexed ? (
                              <Badge variant="default" className="bg-green-600 text-xs">
                                Yes
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                No
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {doc.webViewLink && (
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                              >
                                <a href={doc.webViewLink} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================ */}
        {/* TAB 2: Browse Drive (live folder navigation)     */}
        {/* ================================================ */}
        <TabsContent value="browse" className="space-y-4">
          {!driveConfigured ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-muted-foreground">Google Drive is not configured</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add a Google service account key to enable Drive browsing.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Breadcrumbs */}
              <div className="flex items-center gap-1 text-sm">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleBreadcrumbClick(-1)}
                  className={cn(!browseFolderId && 'font-bold')}
                >
                  Root Folders
                </Button>
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.id} className="flex items-center">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleBreadcrumbClick(index)}
                      className={cn(
                        index === breadcrumbs.length - 1 && 'font-bold'
                      )}
                    >
                      {crumb.name}
                    </Button>
                  </div>
                ))}
              </div>

              {/* Root folders or folder contents */}
              {!browseFolderId ? (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {folders.map((folder: any) => (
                    <Card
                      key={folder.id}
                      className="cursor-pointer transition-colors hover:bg-accent"
                      onClick={() => handleBrowseFolder(folder.driveId, folder.name)}
                    >
                      <CardContent className="p-6 flex flex-col items-center gap-3">
                        <FolderOpen className="h-10 w-10 text-yellow-500" />
                        <div className="text-center">
                          <p className="font-medium text-sm">{folder.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {folder.folderType?.replace(/_/g, ' ') || 'Documents'}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {folders.length === 0 && (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      No folders configured. Add folders in Settings.
                    </div>
                  )}
                </div>
              ) : browseLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-4">
                    {breadcrumbs.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mb-3"
                        onClick={() => {
                          if (breadcrumbs.length <= 1) {
                            handleBreadcrumbClick(-1)
                          } else {
                            handleBreadcrumbClick(breadcrumbs.length - 2)
                          }
                        }}
                      >
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back
                      </Button>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead className="w-[100px]">Type</TableHead>
                          <TableHead className="w-[100px]">Size</TableHead>
                          <TableHead className="w-[130px]">Modified</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {browseFiles.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                              This folder is empty
                            </TableCell>
                          </TableRow>
                        ) : (
                          browseFiles.map((file: any) => {
                            const isFolder = file.mimeType === 'application/vnd.google-apps.folder'
                            const Icon = getFileIcon(file.mimeType)
                            return (
                              <TableRow
                                key={file.id}
                                className={cn(isFolder && 'cursor-pointer')}
                                onClick={() => {
                                  if (isFolder) handleBrowseFolder(file.id, file.name)
                                }}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Icon
                                      className={cn(
                                        'h-4 w-4 flex-shrink-0',
                                        isFolder ? 'text-yellow-500' : 'text-muted-foreground'
                                      )}
                                    />
                                    <span className={cn('truncate max-w-[300px]', isFolder && 'font-medium')}>
                                      {file.name}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {getMimeLabel(file.mimeType)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {isFolder ? '-' : formatFileSize(file.size ? parseInt(file.size) : null)}
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {formatDate(file.modifiedTime)}
                                </TableCell>
                                <TableCell>
                                  {!isFolder && file.webViewLink && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => e.stopPropagation()}
                                      asChild
                                    >
                                      <a href={file.webViewLink} target="_blank" rel="noopener noreferrer">
                                        <ExternalLink className="h-4 w-4" />
                                      </a>
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>

        {/* ================================================ */}
        {/* TAB 3: AI Knowledge Base (RAG search & Q&A)      */}
        {/* ================================================ */}
        <TabsContent value="knowledge" className="space-y-4">
          {/* Indexing Status */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Documents</p>
                <p className="text-2xl font-bold">{ragStatus?.totalDocuments || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Indexed</p>
                <p className="text-2xl font-bold text-green-600">{ragStatus?.indexedDocuments || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{ragStatus?.pendingDocuments || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Chunks</p>
                <p className="text-2xl font-bold">{ragStatus?.totalChunks || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Index All button */}
          {ragStatus && ragStatus.pendingDocuments > 0 && (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <Database className="h-5 w-5 text-yellow-600" />
              <p className="text-sm flex-1">
                {ragStatus.pendingDocuments} document(s) not yet indexed for AI search.
              </p>
              <Button
                size="sm"
                onClick={() => indexAllMutation.mutate()}
                disabled={indexAllMutation.isPending}
              >
                {indexAllMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Database className="mr-2 h-4 w-4" />
                )}
                Index All
              </Button>
            </div>
          )}

          {/* Search / Ask */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Knowledge Base
              </CardTitle>
              <CardDescription>
                Search or ask questions across all indexed compliance policy documents
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  variant={ragMode === 'ask' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRagMode('ask')}
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Ask Question
                </Button>
                <Button
                  variant={ragMode === 'search' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setRagMode('search')}
                >
                  <Search className="mr-2 h-4 w-4" />
                  Semantic Search
                </Button>
              </div>

              {/* Search Input */}
              <form onSubmit={handleRagSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={
                      ragMode === 'ask'
                        ? 'Ask a question about compliance policies...'
                        : 'Search for relevant policy content...'
                    }
                    value={ragQuery}
                    onChange={(e) => setRagQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button type="submit" disabled={ragSearchMutation.isPending || !ragQuery.trim()}>
                  {ragSearchMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-2 h-4 w-4" />
                  )}
                  {ragMode === 'ask' ? 'Ask' : 'Search'}
                </Button>
              </form>

              {/* Results */}
              {ragSearchMutation.isPending && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-muted-foreground">
                    {ragMode === 'ask' ? 'Generating answer...' : 'Searching...'}
                  </span>
                </div>
              )}

              {/* Ask Answer */}
              {ragAnswer && !ragSearchMutation.isPending && (
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg border">
                    <div className="flex items-start gap-3">
                      <Brain className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{ragAnswer.answer}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                  {ragAnswer.sources?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">Sources:</p>
                      <div className="space-y-2">
                        {ragAnswer.sources.map((source: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-start gap-3 p-3 bg-background border rounded-lg"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium truncate">{source.documentName}</p>
                                <Badge variant="outline" className="text-xs flex-shrink-0">
                                  {Math.round(source.similarity * 100)}% match
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {source.snippet}
                              </p>
                            </div>
                            {source.webViewLink && (
                              <Button variant="ghost" size="icon" asChild className="flex-shrink-0">
                                <a href={source.webViewLink} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Search Results */}
              {ragResults.length > 0 && !ragSearchMutation.isPending && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{ragResults.length} results found</p>
                  {ragResults.map((result: any, i: number) => (
                    <div
                      key={result.id || i}
                      className="p-4 border rounded-lg space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm font-medium">{result.documentName}</p>
                        <Badge variant="outline" className="text-xs ml-auto">
                          {Math.round(Number(result.similarity) * 100)}% match
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{result.content}</p>
                      {result.webViewLink && (
                        <a
                          href={result.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          Open in Drive <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Empty state */}
              {!ragSearchMutation.isPending && !ragAnswer && ragResults.length === 0 && (
                <div className="text-center py-8">
                  <Brain className="mx-auto h-10 w-10 text-muted-foreground/40" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    {ragStatus?.indexedDocuments
                      ? 'Ask a question or search across your indexed compliance documents.'
                      : 'No documents indexed yet. Sync your Drive folders and index them first.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
