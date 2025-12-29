'use client'

/**
 * NEXT BEST ACTION PANEL - ACTION COCKPIT
 * 
 * Premium, interactive panel showing:
 * - ONE primary recommended action (deterministic, no LLM)
 * - Quick context strip (last inbound/outbound, stage, service)
 * - Tasks mini list (collapsed by default, max 3 shown)
 * 
 * UX RATIONALE:
 * - Deterministic recommendations = instant, no loading
 * - ONE primary CTA = clear decision, no confusion
 * - Collapsed tasks = less clutter, progressive disclosure
 * - Quick context = staff always know "where we are"
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { Clock, MessageSquare, CheckCircle2, ChevronDown, ChevronUp, Plus, Calendar } from 'lucide-react'
import { format, formatDistanceToNow, differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ActionCockpitCard } from './ActionCockpitCard'
import { determineNextBestAction, type NextBestAction, type LeadData, type ConversationData, type TasksData } from '@/lib/leads/nextBestAction'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/toast'
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion'

interface NextBestActionPanelProps {
  leadId: number
  lead?: {
    id: number
    stage?: string | null
    serviceType?: {
      name?: string
      key?: string
    } | null
    expiryDate?: Date | string | null
    visaExpiryDate?: Date | string | null
    permitExpiryDate?: Date | string | null
    lastInboundAt?: Date | string | null
    lastOutboundAt?: Date | string | null
    dealProbability?: number | null
    ownerId?: number | null
    aiScore?: number | null
    contact?: {
      fullName?: string | null
      phone?: string | null
    } | null
  }
  tasks?: Array<{
    id: number
    title: string
    type: string
    dueAt?: Date | string | null
    status: string
  }>
  onActionPending?: (isPending: boolean) => void
  onComposerFocus?: () => void
}

export const NextBestActionPanel = memo(function NextBestActionPanel({ 
  leadId, 
  lead, 
  tasks = [], 
  onActionPending,
  onComposerFocus 
}: NextBestActionPanelProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [recommendedAction, setRecommendedAction] = useState<NextBestAction | null>(null)
  const [loading, setLoading] = useState(true)

  // Memoize lead data transformation
  const leadData: LeadData | null = useMemo(() => {
    if (!lead) return null
    return {
      id: lead.id,
      stage: lead.stage,
      serviceType: lead.serviceType,
      expiryDate: lead.expiryDate,
      visaExpiryDate: lead.visaExpiryDate,
      permitExpiryDate: lead.permitExpiryDate,
      lastInboundAt: lead.lastInboundAt,
      lastOutboundAt: lead.lastOutboundAt,
      dealProbability: lead.dealProbability,
      ownerId: lead.ownerId,
      aiScore: lead.aiScore,
    }
  }, [lead])

  // Memoize conversation data
  const conversationData: ConversationData = useMemo(() => {
    if (!lead) return {}
    return {
      lastInboundAt: lead.lastInboundAt,
      lastOutboundAt: lead.lastOutboundAt,
      unreadCount: 0, // Could be enhanced with actual unread count
      needsReplySince: lead.lastInboundAt && (!lead.lastOutboundAt || new Date(lead.lastInboundAt) > new Date(lead.lastOutboundAt))
        ? lead.lastInboundAt
        : null,
    }
  }, [lead])

  // Memoize tasks data
  const tasksData: TasksData = useMemo(() => {
  const openTasks = tasks.filter(t => t.status === 'OPEN')
    const dueTasks = openTasks.filter(t => {
    if (!t.dueAt) return false
    const due = typeof t.dueAt === 'string' ? new Date(t.dueAt) : t.dueAt
    return due <= new Date()
  })
    const quoteTaskDue = openTasks.some(t => 
      t.type === 'QUOTE' || t.title.toLowerCase().includes('quote')
    )
    return {
      dueCount: dueTasks.length,
      overdueCount: dueTasks.filter(t => {
        if (!t.dueAt) return false
        const due = typeof t.dueAt === 'string' ? new Date(t.dueAt) : t.dueAt
        return due < new Date()
      }).length,
      quoteTaskDue,
    }
  }, [tasks])

  // Compute recommended action (deterministic, instant)
  useEffect(() => {
    if (!leadData) {
      setLoading(false)
      return
    }

    const action = determineNextBestAction(leadData, conversationData, tasksData)
    setRecommendedAction(action)
    
    // Notify parent if action is urgent
    if (onActionPending) {
      onActionPending(action.impact.urgency >= 80)
    }
    
    setLoading(false)
  }, [leadData, conversationData, tasksData, onActionPending])

  // Handle primary action execution
  const handlePrimaryAction = useCallback(async () => {
    if (!recommendedAction) return

    switch (recommendedAction.primaryAction) {
      case 'open_composer':
        if (onComposerFocus) {
          onComposerFocus()
        } else {
          // Scroll to composer and focus
          const composer = document.querySelector('textarea[placeholder*="message"]') as HTMLTextAreaElement
          if (composer) {
            composer.focus()
            composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }
        break

      case 'create_task':
        try {
          const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              leadId,
              title: recommendedAction.ctaLabel,
              type: 'FOLLOW_UP',
              dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            }),
          })
          if (res.ok) {
            showToast('Task created', 'success')
          }
        } catch (error) {
          console.error('Failed to create task:', error)
          showToast('Failed to create task', 'error')
        }
        break

      case 'open_quote_modal':
        // Navigate to quote creation or open modal
        router.push(`/leads/${leadId}?action=quote`)
        break

      case 'navigate':
        if (recommendedAction.primaryRoute) {
          router.push(recommendedAction.primaryRoute)
        }
        break
    }
  }, [recommendedAction, leadId, router, onComposerFocus, showToast])

  const handleSnooze = useCallback(() => {
    showToast('Action snoozed for 30 minutes', 'info')
  }, [showToast])

  const handleMarkHandled = useCallback(() => {
    showToast('Action marked as handled', 'success')
  }, [showToast])

  const handleAssign = useCallback(() => {
    router.push(`/leads/${leadId}?action=assign`)
  }, [leadId, router])

  // Quick context data
  const contextData = useMemo(() => {
    if (!lead) return null
    
    const lastInbound = lead.lastInboundAt 
      ? (typeof lead.lastInboundAt === 'string' ? new Date(lead.lastInboundAt) : lead.lastInboundAt)
      : null
    const lastOutbound = lead.lastOutboundAt
      ? (typeof lead.lastOutboundAt === 'string' ? new Date(lead.lastOutboundAt) : lead.lastOutboundAt)
      : null
    
    const expiryDates = [
      lead.expiryDate,
      lead.visaExpiryDate,
      lead.permitExpiryDate,
    ].filter(Boolean) as (Date | string)[]
    
    let expirySoon: { days: number; label: string } | null = null
    for (const expiryDate of expiryDates) {
      const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate
      const daysUntil = differenceInDays(expiry, new Date())
      if (daysUntil <= 90 && daysUntil > 0) {
        expirySoon = { days: daysUntil, label: `Expires in ${daysUntil}d` }
        break
      }
    }

    return {
      lastInbound: lastInbound ? formatDistanceToNow(lastInbound, { addSuffix: true }) : null,
      lastOutbound: lastOutbound ? formatDistanceToNow(lastOutbound, { addSuffix: true }) : null,
      stage: lead.stage,
      serviceType: lead.serviceType?.name || lead.serviceType?.key || 'Not specified',
      expirySoon,
    }
  }, [lead])

  // Filter and sort tasks
  const displayTasks = useMemo(() => {
    const openTasks = tasks.filter(t => t.status === 'OPEN')
    const sorted = openTasks.sort((a, b) => {
      const aDue = a.dueAt ? (typeof a.dueAt === 'string' ? new Date(a.dueAt) : a.dueAt) : null
      const bDue = b.dueAt ? (typeof b.dueAt === 'string' ? new Date(b.dueAt) : b.dueAt) : null
      
      if (!aDue && !bDue) return 0
      if (!aDue) return 1
      if (!bDue) return -1
      
      return aDue.getTime() - bDue.getTime()
    })
    return sorted.slice(0, 3)
  }, [tasks])

  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <Card className="card-premium p-6">
          <div className="space-y-3">
            <div className="h-6 w-3/4 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
            <div className="h-11 w-full bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />
          </div>
        </Card>
      </div>
    )
  }

  if (!recommendedAction || !lead) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <Card className="card-premium p-6 text-center">
          <p className="text-body muted-text">No action needed right now</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-4 p-6">
        {/* Primary Recommended Action */}
        <ActionCockpitCard
          action={recommendedAction}
          onPrimaryAction={handlePrimaryAction}
          onSnooze={handleSnooze}
          onMarkHandled={handleMarkHandled}
          onAssign={handleAssign}
        />

        {/* Quick Context Strip */}
        {contextData && (
          <Card className="card-muted p-4">
            <div className="space-y-2">
              {contextData.lastInbound && (
                <div className="flex items-center gap-2 text-meta muted-text">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Last inbound: {contextData.lastInbound}</span>
                      </div>
              )}
              {contextData.lastOutbound && (
                <div className="flex items-center gap-2 text-meta muted-text">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Last outbound: {contextData.lastOutbound}</span>
                    </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {contextData.stage && (
                  <Badge className="chip">{contextData.stage}</Badge>
                )}
                <Badge className="chip">{contextData.serviceType}</Badge>
                {contextData.expirySoon && (
                  <Badge className="chip bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    {contextData.expirySoon.label}
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Tasks Mini List (Collapsed by Default) */}
        {tasks.length > 0 && (
          <Accordion type="single" defaultValue={[]}>
            <AccordionItem value="tasks">
              <AccordionTrigger className="text-body font-semibold">
                Tasks ({tasks.filter(t => t.status === 'OPEN').length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {displayTasks.map((task) => {
                    const isOverdue = task.dueAt && new Date(task.dueAt) < new Date()
                    const isDue = task.dueAt && new Date(task.dueAt) <= new Date()
                    
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "p-3 rounded-[10px] border",
                          isOverdue
                            ? "bg-red-50 dark:bg-red-900/10 border-red-200/60 dark:border-red-800/60"
                            : isDue
                            ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-800/60"
                            : "bg-card-muted border-slate-200/60 dark:border-slate-800/60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-body font-medium text-slate-900 dark:text-slate-100">
                              {task.title}
                            </p>
                            {task.dueAt && (
                              <p className="text-meta muted-text mt-1">
                                {format(new Date(task.dueAt), 'MMM d, h:mm a')}
                              </p>
                            )}
                          </div>
                          {isOverdue && (
                            <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 mt-1" />
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
