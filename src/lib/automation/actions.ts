/**
 * Automation Action Executors
 * 
 * Executes various automation actions like sending messages, creating tasks, etc.
 */

import { prisma } from '../prisma'
import { sendWhatsAppMessage } from '../whatsappClient'
import { sendEmailMessage } from '../emailClient'
import { interpolateTemplate } from '../templateInterpolation'
import { AutomationContext } from './engine'
import { generateAIAutoresponse, AIMessageMode } from '../aiMessaging'
import type { AIMessageContext } from '../aiMessaging'
import { sendTextMessage } from '../whatsapp'
import { requalifyLeadFromConversation } from '../aiQualification'

export interface ActionResult {
  success: boolean
  error?: string
  data?: any
  hint?: string // Additional guidance for errors
  requiresTemplate?: boolean // Indicates template is required (for WhatsApp)
  hoursSinceLastInbound?: number | null // Hours since last inbound message (for WhatsApp)
  requiresHuman?: boolean // Indicates human intervention is required
}

/**
 * Execute a list of actions
 */
export async function runActions(
  actions: any[],
  context: AutomationContext
): Promise<ActionResult[]> {
  const results: ActionResult[] = []

  for (const action of actions) {
    try {
      const result = await executeAction(action, context)
      results.push(result)
    } catch (error: any) {
      results.push({
        success: false,
        error: error.message || 'Unknown error',
      })
    }
  }

  return results
}

/**
 * Execute a single action
 */
async function executeAction(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead, contact } = context

  switch (action.type) {
    case 'SEND_WHATSAPP_TEMPLATE':
    case 'SEND_WHATSAPP':
      return await executeSendWhatsApp(action, context)

    case 'SEND_EMAIL_TEMPLATE':
    case 'SEND_EMAIL':
      return await executeSendEmail(action, context)

    case 'CREATE_TASK':
      return await executeCreateTask(action, context)

    case 'SET_NEXT_FOLLOWUP':
      return await executeSetNextFollowup(action, context)

    case 'UPDATE_STAGE':
      return await executeUpdateStage(action, context)

    case 'ASSIGN_TO_USER':
      return await executeAssignToUser(action, context)

    case 'SET_PRIORITY':
      return await executeSetPriority(action, context)

    case 'SEND_AI_REPLY':
      return await executeSendAIReply(action, context)

    case 'REQUALIFY_LEAD':
      return await executeRequalifyLead(action, context)

    case 'EXTRACT_AND_UPDATE_LEAD_DATA':
      return await executeExtractAndUpdateLeadData(action, context)

    case 'CREATE_AGENT_TASK':
      return await executeCreateAgentTask(action, context)

    default:
      return {
        success: false,
        error: `Unknown action type: ${action.type}`,
      }
  }
}

/**
 * Send WhatsApp message
 */
async function executeSendWhatsApp(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead, contact } = context

  if (!contact.phone) {
    return {
      success: false,
      error: 'Contact has no phone number',
    }
  }

  // Get message template
  let message = action.message || action.template || ''

  // Use template key if provided
  if (action.templateKey && !message) {
    // Look up template from rule or template library
    message = action.templateKey // For now, use as-is (could load from DB)
  }

  // Interpolate template variables
  message = interpolateTemplate(message, context)

  // Send via WhatsApp
  const result = await sendWhatsAppMessage(contact.phone, message)

  if (result.success) {
    // Create message record
    try {
      let conversation = await prisma.conversation.findFirst({
        where: {
          contactId: contact.id,
          channel: 'whatsapp',
        },
      })

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            contactId: contact.id,
            leadId: lead.id,
            channel: 'whatsapp',
            status: 'open',
          },
        })
      }

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          leadId: lead.id,
          contactId: contact.id,
          direction: 'OUTBOUND',
          channel: 'whatsapp',
          type: 'text',
          body: message,
          status: result.messageId ? 'SENT' : 'PENDING',
          providerMessageId: result.messageId || null,
          sentAt: new Date(),
        },
      })

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastOutboundAt: new Date(),
        },
      })

      // Update lead
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          lastContactAt: new Date(),
          lastContactChannel: 'whatsapp',
        },
      })
    } catch (error) {
      console.error('Failed to create message record:', error)
      // Continue - message was sent
    }
  }

  return {
    success: result.success,
    error: result.error,
    data: {
      messageId: result.messageId,
    },
  }
}

