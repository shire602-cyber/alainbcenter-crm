// AUTOPILOT v1: Rule-based automation engine
// Sends WhatsApp messages + creates tasks with idempotency

import { prisma } from '../prisma'
import { sendWhatsAppMessage } from '../whatsappSender'

export type AutopilotOptions = {
  dryRun?: boolean
  now?: Date
}

export type AutopilotResult = {
  ok: boolean
  totals: {
    rules: number
    candidates: number
    sent: number
    skipped: number
    failed: number
  }
  detailsByRule: Array<{
    ruleKey: string
    ruleName: string
    candidates: number
    sent: number
    skipped: number
    failed: number
    errors: string[]
  }>
  timestamp: string
}

/**
 * Replace template variables in message
 */
function replaceTemplateVariables(
  template: string,
  variables: {
    name?: string
    service?: string
    phone?: string
    daysToExpiry?: number
    company?: string
  }
): string {
  let message = template
  message = message.replace(/\{\{name\}\}/g, variables.name || 'there')
  message = message.replace(/\{\{service\}\}/g, variables.service || 'service')
  message = message.replace(/\{\{phone\}\}/g, variables.phone || '')
  message = message.replace(/\{\{daysToExpiry\}\}/g, String(variables.daysToExpiry || 0))
  message = message.replace(/\{\{company\}\}/g, variables.company || 'Alain Business Center')
  return message
}

/**
 * Compute idempotency key for a rule+lead+window
 */
function getIdempotencyKey(
  ruleKey: string,
  leadId: number,
  windowStart: string
): string {
  return `${ruleKey}:${leadId}:${windowStart}`
}

/**
 * Check if already sent (idempotency check)
 */
async function hasBeenSent(
  idempotencyKey: string
): Promise<boolean> {
  const existing = await prisma.automationRunLog.findUnique({
    where: { idempotencyKey },
  })
  return existing?.status === 'sent'
}

/**
 * Log automation run
 */
async function logRun(params: {
  idempotencyKey: string
  ruleKey: string
  ruleId: number | null
  leadId: number
  contactId: number
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
  message?: string
  meta?: any
}): Promise<void> {
  await prisma.automationRunLog.create({
    data: {
      idempotencyKey: params.idempotencyKey,
      ruleKey: params.ruleKey,
      ruleId: params.ruleId,
      leadId: params.leadId,
      contactId: params.contactId,
      status: params.status,
      reason: params.reason,
      message: params.message,
      // meta field removed - not in schema
    },
  })
}

/**
 * Rule: followup_due
 * Leads where nextFollowUpAt <= now AND status != "closed"
 */
async function runFollowupDueRule(
  rule: { id: number; key: string; name: string; template: string | null },
  now: Date,
  dryRun: boolean
): Promise<{
  candidates: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}> {
  const results = {
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  }

  // Get leads due for follow-up
  const leads = await prisma.lead.findMany({
    where: {
      nextFollowUpAt: {
        lte: now,
      },
      status: {
        notIn: ['closed', 'completed', 'lost', 'won'],
      },
    },
    include: {
      contact: true,
      serviceType: true,
    },
  })

  results.candidates = leads.length

  // Window: daily (today's date)
  const windowStart = now.toISOString().split('T')[0] // YYYY-MM-DD

  for (const lead of leads) {
    // Require phone
    if (!lead.contact.phone) {
      results.skipped++
      await logRun({
        idempotencyKey: getIdempotencyKey(rule.key, lead.id, windowStart),
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'skipped',
        reason: 'no_phone',
      })
      continue
    }

    // Check idempotency
    const idempotencyKey = getIdempotencyKey(rule.key, lead.id, windowStart)
    if (await hasBeenSent(idempotencyKey)) {
      results.skipped++
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'skipped',
        reason: 'already_sent',
      })
      continue
    }

    // Build message
    const template = rule.template || 'Hi {{name}}, this is {{company}}. Just following up on your {{service}} request. Are you available for a quick call today?'
    const message = replaceTemplateVariables(template, {
      name: lead.contact.fullName,
      service: lead.serviceType?.name || lead.leadType || 'service',
      phone: lead.contact.phone,
      company: 'Alain Business Center',
    })

    if (dryRun) {
      results.sent++
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'sent',
        message,
      })
      continue
    }

    // Send WhatsApp
    const sendResult = await sendWhatsAppMessage(lead.contact.phone, message)

    if (sendResult.ok) {
      results.sent++

      // Log to CommunicationLog
      await prisma.communicationLog.create({
        data: {
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          messageSnippet: message.substring(0, 200),
        },
      })

      // Log to ChatMessage
      await prisma.chatMessage.create({
        data: {
          leadId: lead.id,
          contactId: lead.contactId,
          channel: 'whatsapp',
          direction: 'outbound',
          message,
          metadata: JSON.stringify({
            externalId: sendResult.externalId,
            automationRule: rule.key,
          }),
        },
      })

      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'sent',
        message,
        meta: sendResult.raw,
      })
    } else {
      results.failed++
      results.errors.push(`Lead ${lead.id}: ${sendResult.error}`)
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'failed',
        reason: sendResult.error,
        message,
      })
    }
  }

  return results
}

