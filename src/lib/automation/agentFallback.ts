/**
 * Agent Fallback System (Phase 4)
 * 
 * Detects when AI cannot handle a situation and escalates to human agents
 * - Low AI confidence → Create task
 * - Human/agent requests → Route to agent
 * - Un-replied leads → Escalate
 * - Overdue follow-ups → Task for agent
 */

import { prisma } from '../prisma'

/**
 * Detect if customer is requesting to speak to a human agent
 */
export function detectHumanAgentRequest(messageText: string): {
  isRequestingHuman: boolean
  confidence: number // 0-100
  keywords: string[]
} {
  const text = messageText.toLowerCase()
  
  // Keywords that indicate customer wants human agent
  const humanRequestKeywords = [
    'speak to human',
    'talk to human',
    'speak to agent',
    'talk to agent',
    'speak to person',
    'talk to person',
    'real person',
    'human agent',
    'human representative',
    'customer service',
    'customer support',
    'support agent',
    'not a bot',
    'not automated',
    'stop bot',
    'stop automated',
    'connect me to',
    'transfer me to',
    'i want to speak',
    'i need to speak',
    'can i speak',
    'may i speak',
    'let me speak',
    'get me a person',
    'get me an agent',
    'i need help from',
    'escalate',
    'escalation',
  ]

  const foundKeywords: string[] = []
  let matchCount = 0

  for (const keyword of humanRequestKeywords) {
    if (text.includes(keyword)) {
      foundKeywords.push(keyword)
      matchCount++
    }
  }

  // Calculate confidence based on number of matches
  const confidence = Math.min(100, matchCount * 20 + (foundKeywords.length > 0 ? 30 : 0))

  return {
    isRequestingHuman: foundKeywords.length > 0,
    confidence,
    keywords: foundKeywords,
  }
}

/**
 * Create a task for an agent when AI cannot handle
 */
export async function createAgentTask(
  leadId: number,
  reason: 'low_confidence' | 'human_request' | 'no_reply_sla' | 'overdue_followup' | 'stale_lead' | 'complex_query',
  details: {
    messageId?: number
    confidence?: number
    messageText?: string
    daysSinceLastContact?: number
    daysOverdue?: number
  }
): Promise<number> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { contact: true },
  })

  if (!lead) {
    throw new Error(`Lead ${leadId} not found`)
  }

  // Determine task title and description based on reason
  let title = ''
  let description = ''
  let priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' = 'NORMAL'
  let dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + 1) // Due tomorrow by default

  switch (reason) {
    case 'low_confidence':
      title = `AI Low Confidence - Review Lead ${leadId}`
      description = `AI confidence is ${details.confidence || 'low'}%. Please review and respond manually.`
      priority = 'NORMAL'
      break

    case 'human_request':
      title = `Customer Requested Human Agent - Lead ${leadId}`
      description = `Customer explicitly requested to speak to a human agent. Please respond promptly.`
      priority = 'HIGH'
      dueDate = new Date() // Due today
      break

    case 'no_reply_sla':
      title = `SLA Breach - No Reply to Lead ${leadId}`
      description = `No reply sent within SLA threshold. Last inbound message was ${details.daysSinceLastContact || 'unknown'} days ago.`
      priority = 'URGENT'
      dueDate = new Date() // Due immediately
      break

    case 'overdue_followup':
      title = `Overdue Follow-up - Lead ${leadId}`
      description = `Follow-up is ${details.daysOverdue || 'overdue'}. Please contact customer.`
      priority = 'HIGH'
      dueDate = new Date() // Due immediately
      break

    case 'stale_lead':
      title = `Stale Lead - Review Lead ${leadId}`
      description = `Lead has been inactive for ${details.daysSinceLastContact || 'many'} days. Please review and re-engage.`
      priority = 'NORMAL'
      break

    case 'complex_query':
      title = `Complex Query - Lead ${leadId} Needs Review`
      description = `Customer query appears complex. AI may not handle it adequately. Please review.`
      priority = 'NORMAL'
      break
  }

  // Add message context if available
  if (details.messageText) {
    description += `\n\nLast message: "${details.messageText.substring(0, 200)}"`
  }

  // Create task
  const task = await prisma.task.create({
    data: {
      leadId,
      title,
      description,
      taskType: 'FOLLOW_UP',
      priority,
      dueDate,
      status: 'PENDING',
      assignedUserId: lead.assignedUserId || null, // Assign to lead's assigned user if available
      createdByUserId: null, // System-created
      meta: JSON.stringify({
        reason,
        ...details,
        autoCreated: true,
        createdAt: new Date().toISOString(),
      }),
    },
  })

  console.log(`✅ Created agent task ${task.id} for lead ${leadId} (reason: ${reason})`)

  // If no assigned user, try to assign to a manager or admin
  if (!task.assignedUserId) {
    const manager = await prisma.user.findFirst({
      where: {
        role: { in: ['MANAGER', 'ADMIN'] },
      },
    })

    if (manager) {
      await prisma.task.update({
        where: { id: task.id },
        data: { assignedUserId: manager.id },
      })
    }
  }

  return task.id
}