/**
 * Send email
 */
async function executeSendEmail(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead, contact } = context

  if (!contact.email) {
    return {
      success: false,
      error: 'Contact has no email address',
    }
  }

  const subject = interpolateTemplate(action.subject || 'Message from Alain Business Center', context)
  const body = interpolateTemplate(action.body || action.template || '', context)

  const result = await sendEmailMessage(contact.email, subject, body)

  return {
    success: result.success,
    error: result.error,
    data: {
      messageId: result.messageId,
    },
  }
}

/**
 * Create task
 */
async function executeCreateTask(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead } = context

  const title = interpolateTemplate(action.title || 'Follow-up task', context)
  const type = action.taskType || 'FOLLOW_UP'
  
  // Calculate due date
  let dueAt: Date | null = null
  if (action.daysFromNow) {
    dueAt = new Date()
    dueAt.setDate(dueAt.getDate() + action.daysFromNow)
  } else if (action.dueAt) {
    dueAt = new Date(action.dueAt)
  }

  try {
    const task = await prisma.task.create({
      data: {
        leadId: lead.id,
        title,
        type,
        dueAt,
        status: 'OPEN',
        assignedUserId: action.assignedUserId || lead.assignedUserId || null,
        aiSuggested: true,
      },
    })

    return {
      success: true,
      data: { taskId: task.id },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create task',
    }
  }
}

/**
 * Set next follow-up date
 */
async function executeSetNextFollowup(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead } = context

  const daysFromNow = action.daysFromNow || 1
  const nextFollowUpAt = new Date()
  nextFollowUpAt.setDate(nextFollowUpAt.getDate() + daysFromNow)

  try {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { nextFollowUpAt },
    })

    return {
      success: true,
      data: { nextFollowUpAt },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to set follow-up',
    }
  }
}

/**
 * Update lead stage
 */
async function executeUpdateStage(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead } = context

  const newStage = action.stage
  if (!newStage) {
    return {
      success: false,
      error: 'Stage not specified',
    }
  }

  try {
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        stage: newStage,
        pipelineStage: newStage.toLowerCase(),
      },
    })

    return {
      success: true,
      data: { stage: newStage },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to update stage',
    }
  }
}

/**
 * Assign lead to user
 */
async function executeAssignToUser(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead } = context

  const userId = action.userId
  if (!userId) {
    return {
      success: false,
      error: 'User ID not specified',
    }
  }

  try {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { assignedUserId: userId },
    })

    return {
      success: true,
      data: { userId },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to assign user',
    }
  }
}

/**
 * Set lead priority
 */
async function executeSetPriority(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead } = context

  const priority = action.priority
  if (!priority || !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) {
    return {
      success: false,
      error: 'Invalid priority value',
    }
  }

  try {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { priority },
    })

    return {
      success: true,
      data: { priority },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to set priority',
    }
  }
}

/**
 * Send AI-generated reply
 */
