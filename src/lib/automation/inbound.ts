/**
 * Inbound Message Automation Handler
 * 
 * Triggers automation rules when inbound messages arrive
 */

import { prisma } from '../prisma'
import { runRuleOnLead, AutomationContext } from './engine'

/**
 * Run automation rules for an inbound message
 * This is called after a message is stored in the database
 */
export async function runInboundAutomationsForMessage(
  leadId: number,
  message: {
    id: number
    direction: string
    channel: string
    body: string | null
    createdAt: Date
  }
): Promise<void> {
  try {
    // Load lead with all necessary relations
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
      console.warn(`Lead ${leadId} not found for automation`)
      return
    }

    // Check if autopilot is disabled
    if (lead.autopilotEnabled === false) {
      console.log(`Autopilot disabled for lead ${leadId}, skipping automation`)
      return
    }

    // Get all active INBOUND_MESSAGE rules
    // Filter by channel if rule specifies channels
    const allRules = await prisma.automationRule.findMany({
      where: {
        isActive: true,
        enabled: true,
        trigger: 'INBOUND_MESSAGE',
      },
    })

    // Filter rules by channel if conditions specify channels
    const messageChannel = message.channel?.toUpperCase() || 'WHATSAPP'
    const rules = allRules.filter((rule) => {
      try {
        const conditions = rule.conditions 
          ? (typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions)
          : {}
        
        // If rule specifies channels, check if message channel is included
        if (conditions.channels && Array.isArray(conditions.channels)) {
          const allowedChannels = conditions.channels.map((c: string) => c.toUpperCase())
          return allowedChannels.includes(messageChannel)
        }
        
        // If no channels specified, apply to all channels
        return true
      } catch (e) {
        // If conditions can't be parsed, include the rule (fail open)
        return true
      }
    })

    if (rules.length === 0) {
      return // No rules configured
    }

    // Check if we already sent an autoresponse to this inbound message
    // This prevents duplicate autoresponds if automation runs multiple times
    // We check for outbound messages created shortly after this inbound message
    // messageChannel already defined above (line 70)
    const oneMinuteAfter = new Date(message.createdAt.getTime() + 60000)
    
    const existingAutoReply = await prisma.message.findFirst({
      where: {
        conversationId: {
          in: lead.conversations.map((c: any) => c.id),
        },
        channel: message.channel,
        direction: 'OUTBOUND',
        rawPayload: {
          contains: '"automation":true',
        },
        createdAt: {
          gte: message.createdAt,
          lte: oneMinuteAfter,
        },
      },
    })

    if (existingAutoReply) {
      console.log(`⏭️ Autoresponse already sent for message ${message.id}, skipping automation`)
      return
    }

    // Build context with trigger data
    const context: AutomationContext = {
      lead,
      contact: lead.contact,
      expiries: lead.expiryItems,
      recentMessages: lead.messages,
      triggerData: {
        lastMessage: {
          id: message.id,
          direction: message.direction,
          channel: message.channel,
          body: message.body,
          createdAt: message.createdAt,
        },
        channel: messageChannel,
      },
    }

    // Run each rule (non-blocking, don't throw errors)
    for (const rule of rules) {
      try {
        const result = await runRuleOnLead(rule, context)

        // Log result (runRuleOnLead already logs, but we can add extra logging here)
        if (result.status === 'SUCCESS') {
          console.log(
            `✅ Automation rule "${rule.name}" (${rule.id}) executed successfully for lead ${leadId}`
          )
        } else if (result.status === 'SKIPPED') {
          console.log(
            `⏭️ Automation rule "${rule.name}" (${rule.id}) skipped for lead ${leadId}: ${result.reason}`
          )
        } else {
          console.error(
            `❌ Automation rule "${rule.name}" (${rule.id}) failed for lead ${leadId}: ${result.reason}`,
            result.errors
          )
        }
      } catch (error: any) {
        // Don't throw - log and continue with other rules
        console.error(
          `Error running automation rule ${rule.id} for lead ${leadId}:`,
          error.message
        )
      }
    }
  } catch (error: any) {
    // Don't throw - this is called from webhook which must return 200
    console.error(`Error running inbound automations for lead ${leadId}:`, error.message)
  }
}

