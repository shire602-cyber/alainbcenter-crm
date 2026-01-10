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

import { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react'
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

// Custom comparison function to prevent re-renders when props haven't actually changed
function arePropsEqual(prevProps: NextBestActionPanelProps, nextProps: NextBestActionPanelProps) {
  // Compare leadId (primitive)
  if (prevProps.leadId !== nextProps.leadId) {
    console.log('[NextBestActionPanel] Props changed: leadId', { prev: prevProps.leadId, next: nextProps.leadId })
    return false
  }
  
  // Compare lead - check if it's the same object or if key fields are the same
  if (prevProps.lead?.id !== nextProps.lead?.id) {
    console.log('[NextBestActionPanel] Props changed: lead.id', { prev: prevProps.lead?.id, next: nextProps.lead?.id })
    return false
  }
  if (prevProps.lead?.stage !== nextProps.lead?.stage) {
    console.log('[NextBestActionPanel] Props changed: lead.stage', { prev: prevProps.lead?.stage, next: nextProps.lead?.stage })
    return false
  }
  if (prevProps.lead?.lastInboundAt !== nextProps.lead?.lastInboundAt) {
    console.log('[NextBestActionPanel] Props changed: lead.lastInboundAt', { prev: prevProps.lead?.lastInboundAt, next: nextProps.lead?.lastInboundAt })
    return false
  }
  if (prevProps.lead?.lastOutboundAt !== nextProps.lead?.lastOutboundAt) {
    console.log('[NextBestActionPanel] Props changed: lead.lastOutboundAt', { prev: prevProps.lead?.lastOutboundAt, next: nextProps.lead?.lastOutboundAt })
    return false
  }
  
  // Compare tasks - check if array length and task IDs are the same
  if (prevProps.tasks?.length !== nextProps.tasks?.length) {
    console.log('[NextBestActionPanel] Props changed: tasks.length', { prev: prevProps.tasks?.length, next: nextProps.tasks?.length })
    return false
  }
  const prevTaskIds = prevProps.tasks?.map(t => t.id).sort().join(',') || ''
  const nextTaskIds = nextProps.tasks?.map(t => t.id).sort().join(',') || ''
  if (prevTaskIds !== nextTaskIds) {
    console.log('[NextBestActionPanel] Props changed: tasks IDs', { prev: prevTaskIds, next: nextTaskIds })
    return false
  }
  
  // Function props are compared by reference, which is fine since we use refs
  console.log('[NextBestActionPanel] Props are equal - preventing re-render')
  return true
}

function NextBestActionPanelComponent({ 
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
  // Store onActionPending in ref to avoid infinite loop (function prop changes on every render)
  const onActionPendingRef = useRef(onActionPending)
  useEffect(() => {
    onActionPendingRef.current = onActionPending
  }, [onActionPending])

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

  // Memoize conversation data - CRITICAL: Compare dates without creating new Date objects in comparison
  const conversationData: ConversationData = useMemo(() => {
    if (!lead) return {}
    // Compare date strings directly to avoid new Date() calls that break memoization
    const needsReply = lead.lastInboundAt && 
      (!lead.lastOutboundAt || 
       (typeof lead.lastInboundAt === 'string' && typeof lead.lastOutboundAt === 'string' 
         ? lead.lastInboundAt > lead.lastOutboundAt
         : new Date(lead.lastInboundAt) > new Date(lead.lastOutboundAt)))
    return {
      lastInboundAt: lead.lastInboundAt,
      lastOutboundAt: lead.lastOutboundAt,
      unreadCount: 0, // Could be enhanced with actual unread count
      needsReplySince: needsReply ? lead.lastInboundAt : null,
    }
  }, [lead])

  // Memoize tasks data - CRITICAL: Use stable date reference and task IDs to prevent memoization from breaking
  const nowRef = useRef(new Date())
  // Create a stable key based on task IDs to prevent recalculation when array reference changes
  // CRITICAL: Calculate taskIdsKey inside useMemo to ensure hooks are called in the same order
  const taskIdsKey = useMemo(() => {
    if (!tasks || !Array.isArray(tasks)) return ''
    return tasks.map((t: any) => t.id).sort().join(',')
  }, [tasks])
  const tasksKey = useMemo(() => {
    if (!tasks || !Array.isArray(tasks)) return ''
    return tasks.map((t: any) => `${t.id}-${t.status}-${t.dueAt || ''}`).sort().join('|')
  }, [taskIdsKey])
  const tasksData: TasksData = useMemo(() => {
    const now = nowRef.current
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
  }, [tasksKey]) // Use tasksKey instead of tasks array reference

  // Store previous action in ref to compare and prevent infinite loops
  const prevActionRef = useRef<NextBestAction | null>(null)
  const renderCountRef = useRef(0)
  renderCountRef.current += 1

  // Memoize the recommended action computation to prevent unnecessary recalculations
  const computedAction = useMemo(() => {
    if (!leadData) return null
    const action = determineNextBestAction(leadData, conversationData, tasksData)
    // #region agent log
    try {
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NextBestActionPanel.tsx:useMemo',message:'computedAction memoized',data:{renderCount:renderCountRef.current,actionKey:action.key,actionTitle:action.title,hasLeadData:!!leadData,hasConversationData:!!conversationData,hasTasksData:!!tasksData},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'DA'})}).catch(()=>{});
    } catch (e) {}
    // #endregion
    return action
  }, [leadData, conversationData, tasksData])

  // Compute recommended action (deterministic, instant)
  useEffect(() => {
    // #region agent log
    const logData = {renderCount:renderCountRef.current,hasLeadData:!!leadData,hasConversationData:!!conversationData,hasTasksData:!!tasksData}
    console.log('[NextBestActionPanel] useEffect triggered', logData)
    try {
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NextBestActionPanel.tsx:useEffect',message:'useEffect triggered',data:logData,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'DB'})}).catch(()=>{});
    } catch (e) {
      console.error('[NextBestActionPanel] Debug log error:', e)
    }
    // #endregion
    
    if (!leadData) {
      setLoading(false)
      return
    }

    // Compute action inside effect to avoid dependency on computedAction object reference
    const action = determineNextBestAction(leadData, conversationData, tasksData)

    // CRITICAL FIX: Only update state if action has actually changed to prevent infinite loops
    const prevAction = prevActionRef.current
    const hasChanged = !prevAction || 
      prevAction.key !== action.key ||
      prevAction.title !== action.title ||
      prevAction.impact.urgency !== action.impact.urgency ||
      prevAction.impact.revenue !== action.impact.revenue ||
      prevAction.impact.risk !== action.impact.risk

    // #region agent log
    const comparisonData = {renderCount:renderCountRef.current,hasChanged:hasChanged,prevActionKey:prevAction?.key,actionKey:action.key}
    console.log('[NextBestActionPanel] action comparison', comparisonData)
    try {
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'NextBestActionPanel.tsx:useEffect',message:'action comparison',data:comparisonData,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'DC'})}).catch(()=>{});
    } catch (e) {
      console.error('[NextBestActionPanel] Debug log error:', e)
    }
    // #endregion

    if (hasChanged) {
      prevActionRef.current = action
      setRecommendedAction(action)
      
      // Notify parent if action is urgent (use ref to avoid dependency on function prop)
      if (onActionPendingRef.current) {
        onActionPendingRef.current(action.impact.urgency >= 80)
      }
    }
    
    setLoading(false)
  }, [leadData, conversationData, tasksData]) // Depend on the actual data, not computedAction

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

  // CRITICAL: Always render same structure to maintain hook order
  // Don't return early - render loading/empty states instead
  if (loading) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <Card className="card-premium p-6">
          <div className="space-y-3">
            <div className="h-6 w-3/4 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-full bg-slate-200 rounded animate-pulse" />
            <div className="h-11 w-full bg-slate-200 rounded animate-pulse" />
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
      <div className="stack-6 inset-hero">
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
                  <Badge className="chip bg-amber-100 text-amber-700">
                    {contextData.expirySoon.label}
                  </Badge>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Tasks Mini List (Collapsed by Default) */}
        {tasks.length > 0 && (
          <Accordion type="single" className="w-full">
            <AccordionItem value="tasks" className="border-none">
              <AccordionTrigger className="text-h2 font-semibold hover:no-underline py-3 transition-all duration-300">
                Tasks ({tasks.filter(t => t.status === 'OPEN').length})
              </AccordionTrigger>
              <AccordionContent className="pt-0 pb-0 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up transition-all duration-300">
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
                            ? "bg-red-50 border-red-200/60"
                            : isDue
                            ? "bg-amber-50 border-amber-200/60"
                            : "bg-card-muted border-slate-200/60"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-body font-medium text-slate-900">
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

        {/* Playbooks Section - PHASE B (Collapsed by Default) */}
        <PlaybooksSection leadId={leadId} lead={lead} onActionPending={onActionPending} />
      </div>
    </div>
  )
}

