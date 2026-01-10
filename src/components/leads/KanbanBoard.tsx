/**
 * PHASE 5F: Kanban Board Component
 * 
 * Mobile-first Kanban board for leads pipeline management
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, TouchSensor } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { KanbanColumn } from './KanbanColumn'
import { KanbanCard } from './KanbanCard'
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, type PipelineStage } from '@/lib/constants'
import { useToast } from '@/components/ui/toast'

interface Lead {
  id: number
  pipelineStage: string
  stage?: string
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

interface KanbanBoardProps {
  leads: Lead[]
  loading?: boolean
  onStageChange: (leadId: number, newStage: PipelineStage) => Promise<void>
  filters?: {
    searchQuery?: string
    pipelineStage?: string
    source?: string
    aiScore?: string
  }
}

export function KanbanBoard({ leads, loading = false, onStageChange, filters }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [updating, setUpdating] = useState<number | null>(null)
  const { showToast } = useToast()

  // Configure sensors for drag and drop (desktop + mobile)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200, // 200ms long-press for mobile
        tolerance: 5,
      },
    })
  )

  // Filter leads before grouping
  const filteredLeads = useMemo(() => {
    let result = leads

    if (filters?.searchQuery) {
      const query = filters.searchQuery.toLowerCase()
      result = result.filter(
        (lead) =>
          lead.contact.fullName.toLowerCase().includes(query) ||
          lead.contact.phone.toLowerCase().includes(query) ||
          lead.serviceType?.name.toLowerCase().includes(query)
      )
    }

    if (filters?.source) {
      result = result.filter((lead) => (lead.contact as any).source === filters.source)
    }

    if (filters?.aiScore) {
      if (filters.aiScore === 'hot') {
        result = result.filter((lead) => (lead.aiScore || 0) >= 70)
      } else if (filters.aiScore === 'warm') {
        result = result.filter((lead) => {
          const score = lead.aiScore || 0
          return score >= 40 && score < 70
        })
      } else if (filters.aiScore === 'cold') {
        result = result.filter((lead) => (lead.aiScore || 0) < 40)
      }
    }

    return result
  }, [leads, filters])

  // Group leads by stage
  const leadsByStage = useMemo(() => {
    const grouped: Record<PipelineStage, Lead[]> = {} as any
    PIPELINE_STAGES.forEach((stage) => {
      grouped[stage] = filteredLeads.filter((lead) => lead.pipelineStage === stage)
    })
    return grouped
  }, [filteredLeads])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as number)
  }, [])

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)

      if (!over) return

      const leadId = active.id as number
      const newStage = over.id as PipelineStage

      // Find the lead
      const lead = filteredLeads.find((l) => l.id === leadId)
      if (!lead) return

      // Only update if stage changed
      if (lead.pipelineStage === newStage) return

      // Optimistic update
      setUpdating(leadId)

      try {
        await onStageChange(leadId, newStage)
        showToast('Stage updated successfully', 'success')
      } catch (error: any) {
        console.error('Failed to update stage:', error)
        showToast('Failed to update stage', 'error')
        // Reload leads on error (parent should handle this)
      } finally {
        setUpdating(null)
      }
    },
    [filteredLeads, onStageChange, showToast]
  )

  const activeLead = activeId ? filteredLeads.find((l) => l.id === activeId) : null

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage} className="flex-shrink-0 w-80 bg-card rounded-lg border p-4">
            <div className="h-8 bg-slate-200 rounded mb-4 animate-pulse" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-slate-200 rounded animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        {PIPELINE_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            leads={leadsByStage[stage]}
            updating={updating}
            onStageChange={onStageChange}
          />
        ))}
      </div>
      <DragOverlay>
        {activeLead ? (
          <div className="w-80">
            <KanbanCard lead={activeLead} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

