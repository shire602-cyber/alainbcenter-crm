/**
 * Advanced Automation Engine
 * 
 * Handles triggers, conditions, actions, and cooldowns
 * Better than anything on the market with intelligent rule execution
 */

import { prisma } from '../prisma'
import { runActions } from './actions'

export type AutomationTrigger =
  | 'EXPIRY_WINDOW'
  | 'STAGE_CHANGE'
  | 'LEAD_CREATED'
  | 'NO_ACTIVITY'
  | 'INBOUND_MESSAGE'
  | 'NO_REPLY_SLA' // Phase 4: No reply within SLA threshold
  | 'FOLLOWUP_DUE'
  | 'FOLLOWUP_OVERDUE'
  | 'INFO_SHARED' // Phase 3: Triggered when info/quotation is shared with customer

export type AutomationStatus = 'SUCCESS' | 'SKIPPED' | 'ERROR'

export interface AutomationContext {
  lead: any
  contact: any
  expiries?: any[]
  documents?: any[]
  recentMessages?: any[]
  triggerData?: any
}

export interface AutomationResult {
  status: AutomationStatus
  reason?: string
  actionsExecuted?: number
  errors?: string[]
}

/**
 * Run a single rule on a lead
 */
export async function runRuleOnLead(
  rule: any,
  context: AutomationContext
): Promise<AutomationResult> {
  try {
    // Check if lead has autopilot disabled
    if (context.lead.autopilotEnabled === false) {
      return {
        status: 'SKIPPED',
        reason: 'Autopilot disabled for this lead',
      }
    }

    // Check cooldown
    const cooldownResult = await checkCooldown(rule, context.lead.id)
    if (!cooldownResult.allowed) {
      return {
        status: 'SKIPPED',
        reason: cooldownResult.reason || 'Cooldown period active',
      }
    }

    // Evaluate conditions
    const conditionsMet = await evaluateConditions(rule, context)
    if (!conditionsMet.met) {
      return {
        status: 'SKIPPED',
        reason: conditionsMet.reason || 'Conditions not met',
      }
    }

    // Parse actions
    let actions: any[] = []
    try {
      if (rule.actions) {
        actions = typeof rule.actions === 'string' 
          ? JSON.parse(rule.actions) 
          : rule.actions
      }
    } catch (e) {
      return {
        status: 'ERROR',
        reason: 'Invalid actions JSON',
        errors: [(e as Error).message],
      }
    }

    if (!Array.isArray(actions) || actions.length === 0) {
      return {
        status: 'SKIPPED',
        reason: 'No actions configured',
      }
    }

    // Execute actions
    const actionResults = await runActions(actions, context)

    // Calculate status
    const executed = actionResults.filter(r => r.success).length
    const failed = actionResults.filter(r => !r.success).length
    const status: AutomationStatus = 
      failed === 0 ? 'SUCCESS' : executed > 0 ? 'SUCCESS' : 'ERROR'

    return {
      status,
      actionsExecuted: executed,
      errors: actionResults
        .filter(r => !r.success)
        .map(r => r.error || 'Unknown error'),
      reason: status === 'SUCCESS' 
        ? `Executed ${executed} action(s)`
        : `Failed to execute actions`,
    }
  } catch (error: any) {
    return {
      status: 'ERROR',
      reason: error.message || 'Unknown error',
      errors: [error.message],
    }
  }
}

/**
 * Run all rules for a specific lead
 */
export async function runAllRulesForLead(leadId: number): Promise<AutomationResult[]> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: true,
      expiryItems: {
        orderBy: { expiryDate: 'asc' },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      },
    },
  })

  if (!lead) {
    throw new Error('Lead not found')
  }

  // Get active rules
  const rules = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      enabled: true,
    },
  })

  const context: AutomationContext = {
    lead,
    contact: lead.contact,
    expiries: lead.expiryItems,
    recentMessages: lead.messages,
  }

  const results: AutomationResult[] = []

  for (const rule of rules) {
    const result = await runRuleOnLead(rule, context)
    
    // Log result
    await logAutomationRun(rule, lead, result)

    results.push(result)
  }

  return results
}

