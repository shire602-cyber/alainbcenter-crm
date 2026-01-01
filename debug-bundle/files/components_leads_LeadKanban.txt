'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  LEAD_STAGES, 
  LEAD_STAGE_LABELS, 
  LEAD_STAGE_COLORS,
  SERVICE_TYPE_LABELS,
  SOURCE_LABELS,
} from '@/lib/leadConstants'
import { getAiScoreCategory } from '@/lib/constants'
import {
  MessageSquare,
  Calendar,
  AlertCircle,
  Flame,
  Snowflake,
  Sparkles,
  MoreVertical,
  Phone,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { format, isPast, differenceInDays, isToday } from 'date-fns'
import { cn } from '@/lib/utils'

type Lead = {
  id: number
  stage: string
  serviceTypeEnum?: string | null
  contact: {
    id: number
    fullName: string
    phone: string
    email?: string | null
    source?: string | null
  }
  assignedUser?: {
    id: number
    name: string
    email: string
  } | null
  aiAgentProfile?: {
    id: number
    name: string
  } | null
  aiScore: number | null
  nextFollowUpAt: string | null
  expiryDate: string | null
  expiryItems?: Array<{
    id: number
    type: string
    expiryDate: string
  }>
  lastContact?: {
    channel: string
    direction: string
    createdAt: string
    messageSnippet?: string | null
  } | null
  createdAt: string
}

interface LeadKanbanProps {
  leads: Lead[]
  loading?: boolean
  onStageChange?: (leadId: number, newStage: string) => Promise<void>
  onLeadClick?: (leadId: number) => void
  onQuickAction?: (leadId: number, action: 'message' | 'task' | 'won' | 'lost') => void
}

export function LeadKanban({ 
  leads, 
  loading = false, 
  onStageChange,
  onLeadClick,
  onQuickAction 
}: LeadKanbanProps) {
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null)
  const [updating, setUpdating] = useState<number | null>(null)

  // Group leads by stage
  const leadsByStage = useMemo(() => {
    const grouped: Record<string, Lead[]> = {}
    LEAD_STAGES.forEach(stage => {
      grouped[stage] = []
    })
    leads.forEach(lead => {
      const stage = lead.stage || 'NEW'
      if (grouped[stage]) {
        grouped[stage].push(lead)
      } else {
        grouped['NEW'].push(lead) // Fallback
      }
    })
    return grouped
  }, [leads])

  const handleDragStart = (lead: Lead) => {
    setDraggedLead(lead)
  }

  const handleDragOver = (e: React.DragEvent, stage: string) => {
    e.preventDefault()
  }

  const handleDrop = async (e: React.DragEvent, targetStage: string) => {
    e.preventDefault()
    if (!draggedLead || draggedLead.stage === targetStage) {
      setDraggedLead(null)
      return
    }

    if (onStageChange) {
      setUpdating(draggedLead.id)
      try {
        await onStageChange(draggedLead.id, targetStage)
      } catch (error) {
        console.error('Failed to update stage:', error)
      } finally {
        setUpdating(null)
        setDraggedLead(null)
      }
    }
  }

  const getAiScoreBadge = (score: number | null) => {
    if (!score) return null
    const category = getAiScoreCategory(score)
    if (category === 'hot') {
      return <Badge variant="destructive" className="text-xs"><Flame className="w-3 h-3 mr-1" />HOT</Badge>
    } else if (category === 'warm') {
      return <Badge variant="default" className="text-xs bg-orange-500"><Sparkles className="w-3 h-3 mr-1" />WARM</Badge>
    } else {
      return <Badge variant="secondary" className="text-xs"><Snowflake className="w-3 h-3 mr-1" />COLD</Badge>
    }
  }

  const getExpiryBadge = (lead: Lead) => {
    const nearestExpiry = lead.expiryItems?.[0]
    if (!nearestExpiry) return null

    const daysUntil = differenceInDays(new Date(nearestExpiry.expiryDate), new Date())
    if (daysUntil < 0) {
      return <Badge variant="destructive" className="text-xs">OVERDUE</Badge>
    } else if (daysUntil <= 7) {
      return <Badge variant="destructive" className="text-xs">EID {daysUntil}d</Badge>
    } else if (daysUntil <= 30) {
      return <Badge variant="default" className="text-xs bg-orange-500">EID {daysUntil}d</Badge>
    } else if (daysUntil <= 90) {
      return <Badge variant="secondary" className="text-xs">EID {daysUntil}d</Badge>
    }
    return null
  }

  const getFollowUpBadge = (nextFollowUpAt: string | null) => {
    if (!nextFollowUpAt) return null
    const followUpDate = new Date(nextFollowUpAt)
    if (isPast(followUpDate) && !isToday(followUpDate)) {
      return <Badge variant="destructive" className="text-xs">OVERDUE</Badge>
    } else if (isToday(followUpDate)) {
      return <Badge variant="default" className="text-xs bg-orange-500">TODAY</Badge>
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {LEAD_STAGES.map(stage => (
          <div key={stage} className="flex-shrink-0 w-80">
            <Card className="p-4">
              <Skeleton className="h-6 w-24 mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))}
              </div>
            </Card>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px]">
      {LEAD_STAGES.map(stage => {
        const stageLeads = leadsByStage[stage] || []
        return (
          <div
            key={stage}
            className="flex-shrink-0 w-80"
            onDragOver={(e) => handleDragOver(e, stage)}
            onDrop={(e) => handleDrop(e, stage)}
          >
            <Card className="h-full flex flex-col">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">
                    {LEAD_STAGE_LABELS[stage as keyof typeof LEAD_STAGE_LABELS]}
                  </h3>
                  <Badge variant="secondary" className="text-xs">
                    {stageLeads.length}
                  </Badge>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {stageLeads.map(lead => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isDragging={draggedLead?.id === lead.id}
                    isUpdating={updating === lead.id}
                    onDragStart={() => handleDragStart(lead)}
                    onClick={() => onLeadClick?.(lead.id)}
                    onQuickAction={onQuickAction}
                    getAiScoreBadge={getAiScoreBadge}
                    getExpiryBadge={getExpiryBadge}
                    getFollowUpBadge={getFollowUpBadge}
                  />
                ))}
                {stageLeads.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    No leads
                  </div>
                )}
              </div>
            </Card>
          </div>
        )
      })}
    </div>
  )
}

interface LeadCardProps {
  lead: Lead
  isDragging: boolean
  isUpdating: boolean
  onDragStart: () => void
  onClick: () => void
  onQuickAction?: (leadId: number, action: 'message' | 'task' | 'won' | 'lost') => void
  getAiScoreBadge: (score: number | null) => React.ReactNode
  getExpiryBadge: (lead: Lead) => React.ReactNode
  getFollowUpBadge: (nextFollowUpAt: string | null) => React.ReactNode
}

function LeadCard({
  lead,
  isDragging,
  isUpdating,
  onDragStart,
  onClick,
  onQuickAction,
  getAiScoreBadge,
  getExpiryBadge,
  getFollowUpBadge,
}: LeadCardProps) {
  const [showActions, setShowActions] = useState(false)

  return (
    <Card
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className={cn(
        "p-3 cursor-pointer hover:shadow-md transition-shadow",
        isDragging && "opacity-50",
        isUpdating && "opacity-50 pointer-events-none"
      )}
    >
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm truncate">{lead.contact.fullName}</h4>
            <p className="text-xs text-muted-foreground truncate">{lead.contact.phone}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation()
              setShowActions(!showActions)
            }}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          {lead.serviceTypeEnum && (
            <Badge variant="outline" className="text-xs">
              {SERVICE_TYPE_LABELS[lead.serviceTypeEnum] || lead.serviceTypeEnum}
            </Badge>
          )}
          {lead.contact.source && (
            <Badge variant="outline" className="text-xs">
              {SOURCE_LABELS[lead.contact.source] || lead.contact.source}
            </Badge>
          )}
          {getAiScoreBadge(lead.aiScore)}
          {getExpiryBadge(lead)}
          {getFollowUpBadge(lead.nextFollowUpAt)}
        </div>

        {/* Last message preview */}
        {lead.lastContact?.messageSnippet && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {lead.lastContact.messageSnippet}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            {lead.assignedUser && (
              <Avatar className="w-6 h-6 text-xs">
                {lead.assignedUser.name.charAt(0).toUpperCase()}
              </Avatar>
            )}
            {lead.aiAgentProfile && (
              <Badge variant="outline" className="text-xs">
                {lead.aiAgentProfile.name}
              </Badge>
            )}
          </div>
          {lead.lastContact && (
            <span className="text-xs text-muted-foreground">
              {format(new Date(lead.lastContact.createdAt), 'MMM d')}
            </span>
          )}
        </div>

        {/* Quick actions (on hover) */}
        {showActions && (
          <div className="flex gap-1 pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onQuickAction?.(lead.id, 'message')
                setShowActions(false)
              }}
            >
              <MessageSquare className="w-3 h-3 mr-1" />
              Message
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onQuickAction?.(lead.id, 'task')
                setShowActions(false)
              }}
            >
              <Calendar className="w-3 h-3 mr-1" />
              Task
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onQuickAction?.(lead.id, 'won')
                setShowActions(false)
              }}
            >
              <CheckCircle2 className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={(e) => {
                e.stopPropagation()
                onQuickAction?.(lead.id, 'lost')
                setShowActions(false)
              }}
            >
              <XCircle className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  )
}