async function executeSendAIReply(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead, contact } = context

  // Determine channel: use trigger message's channel if available, otherwise use action's channel
  const triggerChannel = context.triggerData?.channel || context.triggerData?.lastMessage?.channel
  const channel = (triggerChannel || action.channel || 'WHATSAPP').toUpperCase() as 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'
  const mode = (action.mode || 'GENERIC').toUpperCase() as AIMessageMode

  // Get recent messages for context
  const recentMessages = context.recentMessages || []
  const lastMessage = recentMessages[0] || context.triggerData?.lastMessage
  const userQuery = lastMessage?.body || ''

  // RETRIEVER-FIRST CHAIN: Check if AI can respond before generating reply
  if (userQuery) {
    try {
      const { retrieveAndGuard, markLeadRequiresHuman } = await import('@/lib/ai/retrieverChain')
      const retrievalResult = await retrieveAndGuard(userQuery, {
        similarityThreshold: parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.7'),
        topK: 5,
      })

      if (!retrievalResult.canRespond) {
        // Mark lead as requiring human intervention
        await markLeadRequiresHuman(lead.id, retrievalResult.reason, userQuery)

        // Send polite message to user
        const politeMessage = retrievalResult.suggestedResponse || 
          "I'm only trained to assist with specific business topics. Let me get a human agent for you."

        // Send the polite message via the channel
        if (channel === 'WHATSAPP' && contact.phone) {
          try {
            const { sendTextMessage } = await import('../whatsapp')
            await sendTextMessage(contact.phone, politeMessage)
            
            // Create message record
            const conversation = await prisma.conversation.findFirst({
              where: {
                contactId: contact.id,
                channel: 'whatsapp',
                leadId: lead.id,
              },
            })

            if (conversation) {
              await prisma.message.create({
                data: {
                  conversationId: conversation.id,
                  leadId: lead.id,
                  contactId: contact.id,
                  direction: 'OUTBOUND',
                  channel: 'whatsapp',
                  type: 'text',
                  body: politeMessage,
                  status: 'SENT',
                  rawPayload: JSON.stringify({
                    automation: true,
                    requiresHuman: true,
                    reason: retrievalResult.reason,
                  }),
                  sentAt: new Date(),
                },
              })
            }
          } catch (error: any) {
            console.error('Failed to send polite message:', error)
          }
        }

        return {
          success: false,
          error: retrievalResult.reason,
          requiresHuman: true,
        }
      }
    } catch (retrievalError: any) {
      console.error('Retriever chain error in automation:', retrievalError)
      // Continue to AI generation if retrieval fails (fail-open for now)
    }
  }

  // Generate AI reply (only if retrieval passed)
  const aiContext: AIMessageContext = {
    lead,
    contact,
    recentMessages,
    mode,
    channel: channel as 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT',
  }
  const aiResult = await generateAIAutoresponse(aiContext)

  if (!aiResult.success || !aiResult.text) {
    // Phase 4: If AI fails, create agent task
    try {
      const { createAgentTask } = await import('./agentFallback')
      await createAgentTask(lead.id, 'complex_query', {
        messageText: recentMessages[0]?.body || 'Unknown',
      })
    } catch (error: any) {
      console.error('Failed to create agent task after AI failure:', error.message)
    }

    return {
      success: false,
      error: aiResult.error || 'Failed to generate AI reply',
    }
  }

  // Phase 4: Check AI confidence - if low, create agent task
  if (aiResult.confidence !== undefined && aiResult.confidence < 70) {
    try {
      const { createAgentTask } = await import('./agentFallback')
      await createAgentTask(lead.id, 'low_confidence', {
        confidence: aiResult.confidence,
        messageText: recentMessages[0]?.body || 'Unknown',
      })
    } catch (error: any) {
      console.warn('Failed to create agent task for low confidence:', error.message)
    }
  }

  // Send message based on channel
  if (channel === 'WHATSAPP') {
    if (!contact.phone) {
      return {
        success: false,
        error: 'Contact has no phone number',
      }
    }

    try {
      // Get or create conversation to check 24-hour window
      let conversation = await prisma.conversation.findFirst({
        where: {
          contactId: contact.id,
          channel: 'whatsapp',
          leadId: lead.id,
        },
      })

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            contactId: contact.id,
            leadId: lead.id,
            channel: 'whatsapp',
            status: 'open',
          },
        })
      }

      // Check 24-hour messaging window for WhatsApp
      // WhatsApp Business API only allows free-form messages within 24 hours of customer's last message
      // BUT: For INBOUND_MESSAGE triggers, we're responding to a message that just arrived, so we're always within window
      const isInboundTrigger = context.triggerData?.lastMessage?.direction === 'INBOUND' || 
                                context.triggerData?.lastMessage?.direction === 'IN'
      
      const now = new Date()
      const lastInboundAt = conversation.lastInboundAt || null
      
      let within24HourWindow = false
      
      // If this is an inbound message trigger, we're definitely within the 24-hour window
      if (isInboundTrigger) {
        within24HourWindow = true
        console.log('✅ INBOUND_MESSAGE trigger - within 24-hour window (responding to just-received message)')
      } else if (lastInboundAt) {
        const hoursSinceLastInbound = (now.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60)
        within24HourWindow = hoursSinceLastInbound <= 24
        console.log(`⏰ Checking 24-hour window: ${Math.round(hoursSinceLastInbound * 10) / 10} hours since last inbound`)
      } else {
        // If no inbound message, we can send (first message to customer)
        within24HourWindow = true
        console.log('✅ No previous inbound messages - can send')
      }

      // If outside 24-hour window, cannot send free-form AI message
      if (!within24HourWindow) {
        console.warn(`⚠️ Outside 24-hour window: ${lastInboundAt ? Math.round((now.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60)) : 'never'} hours since last inbound`)
        return {
          success: false,
          error: 'Cannot send AI-generated message outside 24-hour window',
          hint: `WhatsApp Business API requires pre-approved templates for messages sent more than 24 hours after the customer's last message. Last inbound message was ${lastInboundAt ? Math.round((now.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60)) : 'never'} hours ago. Please use a template message instead.`,
          requiresTemplate: true,
          hoursSinceLastInbound: lastInboundAt 
            ? Math.round((now.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60))
            : null,
        }
      }

      // Send via WhatsApp Cloud API (within 24-hour window)
      console.log(`📤 Sending WhatsApp message to ${contact.phone} (${aiResult.text.substring(0, 50)}...)`)
      let result: { messageId: string; waId?: string }
      try {
        result = await sendTextMessage(contact.phone, aiResult.text)
      } catch (error: any) {
        console.error('❌ WhatsApp send failed:', error)
        return {
          success: false,
          error: error.message || 'Failed to send WhatsApp message',
        }
      }

      if (!result || !result.messageId) {
        console.error('❌ WhatsApp send failed: No message ID returned', result)
        return {
          success: false,
          error: 'Failed to send WhatsApp message - no message ID returned',
        }
      }

      console.log(`✅ WhatsApp message sent successfully: ${result.messageId}`)

      // Conversation already retrieved above for 24-hour check

      // Create message record
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          leadId: lead.id,
          contactId: contact.id,
          direction: 'OUTBOUND',
          channel: 'whatsapp',
          type: 'text',
          body: aiResult.text,
          status: result.messageId ? 'SENT' : 'FAILED',
          providerMessageId: result.messageId || null,
          rawPayload: JSON.stringify({
            automation: true,
            actionType: 'SEND_AI_REPLY',
            mode,
            aiGenerated: true,
            channel: 'WHATSAPP',
            confidence: aiResult.confidence,
          }),
          sentAt: new Date(),
        },
      })
      
      console.log(`✅ Message record created in database`)

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastOutboundAt: new Date(),
        },
      })

      // Update lead
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          lastContactAt: new Date(),
          lastContactChannel: 'whatsapp',
        },
      })

      return {
        success: true,
        data: {
          messageId: result.messageId,
          text: aiResult.text.substring(0, 100) + '...',
        },
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send WhatsApp message',
      }
    }
  } else if (channel === 'EMAIL') {
    if (!contact.email) {
      return {
        success: false,
        error: 'Contact has no email address',
      }
    }

    try {
      // Generate subject based on mode
      const subjectMap: Record<AIMessageMode, string> = {
        FOLLOW_UP: 'Follow-up from Alain Business Center',
        QUALIFY: 'Thank you for your interest',
        RENEWAL: 'Renewal reminder from Alain Business Center',
        PRICING: 'Pricing information',
        DOCS: 'Document Request - Alain Business Center',
        REMIND: 'Reminder from Alain Business Center',
        BOOK_CALL: 'Schedule a call with us',
        GENERIC: 'Message from Alain Business Center',
      }
      const subject = subjectMap[mode] || 'Message from Alain Business Center'

      // Send via email client
      const result = await sendEmailMessage(contact.email, subject, aiResult.text)

      // Get or create conversation
      let conversation = await prisma.conversation.findFirst({
        where: {
          contactId: contact.id,
          channel: 'email',
          leadId: lead.id,
        },
      })

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            contactId: contact.id,
            leadId: lead.id,
            channel: 'email',
            status: 'open',
          },
        })
      }

      // Create message record
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          leadId: lead.id,
          contactId: contact.id,
          direction: 'OUTBOUND',
          channel: 'email',
          type: 'text',
          body: aiResult.text,
          status: result.success && result.messageId ? 'SENT' : 'FAILED',
          providerMessageId: result.messageId || null,
          rawPayload: JSON.stringify({
            automation: true,
            actionType: 'SEND_AI_REPLY',
            mode,
            aiGenerated: true,
            channel: 'EMAIL',
            subject,
          }),
          sentAt: new Date(),
        },
      })

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastOutboundAt: new Date(),
        },
      })

      // Update lead
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          lastContactAt: new Date(),
          lastContactChannel: 'email',
        },
      })

      return {
        success: result.success,
        data: {
          messageId: result.messageId,
          text: aiResult.text.substring(0, 100) + '...',
        },
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send email',
      }
    }
  } else if (channel === 'INSTAGRAM' || channel === 'FACEBOOK') {
    // Instagram/Facebook sending via Meta Graph API
    // TODO: Implement Meta Graph API sending when integration is configured
    // For now, log and skip
    console.log(`⏭️ ${channel} autoresponse skipped: channel adapter not yet implemented`)
    
    // Still create message record with SKIPPED status for audit
    let conversation = await prisma.conversation.findFirst({
      where: {
        contactId: contact.id,
        channel: channel.toLowerCase(),
        leadId: lead.id,
      },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          leadId: lead.id,
          channel: channel.toLowerCase(),
          status: 'open',
        },
      })
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        direction: 'OUTBOUND',
        channel: channel.toLowerCase(),
        type: 'text',
        body: aiResult.text,
        status: 'FAILED', // Mark as failed since we can't send yet
        rawPayload: JSON.stringify({
          automation: true,
          actionType: 'SEND_AI_REPLY',
          mode,
          aiGenerated: true,
          skipped: true,
          reason: 'Channel adapter not yet implemented',
        }),
        sentAt: new Date(),
      },
    })

    return {
      success: false,
      error: `${channel} channel adapter not yet implemented`,
    }
  } else if (channel === 'WEBCHAT') {
    // Webchat - typically sent via API endpoint
    // TODO: Implement webchat sending when chat widget is configured
    console.log(`⏭️ WEBCHAT autoresponse skipped: channel adapter not yet implemented`)
    
    // Create message record with SKIPPED status
    let conversation = await prisma.conversation.findFirst({
      where: {
        contactId: contact.id,
        channel: 'webchat',
        leadId: lead.id,
      },
    })

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          leadId: lead.id,
          channel: 'webchat',
          status: 'open',
        },
      })
    }

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        direction: 'OUTBOUND',
        channel: 'webchat',
        type: 'text',
        body: aiResult.text,
        status: 'FAILED',
        rawPayload: JSON.stringify({
          automation: true,
          actionType: 'SEND_AI_REPLY',
          mode,
          aiGenerated: true,
          skipped: true,
          reason: 'Channel adapter not yet implemented',
        }),
        sentAt: new Date(),
      },
    })

    return {
      success: false,
      error: 'WEBCHAT channel adapter not yet implemented',
    }
  }

  return {
    success: false,
    error: `Unsupported channel: ${channel}`,
  }
}

