/**
 * NEXT BEST ACTION - DETERMINISTIC RECOMMENDATION LOGIC
 * 
 * Pure function that determines the best action for a lead based on:
 * - Conversation state (needs reply, unread count)
 * - Expiry dates (renewal urgency)
 * - Qualification status (missing fields)
 * - Task status (overdue tasks)
 * - Lead stage and service type
 * 
 * NO LLM calls - all logic is deterministic and fast.
 */

import { differenceInDays, differenceInHours, parseISO } from 'date-fns'

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
  why: string // 1 sentence explanation
  impact: {
    urgency: number // 0-100
    revenue: number // 0-100
    risk: number // 0-100
  }
  badges: string[] // e.g. ["SLA risk", "Expiry 12d"]
  primaryRoute?: string
  primaryAction?: 'open_composer' | 'create_task' | 'open_quote_modal' | 'navigate'
}

export interface LeadContext {
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
  // Qualification fields (from dataJson or knownFields)
  qualificationComplete?: boolean
  missingFields?: string[]
}

export interface ConversationContext {
  needsReplySince?: Date | string | null
  unreadCount?: number
  lastInboundAt?: Date | string | null
  lastOutboundAt?: Date | string | null
  latestMessage?: string | null
}

export interface TasksContext {
  dueCount: number
  overdueCount: number
  quoteTaskDue?: boolean
}

export interface ExpiryContext {
  nearestExpiry?: {
    type: string
    expiryDate: Date | string
    daysUntil: number
  } | null
}

/**
 * Deterministic recommendation engine
 * Priority order (highest first):
 * 1. Reply needed (SLA breach/warning)
 * 2. Renewal urgency (expiry within 90/60/30/7 days)
 * 3. Missing qualification (business setup needs docs)
 * 4. Quote task due/overdue
 * 5. No assigned owner
 * 6. Follow up (default)
 */
