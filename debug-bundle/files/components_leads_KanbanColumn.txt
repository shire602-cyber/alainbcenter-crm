/**
 * PHASE 5F: Kanban Column Component
 */

'use client'

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGE_COLORS, type PipelineStage } from '@/lib/constants'
import { KanbanCard } from './KanbanCard'
import { cn } from '@/lib/utils'

interface Lead {
  id: number
  pipelineStage: string
  contact: {
    id: number
    fullName: string
    phone: string
  }
  serviceType?: {
    name: string
  } | null
  nextFollowUpAt?: string | null
  assignedUser?: {
    id: number
    name: string
  } | null
  aiScore?: number | null
  lastContactAt?: string | null
  expiryDate?: string | null
}

interface KanbanColumnProps {
  stage: PipelineStage
  leads: Lead[]
  updating: number | null
  onStageChange: (leadId: number, newStage: PipelineStage) => Promise<void>
}

export function KanbanColumn({ stage, leads, updating, onStageChange }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
  })

  const stageColorClass = PIPELINE_STAGE_COLORS[stage] || 'bg-gray-100'
  const leadIds = leads.map((lead) => lead.id)

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-80 bg-card rounded-lg border shadow-sm transition-all',
        isOver && 'ring-2 ring-primary ring-offset-2'
      )}
    >
      <CardHeader className={cn('rounded-t-lg border-b', stageColorClass)}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              {PIPELINE_STAGE_LABELS[stage]}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              {leads.length} {leads.length === 1 ? 'lead' : 'leads'}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-3 space-y-3 min-h-[400px] max-h-[calc(100vh-300px)] overflow-y-auto">
        <SortableContext items={leadIds} strategy={verticalListSortingStrategy}>
          {leads.map((lead) => (
            <KanbanCard
              key={lead.id}
              lead={lead}
              isUpdating={updating === lead.id}
            />
          ))}
        </SortableContext>
        {leads.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No leads
          </div>
        )}
      </CardContent>
    </div>
  )
}