/**
 * Rule: expiry_90
 * Leads where expiryDate is within 85-95 days (window prevents daily spam)
 */
async function runExpiry90Rule(
  rule: { id: number; key: string; name: string; template: string | null },
  now: Date,
  dryRun: boolean
): Promise<{
  candidates: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}> {
  const results = {
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  }

  // Calculate date range: 85-95 days from now
  const days85 = new Date(now.getTime() + 85 * 24 * 60 * 60 * 1000)
  const days95 = new Date(now.getTime() + 95 * 24 * 60 * 60 * 1000)

  const leads = await prisma.lead.findMany({
    where: {
      expiryDate: {
        not: null,
        gte: days85,
        lte: days95,
      },
      status: {
        notIn: ['closed', 'completed', 'lost', 'won'],
      },
    },
    include: {
      contact: true,
      serviceType: true,
    },
  })

  results.candidates = leads.length

  for (const lead of leads) {
    if (!lead.expiryDate || !lead.contact.phone) {
      results.skipped++
      continue
    }

    // Calculate days to expiry
    const daysToExpiry = Math.ceil(
      (lead.expiryDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    )

    // Window: weekly (start of week)
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay()) // Sunday
    const windowStart = weekStart.toISOString().split('T')[0]

    // Check idempotency
    const idempotencyKey = getIdempotencyKey(rule.key, lead.id, windowStart)
    if (await hasBeenSent(idempotencyKey)) {
      results.skipped++
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'skipped',
        reason: 'already_sent',
      })
      continue
    }

    // Build message
    const template = rule.template || 'Hi {{name}}, reminder: your UAE {{service}} may be due for renewal soon (about {{daysToExpiry}} days left). Would you like us to handle it for you?'
    const message = replaceTemplateVariables(template, {
      name: lead.contact.fullName,
      service: lead.serviceType?.name || lead.leadType || 'service',
      phone: lead.contact.phone,
      daysToExpiry,
      company: 'Alain Business Center',
    })

    if (dryRun) {
      results.sent++
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'sent',
        message,
      })
      continue
    }

    // Send WhatsApp
    const sendResult = await sendWhatsAppMessage(lead.contact.phone, message)

    if (sendResult.ok) {
      results.sent++

      // Log to CommunicationLog
      await prisma.communicationLog.create({
        data: {
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          messageSnippet: message.substring(0, 200),
        },
      })

      // Log to ChatMessage
      await prisma.chatMessage.create({
        data: {
          leadId: lead.id,
          contactId: lead.contactId,
          channel: 'whatsapp',
          direction: 'outbound',
          message,
          metadata: JSON.stringify({
            externalId: sendResult.externalId,
            automationRule: rule.key,
          }),
        },
      })

      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'sent',
        message,
      })
    } else {
      results.failed++
      results.errors.push(`Lead ${lead.id}: ${sendResult.error}`)
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'failed',
        reason: sendResult.error,
        message,
      })
    }
  }

  return results
}

/**
 * Rule: overdue
 * expiryDate < today, send every 7 days unless status changes
 */
