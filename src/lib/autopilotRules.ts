// Autopilot Rules Engine
// Handles all automated follow-up and reminder rules

import { prisma } from './prisma'
import { sendWhatsApp, sendEmail } from './messaging'
import { generateExpiryReminderMessage, generateFollowUpMessage } from './aiMessageGeneration'
import { formatDistanceToNow } from 'date-fns'

type RuleContext = {
  dateKey: string // YYYY-MM-DD format
  now: Date
}

/**
 * Check if a rule has already been executed today (prevent duplicates)
 */
async function hasRunToday(
  ruleId: number | null,
  leadId: number,
  actionKey: string,
  dateKey: string
): Promise<boolean> {
  const existing = await prisma.automationRunLog.findFirst({
    where: {
      dateKey,
      actionKey,
      ruleId: ruleId || undefined,
      leadId,
    },
  })
  return !!existing
}

/**
 * Record that a rule has been executed
 */
async function recordRun(
  ruleId: number | null,
  leadId: number,
  actionKey: string,
  dateKey: string
) {
  await prisma.automationRunLog.create({
    data: {
      dateKey,
      actionKey,
      ruleId: ruleId || undefined,
      leadId,
    },
  })
}

/**
 * Rule 1: Instant Reply (optional)
 * Send immediate reply to inbound WhatsApp messages
 */
export async function runInstantReplyRule(context: RuleContext) {
  const results = {
    sent: 0,
    errors: [] as string[],
  }

  // Get active instant reply rule
  const rule = await prisma.automationRule.findFirst({
    where: {
      type: 'instant_reply',
      enabled: true,
    },
  })

  if (!rule || !rule.template) {
    return results // Rule not configured
  }

  // Get inbound messages from last hour that haven't been replied to
  const oneHourAgo = new Date(context.now.getTime() - 60 * 60 * 1000)
  
  const recentInboundMessages = await prisma.chatMessage.findMany({
    where: {
      direction: 'inbound',
      channel: 'whatsapp',
      createdAt: {
        gte: oneHourAgo,
      },
    },
    include: {
      contact: true,
      lead: {
        include: {
          contact: true,
        },
      },
    },
  })

  for (const message of recentInboundMessages) {
    if (!message.lead || !message.contact) continue

    // Check if we already replied
    const hasReplied = await prisma.chatMessage.findFirst({
      where: {
        contactId: message.contactId,
        leadId: message.leadId,
        direction: 'outbound',
        createdAt: {
          gt: message.createdAt,
        },
      },
    })

    if (hasReplied) continue

    // Check if already sent today
    const actionKey = `instant_reply_${message.leadId}_${message.id}`
    if (await hasRunToday(rule.id, message.lead.id, actionKey, context.dateKey)) {
      continue
    }

    try {
      // Send instant reply
      const replyMessage = rule.template
        .replace('{name}', message.contact.fullName.split(' ')[0])
        .replace('{service}', message.lead.leadType || message.lead.serviceTypeEnum || 'our services')

      const sendResult = await sendWhatsApp(
        message.lead,
        message.contact,
        replyMessage
      )

      if (sendResult.success) {
        await recordRun(rule.id, message.lead.id, actionKey, context.dateKey)
        results.sent++
      } else {
        results.errors.push(`Lead ${message.lead.id}: Failed to send instant reply`)
      }
    } catch (error: any) {
      results.errors.push(`Lead ${message.lead.id}: ${error.message}`)
    }
  }

  return results
}

/**
 * Rule 2: No Reply Follow-up
 * If inbound message not answered in 2 hours → remind agent + draft AI reply
 */
