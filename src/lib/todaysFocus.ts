/**
 * TODAY'S FOCUS ENGINE
 * 
 * Phase 4: System-wide "Today's Focus" engine that surfaces:
 * - Replies overdue
 * - Quotes due today
 * - Follow-ups due
 * - Renewals (90/60/30/7/3/today)
 * - HOT leads untouched
 * 
 * Each item shows WHY it's listed and ONE click action
 */

import { prisma } from './prisma'
import { format, isToday, isPast, addDays, differenceInDays } from 'date-fns'

export interface FocusItem {
  id: string
  type: 'reply_overdue' | 'quote_due' | 'followup_due' | 'renewal' | 'hot_lead'
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  title: string
  reason: string
  leadId: number
  leadStage?: string
  contactName?: string
  action: {
    type: 'reply' | 'assign' | 'send_template' | 'view'
    label: string
    url: string
  }
  dueAt?: Date
  metadata?: Record<string, any>
}

/**
 * Get all focus items for today
 */
export async function getTodaysFocus(userId?: number): Promise<FocusItem[]> {
  const items: FocusItem[] = []
  const now = new Date()

  // 1. Replies overdue
  const overdueReplies = await getOverdueReplies(userId)
  items.push(...overdueReplies)

  // 2. Quotes due today
  const quotesDue = await getQuotesDueToday(userId)
  items.push(...quotesDue)

  // 3. Follow-ups due
  const followupsDue = await getFollowupsDue(userId)
  items.push(...followupsDue)

  // 4. Renewals (90/60/30/7/3/today)
  const renewals = await getRenewalsDue(userId)
  items.push(...renewals)

  // 5. HOT leads untouched
  const hotLeads = await getHotLeadsUntouched(userId)
  items.push(...hotLeads)

  // Sort by priority (URGENT > HIGH > NORMAL > LOW) then by dueAt
  items.sort((a, b) => {
    const priorityOrder = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 }
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
    if (priorityDiff !== 0) return priorityDiff

    if (a.dueAt && b.dueAt) {
      return a.dueAt.getTime() - b.dueAt.getTime()
    }
    return 0
  })

  return items
}

/**
 * Get overdue reply tasks
 */