async function runOverdueRule(
  rule: { id: number; key: string; name: string; template: string | null },
  now: Date,
  dryRun: boolean
): Promise<{
  candidates: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}> {
  const results = {
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [] as string[],
  }

  const leads = await prisma.lead.findMany({
    where: {
      expiryDate: {
        lt: now,
      },
      status: {
        notIn: ['closed', 'completed', 'lost', 'won'],
      },
    },
    include: {
      contact: true,
      serviceType: true,
    },
  })

  results.candidates = leads.length

  // Window: every 7 days
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - (now.getDay() % 7)) // Start of week
  const windowStart = weekStart.toISOString().split('T')[0]

  for (const lead of leads) {
    if (!lead.contact.phone) {
      results.skipped++
      await logRun({
        idempotencyKey: getIdempotencyKey(rule.key, lead.id, windowStart),
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'skipped',
        reason: 'no_phone',
      })
      continue
    }

    // Check idempotency (7-day window)
    const idempotencyKey = getIdempotencyKey(rule.key, lead.id, windowStart)
    if (await hasBeenSent(idempotencyKey)) {
      results.skipped++
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'skipped',
        reason: 'already_sent_this_week',
      })
      continue
    }

    // Build message
    const template = rule.template || 'Hi {{name}}, your {{service}} appears overdue. We can help fix it urgently. Reply 1) YES 2) Need price 3) Call me'
    const message = replaceTemplateVariables(template, {
      name: lead.contact.fullName,
      service: lead.serviceType?.name || lead.leadType || 'service',
      phone: lead.contact.phone,
      company: 'Alain Business Center',
    })

    if (dryRun) {
      results.sent++
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'sent',
        message,
      })
      continue
    }

    // Send WhatsApp
    const sendResult = await sendWhatsAppMessage(lead.contact.phone, message)

    if (sendResult.ok) {
      results.sent++

      // Log to CommunicationLog
      await prisma.communicationLog.create({
        data: {
          leadId: lead.id,
          channel: 'whatsapp',
          direction: 'outbound',
          messageSnippet: message.substring(0, 200),
        },
      })

      // Log to ChatMessage
      await prisma.chatMessage.create({
        data: {
          leadId: lead.id,
          contactId: lead.contactId,
          channel: 'whatsapp',
          direction: 'outbound',
          message,
          metadata: JSON.stringify({
            externalId: sendResult.externalId,
            automationRule: rule.key,
          }),
        },
      })

      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'sent',
        message,
        meta: sendResult.raw,
      })
    } else {
      results.failed++
      results.errors.push(`Lead ${lead.id}: ${sendResult.error}`)
      await logRun({
        idempotencyKey,
        ruleKey: rule.key,
        ruleId: rule.id,
        leadId: lead.id,
        contactId: lead.contactId,
        status: 'failed',
        reason: sendResult.error,
        message,
      })
    }
  }

  return results
}

/**
 * Main autopilot runner
 */
export async function runAutopilot(
  options: AutopilotOptions = {}
): Promise<AutopilotResult> {
  const { dryRun = false, now = new Date() } = options

  // Get all enabled rules
  const rules = await prisma.automationRule.findMany({
    where: {
      enabled: true,
      channel: 'whatsapp',
    },
  })

  const detailsByRule: AutopilotResult['detailsByRule'] = []
  let totalCandidates = 0
  let totalSent = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const rule of rules) {
    if (!rule.key) {
      continue // Skip rules without key
    }

    let ruleResults: {
      candidates: number
      sent: number
      skipped: number
      failed: number
      errors: string[]
    }

    if (!rule.key) {
      continue // Skip rules without a key
    }

    switch (rule.key) {
      case 'followup_due':
        ruleResults = await runFollowupDueRule(rule as any, now, dryRun)
        break
      case 'expiry_90':
        ruleResults = await runExpiry90Rule(rule as any, now, dryRun)
        break
      case 'overdue':
        ruleResults = await runOverdueRule(rule as any, now, dryRun)
        break
      default:
        // Unknown rule key, skip
        continue
    }

    detailsByRule.push({
      ruleKey: rule.key,
      ruleName: rule.name,
      ...ruleResults,
    })

    totalCandidates += ruleResults.candidates
    totalSent += ruleResults.sent
    totalSkipped += ruleResults.skipped
    totalFailed += ruleResults.failed
  }

  return {
    ok: true,
    totals: {
      rules: rules.length,
      candidates: totalCandidates,
      sent: totalSent,
      skipped: totalSkipped,
      failed: totalFailed,
    },
    detailsByRule,
    timestamp: now.toISOString(),
  }
}