export async function runNoReplyFollowUpRule(context: RuleContext) {
  const results = {
    tasksCreated: 0,
    errors: [] as string[],
  }

  // Get active no-reply follow-up rule
  const rule = await prisma.automationRule.findFirst({
    where: {
      type: 'no_reply_followup',
      enabled: true,
    },
  })

  if (!rule) {
    return results
  }

  // hoursAfterInbound not in schema - use default or skip
  const hoursAfterInbound = 24 // Default to 24 hours
  const hoursAgo = new Date(context.now.getTime() - hoursAfterInbound * 60 * 60 * 1000)

  // Find inbound messages that haven't been replied to
  const unreadInbound = await prisma.chatMessage.findMany({
    where: {
      direction: 'inbound',
      createdAt: {
        lte: hoursAgo,
      },
    },
    include: {
      contact: true,
      lead: {
        include: {
          contact: true,
        },
      },
    },
  })

  for (const message of unreadInbound) {
    if (!message.lead || !message.contact) continue

    // Check if already replied
    const hasReplied = await prisma.chatMessage.findFirst({
      where: {
        contactId: message.contactId,
        leadId: message.leadId,
        direction: 'outbound',
        createdAt: {
          gt: message.createdAt,
        },
      },
    })

    if (hasReplied) continue

    // Check if task already exists
    const existingTask = await prisma.task.findFirst({
      where: {
        leadId: message.lead.id,
        title: {
          contains: 'No reply follow-up',
        },
        doneAt: null,
      },
    })

    if (existingTask) continue

    // Check if already processed today
    const actionKey = `no_reply_${message.leadId}_${message.id}`
    if (await hasRunToday(rule.id, message.lead.id, actionKey, context.dateKey)) {
      continue
    }

    try {
      // Generate AI reply draft
      const { generateAiReply } = await import('./aiReply')
      const aiReply = await generateAiReply(message.lead as any, [
        { channel: message.channel, messageSnippet: message.message.substring(0, 200) },
      ])

      // Create task for agent
      await prisma.task.create({
        data: {
          leadId: message.lead.id,
          title: `No reply follow-up needed - ${message.contact.fullName}`,
          type: 'whatsapp',
          dueAt: context.now,
        },
      })

      // Save AI draft as internal note
      await prisma.chatMessage.create({
        data: {
          contactId: message.contact.id,
          leadId: message.lead.id,
          channel: 'internal',
          direction: 'outbound',
          message: `[AI Draft] ${aiReply.message}`,
          // aiGenerated field not in schema - removed
        },
      })

      await recordRun(rule.id, message.lead.id, actionKey, context.dateKey)
      results.tasksCreated++
    } catch (error: any) {
      results.errors.push(`Lead ${message.lead.id}: ${error.message}`)
    }
  }

  return results
}

/**
 * Rule 3: Next Follow-up Due
 * If nextFollowUpAt <= now and status not closed → create task + notify
 */
export async function runNextFollowUpDueRule(context: RuleContext) {
  const results = {
    tasksCreated: 0,
    errors: [] as string[],
  }

  // Get active follow-up due rule
  const rule = await prisma.automationRule.findFirst({
    where: {
      type: 'followup_due',
      enabled: true,
    },
  })

  if (!rule) {
    return results
  }

  const leadsDue = await prisma.lead.findMany({
    where: {
      nextFollowUpAt: {
        lte: context.now,
      },
      status: {
        notIn: ['completed', 'lost', 'won'],
      },
    },
    include: {
      contact: true,
    },
  })

  for (const lead of leadsDue) {
    // Check if task already exists
    const existingTask = await prisma.task.findFirst({
      where: {
        leadId: lead.id,
        title: {
          contains: 'Follow-up due',
        },
        doneAt: null,
      },
    })

    if (existingTask) continue

    // Check if already processed today
    const actionKey = `followup_due_${lead.id}`
    if (await hasRunToday(rule.id, lead.id, actionKey, context.dateKey)) {
      continue
    }

    try {
      await prisma.task.create({
        data: {
          leadId: lead.id,
          title: `Follow-up due - ${lead.contact.fullName}`,
          type: 'whatsapp',
          dueAt: context.now,
        },
      })

      await recordRun(rule.id, lead.id, actionKey, context.dateKey)
      results.tasksCreated++
    } catch (error: any) {
      results.errors.push(`Lead ${lead.id}: ${error.message}`)
    }
  }

  return results
}

/**
 * Rule 4: Expiry Reminders (90/60/30/7 days)
 * If expiryDate approaching → send templated/AI WhatsApp reminder
 */