async function getOverdueReplies(userId?: number): Promise<FocusItem[]> {
  const tasks = await prisma.task.findMany({
    where: {
      type: 'REPLY_WHATSAPP',
      status: 'OPEN',
      dueAt: {
        lte: new Date(),
      },
      ...(userId && {
        OR: [
          { assignedUserId: userId },
          { assignedUserId: null },
        ],
      }),
    },
    include: {
      lead: {
        include: {
          contact: true,
          conversations: {
            where: {
              status: 'open',
            },
            take: 1,
            orderBy: { lastInboundAt: 'desc' },
          },
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 50,
  })

  return tasks.map((task) => {
    const hoursOverdue = Math.floor((Date.now() - task.dueAt!.getTime()) / (1000 * 60 * 60))
    const priority = hoursOverdue > 24 ? 'URGENT' : hoursOverdue > 4 ? 'HIGH' : 'NORMAL'

    return {
      id: `reply_${task.id}`,
      type: 'reply_overdue' as const,
      priority,
      title: `Reply to ${task.lead.contact.fullName}`,
      reason: `Reply overdue by ${hoursOverdue}h (due ${format(task.dueAt!, 'HH:mm')})`,
      leadId: task.leadId,
      leadStage: task.lead.stage,
      contactName: task.lead.contact.fullName,
      action: {
        type: 'reply' as const,
        label: 'Reply Now',
        url: `/leads/${task.leadId}?action=reply`,
      },
      dueAt: task.dueAt!,
      metadata: {
        taskId: task.id,
        conversationId: task.conversationId,
        hoursOverdue,
      },
    }
  })
}

/**
 * Get quotes due today
 */
async function getQuotesDueToday(userId?: number): Promise<FocusItem[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = addDays(today, 1)

  const tasks = await prisma.task.findMany({
    where: {
      type: 'DOCUMENT_REQUEST', // Quote tasks use this type
      status: 'OPEN',
      title: {
        contains: 'quotation',
      },
      dueAt: {
        gte: today,
        lt: tomorrow,
      },
      ...(userId && {
        OR: [
          { assignedUserId: userId },
          { assignedUserId: null },
        ],
      }),
    },
    include: {
      lead: {
        include: {
          contact: true,
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 50,
  })

  return tasks.map((task) => ({
    id: `quote_${task.id}`,
    type: 'quote_due' as const,
    priority: isPast(task.dueAt!) ? 'HIGH' : 'NORMAL',
    title: `Send quotation to ${task.lead.contact.fullName}`,
    reason: `Quote due today (${format(task.dueAt!, 'HH:mm')})`,
    leadId: task.leadId,
    leadStage: task.lead.stage,
    contactName: task.lead.contact.fullName,
    action: {
      type: 'send_template' as const,
      label: 'Send Quote',
      url: `/leads/${task.leadId}?action=quote`,
    },
    dueAt: task.dueAt!,
    metadata: {
      taskId: task.id,
    },
  }))
}

/**
 * Get follow-ups due
 */
async function getFollowupsDue(userId?: number): Promise<FocusItem[]> {
  const now = new Date()
  const oneDayLater = addDays(now, 1)

  // Follow-ups from lead.nextFollowUpAt
  const leadsWithFollowups = await prisma.lead.findMany({
    where: {
      nextFollowUpAt: {
        gte: now,
        lte: oneDayLater,
      },
      stage: {
        notIn: ['COMPLETED_WON', 'LOST', 'ON_HOLD'],
      },
      ...(userId && {
        OR: [
          { assignedUserId: userId },
          { assignedUserId: null },
        ],
      }),
    },
    include: {
      contact: true,
    },
    take: 50,
  })

  return leadsWithFollowups.map((lead) => {
    const hoursUntil = Math.floor((lead.nextFollowUpAt!.getTime() - now.getTime()) / (1000 * 60 * 60))
    const priority = hoursUntil < 2 ? 'HIGH' : 'NORMAL'

    return {
      id: `followup_${lead.id}`,
      type: 'followup_due' as const,
      priority,
      title: `Follow up with ${lead.contact.fullName}`,
      reason: `Follow-up due in ${hoursUntil}h (${format(lead.nextFollowUpAt!, 'HH:mm')})`,
      leadId: lead.id,
      leadStage: lead.stage,
      contactName: lead.contact.fullName,
      action: {
        type: 'reply' as const,
        label: 'Follow Up',
        url: `/leads/${lead.id}?action=followup`,
      },
      dueAt: lead.nextFollowUpAt!,
      metadata: {
        hoursUntil,
      },
    }
  })
}

/**
 * Get renewals due (90/60/30/7/3/today)
 */
async function getRenewalsDue(userId?: number): Promise<FocusItem[]> {
  const now = new Date()
  const ninetyDaysLater = addDays(now, 90)

  const expiryItems = await prisma.expiryItem.findMany({
    where: {
      expiryDate: {
        gte: now,
        lte: ninetyDaysLater,
      },
      renewalStatus: {
        notIn: ['RENEWED', 'NOT_RENEWING'],
      },
      ...(userId && {
        OR: [
          { assignedUserId: userId },
          { assignedUserId: null },
        ],
      }),
    },
    include: {
      contact: true,
      lead: true,
    },
    orderBy: { expiryDate: 'asc' },
    take: 100,
  })

  return expiryItems
    .map((item) => {
      const daysUntil = differenceInDays(item.expiryDate, now)
      let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'
      let reason = ''

      if (daysUntil <= 3) {
        priority = 'URGENT'
        reason = `Renewal URGENT: ${item.type} expires in ${daysUntil} day(s)`
      } else if (daysUntil <= 7) {
        priority = 'HIGH'
        reason = `Renewal due: ${item.type} expires in ${daysUntil} days`
      } else if (daysUntil <= 30) {
        priority = 'HIGH'
        reason = `Renewal reminder: ${item.type} expires in ${daysUntil} days`
      } else if (daysUntil <= 60) {
        priority = 'NORMAL'
        reason = `Renewal upcoming: ${item.type} expires in ${daysUntil} days`
      } else {
        priority = 'LOW'
        reason = `Renewal planning: ${item.type} expires in ${daysUntil} days`
      }

      return {
        id: `renewal_${item.id}`,
        type: 'renewal' as const,
        priority,
        title: `Renewal: ${item.type} for ${item.contact.fullName}`,
        reason,
        leadId: item.leadId || item.lead?.id || 0,
        leadStage: item.lead?.stage,
        contactName: item.contact.fullName,
        action: {
          type: 'view' as const,
          label: 'View Renewal',
          url: `/leads/${item.leadId || item.lead?.id || 0}?tab=renewals`,
        },
        dueAt: item.expiryDate,
        metadata: {
          expiryItemId: item.id,
          expiryType: item.type,
          daysUntil,
        },
      }
    })
    .filter((item) => item.leadId > 0) // Only include items with valid leadId
}

/**
 * Get HOT leads untouched (high score, no recent activity)
 */
async function getHotLeadsUntouched(userId?: number): Promise<FocusItem[]> {
  const twoDaysAgo = addDays(new Date(), -2)

  const hotLeads = await prisma.lead.findMany({
    where: {
      aiScore: {
        gte: 70, // HOT threshold
      },
      stage: {
        in: ['NEW', 'CONTACTED'],
      },
      lastInboundAt: {
        lte: twoDaysAgo, // No recent inbound
      },
      ...(userId && {
        OR: [
          { assignedUserId: userId },
          { assignedUserId: null },
        ],
      }),
    },
    include: {
      contact: true,
    },
    orderBy: [
      { aiScore: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 20,
  })

  return hotLeads.map((lead) => {
    const daysSinceContact = lead.lastInboundAt
      ? differenceInDays(new Date(), lead.lastInboundAt)
      : differenceInDays(new Date(), lead.createdAt)

    return {
      id: `hot_${lead.id}`,
      type: 'hot_lead' as const,
      priority: daysSinceContact > 3 ? 'HIGH' : 'NORMAL',
      title: `HOT Lead: ${lead.contact.fullName} (Score: ${lead.aiScore})`,
      reason: `High-value lead untouched for ${daysSinceContact} day(s)`,
      leadId: lead.id,
      leadStage: lead.stage,
      contactName: lead.contact.fullName,
      action: {
        type: 'view' as const,
        label: 'View Lead',
        url: `/leads/${lead.id}`,
      },
      metadata: {
        aiScore: lead.aiScore,
        daysSinceContact,
      },
    }
  })
}

