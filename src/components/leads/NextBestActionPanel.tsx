'use client'

/**
 * NEXT BEST ACTION PANEL - PREMIUM ACTION COCKPIT
 * 
 * UX RATIONALE:
 * - ONE primary recommended action (never 2 competing CTAs)
 * - Clear "why this matters" explanation
 * - Impact pills (urgency/revenue/risk) for quick scanning
 * - Quick context strip (last inbound/outbound, stage, service)
 * - Tasks collapsed by default (progressive disclosure)
 * - Mobile: becomes bottom sheet via Sheet component
 * 
 * Performance:
 * - Memoized action computation (useMemo)
 * - Memoized task list (useMemo)
 * - React.memo on component
 * - Skeleton within 50ms
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { Clock, MessageSquare, CheckCircle2, Plus, ChevronDown, ChevronUp } from 'lucide-react'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ActionCockpitCard } from './ActionCockpitCard'
import { computeNextBestAction, computeExpiryContext, type NextBestAction, type LeadContext, type ConversationContext, type TasksContext } from '@/lib/leads/nextBestAction'
import { useToast } from '@/components/ui/toast'
import { useRouter } from 'next/navigation'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface NextBestActionPanelProps {
  leadId: number
  lead?: {
    id: number
    stage?: string | null
    serviceTypeEnum?: string | null
    serviceType?: { name: string } | null
    expiryDate?: Date | string | null
    lastInboundAt?: Date | string | null
    lastOutboundAt?: Date | string | null
    assignedUserId?: number | null
    dealProbability?: number | null
    aiScore?: number | null
    isRenewal?: boolean
    valueEstimate?: string | null
    expiryItems?: Array<{
      type: string
      expiryDate: Date | string
    }>
    conversations?: Array<{
      messages?: Array<{
        direction: string
        body: string | null
        createdAt: string
      }>
    }>
  }
  tasks?: Array<{
    id: number
    title: string
    type: string
    dueAt?: Date | string | null
    status: string
  }>
  onActionPending?: (isPending: boolean) => void
  onComposerOpen?: () => void
}

export const NextBestActionPanel = memo(function NextBestActionPanel({
  leadId,
  lead,
  tasks = [],
  onActionPending,
  onComposerOpen,
}: NextBestActionPanelProps) {
  const [loading, setLoading] = useState(true)
  const [action, setAction] = useState<NextBestAction | null>(null)
  const { showToast } = useToast()
  const router = useRouter()

  // Memoize task context
  const tasksContext = useMemo<TasksContext>(() => {
    const now = new Date()
    const openTasks = tasks.filter(t => t.status === 'OPEN')
    const dueTasks = openTasks.filter(t => {
      if (!t.dueAt) return false
      const due = typeof t.dueAt === 'string' ? new Date(t.dueAt) : t.dueAt
      return due <= now
    })
    const quoteTaskDue = openTasks.some(t => 
      t.type === 'QUOTE' || t.title.toLowerCase().includes('quote')
    )

    return {
      dueCount: dueTasks.length,
      overdueCount: dueTasks.filter(t => {
        if (!t.dueAt) return false
        const due = typeof t.dueAt === 'string' ? new Date(t.dueAt) : t.dueAt
        return due < now
      }).length,
      quoteTaskDue,
    }
  }, [tasks])

  // Memoize conversation context
  const conversationContext = useMemo<ConversationContext>(() => {
    if (!lead) return {}
    
    const lastConversation = lead.conversations?.[0]
    const lastMessage = lastConversation?.messages?.[0]
    const unreadCount = 0 // TODO: Get from API if available
    
    return {
      needsReplySince: lead.lastInboundAt && !lead.lastOutboundAt 
        ? lead.lastInboundAt 
        : lead.lastInboundAt && lead.lastOutboundAt
        ? (() => {
            const inbound = typeof lead.lastInboundAt === 'string' ? new Date(lead.lastInboundAt) : lead.lastInboundAt
            const outbound = typeof lead.lastOutboundAt === 'string' ? new Date(lead.lastOutboundAt) : lead.lastOutboundAt
            return inbound > outbound ? lead.lastInboundAt : null
          })()
        : null,
      unreadCount,
      lastInboundAt: lead.lastInboundAt,
      lastOutboundAt: lead.lastOutboundAt,
      latestMessage: lastMessage?.body || null,
    }
  }, [lead])

  // Memoize expiry context
  const expiryContext = useMemo(() => {
    if (!lead) return {}
    return computeExpiryContext(lead as LeadContext, lead.expiryItems)
  }, [lead])

  // Memoize lead context
  const leadContext = useMemo<LeadContext>(() => {
    if (!lead) return { id: leadId }
    
    return {
      id: lead.id,
      stage: lead.stage,
      serviceTypeEnum: lead.serviceTypeEnum,
      serviceType: lead.serviceType,
      expiryDate: lead.expiryDate,
      lastInboundAt: lead.lastInboundAt,
      lastOutboundAt: lead.lastOutboundAt,
      assignedUserId: lead.assignedUserId,
      dealProbability: lead.dealProbability,
      aiScore: lead.aiScore,
      isRenewal: lead.isRenewal,
      valueEstimate: lead.valueEstimate,
      qualificationComplete: false, // TODO: Compute from dataJson if available
      missingFields: [], // TODO: Extract from dataJson if available
    }
  }, [lead, leadId])

  // Memoize computed action
  const computedAction = useMemo(() => {
    if (!lead) return null
    return computeNextBestAction(leadContext, conversationContext, tasksContext, expiryContext)
  }, [leadContext, conversationContext, tasksContext, expiryContext])

  useEffect(() => {
    if (computedAction) {
      setAction(computedAction)
      setLoading(false)
      
      // Notify parent of urgency
      if (onActionPending) {
        const isUrgent = computedAction.impact.urgency >= 70
        onActionPending(isUrgent)
      }
    } else {
      setLoading(false)
    }
  }, [computedAction, onActionPending])

  const handlePrimaryAction = useCallback(async () => {
    if (!action) return

    switch (action.primaryAction) {
      case 'open_composer':
        if (onComposerOpen) {
          onComposerOpen()
          // Scroll to composer
          setTimeout(() => {
            const composer = document.querySelector('textarea[placeholder*="message"]')
            composer?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            ;(composer as HTMLTextAreaElement)?.focus()
          }, 100)
        }
        break
      
      case 'create_task':
        try {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadId,
              title: action.title,
              type: 'FOLLOW_UP',
              dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }),
          })
          if (res.ok) {
            showToast('Task created', 'success')
            router.refresh()
          }
        } catch (error) {
          showToast('Failed to create task', 'error')
        }
        break
      
      case 'open_quote_modal':
        // TODO: Open quote modal if available
        showToast('Quote feature coming soon', 'info')
        break
      
      case 'navigate':
        if (action.primaryRoute) {
          router.push(action.primaryRoute)
        }
        break
      
      default:
        // Fallback: open composer
        if (onComposerOpen) {
          onComposerOpen()
        }
    }
  }, [action, leadId, onComposerOpen, router, showToast])

  const handleSnooze = useCallback(() => {
    showToast('Action snoozed for 30 minutes', 'info')
    // TODO: Implement snooze logic
  }, [showToast])

  const handleMarkHandled = useCallback(() => {
    showToast('Action marked as handled', 'success')
    // TODO: Implement mark handled logic
  }, [showToast])

  // Memoize tasks list (max 3, due/overdue first)
  const displayTasks = useMemo(() => {
    const openTasks = tasks.filter(t => t.status === 'OPEN')
    const now = new Date()
    
    const sorted = openTasks.sort((a, b) => {
      const aDue = a.dueAt ? (typeof a.dueAt === 'string' ? new Date(a.dueAt) : a.dueAt) : null
      const bDue = b.dueAt ? (typeof b.dueAt === 'string' ? new Date(b.dueAt) : b.dueAt) : null
      
      // Overdue first
      if (aDue && aDue < now && (!bDue || bDue >= now)) return -1
      if (bDue && bDue < now && (!aDue || aDue >= now)) return 1
      
      // Then by due date
      if (aDue && bDue) return aDue.getTime() - bDue.getTime()
      if (aDue) return -1
      if (bDue) return 1
      return 0
    })
    
    return sorted.slice(0, 3)
  }, [tasks])

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-48 rounded-[14px]" />
        <Skeleton className="h-24 rounded-[14px]" />
      </div>
    )
  }

  if (!action) {
    return (
      <Card className="card-premium p-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <p className="text-body font-medium text-slate-900 dark:text-slate-100 mb-2">
          All caught up
        </p>
        <p className="text-meta muted-text">
          No action needed right now
        </p>
      </Card>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-6">
        {/* Primary Recommended Action */}
        <ActionCockpitCard
          action={action}
          onPrimaryAction={handlePrimaryAction}
          onSnooze={handleSnooze}
          onMarkHandled={handleMarkHandled}
        />

        {/* Quick Context Strip */}
        {lead && (
          <Card className="card-muted p-4">
            <div className="space-y-2">
              {lead.lastInboundAt && (
                <div className="flex items-center gap-2 text-meta muted-text">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Last inbound: {formatDistanceToNow(new Date(lead.lastInboundAt), { addSuffix: true })}</span>
                </div>
              )}
              {lead.lastOutboundAt && (
                <div className="flex items-center gap-2 text-meta muted-text">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Last outbound: {formatDistanceToNow(new Date(lead.lastOutboundAt), { addSuffix: true })}</span>
                </div>
              )}
              {lead.stage && (
                <div className="flex items-center gap-2">
                  <Badge className="chip">{lead.stage}</Badge>
                  {lead.serviceType?.name && (
                    <Badge className="chip">{lead.serviceType.name}</Badge>
                  )}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Tasks (Collapsed by Default) */}
        {displayTasks.length > 0 && (
          <Accordion type="single" collapsible defaultValue={undefined}>
            <AccordionItem value="tasks" className="border-none">
              <AccordionTrigger className="text-body font-semibold text-slate-900 dark:text-slate-100 py-2">
                Tasks ({tasks.filter(t => t.status === 'OPEN').length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {displayTasks.map((task) => {
                    const dueDate = task.dueAt ? (typeof task.dueAt === 'string' ? new Date(task.dueAt) : task.dueAt) : null
                    const isOverdue = dueDate && dueDate < new Date()
                    
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "p-3 rounded-[10px] border",
                          isOverdue
                            ? "bg-red-50 dark:bg-red-900/20 border-red-200/60 dark:border-red-800/60"
                            : "bg-card border-slate-200/60 dark:border-slate-800/60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-body font-medium text-slate-900 dark:text-slate-100">
                              {task.title}
                            </p>
                            {dueDate && (
                              <p className="text-meta muted-text mt-1">
                                {isOverdue ? 'Overdue' : 'Due'} {format(dueDate, 'MMM d, h:mm a')}
                              </p>
                            )}
                          </div>
                          {isOverdue && (
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {tasks.filter(t => t.status === 'OPEN').length > 3 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-meta"
                      onClick={() => router.push(`/leads/${leadId}?tab=tasks`)}
                    >
                      View all {tasks.filter(t => t.status === 'OPEN').length} tasks
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </div>
  )
})
