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
    // Use select to avoid loading missing columns (infoSharedAt, etc.)
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        contactId: true,
        stage: true,
        pipelineStage: true,
        leadType: true,
        serviceTypeId: true,
        serviceTypeEnum: true,
        priority: true,
        urgency: true,
        aiScore: true,
        nextFollowUpAt: true,
        lastContactAt: true,
        expiryDate: true,
        autopilotEnabled: true,
        status: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        contact: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
            nationality: true,
          },
        },
        expiryItems: {
          orderBy: { expiryDate: 'asc' },
          select: {
            id: true,
            type: true,
            expiryDate: true,
            renewalStatus: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            direction: true,
            channel: true,
            body: true,
            createdAt: true,
          },
        },
        conversations: {
          select: {
            id: true,
            channel: true,
            status: true,
            lastMessageAt: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              select: {
                id: true,
                direction: true,
                body: true,
                createdAt: true,
              },
            },
          },
        },
        // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
      },
    })

    if (!lead) {
      console.warn(`Lead ${leadId} not found for automation`)
      return
    }

    // Check if autopilot is disabled (default to enabled if not set)
    // Note: autopilotEnabled field may not exist in schema, so we check safely
    if (lead.autopilotEnabled === false) {
      console.log(`Autopilot disabled for lead ${leadId}, skipping automation`)
      return
    }
    // If autopilotEnabled is null/undefined, default to enabled (autopilot runs)

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

    // Phase 4: Check for human agent request (before AI processing)
    if (message.body && message.body.trim().length > 0) {
      const { detectHumanAgentRequest, createAgentTask } = await import('./agentFallback')
      const humanRequest = detectHumanAgentRequest(message.body)
      
      if (humanRequest.isRequestingHuman && humanRequest.confidence >= 50) {
        // Customer wants human agent - create task immediately
        try {
          await createAgentTask(lead.id, 'human_request', {
            messageId: message.id,
            messageText: message.body,
            confidence: humanRequest.confidence,
          })
          
          // Also update lead to indicate human intervention needed
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              notes: lead.notes 
                ? `${lead.notes}\n\n[System]: Customer requested human agent on ${new Date().toISOString()}`
                : `[System]: Customer requested human agent on ${new Date().toISOString()}`,
            },
          })
          
          console.log(`⚠️ Human agent requested for lead ${lead.id} - task created`)
        } catch (error: any) {
          console.error('Failed to create agent task for human request:', error.message)
        }
      }
    }

    // Phase 1: Extract data from message using AI (non-blocking)
    if (message.body && message.body.trim().length > 0) {
      try {
        const { extractLeadDataFromMessage } = await import('../ai/extractData')
        const extracted = await extractLeadDataFromMessage(
          message.body,
          lead.contact,
          lead
        )

        // Only update if confidence is reasonable (>50) and data is new/better
        if (extracted.confidence > 50) {
          const updates: any = {}
          const contactUpdates: any = {}

          // Update contact if we have better info
          if (extracted.name && (!lead.contact.fullName || lead.contact.fullName.includes('Unknown') || lead.contact.fullName.includes('WhatsApp'))) {
            contactUpdates.fullName = extracted.name
          }
          if (extracted.email && !lead.contact.email) {
            contactUpdates.email = extracted.email
          }
          if (extracted.phone && !lead.contact.phone) {
            contactUpdates.phone = extracted.phone
          }
          if (extracted.nationality && !lead.contact.nationality) {
            contactUpdates.nationality = extracted.nationality
          }

          // Update lead if we have better info
          if (extracted.serviceType && !lead.leadType && !lead.serviceTypeId) {
            // SQLite doesn't support case-insensitive mode, use contains (case-sensitive)
            const serviceType = await prisma.serviceType.findFirst({
              where: {
                OR: [
                  { name: { contains: extracted.serviceType } },
                  { code: extracted.serviceTypeEnum || undefined },
                ],
              },
            })
            if (serviceType) {
              updates.serviceTypeId = serviceType.id
              updates.leadType = serviceType.name
            } else {
              updates.leadType = extracted.serviceType
            }
          }
          if (extracted.serviceTypeEnum && !lead.serviceTypeEnum) {
            updates.serviceTypeEnum = extracted.serviceTypeEnum
          }
          if (extracted.urgency && !lead.urgency) {
            updates.urgency = extracted.urgency.toUpperCase()
          }
          if (extracted.expiryDate) {
            try {
              const parsedDate = new Date(extracted.expiryDate)
              if (!isNaN(parsedDate.getTime()) && !lead.expiryDate) {
                updates.expiryDate = parsedDate
              }
            } catch {
              // Ignore invalid dates
            }
          }
          if (extracted.notes) {
            updates.notes = lead.notes 
              ? `${lead.notes}\n\n[AI Extracted]: ${extracted.notes}`
              : extracted.notes
          }

          // Apply updates
          if (Object.keys(contactUpdates).length > 0) {
            await prisma.contact.update({
              where: { id: lead.contact.id },
              data: contactUpdates,
            })
          }

          if (Object.keys(updates).length > 0) {
            await prisma.lead.update({
              where: { id: lead.id },
              data: updates,
            })
          }
        }
      } catch (extractError: any) {
        // Don't fail automation if extraction fails
        console.warn('AI data extraction failed in automation (non-blocking):', extractError.message)
      }
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