export async function runExpiryReminderRule(context: RuleContext) {
  const results = {
    sent: 0,
    errors: [] as string[],
  }

  // Get active expiry reminder rules
  const rules = await prisma.automationRule.findMany({
    where: {
      type: 'expiry_reminder',
      enabled: true,
    },
  })

  if (rules.length === 0) {
    return results
  }

  const today = new Date(context.dateKey)
  today.setUTCHours(0, 0, 0, 0)

  // Get leads with expiry dates
  const leadsWithExpiry = await prisma.lead.findMany({
    where: {
      expiryDate: {
        not: null,
        gte: today,
      },
      status: {
        notIn: ['completed', 'lost'],
      },
    },
    include: {
      contact: true,
      serviceType: true,
    },
  })

  for (const lead of leadsWithExpiry) {
    if (!lead.expiryDate) continue

    const expiryDate = new Date(lead.expiryDate)
    expiryDate.setUTCHours(0, 0, 0, 0)
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    for (const rule of rules) {
      if (!rule.daysBeforeExpiry) continue

      // Check if we're in the reminder window (within 1 day of target)
      const targetDays = rule.daysBeforeExpiry
      if (daysUntilExpiry < targetDays - 1 || daysUntilExpiry > targetDays + 1) {
        continue
      }

      // Check if already sent
      const actionKey = `expiry_${targetDays}_${lead.id}`
      if (await hasRunToday(rule.id, lead.id, actionKey, context.dateKey)) {
        continue
      }

      try {
        const message = await generateExpiryReminderMessage(lead as any, targetDays)

        let sendResult
        if (rule.channel === 'whatsapp' && lead.contact.phone) {
          sendResult = await sendWhatsApp(lead as any, lead.contact as any, message)
        } else if (rule.channel === 'email' && lead.contact.email) {
          sendResult = await sendEmail(
            lead as any,
            lead.contact as any,
            `Expiry Reminder: ${targetDays} Days`,
            message
          )
        } else {
          results.errors.push(`Lead ${lead.id}: No ${rule.channel} contact method`)
          continue
        }

        if (sendResult.success) {
          await recordRun(rule.id, lead.id, actionKey, context.dateKey)
          await prisma.lead.update({
            where: { id: lead.id },
            data: { lastContactAt: context.now },
          })
          results.sent++
        } else {
          results.errors.push(`Lead ${lead.id}: Failed to send expiry reminder`)
        }
      } catch (error: any) {
        results.errors.push(`Lead ${lead.id}: ${error.message}`)
      }
    }
  }

  return results
}

/**
 * Rule 5: Overdue Escalation
 * If expiryDate passed → urgent follow-up + escalation
 */
export async function runOverdueRule(context: RuleContext) {
  const results = {
    tasksCreated: 0,
    errors: [] as string[],
  }

  // Get active overdue rule
  const rule = await prisma.automationRule.findFirst({
    where: {
      type: 'overdue',
      enabled: true,
    },
  })

  if (!rule) {
    return results
  }

  const today = new Date(context.dateKey)
  today.setUTCHours(0, 0, 0, 0)

  const overdueLeads = await prisma.lead.findMany({
    where: {
      expiryDate: {
        lt: today,
      },
      status: {
        notIn: ['completed', 'lost'],
      },
    },
    include: {
      contact: true,
    },
  })

  for (const lead of overdueLeads) {
    // Check if task already exists
    const existingTask = await prisma.task.findFirst({
      where: {
        leadId: lead.id,
        title: {
          contains: 'OVERDUE',
        },
        doneAt: null,
      },
    })

    if (existingTask) continue

    // Check if already processed today
    const actionKey = `overdue_${lead.id}`
    if (await hasRunToday(rule.id, lead.id, actionKey, context.dateKey)) {
      continue
    }

    try {
      // Create urgent task
      await prisma.task.create({
        data: {
          leadId: lead.id,
          title: `🚨 OVERDUE - ${lead.contact.fullName} - Expired ${formatDistanceToNow(new Date(lead.expiryDate!))} ago`,
          type: 'whatsapp',
          dueAt: context.now,
        },
      })

      await recordRun(rule.id, lead.id, actionKey, context.dateKey)
      results.tasksCreated++
    } catch (error: any) {
      results.errors.push(`Lead ${lead.id}: ${error.message}`)
    }
  }

  return results
}

/**
 * Run all autopilot rules
 */
export async function runAllAutopilotRules() {
  const now = new Date()
  const dateKey = now.toISOString().split('T')[0] // YYYY-MM-DD

  const context: RuleContext = {
    dateKey,
    now,
  }

  const results = {
    instantReply: await runInstantReplyRule(context),
    noReplyFollowUp: await runNoReplyFollowUpRule(context),
    nextFollowUpDue: await runNextFollowUpDueRule(context),
    expiryReminders: await runExpiryReminderRule(context),
    overdue: await runOverdueRule(context),
    timestamp: now.toISOString(),
  }

  return results
}























