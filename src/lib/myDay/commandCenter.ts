/**
 * MY DAY COMMAND CENTER
 * 
 * Redesigned "My Day" system with 3 prioritized sections:
 * 1. ACTION REQUIRED (max 3 items) - Urgent, blocking tasks
 * 2. QUICK WINS (time-estimated, non-blocking) - Fast actions
 * 3. WAITING ON CUSTOMER (read-only) - Customer-dependent items
 * 
 * Rules:
 * - Only ONE task per lead per category
 * - Tasks must include clear CTA (Reply, Call, Send Quote)
 * - Tasks sorted by urgency + revenue potential
 */

import { prisma } from '../prisma'
import { format, differenceInHours, differenceInDays, isToday, isPast } from 'date-fns'

export interface CommandCenterItem {
  id: string
  leadId: number
  contactName: string
  serviceType?: string
  title: string
  reason: string
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  category: 'ACTION_REQUIRED' | 'QUICK_WIN' | 'WAITING_ON_CUSTOMER'
  action: {
    type: 'reply' | 'call' | 'send_quote' | 'view' | 'follow_up'
    label: string
    url: string
    estimatedMinutes?: number
  }
  dueAt?: Date
  revenuePotential?: number // Expected revenue in AED
  metadata?: Record<string, any>
}

export interface CommandCenter {
  actionRequired: CommandCenterItem[] // Max 3
  quickWins: CommandCenterItem[]
  waitingOnCustomer: CommandCenterItem[]
  summary: {
    totalItems: number
    urgentCount: number
    estimatedTimeMinutes: number
  }
}

/**
 * Get Command Center data for user
 */
export async function getCommandCenter(userId?: number): Promise<CommandCenter> {
  const now = new Date()
  const today = new Date(now)
  today.setUTCHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  // Get all tasks for user (deduplicated by leadId + type + date)
  const tasks = await getDeduplicatedTasks(userId, today)
  
  // Get leads with SLA breaches
  const slaBreaches = await getSLABreaches(userId, now)
  
  // Get quotes ready to send
  const quotesReady = await getQuotesReady(userId, today)
  
  // Get customer waiting items
  const waitingItems = await getWaitingOnCustomer(userId, now)

  // Categorize items
  const actionRequired: CommandCenterItem[] = []
  const quickWins: CommandCenterItem[] = []
  const waitingOnCustomer: CommandCenterItem[] = []

  // ACTION REQUIRED: SLA breaches, overdue replies, urgent tasks
  for (const item of [...slaBreaches, ...tasks.filter(t => isUrgent(t))]) {
    if (actionRequired.length < 3) {
      actionRequired.push(item)
    }
  }

  // QUICK WINS: Non-urgent tasks, quotes ready, follow-ups
  for (const item of [...quotesReady, ...tasks.filter(t => !isUrgent(t))]) {
    quickWins.push(item)
  }

  // WAITING ON CUSTOMER: Items waiting for customer response
  waitingOnCustomer.push(...waitingItems)

  // Sort by priority and revenue potential
  actionRequired.sort(sortByPriorityAndRevenue)
  quickWins.sort(sortByPriorityAndRevenue)
  waitingOnCustomer.sort(sortByPriorityAndRevenue)

  // Calculate summary
  const allItems = [...actionRequired, ...quickWins, ...waitingOnCustomer]
  const estimatedTimeMinutes = allItems.reduce((sum, item) => {
    return sum + (item.action.estimatedMinutes || 5)
  }, 0)

  return {
    actionRequired: actionRequired.slice(0, 3), // Enforce max 3
    quickWins,
    waitingOnCustomer,
    summary: {
      totalItems: allItems.length,
      urgentCount: allItems.filter(i => i.priority === 'URGENT' || i.priority === 'HIGH').length,
      estimatedTimeMinutes,
    },
  }
}

/**
 * Get deduplicated tasks (only one per lead per type per day)
 */