// Playbooks Section Component - PHASE B
function PlaybooksSection({ 
  leadId, 
  lead, 
  onActionPending 
}: { 
  leadId: number
  lead?: NextBestActionPanelProps['lead']
  onActionPending?: (isPending: boolean) => void
}) {
  const [playbooks, setPlaybooks] = useState<Array<{ key: string; label: string; description: string }>>([])
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState<string | null>(null)
  const { showToast } = useToast()
  const router = useRouter()

  useEffect(() => {
    if (lead) {
      const { getAvailablePlaybooks } = require('@/lib/leads/playbooks')
      const available = getAvailablePlaybooks(lead.serviceType?.name, lead.stage)
      
      const playbookLabels: Record<string, { label: string; description: string }> = {
        request_docs: { label: 'Request Documents', description: 'Send document request template' },
        send_pricing: { label: 'Send Pricing', description: 'Send pricing information' },
        renewal_reminder: { label: 'Renewal Reminder', description: 'Send renewal reminder' },
        quote_followup: { label: 'Quote Follow-up', description: 'Follow up on sent quote' },
      }
      
      setPlaybooks(
        available.slice(0, 2).map((key: string) => ({
          key,
          ...(playbookLabels[key] || { label: key, description: '' }),
        }))
      )
    }
  }, [lead])

  async function handleRunPlaybook(playbookKey: string) {
    if (executing) return
    
    setExecuting(playbookKey)
    if (onActionPending) onActionPending(true)
    
    try {
      const res = await fetch(`/api/leads/${leadId}/playbooks/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playbookKey,
          channel: 'whatsapp',
        }),
      })
      
      const data = await res.json()
      
      if (data.ok) {
        showToast(`Playbook "${playbookKey}" executed successfully`, 'success')
        // Refresh page to show updated state
        router.refresh()
      } else {
        throw new Error(data.error || 'Failed to execute playbook')
      }
    } catch (error: any) {
      console.error('Failed to execute playbook:', error)
      showToast(error.message || 'Failed to execute playbook', 'error')
    } finally {
      setExecuting(null)
      if (onActionPending) onActionPending(false)
    }
  }

  // CRITICAL FIX: Never return null after hooks - always render same structure
  // Return empty fragment instead to maintain component tree consistency
  if (playbooks.length === 0) {
    return <></>
  }

  return (
    <Accordion type="single" className="w-full">
      <AccordionItem value="playbooks" className="border-none">
        <AccordionTrigger className="text-h2 font-semibold hover:no-underline py-3">
          Playbooks ({playbooks.length})
        </AccordionTrigger>
        <AccordionContent className="pt-0 pb-0">
          <div className="space-y-2">
            {playbooks.map((playbook) => (
              <Button
                key={playbook.key}
                variant="outline"
                className="w-full justify-start text-left h-auto py-3 px-4"
                onClick={() => handleRunPlaybook(playbook.key)}
                disabled={executing === playbook.key}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm">{playbook.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{playbook.description}</div>
                </div>
                {executing === playbook.key && (
                  <Clock className="h-4 w-4 animate-spin ml-2" />
                )}
              </Button>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

// CRITICAL: Use custom comparison to prevent unnecessary re-renders when props haven't actually changed
export const NextBestActionPanel = memo(NextBestActionPanelComponent, arePropsEqual)
