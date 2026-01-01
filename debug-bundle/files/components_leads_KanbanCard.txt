/**
 * PHASE 5F: Kanban Card Component
 */

'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { format, differenceInDays, parseISO } from 'date-fns'
import { MessageSquare, Calendar, AlertCircle, Clock, TrendingUp } from 'lucide-react'
import { getAiScoreCategory } from '@/lib/constants'

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

interface KanbanCardProps {
  lead: Lead
  isDragging?: boolean
  isUpdating?: boolean
}

export function KanbanCard({ lead, isDragging = false, isUpdating = false }: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: lead.id,
    disabled: isUpdating,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging || isSortableDragging ? 0.5 : 1,
  }

  const scoreCategory = getAiScoreCategory(lead.aiScore ?? null)
  const warnings: Array<{ text: string; variant: 'destructive' | 'warning' }> = []

  // Check expiry
  if (lead.expiryDate) {
    const expiryDate = parseISO(lead.expiryDate)
    const daysUntil = differenceInDays(expiryDate, new Date())
    if (daysUntil >= 0 && daysUntil <= 90) {
      warnings.push({
        text: daysUntil === 0 ? 'Expires today' : `${daysUntil}d`,
        variant: daysUntil <= 7 ? 'destructive' : 'warning',
      })
    }
  }

  // Check follow-up
  if (lead.nextFollowUpAt) {
    const followUpDate = parseISO(lead.nextFollowUpAt)
    const daysUntil = differenceInDays(followUpDate, new Date())
    if (daysUntil <= 0) {
      warnings.push({
        text: daysUntil === 0 ? 'Due today' : 'Overdue',
        variant: 'destructive',
      })
    }
  }

  // Get last activity time
  const lastActivity = lead.lastContactAt
    ? format(parseISO(lead.lastContactAt), 'MMM d')
    : null

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'cursor-move transition-all duration-200 hover:shadow-lg group',
        isUpdating && 'opacity-50 cursor-not-allowed',
        isDragging && 'scale-95'
      )}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/leads/${lead.id}`}
            className="flex items-center gap-2 flex-1 min-w-0 group/link"
            onClick={(e) => e.stopPropagation()}
          >
            <Avatar fallback={lead.contact.fullName} size="sm" className="flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-foreground truncate group-hover/link:text-primary transition-colors">
                {lead.contact.fullName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {lead.contact.phone}
              </p>
            </div>
          </Link>
        </div>

        {/* Service Label */}
        {lead.serviceType?.name && (
          <div>
            <Badge variant="outline" className="text-xs">
              {lead.serviceType.name}
            </Badge>
          </div>
        )}

        {/* AI Score */}
        {lead.aiScore !== null && lead.aiScore !== undefined && (
          <div className="flex items-center gap-2">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <Badge
              variant={
                scoreCategory === 'hot'
                  ? 'destructive'
                  : scoreCategory === 'warm'
                  ? 'default'
                  : 'outline'
              }
              className="text-xs"
            >
              {lead.aiScore}
            </Badge>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {warnings.map((warning, idx) => (
              <Badge
                key={idx}
                variant={warning.variant}
                className="text-xs"
              >
                <AlertCircle className="h-3 w-3 mr-1" />
                {warning.text}
              </Badge>
            ))}
          </div>
        )}

        {/* Last Activity / Next Task */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {lastActivity && (
            <div className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              <span>{lastActivity}</span>
            </div>
          )}
          {lead.assignedUser && (
            <div className="flex items-center gap-1">
              <span className="truncate max-w-[80px]">{lead.assignedUser.name}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