/**
 * Run scheduled rules (daily/hourly)
 */
export async function runScheduledRules(
  schedule: 'daily' | 'hourly' = 'daily'
): Promise<{
  rulesRun: number
  leadsProcessed: number
  actionsExecuted: number
  errors: string[]
}> {
  const now = new Date()
  
  // Get rules for this schedule
  const rules = await prisma.automationRule.findMany({
    where: {
      isActive: true,
      enabled: true,
      schedule: schedule,
    },
  })

  let leadsProcessed = 0
  let actionsExecuted = 0
  const errors: string[] = []

  for (const rule of rules) {
    try {
      const candidates = await findRuleCandidates(rule, now)
      leadsProcessed += candidates.length

      for (const lead of candidates) {
        try {
          const context: AutomationContext = {
            lead,
            contact: lead.contact,
            expiries: lead.expiryItems,
            recentMessages: lead.messages?.slice(0, 10),
          }

          const result = await runRuleOnLead(rule, context)
          await logAutomationRun(rule, lead, result)

          if (result.status === 'SUCCESS' && result.actionsExecuted) {
            actionsExecuted += result.actionsExecuted
          }

          if (result.errors && result.errors.length > 0) {
            errors.push(...result.errors.map(e => `Lead ${lead.id}: ${e}`))
          }
        } catch (error: any) {
          errors.push(`Lead ${lead.id}: ${error.message}`)
        }
      }
    } catch (error: any) {
      errors.push(`Rule ${rule.id}: ${error.message}`)
    }
  }

  return {
    rulesRun: rules.length,
    leadsProcessed,
    actionsExecuted,
    errors,
  }
}

/**
 * Evaluate rule conditions
 */
