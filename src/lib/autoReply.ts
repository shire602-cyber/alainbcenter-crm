/**
 * Simplified Auto-Reply System
 * 
 * Immediate auto-reply when messages arrive (no queue/worker)
 */

import { prisma } from './prisma'
import { sendTextMessage } from './whatsapp'
import { generateAIAutoresponse, AIMessageMode } from './aiMessaging'
import type { AIMessageContext } from './aiMessaging'
import { retrieveAndGuard, markLeadRequiresHuman } from './ai/retrieverChain'
import { notifyAIUntrainedSubject } from './notifications'
import { createAgentTask } from './automation/agentFallback'

interface AutoReplyOptions {
  leadId: number
  messageId: number
  messageText: string
  channel: string
  contactId: number
}

/**
 * Check if auto-reply should run for this lead
 */
async function shouldAutoReply(leadId: number): Promise<{ shouldReply: boolean; reason?: string }> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      autoReplyEnabled: true,
      mutedUntil: true,
      lastAutoReplyAt: true,
      allowOutsideHours: true,
    },
  })

  if (!lead) {
    return { shouldReply: false, reason: 'Lead not found' }
  }

  // Check if auto-reply is enabled
  if (!lead.autoReplyEnabled) {
    return { shouldReply: false, reason: 'Auto-reply disabled for this lead' }
  }

  // Check if muted
  if (lead.mutedUntil && lead.mutedUntil > new Date()) {
    return { shouldReply: false, reason: `Lead muted until ${lead.mutedUntil.toISOString()}` }
  }

  // Rate limiting: don't reply if replied in last 2 minutes
  if (lead.lastAutoReplyAt) {
    const minutesSinceLastReply = (Date.now() - lead.lastAutoReplyAt.getTime()) / (1000 * 60)
    if (minutesSinceLastReply < 2) {
      return { shouldReply: false, reason: 'Rate limit: replied recently' }
    }
  }

  // Check business hours (if not allowed outside hours)
  if (!lead.allowOutsideHours) {
    const now = new Date()
    const hour = now.getUTCHours() // Adjust for Dubai timezone if needed
    // Dubai is UTC+4, so 9-18 Dubai = 5-14 UTC
    const dubaiHour = (hour + 4) % 24
    if (dubaiHour < 9 || dubaiHour >= 18) {
      return { shouldReply: false, reason: 'Outside business hours (9 AM - 6 PM Dubai time)' }
    }
  }

  return { shouldReply: true }
}

/**
 * Detect if message needs human attention (payment dispute, angry, legal threat, etc.)
 */
function needsHumanAttention(messageText: string): { needsHuman: boolean; reason?: string } {
  const text = messageText.toLowerCase()
  
  // Payment dispute patterns
  if (text.match(/\b(refund|chargeback|dispute|fraud|scam|stolen|unauthorized)\b/)) {
    return { needsHuman: true, reason: 'Payment dispute detected' }
  }
  
  // Angry/urgent patterns
  if (text.match(/\b(angry|furious|complaint|sue|lawyer|legal action|court)\b/)) {
    return { needsHuman: true, reason: 'Urgent/legal matter detected' }
  }
  
  // Complex request patterns
  if (text.match(/\b(complicated|complex|detailed|explain|clarify|confused)\b/) && text.length > 200) {
    return { needsHuman: true, reason: 'Complex request detected' }
  }
  
  return { needsHuman: false }
}

/**
 * Handle immediate auto-reply for inbound message
 */
