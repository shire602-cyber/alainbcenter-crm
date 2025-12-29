/**
 * NEXT BEST ACTION - DETERMINISTIC RECOMMENDATION LOGIC
 * 
 * Pure function that determines the best action for a lead based on:
 * - Conversation state (needs reply, unread, last inbound/outbound)
 * - Lead state (expiry dates, stage, service type, qualification)
 * - Tasks (due/overdue counts)
 * 
 * NO LLM calls - all logic is deterministic and fast.
 */

import { differenceInDays, differenceInHours, formatDistanceToNow } from 'date-fns'

export type NextBestActionKey = 
  | 'reply_now'
  | 'send_quote'
  | 'request_docs'
  | 'follow_up'
  | 'schedule_call'
  | 'renewal_reminder'
  | 'assign_owner'
  | 'review_ai'

export interface NextBestAction {
  key: NextBestActionKey
  title: string
  ctaLabel: string
  why: string // 1 sentence explaining why this matters
  impact: {
    urgency: number // 0-100
    revenue: number // 0-100
    risk: number // 0-100
  }
  badges: string[] // e.g. ["SLA risk", "Expiry 12d"]
  primaryRoute?: string
  primaryAction?: 'open_composer' | 'create_task' | 'open_quote_modal' | 'navigate'
}

export interface LeadData {
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
}

export interface ConversationData {
  needsReplySince?: Date | string | null
  unreadCount?: number
  lastInboundAt?: Date | string | null
  lastOutboundAt?: Date | string | null
  latestInboundText?: string | null
}

export interface TasksData {
  dueCount: number
  overdueCount: number
  quoteTaskDue?: boolean
}

/**
 * Determine the next best action for a lead
 */