async function evaluateConditions(
  rule: any,
  context: AutomationContext
): Promise<{ met: boolean; reason?: string }> {
  if (!rule.conditions) {
    return { met: true }
  }

  let conditions: any
  try {
    conditions = typeof rule.conditions === 'string' 
      ? JSON.parse(rule.conditions) 
      : rule.conditions
  } catch {
    return { met: false, reason: 'Invalid conditions JSON' }
  }

  const { lead, contact, expiries, documents, recentMessages } = context

  // Handle different condition types based on trigger
  if (rule.trigger === 'EXPIRY_WINDOW') {
    const { expiryType, daysBefore, documentExpiryInDays, documentTypes } = conditions
    
    // Check document expiry if specified
    if (documentExpiryInDays !== undefined) {
      const leadWithDocs = await prisma.lead.findUnique({
        where: { id: lead.id },
        include: { documents: true },
      })

      if (!leadWithDocs?.documents || leadWithDocs.documents.length === 0) {
        return { met: false, reason: 'No documents found' }
      }

      const now = new Date()
      const targetDays = documentExpiryInDays
      const matchingDocs = leadWithDocs.documents.filter((doc: any) => {
        if (!doc.expiryDate) return false
        
        // Filter by document type if specified
        if (documentTypes && Array.isArray(documentTypes) && documentTypes.length > 0) {
          if (!doc.category || !documentTypes.includes(doc.category.toUpperCase())) {
            return false
          }
        }
        
        const expiryDate = new Date(doc.expiryDate)
        const daysUntil = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        
        // Match documents expiring within the specified window
        return daysUntil >= (targetDays - 2) && daysUntil <= (targetDays + 2)
      })

      return {
        met: matchingDocs.length > 0,
        reason: matchingDocs.length === 0 ? 'No documents expiring in specified window' : undefined,
      }
    }

    // Original expiry item logic
    if (!expiries || expiries.length === 0) {
      return { met: false, reason: 'No expiry items found' }
    }

    const now = new Date()
    const matchingExpiries = expiries.filter((e: any) => {
      if (expiryType && e.type !== expiryType) return false
      
      const daysUntil = Math.ceil(
        (new Date(e.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      )
      
      return daysUntil >= (daysBefore - 2) && daysUntil <= (daysBefore + 2)
    })

    return {
      met: matchingExpiries.length > 0,
      reason: matchingExpiries.length === 0 ? 'No matching expiry items' : undefined,
    }
  }

  if (rule.trigger === 'NO_ACTIVITY') {
    const { daysWithoutMessage } = conditions
    if (!recentMessages || recentMessages.length === 0) {
      // No messages at all - check lead creation date
      const daysSinceCreated = Math.floor(
        (new Date().getTime() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      )
      return {
        met: daysSinceCreated >= daysWithoutMessage,
        reason: daysSinceCreated < daysWithoutMessage 
          ? `Only ${daysSinceCreated} days since lead creation`
          : undefined,
      }
    }

    const lastMessage = recentMessages[0]
    const daysSinceMessage = Math.floor(
      (new Date().getTime() - new Date(lastMessage.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    )

    return {
      met: daysSinceMessage >= daysWithoutMessage,
      reason: daysSinceMessage < daysWithoutMessage
        ? `Last message was ${daysSinceMessage} days ago`
        : undefined,
    }
  }

  if (rule.trigger === 'STAGE_CHANGE') {
    const { fromStage, toStage, missingMandatoryDocs } = conditions
    
    // Check stage filters if specified
    if (fromStage && context.triggerData?.fromStage !== fromStage) {
      return { met: false, reason: `Stage change from '${context.triggerData?.fromStage}' doesn't match '${fromStage}'` }
    }
    if (toStage && context.triggerData?.toStage !== toStage) {
      return { met: false, reason: `Stage change to '${context.triggerData?.toStage}' doesn't match '${toStage}'` }
    }
    
    // Check for missing mandatory docs if required
    if (missingMandatoryDocs === true) {
      try {
        const { getLeadComplianceStatus } = await import('../compliance')
        const compliance = await getLeadComplianceStatus(lead.id)
        
        if (compliance.missingMandatory.length === 0) {
          return { met: false, reason: 'No missing mandatory documents' }
        }
        
        return { met: true, reason: `${compliance.missingMandatory.length} missing mandatory document(s)` }
      } catch (error) {
        console.warn('Failed to check compliance for STAGE_CHANGE rule:', error)
        // If compliance check fails, don't block the rule
        return { met: true }
      }
    }
    
    // If no specific conditions, rule passes
    return { met: true }
  }

  if (rule.trigger === 'LEAD_CREATED') {
    const { sourceIn, hotOnly } = conditions
    if (sourceIn && !sourceIn.includes(lead.source)) {
      return { met: false, reason: `Source ${lead.source} not in allowed list` }
    }
    if (hotOnly && (lead.aiScore || 0) < 70) {
      return { met: false, reason: 'Lead score below hot threshold' }
    }
    return { met: true }
  }

  if (rule.trigger === 'NO_REPLY_SLA') {
    const { hoursWithoutReply } = conditions || { hoursWithoutReply: 48 }
    
    // Find last inbound message
    const lastInbound = recentMessages?.find(
      (m: any) => m.direction === 'INBOUND' || m.direction === 'IN' || m.direction === 'inbound'
    )

    if (!lastInbound) {
      return { met: false, reason: 'No inbound messages found' }
    }

    // Find reply after that
    const replyAfter = recentMessages?.find(
      (m: any) => 
        (m.direction === 'OUTBOUND' || m.direction === 'OUT' || m.direction === 'outbound') &&
        new Date(m.createdAt) > new Date(lastInbound.createdAt)
    )

    if (replyAfter) {
      return { met: false, reason: 'Reply already sent' }
    }

    const hoursSince = 
      (new Date().getTime() - new Date(lastInbound.createdAt).getTime()) / (1000 * 60 * 60)

    return {
      met: hoursSince >= hoursWithoutReply,
      reason: hoursSince < hoursWithoutReply
        ? `Only ${Math.floor(hoursSince)} hours since inbound message`
        : undefined,
    }
  }

  if (rule.trigger === 'FOLLOWUP_DUE') {
    if (!lead.nextFollowUpAt) {
      return { met: false, reason: 'No follow-up scheduled' }
    }

    const now = new Date()
    const followUpDate = new Date(lead.nextFollowUpAt)

    return {
      met: followUpDate <= now,
      reason: followUpDate > now ? 'Follow-up not yet due' : undefined,
    }
  }

  if (rule.trigger === 'FOLLOWUP_OVERDUE') {
    if (!lead.nextFollowUpAt) {
      return { met: false, reason: 'No follow-up scheduled' }
    }

    const now = new Date()
    const followUpDate = new Date(lead.nextFollowUpAt)
    const hoursOverdue = (now.getTime() - followUpDate.getTime()) / (1000 * 60 * 60)

    return {
      met: hoursOverdue >= 24, // Overdue by 24+ hours
      reason: hoursOverdue < 24 ? 'Not yet overdue by 24 hours' : undefined,
    }
  }

  if (rule.trigger === 'INFO_SHARED') {
    // Phase 3: Check if info was shared and follow-up is due
    const { daysAfter = 2, infoType } = conditions || {}
    
    // Type assertion for new fields (will be available after migration)
    const leadWithNewFields = lead as any & {
      infoSharedAt: Date | null
      lastInfoSharedType: string | null
    }
    
    if (!leadWithNewFields.infoSharedAt) {
      return { met: false, reason: 'No info shared timestamp found' }
    }

    // Check info type filter if specified
    if (infoType && leadWithNewFields.lastInfoSharedType !== infoType) {
      return { met: false, reason: `Info type '${leadWithNewFields.lastInfoSharedType}' doesn't match required '${infoType}'` }
    }

    const now = new Date()
    const sharedDate = new Date(leadWithNewFields.infoSharedAt!)
    const daysSinceShared = Math.floor(
      (now.getTime() - sharedDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    // Check if we're within the follow-up window (daysAfter ± 1 day)
    const shouldFollowUp = daysSinceShared >= (daysAfter - 1) && daysSinceShared <= (daysAfter + 1)

    // Also check if we already sent a follow-up for this info sharing event
    // We use infoSharedAt as a unique identifier for this sharing event
    const actionKey = `info_followup_${lead.id}_${sharedDate.toISOString().split('T')[0]}`
    const existingLog = await prisma.automationRunLog.findFirst({
      where: {
        leadId: lead.id,
        actionKey,
      },
    })

    if (existingLog) {
      return { met: false, reason: 'Follow-up already sent for this info sharing event' }
    }

    return {
      met: shouldFollowUp,
      reason: !shouldFollowUp 
        ? `Info shared ${daysSinceShared} days ago, follow-up due after ${daysAfter} days`
        : undefined,
    }
  }

  if (rule.trigger === 'NO_REPLY_SLA') {
    // Phase 4: Check if no reply within SLA
    const { slaMinutes = 15, escalateAfterMinutes = 60 } = conditions || {}
    
    if (!recentMessages || recentMessages.length === 0) {
      return { met: false, reason: 'No messages found' }
    }

    const lastInbound = recentMessages.find(
      (m: any) => m.direction === 'INBOUND' || m.direction === 'IN'
    )

    if (!lastInbound) {
      return { met: false, reason: 'No inbound message found' }
    }

    const now = new Date()
    const minutesSinceInbound = Math.floor(
      (now.getTime() - new Date(lastInbound.createdAt).getTime()) / (1000 * 60)
    )

    // Check if there's an outbound after the last inbound
    const hasOutboundAfter = recentMessages.some(
      (m: any) =>
        (m.direction === 'OUTBOUND' || m.direction === 'OUT') &&
        new Date(m.createdAt) > new Date(lastInbound.createdAt)
    )

    if (hasOutboundAfter) {
      return { met: false, reason: 'Reply already sent' }
    }

    // Escalate if past escalateAfterMinutes
    const shouldEscalate = minutesSinceInbound >= escalateAfterMinutes

    return {
      met: shouldEscalate,
      reason: !shouldEscalate
        ? `Only ${minutesSinceInbound} minutes since last inbound (SLA: ${slaMinutes} min, escalate after: ${escalateAfterMinutes} min)`
        : undefined,
    }
  }

  if (rule.trigger === 'INBOUND_MESSAGE') {
    const {
      channels = [],
      matchStages = [],
      onlyHot = false,
      containsAny = [],
      workingHoursOnly = false,
      cooldownMinutes = 0,
    } = conditions

    // Get last message from triggerData (passed from webhook)
    const lastMessage = context.triggerData?.lastMessage
    if (!lastMessage) {
      return { met: false, reason: 'No last message in context' }
    }

    // Channel match
    const messageChannel = lastMessage.channel?.toUpperCase() || 'WHATSAPP'
    const allowedChannels = channels.map((c: string) => c.toUpperCase())
    if (allowedChannels.length > 0 && !allowedChannels.includes(messageChannel)) {
      return { met: false, reason: `Channel ${messageChannel} not in allowed list` }
    }

    // Stage match
    if (matchStages.length > 0 && !matchStages.includes(lead.stage)) {
      return { met: false, reason: `Lead stage ${lead.stage} not in allowed stages` }
    }

    // Hot lead requirement
    if (onlyHot && (lead.aiScore || 0) < 70) {
      return { met: false, reason: 'Lead score below hot threshold (70)' }
    }

    // Keyword match (case-insensitive)
    if (containsAny.length > 0) {
      const messageText = (lastMessage.body || '').toLowerCase()
      const hasKeyword = containsAny.some((keyword: string) =>
        messageText.includes(keyword.toLowerCase())
      )
      if (!hasKeyword) {
        return { met: false, reason: 'Message does not contain any required keywords' }
      }
    }

    // Working hours check (9-18 Dubai time)
    if (workingHoursOnly) {
      const now = new Date()
      // Convert to Dubai timezone
      const dubaiTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dubai' }))
      const hour = dubaiTime.getHours()
      const dayOfWeek = dubaiTime.getDay() // 0 = Sunday, 6 = Saturday
      
      // Check if it's a weekday (Monday-Friday)
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5
      
      if (!isWeekday) {
        return { met: false, reason: 'Outside working days (Monday-Friday only)' }
      }
      
      if (hour < 9 || hour >= 18) {
        return { met: false, reason: `Outside working hours (9-18 Dubai time, current: ${hour}:00)` }
      }
    }

    // Cooldown check (handled separately in checkCooldown, but we use minutes here)
    if (cooldownMinutes > 0) {
      const lastRun = await prisma.automationRunLog.findFirst({
        where: {
          ruleId: rule.id,
          leadId: lead.id,
          status: 'SUCCESS',
        },
        orderBy: { ranAt: 'desc' },
      })

      if (lastRun) {
        const minutesSince = Math.floor(
          (new Date().getTime() - new Date(lastRun.ranAt).getTime()) / (1000 * 60)
        )
        if (minutesSince < cooldownMinutes) {
          return {
            met: false,
            reason: `Cooldown active: ${minutesSince}/${cooldownMinutes} minutes`,
          }
        }
      }
    }

    return { met: true }
  }

  // Default: conditions met
  return { met: true }
}

/**
 * Find candidate leads for a rule
 */
async function findRuleCandidates(rule: any, now: Date): Promise<any[]> {
  const { trigger, conditions } = rule

  let where: any = {}

  if (trigger === 'EXPIRY_WINDOW') {
    // This will be handled by ExpiryItem query
    const { expiryType, daysBefore } = conditions
      ? (typeof conditions === 'string' ? JSON.parse(conditions) : conditions)
      : {}

    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() + (daysBefore || 90))

    const expiryItems = await prisma.expiryItem.findMany({
      where: {
        type: expiryType || undefined,
        expiryDate: {
          gte: new Date(targetDate.getTime() - 2 * 24 * 60 * 60 * 1000),
          lte: new Date(targetDate.getTime() + 2 * 24 * 60 * 60 * 1000),
        },
        lead: {
          autopilotEnabled: { not: false }, // null or true
        },
      },
      include: {
        lead: {
          include: {
            contact: true,
            expiryItems: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
      },
    })

    return expiryItems.map(e => e.lead).filter(Boolean)
  }

  if (trigger === 'NO_ACTIVITY') {
    const { daysWithoutMessage } = conditions
      ? (typeof conditions === 'string' ? JSON.parse(conditions) : conditions)
      : { daysWithoutMessage: 7 }

    const cutoffDate = new Date(now)
    cutoffDate.setDate(cutoffDate.getDate() - daysWithoutMessage)

    const leads = await prisma.lead.findMany({
      where: {
        autopilotEnabled: { not: false },
        stage: { notIn: ['COMPLETED_WON', 'LOST'] },
        OR: [
          {
            messages: {
              none: {
                createdAt: { gte: cutoffDate },
              },
            },
            createdAt: { lte: cutoffDate },
          },
        ],
      },
      include: {
        contact: true,
        expiryItems: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    return leads
  }

  if (trigger === 'INFO_SHARED') {
    // Phase 3: Find leads where info was shared and follow-up is due
    const { daysAfter = 2 } = conditions
      ? (typeof conditions === 'string' ? JSON.parse(conditions) : conditions)
      : { daysAfter: 2 }

    const targetDate = new Date(now)
    targetDate.setDate(targetDate.getDate() - daysAfter)

    // Find leads where infoSharedAt is around the target date (within ±1 day)
    const startDate = new Date(targetDate)
    startDate.setDate(startDate.getDate() - 1)
    const endDate = new Date(targetDate)
    endDate.setDate(endDate.getDate() + 1)

    // Use raw query for new fields until migration is applied
    const leadIds = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id FROM "Lead"
      WHERE "infoSharedAt" IS NOT NULL
      AND "infoSharedAt" >= ${startDate}
      AND "infoSharedAt" <= ${endDate}
      AND "autopilotEnabled" != 0
      AND "stage" NOT IN ('COMPLETED_WON', 'LOST')
    `

    if (leadIds.length === 0) {
      return []
    }

    return await prisma.lead.findMany({
      where: {
        id: { in: leadIds.map(r => r.id) },
      },
      include: {
        contact: true,
        expiryItems: {
          orderBy: { expiryDate: 'asc' },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
  }

  if (trigger === 'FOLLOWUP_DUE') {
    return await prisma.lead.findMany({
      where: {
        autopilotEnabled: { not: false },
        stage: { notIn: ['COMPLETED_WON', 'LOST'] },
        nextFollowUpAt: {
          lte: now,
          not: null,
        },
      },
      include: {
        contact: true,
        expiryItems: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
  }

  if (trigger === 'NO_REPLY_SLA') {
    // Phase 4: Find leads with no reply SLA breach
    const { escalateAfterMinutes = 60 } = conditions
      ? (typeof conditions === 'string' ? JSON.parse(conditions) : conditions)
      : { escalateAfterMinutes: 60 }

    const cutoffTime = new Date(now)
    cutoffTime.setMinutes(cutoffTime.getMinutes() - escalateAfterMinutes)

    // Get all active leads with recent inbound messages
    const allLeads = await prisma.lead.findMany({
      where: {
        autopilotEnabled: { not: false },
        stage: { notIn: ['COMPLETED_WON', 'LOST'] },
      },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })

    // Filter leads where last inbound is past SLA and no outbound after
    const leadsNeedingEscalation = allLeads.filter((lead) => {
      const lastInbound = lead.messages.find(
        (m) => m.direction === 'INBOUND' || m.direction === 'IN'
      )

      if (!lastInbound || lastInbound.createdAt > cutoffTime) {
        return false
      }

      const hasOutboundAfter = lead.messages.some(
        (m) =>
          (m.direction === 'OUTBOUND' || m.direction === 'OUT') &&
          m.createdAt > lastInbound.createdAt
      )

      return !hasOutboundAfter
    })

    return leadsNeedingEscalation.map((lead) => ({
      ...lead,
      expiryItems: [],
    }))
  }

  if (trigger === 'FOLLOWUP_OVERDUE') {
    const overdueDate = new Date(now)
    overdueDate.setHours(overdueDate.getHours() - 24)

    return await prisma.lead.findMany({
      where: {
        autopilotEnabled: { not: false },
        stage: { notIn: ['COMPLETED_WON', 'LOST'] },
        nextFollowUpAt: {
          lte: overdueDate,
          not: null,
        },
      },
      include: {
        contact: true,
        expiryItems: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
  }

  if (trigger === 'NO_REPLY_SLA') {
    // Find leads with unread inbound messages older than SLA
    const { hoursWithoutReply = 48 } = conditions
      ? (typeof conditions === 'string' ? JSON.parse(conditions) : conditions)
      : {}

    const cutoffTime = new Date(now)
    cutoffTime.setHours(cutoffTime.getHours() - hoursWithoutReply)

    const conversations = await prisma.conversation.findMany({
      where: {
        unreadCount: { gt: 0 },
        lastInboundAt: {
          lte: cutoffTime,
          not: null,
        },
        lead: {
          autopilotEnabled: { not: false },
        },
      },
      include: {
        lead: {
          include: {
            contact: true,
            expiryItems: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
      },
    })

    return conversations.map(c => c.lead).filter(Boolean)
  }

  return []
}

/**
 * Check cooldown period
 */
async function checkCooldown(
  rule: any,
  leadId: number
): Promise<{ allowed: boolean; reason?: string }> {
  let conditions: any
  try {
    conditions = rule.conditions 
      ? (typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions)
      : {}
  } catch {
    return { allowed: true }
  }

  // Support both cooldownDays (for scheduled rules) and cooldownMinutes (for INBOUND_MESSAGE)
  const cooldownDays = conditions.cooldownDays || 0
  const cooldownMinutes = conditions.cooldownMinutes || 0

  if (cooldownDays === 0 && cooldownMinutes === 0) {
    return { allowed: true }
  }

  // Check last run for this rule + lead
  const lastRun = await prisma.automationRunLog.findFirst({
    where: {
      ruleId: rule.id,
      leadId,
      status: 'SUCCESS',
    },
    orderBy: { ranAt: 'desc' },
  })

  if (!lastRun) {
    return { allowed: true }
  }

  // Check minutes cooldown (for INBOUND_MESSAGE)
  if (cooldownMinutes > 0) {
    const minutesSince = Math.floor(
      (new Date().getTime() - new Date(lastRun.ranAt).getTime()) / (1000 * 60)
    )
    if (minutesSince < cooldownMinutes) {
      return {
        allowed: false,
        reason: `Cooldown active: ${minutesSince}/${cooldownMinutes} minutes`,
      }
    }
  }

  // Check days cooldown (for scheduled rules)
  if (cooldownDays > 0) {
    const daysSince = Math.floor(
      (new Date().getTime() - new Date(lastRun.ranAt).getTime()) / (1000 * 60 * 60 * 24)
    )
    if (daysSince < cooldownDays) {
      return {
        allowed: false,
        reason: `Cooldown active: ${daysSince}/${cooldownDays} days`,
      }
    }
  }

  return { allowed: true }
}

/**
 * Log automation run
 */
async function logAutomationRun(
  rule: any,
  lead: any,
  result: AutomationResult
): Promise<void> {
  const idempotencyKey = `${rule.key || rule.id}:${lead.id}:${new Date().toISOString().split('T')[0]}`

  try {
    await prisma.automationRunLog.create({
      data: {
        ruleId: rule.id,
        ruleKey: rule.key || null,
        leadId: lead.id,
        contactId: lead.contactId,
        status: result.status,
        reason: result.reason,
        details: JSON.stringify({
          actionsExecuted: result.actionsExecuted,
          errors: result.errors,
        }),
        idempotencyKey: `${rule.key || rule.id}:${lead.id}:${Date.now()}`,
        ranAt: new Date(),
      },
    })
  } catch (error: any) {
    // Idempotency key conflict - that's OK, already logged
    if (error.code !== 'P2002') {
      console.error('Failed to log automation run:', error)
    }
  }
}