async function getDeduplicatedTasks(userId: number | undefined, today: Date): Promise<CommandCenterItem[]> {
  const tasks = await prisma.task.findMany({
    where: {
      status: 'OPEN',
      dueAt: {
        lte: new Date(today.getTime() + 24 * 60 * 60 * 1000), // Today or overdue
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
          serviceType: true,
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 100,
  })

  // Deduplicate: Only keep one task per lead per type per day
  const seen = new Map<string, CommandCenterItem>()
  
  for (const task of tasks) {
    const dateKey = task.dueAt ? format(task.dueAt, 'yyyy-MM-dd') : format(today, 'yyyy-MM-dd')
    const key = `${task.leadId}_${task.type}_${dateKey}`
    
    if (!seen.has(key)) {
      const item = taskToCommandCenterItem(task)
      seen.set(key, item)
    }
  }

  return Array.from(seen.values())
}

/**
 * Get SLA breaches (conversations needing immediate reply)
 */
async function getSLABreaches(userId: number | undefined, now: Date): Promise<CommandCenterItem[]> {
  const allConversations = await prisma.conversation.findMany({
    where: {
      status: 'open',
      lastInboundAt: {
        not: null,
        lte: new Date(now.getTime() - 10 * 60 * 1000), // 10 minutes ago
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
      lead: {
        include: {
          serviceType: true,
        },
      },
    },
    orderBy: { lastInboundAt: 'asc' },
  })

  // Filter: lastOutboundAt is null OR lastOutboundAt < lastInboundAt
  // (Prisma doesn't support field-to-field comparison in filters)
  const conversations = allConversations.filter(conv => 
    !conv.lastOutboundAt || 
    (conv.lastInboundAt && conv.lastOutboundAt < conv.lastInboundAt)
  ).slice(0, 10)

  return conversations.map((conv) => {
    const hoursSinceInbound = conv.lastInboundAt
      ? differenceInHours(now, conv.lastInboundAt)
      : 0
    const priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW' = hoursSinceInbound > 24 ? 'URGENT' : hoursSinceInbound > 4 ? 'HIGH' : 'NORMAL'

    return {
      id: `sla_${conv.id}`,
      leadId: conv.leadId || 0,
      contactName: conv.contact.fullName,
      serviceType: conv.lead?.serviceType?.name,
      title: `Reply to ${conv.contact.fullName}`,
      reason: `SLA breach: ${hoursSinceInbound}h since last message`,
      priority,
      category: 'ACTION_REQUIRED' as const,
      action: {
        type: 'reply' as const,
        label: 'Reply Now',
        url: `/leads/${conv.leadId || 0}?action=reply`,
        estimatedMinutes: 5,
      },
      dueAt: conv.lastInboundAt || undefined,
      revenuePotential: conv.lead?.expectedRevenueAED || undefined,
    }
  }).filter(item => item.leadId > 0)
}

/**
 * Get quotes ready to send
 */
async function getQuotesReady(userId: number | undefined, today: Date): Promise<CommandCenterItem[]> {
  const tasks = await prisma.task.findMany({
    where: {
      type: 'DOCUMENT_REQUEST',
      status: 'OPEN',
      title: {
        contains: 'quotation',
      },
      dueAt: {
        gte: today,
        lt: new Date(today.getTime() + 24 * 60 * 60 * 1000),
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
          serviceType: true,
        },
      },
    },
    orderBy: { dueAt: 'asc' },
    take: 20,
  })

  return tasks.map((task) => {
    const isOverdue = task.dueAt && isPast(task.dueAt)
    return {
      id: `quote_${task.id}`,
      leadId: task.leadId,
      contactName: task.lead.contact.fullName,
      serviceType: task.lead.serviceType?.name,
      title: `Send quotation to ${task.lead.contact.fullName}`,
      reason: isOverdue ? 'Quote overdue' : `Quote due ${format(task.dueAt!, 'HH:mm')}`,
      priority: isOverdue ? 'HIGH' : 'NORMAL',
      category: 'QUICK_WIN' as const,
      action: {
        type: 'send_quote' as const,
        label: 'Send Quote',
        url: `/leads/${task.leadId}?action=quote`,
        estimatedMinutes: 10,
      },
      dueAt: task.dueAt || undefined,
      revenuePotential: task.lead.expectedRevenueAED || undefined,
    }
  })
}

/**
 * Get items waiting on customer response
 */
async function getWaitingOnCustomer(userId: number | undefined, now: Date): Promise<CommandCenterItem[]> {
  const allLeads = await prisma.lead.findMany({
    where: {
      stage: {
        in: ['QUOTE_SENT', 'NEGOTIATION'],
      },
      lastOutboundAt: {
        not: null,
        lte: new Date(now.getTime() - 24 * 60 * 60 * 1000), // Outbound sent > 24h ago
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
      serviceType: true,
    },
    orderBy: { lastOutboundAt: 'desc' },
    take: 20,
  })

  // Filter: lastInboundAt is null OR lastInboundAt < lastOutboundAt
  // (Prisma doesn't support field-to-field comparison in filters)
  const leads = allLeads.filter(lead => 
    !lead.lastInboundAt || 
    (lead.lastOutboundAt && lead.lastInboundAt < lead.lastOutboundAt)
  )

  return leads.map((lead) => {
    const daysSinceOutbound = lead.lastOutboundAt
      ? differenceInDays(now, lead.lastOutboundAt)
      : 0

    return {
      id: `waiting_${lead.id}`,
      leadId: lead.id,
      contactName: lead.contact.fullName,
      serviceType: lead.serviceType?.name,
      title: `Waiting on ${lead.contact.fullName}`,
      reason: `Quote sent ${daysSinceOutbound} day(s) ago - awaiting response`,
      priority: daysSinceOutbound > 7 ? 'HIGH' : 'NORMAL',
      category: 'WAITING_ON_CUSTOMER' as const,
      action: {
        type: 'view' as const,
        label: 'View Lead',
        url: `/leads/${lead.id}`,
        estimatedMinutes: 2,
      },
      revenuePotential: lead.expectedRevenueAED || undefined,
    }
  })
}

/**
 * Convert task to CommandCenterItem
 */
function taskToCommandCenterItem(task: any): CommandCenterItem {
  const isOverdue = task.dueAt && isPast(task.dueAt)
  const hoursOverdue = task.dueAt && isPast(task.dueAt)
    ? differenceInHours(new Date(), task.dueAt)
    : 0

  let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'
  if (isOverdue) {
    priority = hoursOverdue > 24 ? 'URGENT' : hoursOverdue > 4 ? 'HIGH' : 'NORMAL'
  }

  let actionType: 'reply' | 'call' | 'send_quote' | 'view' | 'follow_up' = 'view'
  let actionLabel = 'View'
  let estimatedMinutes = 5

  if (task.type === 'REPLY_WHATSAPP') {
    actionType = 'reply'
    actionLabel = 'Reply Now'
    estimatedMinutes = 5
  } else if (task.type === 'CALL') {
    actionType = 'call'
    actionLabel = 'Call Now'
    estimatedMinutes = 10
  } else if (task.type === 'DOCUMENT_REQUEST' && task.title.toLowerCase().includes('quotation')) {
    actionType = 'send_quote'
    actionLabel = 'Send Quote'
    estimatedMinutes = 10
  } else if (task.type.includes('FOLLOWUP') || task.type.includes('FOLLOW_UP')) {
    actionType = 'follow_up'
    actionLabel = 'Follow Up'
    estimatedMinutes = 5
  }

  return {
    id: `task_${task.id}`,
    leadId: task.leadId,
    contactName: task.lead.contact.fullName,
    serviceType: task.lead.serviceType?.name,
    title: task.title,
    reason: isOverdue
      ? `Overdue by ${hoursOverdue}h (due ${format(task.dueAt, 'HH:mm')})`
      : `Due ${format(task.dueAt, 'HH:mm')}`,
    priority,
    category: isUrgent({ priority } as CommandCenterItem) ? 'ACTION_REQUIRED' : 'QUICK_WIN',
    action: {
      type: actionType,
      label: actionLabel,
      url: `/leads/${task.leadId}?action=${actionType}`,
      estimatedMinutes,
    },
    dueAt: task.dueAt || undefined,
      revenuePotential: task.lead.expectedRevenueAED || undefined,
  }
}

/**
 * Check if item is urgent
 */
function isUrgent(item: CommandCenterItem): boolean {
  return item.priority === 'URGENT' || item.priority === 'HIGH'
}

/**
 * Sort by priority and revenue potential
 */
function sortByPriorityAndRevenue(a: CommandCenterItem, b: CommandCenterItem): number {
  const priorityOrder = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 }
  const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority]
  if (priorityDiff !== 0) return priorityDiff

  // Then by revenue potential (higher first)
  const revenueDiff = (b.revenuePotential || 0) - (a.revenuePotential || 0)
  if (revenueDiff !== 0) return revenueDiff

  // Then by due date (earlier first)
  if (a.dueAt && b.dueAt) {
    return a.dueAt.getTime() - b.dueAt.getTime()
  }

  return 0
}