/**
 * Re-qualify lead from conversation
 */
async function executeRequalifyLead(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead } = context

  try {
    await requalifyLeadFromConversation(lead.id)

    return {
      success: true,
      data: {
        leadId: lead.id,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to re-qualify lead',
    }
  }
}

/**
 * Extract and update lead data from message (Phase 1)
 */
async function executeExtractAndUpdateLeadData(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead, contact, triggerData } = context

  try {
    // Get the last message from trigger data
    const lastMessage = triggerData?.lastMessage
    if (!lastMessage || !lastMessage.body) {
      return {
        success: false,
        error: 'No message body to extract data from',
      }
    }

    const { extractLeadDataFromMessage } = await import('../ai/extractData')
    const extracted = await extractLeadDataFromMessage(
      lastMessage.body,
      contact,
      lead
    )

    // Only update if confidence is reasonable
    if (extracted.confidence < 50) {
      return {
        success: false,
        error: `Low confidence (${extracted.confidence}) - skipping extraction`,
      }
    }

    const updates: any = {}
    const contactUpdates: any = {}

    // Update contact if we have better info
    if (extracted.name && (!contact.fullName || contact.fullName.includes('Unknown') || contact.fullName.includes('WhatsApp'))) {
      contactUpdates.fullName = extracted.name
    }
    if (extracted.email && !contact.email) {
      contactUpdates.email = extracted.email
    }
    if (extracted.phone && !contact.phone) {
      contactUpdates.phone = extracted.phone
    }
    if (extracted.nationality && !contact.nationality) {
      contactUpdates.nationality = extracted.nationality
    }

    // Update lead if we have better info
    if (extracted.serviceType && !lead.leadType && !lead.serviceTypeId) {
      // Try to find matching ServiceType
            // Use contains for text search (works for both SQLite and PostgreSQL)
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
        where: { id: contact.id },
        data: contactUpdates,
      })
    }

    if (Object.keys(updates).length > 0) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: updates,
      })
    }

    return {
      success: true,
      data: {
        leadId: lead.id,
        extracted,
        fieldsUpdated: Object.keys(updates).length + Object.keys(contactUpdates).length,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to extract and update lead data',
    }
  }
}

/**
 * Create agent task (Phase 4)
 */
async function executeCreateAgentTask(
  action: any,
  context: AutomationContext
): Promise<ActionResult> {
  const { lead, triggerData } = context

  try {
    const { createAgentTask } = await import('./agentFallback')
    
    const reason = action.reason || 'complex_query'
    const priority = action.priority || 'NORMAL'
    
    // Extract details from trigger data
    const details: any = {}
    if (triggerData?.lastMessage) {
      details.messageId = triggerData.lastMessage.id
      details.messageText = triggerData.lastMessage.body
    }
    if (triggerData?.daysSinceLastContact) {
      details.daysSinceLastContact = triggerData.daysSinceLastContact
    }
    if (triggerData?.hoursOverdue) {
      details.daysOverdue = Math.floor(triggerData.hoursOverdue / 24)
    }
    if (triggerData?.confidence) {
      details.confidence = triggerData.confidence
    }

    const taskId = await createAgentTask(lead.id, reason, details)

    // Priority is already stored in lead notes by createAgentTask
    // Task model doesn't have priority field, so no update needed

    return {
      success: true,
      data: {
        taskId,
        leadId: lead.id,
        reason,
      },
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to create agent task',
    }
  }
}