/**
 * Check if lead needs agent escalation
 */
export async function checkLeadNeedsEscalation(leadId: number): Promise<{
  needsEscalation: boolean
  reason: string | null
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
}> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
      tasks: {
        where: {
          status: { not: 'COMPLETED' },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
        include: {
          assignedUser: true,
        },
      },
    },
  })

  if (!lead) {
    return { needsEscalation: false, reason: null, priority: 'NORMAL' }
  }

  const now = new Date()

  // Check 1: No reply SLA breach (15 minutes for inbound messages)
  const lastInbound = lead.messages.find(
    (m) => m.direction === 'INBOUND' || m.direction === 'IN'
  )
  if (lastInbound) {
    const minutesSinceInbound = Math.floor(
      (now.getTime() - lastInbound.createdAt.getTime()) / (1000 * 60)
    )
    const lastOutbound = lead.messages.find(
      (m) =>
        (m.direction === 'OUTBOUND' || m.direction === 'OUT') &&
        m.createdAt > lastInbound.createdAt
    )

    if (!lastOutbound && minutesSinceInbound >= 15) {
      return {
        needsEscalation: true,
        reason: `No reply sent within SLA (${minutesSinceInbound} minutes since last inbound)`,
        priority: minutesSinceInbound >= 60 ? 'URGENT' : 'HIGH',
      }
    }
  }

  // Check 2: Overdue follow-up
  if (lead.nextFollowUpAt && lead.nextFollowUpAt < now) {
    const hoursOverdue = Math.floor(
      (now.getTime() - lead.nextFollowUpAt.getTime()) / (1000 * 60 * 60)
    )
    return {
      needsEscalation: true,
      reason: `Follow-up overdue by ${hoursOverdue} hours`,
      priority: hoursOverdue >= 24 ? 'URGENT' : 'HIGH',
    }
  }

  // Check 3: Stale lead (no activity for 7+ days)
  const lastContactAt = lead.lastContactAt || lead.createdAt
  const daysSinceContact = Math.floor(
    (now.getTime() - lastContactAt.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (daysSinceContact >= 7 && lead.stage !== 'COMPLETED_WON' && lead.stage !== 'LOST') {
    return {
      needsEscalation: true,
      reason: `Lead inactive for ${daysSinceContact} days`,
      priority: daysSinceContact >= 14 ? 'HIGH' : 'NORMAL',
    }
  }

  // Check 4: Low AI score and no recent activity
  if (lead.aiScore !== null && lead.aiScore < 30 && daysSinceContact >= 3) {
    return {
      needsEscalation: true,
      reason: `Low AI score (${lead.aiScore}) and no recent activity`,
      priority: 'NORMAL',
    }
  }

  return { needsEscalation: false, reason: null, priority: 'NORMAL' }
}

