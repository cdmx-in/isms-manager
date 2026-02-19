import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import {
  Upload,
  File,
  Trash2,
  Download,
  Loader2,
  FileText,
  Image,
  FileSpreadsheet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import axiosInstance from '@/lib/api'

interface EvidenceUploadProps {
  controlId: string
  entityType?: string
}

const FILE_ICONS: Record<string, React.ElementType> = {
  'application/pdf': FileText,
  'image/jpeg': Image,
  'image/png': Image,
  'image/gif': Image,
  'image/webp': Image,
  'text/csv': FileSpreadsheet,
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': FileSpreadsheet,
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function EvidenceUpload({ controlId, entityType = 'control' }: EvidenceUploadProps) {
  const { currentOrganizationId } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)

  const { data: files, isLoading } = useQuery({
    queryKey: ['evidence-files', controlId, currentOrganizationId],
    queryFn: async () => {
      const response = await axiosInstance.get('/files', {
        params: {
          organizationId: currentOrganizationId,
          entityType,
          entityId: controlId,
        },
      })
      return response.data?.data || []
    },
    enabled: !!currentOrganizationId && !!controlId,
  })

  const uploadFile = async (file: globalThis.File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('organizationId', currentOrganizationId!)
      formData.append('entityType', entityType)
      formData.append('entityId', controlId)

      await axiosInstance.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      queryClient.invalidateQueries({ queryKey: ['evidence-files', controlId] })
      toast({ title: 'File uploaded successfully' })
    } catch (error: any) {
      const errMsg = typeof error.response?.data?.error === 'string'
        ? error.response.data.error
        : error.response?.data?.error?.message || error.response?.data?.message || 'Failed to upload file'
      toast({
        title: 'Upload failed',
        description: errMsg,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => axiosInstance.delete(`/files/${fileId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence-files', controlId] })
      toast({ title: 'File deleted' })
    },
    onError: (error: any) => {
      const errMsg = typeof error.response?.data?.error === 'string'
        ? error.response.data.error
        : error.response?.data?.error?.message || error.response?.data?.message || 'Failed to delete file'
      toast({
        title: 'Delete failed',
        description: errMsg,
        variant: 'destructive',
      })
    },
  })

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const response = await axiosInstance.get(`/files/${fileId}/download`)
      const { url } = response.data?.data || {}
      if (url) {
        window.open(url, '_blank')
      }
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not generate download link',
        variant: 'destructive',
      })
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (selectedFiles) {
      Array.from(selectedFiles).forEach(uploadFile)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const droppedFiles = e.dataTransfer.files
      if (droppedFiles) {
        Array.from(droppedFiles).forEach(uploadFile)
      }
    },
    [controlId, currentOrganizationId]
  )

  const getFileIcon = (mimeType: string) => {
    const Icon = FILE_ICONS[mimeType] || File
    return Icon
  }

  return (
    <div className="space-y-4">
      {/* Upload zone */}
      <div
        className={cn(
          'rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer',
          isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50',
          uploading && 'opacity-50 pointer-events-none'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Drag and drop files here, or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              PDF, Word, Excel, Images, CSV (max 50MB)
            </p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip"
          onChange={handleFileSelect}
        />
      </div>

      {/* File list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : files && files.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">{files.length} file{files.length !== 1 ? 's' : ''} uploaded</p>
          {files.map((file: any) => {
            const FileIcon = getFileIcon(file.mimeType)
            return (
              <div
                key={file.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.originalName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} &middot; {formatDate(file.createdAt)}
                    {file.uploadedBy && ` &middot; ${file.uploadedBy.firstName} ${file.uploadedBy.lastName}`}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleDownload(file.id, file.originalName)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(file.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          No evidence files uploaded yet
        </p>
      )}
    </div>
  )
}