export function computeNextBestAction(
  lead: LeadContext,
  conversation: ConversationContext,
  tasks: TasksContext,
  expiry?: ExpiryContext
): NextBestAction {
  const now = new Date()
  
  // 1. PRIORITY: Reply needed (SLA breach/warning)
  if (conversation.needsReplySince || (conversation.unreadCount && conversation.unreadCount > 0)) {
    const lastInbound = conversation.lastInboundAt 
      ? (typeof conversation.lastInboundAt === 'string' ? parseISO(conversation.lastInboundAt) : conversation.lastInboundAt)
      : null
    
    if (lastInbound) {
      const hoursSince = differenceInHours(now, lastInbound)
      const isBreach = hoursSince > 24
      const isWarning = hoursSince > 10
      
      return {
        key: 'reply_now',
        title: 'Reply Now',
        ctaLabel: 'Reply Now',
        why: isBreach 
          ? `Customer waiting ${Math.floor(hoursSince / 24)} days — SLA breached`
          : isWarning
          ? `Customer asked ${Math.floor(hoursSince)}h ago — SLA risk`
          : `Customer message ${conversation.unreadCount > 1 ? `(${conversation.unreadCount} unread)` : ''} — needs response`,
        impact: {
          urgency: isBreach ? 100 : isWarning ? 85 : 70,
          revenue: lead.dealProbability ? lead.dealProbability : 50,
          risk: isBreach ? 90 : isWarning ? 60 : 40,
        },
        badges: isBreach 
          ? ['SLA breached']
          : isWarning
          ? ['SLA risk']
          : ['Needs reply'],
        primaryAction: 'open_composer',
      }
    }
  }

  // 2. PRIORITY: Renewal urgency (expiry within 90/60/30/7 days)
  if (expiry?.nearestExpiry) {
    const { daysUntil, type } = expiry.nearestExpiry
    const expiryDate = typeof expiry.nearestExpiry.expiryDate === 'string'
      ? parseISO(expiry.nearestExpiry.expiryDate)
      : expiry.nearestExpiry.expiryDate
    
    if (daysUntil <= 90) {
      const urgency = daysUntil <= 7 ? 100 : daysUntil <= 30 ? 90 : daysUntil <= 60 ? 80 : 60
      
      return {
        key: 'renewal_reminder',
        title: 'Renewal Due Soon',
        ctaLabel: daysUntil <= 7 ? 'Renew Now' : 'Start Renewal',
        why: `${type} expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''} — renewal opportunity`,
        impact: {
          urgency,
          revenue: lead.isRenewal ? 85 : 70,
          risk: daysUntil <= 7 ? 90 : daysUntil <= 30 ? 60 : 40,
        },
        badges: daysUntil <= 7 
          ? ['Expiry 7d']
          : daysUntil <= 30
          ? ['Expiry 30d']
          : ['Expiry 60d'],
        primaryAction: 'create_task',
      }
    }
  }

  // 3. PRIORITY: Missing qualification (business setup needs docs)
  if (lead.serviceTypeEnum?.includes('BUSINESS_SETUP') && !lead.qualificationComplete) {
    const missingFields = lead.missingFields || []
    const missingText = missingFields.length > 0 
      ? `Missing: ${missingFields.slice(0, 2).join(', ')}${missingFields.length > 2 ? '...' : ''}`
      : 'Missing key qualification fields'
    
    return {
      key: 'request_docs',
      title: 'Request Documents',
      ctaLabel: 'Request Documents',
      why: `${missingText} — qualification incomplete`,
      impact: {
        urgency: 70,
        revenue: lead.dealProbability ? lead.dealProbability : 60,
        risk: 50,
      },
      badges: ['Qualification'],
      primaryAction: 'open_composer',
    }
  }

  // 4. PRIORITY: Quote task due/overdue
  if (tasks.quoteTaskDue || (tasks.overdueCount > 0 && tasks.quoteTaskDue)) {
    return {
      key: 'send_quote',
      title: 'Send Quote',
      ctaLabel: 'Create Quote',
      why: 'Quote task due — customer waiting for pricing',
      impact: {
        urgency: 75,
        revenue: lead.dealProbability ? lead.dealProbability : 70,
        risk: 40,
      },
      badges: ['Quote due'],
      primaryAction: 'open_quote_modal',
    }
  }

  // 5. PRIORITY: No assigned owner
  if (!lead.assignedUserId) {
    return {
      key: 'assign_owner',
      title: 'Assign Owner',
      ctaLabel: 'Assign to Me',
      why: 'Lead not assigned — needs ownership',
      impact: {
        urgency: 50,
        revenue: 40,
        risk: 30,
      },
      badges: ['Unassigned'],
      primaryAction: 'create_task',
    }
  }

  // 6. DEFAULT: Follow up
  const lastOutbound = lead.lastOutboundAt
    ? (typeof lead.lastOutboundAt === 'string' ? parseISO(lead.lastOutboundAt) : lead.lastOutboundAt)
    : null
  
  const daysSinceLastOutbound = lastOutbound ? differenceInDays(now, lastOutbound) : null
  
  return {
    key: 'follow_up',
    title: 'Follow Up',
    ctaLabel: daysSinceLastOutbound && daysSinceLastOutbound > 7 ? 'Follow Up Now' : 'Continue Conversation',
    why: daysSinceLastOutbound && daysSinceLastOutbound > 7
      ? `No contact in ${daysSinceLastOutbound} days — re-engage`
      : lead.stage === 'PROPOSAL_SENT' || lead.stage === 'QUOTE_SENT'
      ? 'Quote sent — check in with customer'
      : 'Keep the momentum going',
    impact: {
      urgency: daysSinceLastOutbound && daysSinceLastOutbound > 7 ? 60 : 40,
      revenue: lead.dealProbability ? lead.dealProbability : 50,
      risk: 20,
    },
    badges: [],
    primaryAction: 'open_composer',
  }
}

/**
 * Helper to compute expiry context from lead data
 */
export function computeExpiryContext(lead: LeadContext, expiryItems?: Array<{
  type: string
  expiryDate: Date | string
}>): ExpiryContext {
  if (!expiryItems || expiryItems.length === 0) {
    // Fallback to lead.expiryDate if no expiry items
    if (lead.expiryDate) {
      const expiryDate = typeof lead.expiryDate === 'string' ? parseISO(lead.expiryDate) : lead.expiryDate
      const daysUntil = differenceInDays(expiryDate, new Date())
      if (daysUntil <= 90) {
        return {
          nearestExpiry: {
            type: 'Service',
            expiryDate,
            daysUntil,
          },
        }
      }
    }
    return {}
  }

  const now = new Date()
  const upcoming = expiryItems
    .map(item => ({
      ...item,
      expiryDate: typeof item.expiryDate === 'string' ? parseISO(item.expiryDate) : item.expiryDate,
      daysUntil: differenceInDays(item.expiryDate, now),
    }))
    .filter(item => item.daysUntil <= 90)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  if (upcoming.length === 0) return {}

  return {
    nearestExpiry: upcoming[0],
  }
}

