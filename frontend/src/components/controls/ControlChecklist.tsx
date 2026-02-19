import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, CheckCircle2, Circle, ChevronDown, ChevronUp, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ControlChecklistProps {
  controlId: string
}

export function ControlChecklist({ controlId }: ControlChecklistProps) {
  const { currentOrganizationId } = useAuthStore()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [expandedItem, setExpandedItem] = useState<string | null>(null)
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({})

  const { data: checklistItems, isLoading } = useQuery({
    queryKey: ['checklist', controlId, currentOrganizationId],
    queryFn: () => api.checklist.getForControl(controlId, currentOrganizationId!),
    enabled: !!currentOrganizationId && !!controlId,
  })

  const initializeMutation = useMutation({
    mutationFn: () => api.checklist.initialize(controlId, currentOrganizationId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', controlId] })
      toast({ title: 'Checklist initialized' })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to initialize checklist',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: { isCompleted?: boolean; notes?: string } }) =>
      api.checklist.updateItem(itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist', controlId] })
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to update item',
        description: error.response?.data?.error || 'An error occurred',
        variant: 'destructive',
      })
    },
  })

  const handleToggle = (itemId: string, currentState: boolean) => {
    updateItemMutation.mutate({ itemId, data: { isCompleted: !currentState } })
  }

  const handleSaveNotes = (itemId: string) => {
    const notes = editingNotes[itemId]
    if (notes !== undefined) {
      updateItemMutation.mutate({ itemId, data: { notes } })
      setEditingNotes((prev) => {
        const next = { ...prev }
        delete next[itemId]
        return next
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!checklistItems?.length) {
    return (
      <div className="text-center py-8">
        <ListChecks className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm text-muted-foreground mb-4">
          No checklist items yet. Initialize the implementation checklist to get started.
        </p>
        <Button
          onClick={() => initializeMutation.mutate()}
          disabled={initializeMutation.isPending}
        >
          {initializeMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Initialize Checklist
        </Button>
      </div>
    )
  }

  const completedCount = checklistItems.filter((item: any) => item.isCompleted).length
  const totalCount = checklistItems.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Implementation Progress</span>
          <span className="text-muted-foreground">
            {completedCount}/{totalCount} completed ({progressPercent}%)
          </span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Checklist Items */}
      <div className="space-y-2">
        {checklistItems.map((item: any) => {
          const isExpanded = expandedItem === item.id
          return (
            <div
              key={item.id}
              className={cn(
                'border rounded-lg transition-colors',
                item.isCompleted && 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
              )}
            >
              <div className="flex items-start gap-3 p-3">
                <button
                  onClick={() => handleToggle(item.id, item.isCompleted)}
                  className="mt-0.5 flex-shrink-0"
                  disabled={updateItemMutation.isPending}
                >
                  {item.isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground hover:text-primary" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      item.isCompleted && 'line-through text-muted-foreground'
                    )}
                  >
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </button>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 pt-0 ml-8 space-y-3">
                  {item.guidance && (
                    <div className="p-2 bg-muted/50 rounded text-xs text-muted-foreground">
                      <span className="font-medium">Guidance:</span> {item.guidance}
                    </div>
                  )}
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Notes</label>
                    <Textarea
                      value={editingNotes[item.id] ?? item.notes ?? ''}
                      onChange={(e) =>
                        setEditingNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder="Add implementation notes..."
                      rows={2}
                      className="text-xs"
                    />
                    {editingNotes[item.id] !== undefined && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSaveNotes(item.id)}
                        disabled={updateItemMutation.isPending}
                      >
                        Save Notes
                      </Button>
                    )}
                  </div>
                  {item.completedAt && (
                    <p className="text-xs text-muted-foreground">
                      Completed: {new Date(item.completedAt).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
