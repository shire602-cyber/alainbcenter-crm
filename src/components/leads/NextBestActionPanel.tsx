'use client'

/**
 * NEXT BEST ACTION PANEL - COMMAND CENTER VERSION
 * Visually dominant action with urgency indicators
 * Secondary info collapsed by default
 */

import { useState, useEffect } from 'react'
import { AlertCircle, Clock, ChevronDown, ChevronUp, Target, MessageSquare } from 'lucide-react'
import { format, differenceInHours, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'

interface NextBestActionPanelProps {
  leadId: number
  lead?: {
    stage?: string | null
    dealProbability?: number | null
    lastInboundAt?: Date | string | null
    lastOutboundAt?: Date | string | null
  }
  tasks?: Array<{
    id: number
    title: string
    type: string
    dueAt?: Date | string | null
    status: string
  }>
  onActionPending?: (isPending: boolean) => void
}

export function NextBestActionPanel({ leadId, lead, tasks = [], onActionPending }: NextBestActionPanelProps) {
  const [primaryAction, setPrimaryAction] = useState<{
    type: 'reply' | 'call' | 'quote' | 'follow_up' | 'qualify'
    label: string
    reason: string
    urgency: 'low' | 'normal' | 'high' | 'urgent'
  } | null>(null)

  // Calculate SLA status
  const slaStatus = (() => {
    if (!lead?.lastInboundAt) return null
    const lastInbound = typeof lead.lastInboundAt === 'string' 
      ? new Date(lead.lastInboundAt) 
      : lead.lastInboundAt
    const hoursSince = differenceInHours(new Date(), lastInbound)
    
    if (hoursSince > 24) return { level: 'breach', hours: hoursSince, slaRisk: 'high' as const }
    if (hoursSince > 10) return { level: 'warning', hours: hoursSince, slaRisk: 'medium' as const }
    if (hoursSince > 4) return { level: 'caution', hours: hoursSince, slaRisk: 'low' as const }
    return { level: 'ok', hours: hoursSince, slaRisk: 'none' as const }
  })()

  // Determine primary action
  useEffect(() => {
    if (slaStatus && slaStatus.level === 'breach') {
      setPrimaryAction({
        type: 'reply',
        label: 'Reply Now',
        reason: 'Customer waiting for your response',
        urgency: 'urgent',
      })
    } else if (lead?.stage === 'PROPOSAL_SENT' || lead?.stage === 'QUOTE_SENT') {
      setPrimaryAction({
        type: 'follow_up',
        label: 'Follow Up',
        reason: 'Quote sent - check in with customer',
        urgency: 'high',
      })
    } else if (lead?.dealProbability && lead.dealProbability >= 70) {
      setPrimaryAction({
        type: 'qualify',
        label: 'Qualify Lead',
        reason: 'High-value opportunity - needs attention',
        urgency: 'high',
      })
    } else {
      setPrimaryAction({
        type: 'reply',
        label: 'Continue Conversation',
        reason: 'Keep the momentum going',
        urgency: 'normal',
      })
    }
  }, [slaStatus, lead])

  // Notify parent when action is pending
  useEffect(() => {
    if (onActionPending) {
      onActionPending(primaryAction !== null && (primaryAction.urgency === 'urgent' || primaryAction.urgency === 'high'))
    }
  }, [primaryAction, onActionPending])

  const openTasks = tasks.filter(t => t.status === 'OPEN')
  const urgentTasks = openTasks.filter(t => {
    if (!t.dueAt) return false
    const due = typeof t.dueAt === 'string' ? new Date(t.dueAt) : t.dueAt
    return due <= new Date()
  })

  function getActionUrl(actionType: string): string {
    switch (actionType) {
      case 'reply':
        return `/leads/${leadId}?action=reply`
      case 'call':
        return `/leads/${leadId}?action=call`
      case 'quote':
        return `/leads/${leadId}?action=quote`
      case 'follow_up':
        return `/leads/${leadId}?action=followup`
      case 'qualify':
        return `/leads/${leadId}?action=qualify`
      default:
        return `/leads/${leadId}`
    }
  }

  function handleAction() {
    if (primaryAction) {
      window.location.href = getActionUrl(primaryAction.type)
    }
  }

  const urgencyIndicators = primaryAction ? {
    timeWaiting: lead?.lastInboundAt 
      ? formatDistanceToNow(new Date(lead.lastInboundAt), { addSuffix: true })
      : undefined,
    slaRisk: slaStatus?.slaRisk || 'none' as const,
  } : undefined

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6">
        {/* Recommended Action Card */}
        {primaryAction && (
          <Card className="card-premium p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-[12px] bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-body font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Recommended Action
                </h3>
                <p className="text-body muted-text mb-4">
                  {primaryAction.reason}
                </p>
                <Button
                  onClick={handleAction}
                  className={cn(
                    "w-full h-11 rounded-[14px] font-semibold",
                    "bg-primary hover:bg-primary/90 text-primary-foreground",
                    "transition-all duration-200 hover:shadow-md active:scale-95"
                  )}
                >
                  {primaryAction.label}
                </Button>
                {urgencyIndicators && (
                  <div className="mt-4 pt-4 divider-soft">
                    <div className="flex items-center gap-4 text-meta muted-text">
                      {urgencyIndicators.timeWaiting && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{urgencyIndicators.timeWaiting}</span>
                        </div>
                      )}
                      {urgencyIndicators.slaRisk !== 'none' && (
                        <div className="flex items-center gap-1.5">
                          <div className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            urgencyIndicators.slaRisk === 'high' ? "bg-red-500" : "bg-amber-500"
                          )} />
                          <span>SLA {urgencyIndicators.slaRisk === 'high' ? 'breach' : 'warning'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Collapsed Secondary Info */}
        <Accordion type="multiple" defaultValue={[]}>
          {/* Status Indicators */}
          <AccordionItem value="status">
            <AccordionTrigger>
              Status & Metrics
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                {slaStatus && (
                  <div className={cn(
                    "p-3 rounded-lg border text-sm",
                    slaStatus.level === 'breach' && "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
                    slaStatus.level === 'warning' && "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800",
                    slaStatus.level === 'caution' && "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800",
                    slaStatus.level === 'ok' && "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className={cn("h-4 w-4", slaStatus.level === 'breach' ? 'text-red-600' : slaStatus.level === 'warning' ? 'text-orange-600' : 'text-slate-400')} />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Response Time
                        </span>
                      </div>
                      <span className={cn(
                        "text-sm font-bold",
                        slaStatus.level === 'breach' ? 'text-red-600' : slaStatus.level === 'warning' ? 'text-orange-600' : 'text-slate-600'
                      )}>
                        {slaStatus.hours}h
                      </span>
                    </div>
                  </div>
                )}

                {lead?.dealProbability !== null && lead?.dealProbability !== undefined && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-slate-400" />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          Deal Probability
                        </span>
                      </div>
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {lead.dealProbability}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Tasks */}
          {openTasks.length > 0 && (
            <AccordionItem value="tasks">
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <span>Customer waiting ({openTasks.length})</span>
                  {urgentTasks.length > 0 && (
                    <Badge variant="destructive" className="text-xs">
                      {urgentTasks.length}
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2">
                  {openTasks.slice(0, 5).map((task) => {
                    const isOverdue = task.dueAt && new Date(task.dueAt) <= new Date()
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "p-3 rounded-lg border text-sm",
                          isOverdue
                            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                            : "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {task.title}
                            </p>
                            {task.dueAt && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {format(new Date(task.dueAt), 'MMM d, h:mm a')}
                              </p>
                            )}
                          </div>
                          {isOverdue && (
                            <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {openTasks.length > 5 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs"
                      onClick={() => window.location.href = `/leads/${leadId}?tab=tasks`}
                    >
                      View all {openTasks.length} tasks
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </div>
    </div>
  )
}