export async function handleInboundAutoReply(options: AutoReplyOptions): Promise<{
  replied: boolean
  reason?: string
  error?: string
}> {
  const { leadId, messageId, messageText, channel, contactId } = options

  try {
    // Step 1: Check if auto-reply should run
    const shouldReply = await shouldAutoReply(leadId)
    if (!shouldReply.shouldReply) {
      console.log(`⏭️ Skipping auto-reply for lead ${leadId}: ${shouldReply.reason}`)
      return { replied: false, reason: shouldReply.reason }
    }

    // Step 2: Check if needs human attention
    const humanCheck = needsHumanAttention(messageText)
    if (humanCheck.needsHuman) {
      console.log(`⚠️ Human attention needed for lead ${leadId}: ${humanCheck.reason}`)
      
      // Create task for human
      try {
        await createAgentTask(leadId, 'human_request', {
          messageText,
          confidence: 100,
        })
      } catch (error: any) {
        console.error('Failed to create agent task:', error.message)
      }
      
      return { replied: false, reason: humanCheck.reason }
    }

    // Step 3: Load lead and contact
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })

    if (!lead || !lead.contact) {
      return { replied: false, reason: 'Lead or contact not found' }
    }

    // Step 4: Check if AI can respond (retriever-first chain)
    const retrievalResult = await retrieveAndGuard(messageText, {
      similarityThreshold: parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.7'),
      topK: 5,
    })

    if (!retrievalResult.canRespond) {
      // Mark lead and notify users
      await markLeadRequiresHuman(leadId, retrievalResult.reason, messageText)
      
      const conversation = await prisma.conversation.findFirst({
        where: {
          contactId: contactId,
          leadId: leadId,
          channel: channel.toLowerCase(),
        },
      })
      
      await notifyAIUntrainedSubject(
        leadId,
        conversation?.id || null,
        messageText,
        retrievalResult.reason
      )
      
      return { replied: false, reason: 'AI not trained on this subject' }
    }

    // Step 5: Generate AI reply
    const aiContext: AIMessageContext = {
      lead,
      contact: lead.contact,
      recentMessages: lead.messages.map(m => ({
        direction: m.direction,
        body: m.body || '',
        createdAt: m.createdAt,
      })),
      mode: 'QUALIFY' as AIMessageMode, // Default mode
      channel: channel.toUpperCase() as 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT',
    }

    const aiResult = await generateAIAutoresponse(aiContext)

    if (!aiResult.success || !aiResult.text) {
      // Create task if AI fails
      try {
        await createAgentTask(leadId, 'complex_query', {
          messageText,
        })
      } catch (error: any) {
        console.error('Failed to create agent task:', error.message)
      }
      
      return { replied: false, error: aiResult.error || 'Failed to generate AI reply' }
    }

    // Step 6: Send reply immediately
    if (channel.toUpperCase() === 'WHATSAPP' && lead.contact.phone) {
      try {
        const result = await sendTextMessage(lead.contact.phone, aiResult.text)
        
        if (!result || !result.messageId) {
          throw new Error('No message ID returned from WhatsApp')
        }

        // Step 7: Save outbound message
        const conversation = await prisma.conversation.findFirst({
          where: {
            contactId: contactId,
            leadId: leadId,
            channel: channel.toLowerCase(),
          },
        })

        if (conversation) {
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              leadId: leadId,
              contactId: contactId,
              direction: 'OUTBOUND',
              channel: channel.toLowerCase(),
              type: 'text',
              body: aiResult.text,
              status: 'SENT',
              providerMessageId: result.messageId,
              rawPayload: JSON.stringify({
                automation: true,
                autoReply: true,
                aiGenerated: true,
                confidence: aiResult.confidence,
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
              unreadCount: 0,
            },
          })
        }

        // Update lead: mark last auto-reply time
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            lastAutoReplyAt: new Date(),
            lastContactAt: new Date(),
          },
        })

        console.log(`✅ Auto-reply sent to lead ${leadId} via ${channel}`)
        return { replied: true }
      } catch (error: any) {
        console.error(`❌ Failed to send auto-reply:`, error)
        
        // Create task for human
        try {
          await createAgentTask(leadId, 'complex_query', {
            messageText: `Failed to send auto-reply: ${error.message}`,
          })
        } catch (taskError) {
          console.error('Failed to create task:', taskError)
        }
        
        return { replied: false, error: error.message }
      }
    }

    return { replied: false, reason: 'Channel not supported or no phone number' }
  } catch (error: any) {
    console.error('Auto-reply error:', error)
    return { replied: false, error: error.message }
  }
}