export function determineNextBestAction(
  lead: LeadData,
  conversation: ConversationData = {},
  tasks: TasksData = { dueCount: 0, overdueCount: 0 }
): NextBestAction {
  const leadId = lead.id

  // Rule 1: If conversation needs reply OR unread messages -> reply_now (highest priority)
  const needsReply = conversation.needsReplySince || (conversation.unreadCount ?? 0) > 0
  if (needsReply) {
    const lastInbound = conversation.lastInboundAt 
      ? (typeof conversation.lastInboundAt === 'string' ? new Date(conversation.lastInboundAt) : conversation.lastInboundAt)
      : null
    
    const hoursSince = lastInbound ? differenceInHours(new Date(), lastInbound) : 0
    const isSlaBreached = hoursSince > 24
    const isSlaWarning = hoursSince > 10

    return {
      key: 'reply_now',
      title: 'Recommended',
      ctaLabel: 'Reply Now',
      why: isSlaBreached 
        ? `Customer waiting ${formatDistanceToNow(lastInbound!, { addSuffix: true })} — SLA breached`
        : isSlaWarning
        ? `Customer waiting ${formatDistanceToNow(lastInbound!, { addSuffix: true })} — SLA risk`
        : `Customer asked ${formatDistanceToNow(lastInbound!, { addSuffix: true })} — needs your response`,
      impact: {
        urgency: isSlaBreached ? 100 : isSlaWarning ? 85 : 70,
        revenue: 60,
        risk: isSlaBreached ? 90 : isSlaWarning ? 60 : 40,
      },
      badges: isSlaBreached 
        ? ['SLA breached']
        : isSlaWarning
        ? ['SLA risk']
        : ['Needs reply'],
      primaryAction: 'open_composer',
    }
  }

  // Rule 2: If lead expiry within 90/60/30/7 days -> renewal_reminder
  const expiryDates = [
    lead.expiryDate,
    lead.visaExpiryDate,
    lead.permitExpiryDate,
  ].filter(Boolean) as (Date | string)[]

  for (const expiryDate of expiryDates) {
    const expiry = typeof expiryDate === 'string' ? new Date(expiryDate) : expiryDate
    const daysUntil = differenceInDays(expiry, new Date())
    
    if (daysUntil <= 90 && daysUntil > 0) {
      const urgencyLevel = daysUntil <= 7 ? 'critical' : daysUntil <= 30 ? 'high' : daysUntil <= 60 ? 'medium' : 'low'
      
      return {
        key: 'renewal_reminder',
        title: 'Recommended',
        ctaLabel: daysUntil <= 7 ? 'Renew Now' : 'Plan Renewal',
        why: `Expiry in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} — ${urgencyLevel === 'critical' ? 'urgent renewal needed' : 'renewal approaching'}`,
        impact: {
          urgency: daysUntil <= 7 ? 95 : daysUntil <= 30 ? 80 : daysUntil <= 60 ? 60 : 40,
          revenue: daysUntil <= 7 ? 90 : daysUntil <= 30 ? 70 : 50,
          risk: daysUntil <= 7 ? 100 : daysUntil <= 30 ? 80 : 60,
        },
        badges: daysUntil <= 7 
          ? [`Expiry ${daysUntil}d`]
          : daysUntil <= 30
          ? [`Expiry ${daysUntil}d`]
          : [`Expiry ${daysUntil}d`],
        primaryAction: 'create_task',
      }
    }
  }

  // Rule 3: If business setup and qualification incomplete -> request_docs or schedule_call
  const serviceKey = lead.serviceType?.key || lead.serviceType?.name?.toLowerCase() || ''
  const isBusinessSetup = serviceKey.includes('business') || serviceKey.includes('setup')
  
  if (isBusinessSetup && lead.stage && ['NEW', 'CONTACTED', 'QUALIFYING'].includes(lead.stage)) {
    const missingFields = [] // Could be enhanced with actual qualification check
    if (missingFields.length > 0) {
      return {
        key: 'request_docs',
        title: 'Recommended',
        ctaLabel: 'Request Documents',
        why: `Missing ${missingFields.length} key field${missingFields.length !== 1 ? 's' : ''} — qualification incomplete`,
        impact: {
          urgency: 60,
          revenue: 50,
          risk: 30,
        },
        badges: ['Qualification'],
        primaryAction: 'create_task',
      }
    }
  }

  // Rule 4: If quote task due/overdue -> send_quote
  if (tasks.quoteTaskDue || (lead.stage === 'PROPOSAL_SENT' || lead.stage === 'QUOTE_SENT')) {
    return {
      key: 'send_quote',
      title: 'Recommended',
      ctaLabel: 'Send Quote',
      why: tasks.quoteTaskDue 
        ? 'Quote task due — customer waiting for pricing'
        : 'Quote sent — follow up with customer',
      impact: {
        urgency: tasks.quoteTaskDue ? 75 : 50,
        revenue: 85,
        risk: 20,
      },
      badges: tasks.quoteTaskDue ? ['Task due'] : ['Follow up'],
      primaryAction: 'open_quote_modal',
    }
  }

  // Rule 5: If no assigned user -> assign_owner
  if (!lead.ownerId) {
    return {
      key: 'assign_owner',
      title: 'Recommended',
      ctaLabel: 'Assign Owner',
      why: 'Lead has no assigned owner — assign to team member',
      impact: {
        urgency: 40,
        revenue: 30,
        risk: 50,
      },
      badges: ['Unassigned'],
      primaryAction: 'navigate',
      primaryRoute: `/leads/${leadId}?action=assign`,
    }
  }

  // Rule 6: Default -> follow_up
  const lastOutbound = lead.lastOutboundAt 
    ? (typeof lead.lastOutboundAt === 'string' ? new Date(lead.lastOutboundAt) : lead.lastOutboundAt)
    : null
  
  return {
    key: 'follow_up',
    title: 'Recommended',
    ctaLabel: 'Follow Up',
    why: lastOutbound
      ? `Last contacted ${formatDistanceToNow(lastOutbound, { addSuffix: true })} — keep momentum going`
      : 'No recent activity — initiate conversation',
    impact: {
      urgency: 30,
      revenue: 40,
      risk: 20,
    },
    badges: [],
    primaryAction: 'open_composer',
  }
}

