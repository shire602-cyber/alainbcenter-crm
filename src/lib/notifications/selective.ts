/**
 * SELECTIVE NOTIFICATION SYSTEM
 * 
 * Only generates notifications for specific events:
 * - SLA breach imminent (within 5 minutes)
 * - Customer replies (new inbound message)
 * - Quote ready (quote task due today)
 * - Deadline today (task/expiry due today)
 * 
 * Each notification:
 * - Tied to a specific action
 * - Auto-dismisses once action is taken
 * - Never duplicates for same lead/action
 */

import { prisma } from '../prisma'
import { format, differenceInMinutes, isToday } from 'date-fns'

export type NotificationType = 
  | 'sla_breach_imminent'
  | 'customer_reply'
  | 'quote_ready'
  | 'deadline_today'

export interface SelectiveNotification {
  id: number
  type: NotificationType
  title: string
  message: string
  leadId: number
  conversationId?: number
  actionUrl: string
  actionLabel: string
  createdAt: Date
  isRead: boolean
}

/**
 * Create notification for SLA breach imminent
 */
export async function notifySLABreachImminent(
  conversationId: number,
  minutesUntilBreach: number
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      lead: true,
    },
  })

  if (!conversation || !conversation.leadId) return

  // Check if notification already exists
  const existing = await prisma.notification.findFirst({
    where: {
      type: 'sla_breach_imminent',
      conversationId,
      isRead: false,
      createdAt: {
        gte: new Date(Date.now() - 60 * 60 * 1000), // Last hour
      },
    },
  })

  if (existing) return // Already notified

  await prisma.notification.create({
    data: {
      type: 'sla_breach_imminent',
      title: 'SLA Breach Imminent',
      message: `Reply to ${conversation.contact.fullName} within ${minutesUntilBreach} minutes to meet SLA`,
      leadId: conversation.leadId,
      conversationId,
    },
  })
}

/**
 * Create notification for customer reply
 */
export async function notifyCustomerReply(
  conversationId: number,
  messageId: number
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      contact: true,
      lead: true,
    },
  })

  if (!conversation || !conversation.leadId) return

  // Check if notification already exists for this message
  const existing = await prisma.notification.findFirst({
    where: {
      type: 'customer_reply',
      conversationId,
      isRead: false,
      createdAt: {
        gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
      },
    },
  })

  if (existing) return // Already notified

  await prisma.notification.create({
    data: {
      type: 'customer_reply',
      title: 'New Customer Reply',
      message: `${conversation.contact.fullName} replied to your message`,
      leadId: conversation.leadId,
      conversationId,
    },
  })
}

/**
 * Create notification for quote ready
 */
export async function notifyQuoteReady(taskId: number): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      lead: {
        include: {
          contact: true,
        },
      },
    },
  })

  if (!task || !task.leadId) return

  // Check if notification already exists
  const existing = await prisma.notification.findFirst({
    where: {
      type: 'quote_ready',
      leadId: task.leadId,
      isRead: false,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  })

  if (existing) return // Already notified

  await prisma.notification.create({
    data: {
      type: 'quote_ready',
      title: 'Quote Ready to Send',
      message: `Send quotation to ${task.lead.contact.fullName}`,
      leadId: task.leadId,
    },
  })
}

/**
 * Create notification for deadline today
 */
export async function notifyDeadlineToday(
  taskId: number,
  deadlineType: 'task' | 'expiry'
): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      lead: {
        include: {
          contact: true,
        },
      },
      expiryItem: true,
    },
  })

  if (!task || !task.leadId) return

  // Check if notification already exists
  const existing = await prisma.notification.findFirst({
    where: {
      type: 'deadline_today',
      leadId: task.leadId,
      isRead: false,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
  })

  if (existing) return // Already notified

  const title = deadlineType === 'expiry' 
    ? 'Expiry Deadline Today'
    : 'Task Deadline Today'

  const message = deadlineType === 'expiry'
    ? `${task.expiryItem?.type || 'Item'} expires today for ${task.lead.contact.fullName}`
    : `${task.title} due today for ${task.lead.contact.fullName}`

  await prisma.notification.create({
    data: {
      type: 'deadline_today',
      title,
      message,
      leadId: task.leadId,
    },
  })
}

/**
 * Auto-dismiss notification when action is taken
 */
export async function dismissNotificationForAction(
  leadId: number,
  actionType: 'reply' | 'quote_sent' | 'task_completed'
): Promise<void> {
  let notificationTypes: NotificationType[] = []

  switch (actionType) {
    case 'reply':
      notificationTypes = ['sla_breach_imminent', 'customer_reply']
      break
    case 'quote_sent':
      notificationTypes = ['quote_ready']
      break
    case 'task_completed':
      notificationTypes = ['deadline_today']
      break
  }

  await prisma.notification.updateMany({
    where: {
      leadId,
      type: {
        in: notificationTypes,
      },
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  })
}

/**
 * Clean up old notifications (older than 7 days)
 */
export async function cleanupOldNotifications(): Promise<void> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  await prisma.notification.deleteMany({
    where: {
      createdAt: {
        lt: sevenDaysAgo,
      },
      isRead: true,
    },
  })
}

