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
import { detectLanguage } from './utils/languageDetection'

interface AutoReplyOptions {
  leadId: number
  messageId: number
  messageText: string
  channel: string
  contactId: number
}

/**
 * Check if auto-reply should run for this lead
 * @param leadId - Lead ID
 * @param isFirstMessage - Whether this is the first message from the customer
 */
async function shouldAutoReply(leadId: number, isFirstMessage: boolean = false): Promise<{ shouldReply: boolean; reason?: string }> {
  console.log(`🔍 Checking shouldAutoReply for lead ${leadId} (isFirstMessage: ${isFirstMessage})`)
  
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
    console.log(`❌ Lead ${leadId} not found`)
    return { shouldReply: false, reason: 'Lead not found' }
  }

  console.log(`📊 Lead ${leadId} auto-reply settings:`, {
    autoReplyEnabled: lead.autoReplyEnabled,
    mutedUntil: lead.mutedUntil,
    lastAutoReplyAt: lead.lastAutoReplyAt,
    allowOutsideHours: lead.allowOutsideHours,
  })

  // Check if auto-reply is enabled (treat NULL/undefined as true for backward compatibility)
  // Default to true if not explicitly set to false
  if (lead.autoReplyEnabled === false) {
    console.log(`⏭️ Auto-reply disabled for lead ${leadId}`)
    return { shouldReply: false, reason: 'Auto-reply disabled for this lead' }
  }
  // If NULL or undefined, default to true (for leads created before migration)
  console.log(`✅ Auto-reply enabled for lead ${leadId} (autoReplyEnabled: ${lead.autoReplyEnabled ?? 'null/undefined - defaulting to true'})`)

  // Check if muted
  if (lead.mutedUntil && lead.mutedUntil > new Date()) {
    console.log(`⏭️ Lead ${leadId} muted until ${lead.mutedUntil.toISOString()}`)
    return { shouldReply: false, reason: `Lead muted until ${lead.mutedUntil.toISOString()}` }
  }

  // Rate limiting: don't reply if replied in last 2 minutes
  // BUT: Always allow first message replies (24/7, no rate limit)
  if (!isFirstMessage && lead.lastAutoReplyAt) {
    const minutesSinceLastReply = (Date.now() - lead.lastAutoReplyAt.getTime()) / (1000 * 60)
    console.log(`⏱️ Last auto-reply was ${minutesSinceLastReply.toFixed(1)} minutes ago`)
    if (minutesSinceLastReply < 2) {
      console.log(`⏭️ Rate limit: replied ${minutesSinceLastReply.toFixed(1)} minutes ago`)
      return { shouldReply: false, reason: 'Rate limit: replied recently' }
    }
  } else if (isFirstMessage) {
    console.log(`✅ First message - rate limit bypassed`)
  }

  // Business hours check:
  // - First contact: 24/7 (important for marketing campaigns)
  // - Follow-ups: 24/7 if allowOutsideHours=true (for sales), otherwise 7 AM - 9:30 PM Dubai time
  if (!isFirstMessage) {
    // Check if lead has allowOutsideHours enabled (for sales - 24/7 support)
    if (lead.allowOutsideHours) {
      console.log(`✅ allowOutsideHours=true - 24/7 auto-reply enabled for follow-ups (sales mode)`)
    } else {
      // Apply business hours restriction for customer support
      const now = new Date()
      const utcHour = now.getUTCHours()
      const utcMinutes = now.getUTCMinutes()
      
      // Dubai is UTC+4
      // 7 AM Dubai = 3 AM UTC (03:00)
      // 9:30 PM Dubai = 5:30 PM UTC (17:30)
      const dubaiHour = (utcHour + 4) % 24
      const dubaiMinutes = utcMinutes
      const dubaiTime = dubaiHour * 60 + dubaiMinutes // Total minutes in day
      const startTime = 7 * 60 // 7:00 AM = 420 minutes
      const endTime = 21 * 60 + 30 // 9:30 PM = 1290 minutes
      
      console.log(`🕐 Current time: UTC ${utcHour}:${utcMinutes.toString().padStart(2, '0')}, Dubai ${dubaiHour}:${dubaiMinutes.toString().padStart(2, '0')} (${dubaiTime} minutes)`)
      
      if (dubaiTime < startTime || dubaiTime >= endTime) {
        console.log(`⏭️ Outside business hours for follow-ups (7 AM - 9:30 PM Dubai time)`)
        return { shouldReply: false, reason: 'Outside business hours for follow-ups (7 AM - 9:30 PM Dubai time)' }
      }
      
      console.log(`✅ Within business hours for follow-ups (7 AM - 9:30 PM Dubai time)`)
    }
  } else {
    console.log(`✅ First contact - 24/7 auto-reply enabled`)
  }

  console.log(`✅ Auto-reply check passed for lead ${leadId}`)
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

  if (!messageText || !messageText.trim()) {
    console.log(`⏭️ Auto-reply skipped: Empty message text for lead ${leadId}`)
    return { replied: false, reason: 'Empty message text' }
  }

  console.log(`🤖 Auto-reply handler called for lead ${leadId}, message: "${messageText.substring(0, 50)}..."`)

  // Log auto-reply attempt to database for debugging
  const logId = `auto-reply-${leadId}-${messageId}-${Date.now()}`
  try {
    await prisma.externalEventLog.create({
      data: {
        provider: 'auto-reply',
        externalId: logId,
        payload: JSON.stringify({
          leadId,
          messageId,
          contactId,
          channel,
          messageText: messageText.substring(0, 200),
          timestamp: new Date().toISOString(),
          status: 'started',
        }),
      },
    })
  } catch (logError: any) {
    console.warn('Failed to log auto-reply start:', logError.message)
  }

  try {
    // Step 1: Check if this is the first message (to pass to shouldAutoReply)
    // Check for both uppercase and lowercase for backward compatibility
    const channelLower = channel.toLowerCase()
    
    // CRITICAL: Check if we already replied to THIS specific inbound message
    // This prevents duplicate replies when webhook retries the same message
    const conversations = await prisma.conversation.findMany({
      where: { leadId: leadId, channel: channelLower },
      select: { id: true },
    })
    const conversationIds = conversations.map(c => c.id)
    
    if (conversationIds.length > 0) {
      // Check for any outbound auto-reply message created within 5 minutes of this inbound message
      const inboundMessage = await prisma.message.findUnique({
        where: { id: messageId },
        select: { createdAt: true },
      })
      
      if (inboundMessage) {
        const fiveMinutesAfter = new Date(inboundMessage.createdAt.getTime() + 5 * 60 * 1000)
        const existingReply = await prisma.message.findFirst({
          where: {
            conversationId: { in: conversationIds },
            direction: 'OUTBOUND',
            channel: channelLower,
            rawPayload: {
              contains: '"autoReply":true',
            },
            createdAt: {
              gte: inboundMessage.createdAt,
              lte: fiveMinutesAfter,
            },
          },
        })
        
        if (existingReply) {
          console.log(`⏭️ Auto-reply already sent for message ${messageId} (found existing reply ${existingReply.id})`)
          return { replied: false, reason: 'Already replied to this message' }
        }
      }
    }
    
    let messageCount = await prisma.message.count({
      where: {
        leadId: leadId,
        OR: [
          { direction: 'INBOUND' },
          { direction: 'inbound' },
          { direction: 'IN' }, // Legacy support
        ],
        channel: channelLower,
      },
    })
    let isFirstMessage = messageCount <= 1
    console.log(`📊 Message count for lead ${leadId} on channel ${channelLower}: ${messageCount} (isFirstMessage: ${isFirstMessage})`)
    
    // Step 2: Check if auto-reply should run (with first message context)
    const shouldReply = await shouldAutoReply(leadId, isFirstMessage)
    if (!shouldReply.shouldReply) {
      console.log(`⏭️ Skipping auto-reply for lead ${leadId}: ${shouldReply.reason}`)
      
      // Log skip reason to database
      try {
        await prisma.externalEventLog.create({
          data: {
            provider: 'auto-reply',
            externalId: `auto-reply-skip-${leadId}-${Date.now()}`,
            payload: JSON.stringify({
              leadId,
              messageId,
              contactId,
              channel,
              status: 'skipped',
              reason: shouldReply.reason,
              isFirstMessage,
              timestamp: new Date().toISOString(),
            }),
          },
        })
      } catch (logError: any) {
        console.warn('Failed to log auto-reply skip:', logError.message)
      }
      
      return { replied: false, reason: shouldReply.reason }
    }
    
    console.log(`✅ Auto-reply approved for lead ${leadId} (isFirstMessage: ${isFirstMessage})`)

    // Step 3: Check if needs human attention
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

    // Step 4: Load lead and contact
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
      console.error(`❌ Lead ${leadId} or contact not found`)
      return { replied: false, reason: 'Lead or contact not found' }
    }

    if (!lead.contact.phone || !lead.contact.phone.trim()) {
      console.log(`⏭️ Auto-reply skipped: Contact ${lead.contact.id} has no phone number`)
      return { replied: false, reason: 'Contact has no phone number' }
    }

    console.log(`✅ Lead ${leadId} loaded: contact phone=${lead.contact.phone}, autoReplyEnabled=${lead.autoReplyEnabled ?? 'null (defaulting to true)'}`)

    // Step 5: Detect language from message
    const detectedLanguage = detectLanguage(messageText)
    console.log(`🌐 Detected language: ${detectedLanguage}`)

    // Step 6: Log message count (already determined in Step 1)
    console.log(`📨 Message count for lead ${leadId}: ${messageCount} (isFirstMessage: ${isFirstMessage})`)

    // Step 7: Check if AI can respond (retriever-first chain)
    // Skip retriever check for first messages - always greet and collect info
    let retrievalResult: any = null
    if (!isFirstMessage) {
      try {
        retrievalResult = await retrieveAndGuard(messageText, {
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
      } catch (retrievalError: any) {
        // If retrieval fails, log but continue for first messages
        console.warn('Retriever chain error (non-blocking):', retrievalError.message)
        if (!isFirstMessage) {
          // For non-first messages, fail if retrieval errors
          return { replied: false, reason: 'Failed to check AI training' }
        }
      }
    } else {
      // First message - always respond with greeting
      console.log(`👋 First message detected - sending greeting for lead ${leadId}`)
    }

    // Step 8: Generate AI reply (with language detection)
    // Use detected language from message
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
      language: detectedLanguage, // Pass detected language to AI context
    }

    console.log(`🤖 Generating AI reply with language: ${detectedLanguage}`)
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

    // Step 9: Send reply immediately
    const channelUpper = channel.toUpperCase()
    console.log(`🔍 Checking channel support: ${channelUpper}, has phone: ${!!lead.contact.phone}`)
    
    if (channelUpper === 'WHATSAPP' && lead.contact.phone) {
      try {
        console.log(`📤 Sending WhatsApp message to ${lead.contact.phone} (lead ${leadId})`)
        console.log(`📝 Message text (first 100 chars): ${aiResult.text.substring(0, 100)}...`)
        
        const result = await sendTextMessage(lead.contact.phone, aiResult.text)
        
        console.log(`📨 WhatsApp API response:`, { messageId: result?.messageId, waId: result?.waId })
        
        if (!result || !result.messageId) {
          throw new Error('No message ID returned from WhatsApp API')
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

        console.log(`✅ Auto-reply sent successfully to lead ${leadId} via ${channel} (messageId: ${result.messageId})`)
        
        // Log success to database
        try {
          await prisma.externalEventLog.create({
            data: {
              provider: 'auto-reply',
              externalId: `auto-reply-success-${leadId}-${Date.now()}`,
              payload: JSON.stringify({
                leadId,
                messageId,
                contactId,
                channel,
                whatsappMessageId: result.messageId,
                status: 'success',
                timestamp: new Date().toISOString(),
              }),
            },
          })
        } catch (logError: any) {
          console.warn('Failed to log auto-reply success:', logError.message)
        }
        
        return { replied: true }
      } catch (error: any) {
        console.error(`❌ Failed to send auto-reply to lead ${leadId}:`, {
          error: error.message,
          stack: error.stack,
          phone: lead.contact.phone,
          channel: channel,
        })
        
        // Create task for human
        try {
          await createAgentTask(leadId, 'complex_query', {
            messageText: `Failed to send auto-reply: ${error.message}`,
          })
          console.log(`✅ Created agent task for failed auto-reply`)
        } catch (taskError: any) {
          console.error('❌ Failed to create agent task:', taskError.message)
        }
        
        return { replied: false, error: error.message || 'Unknown error sending message' }
      }
    }

    // Log unsupported channel to database
    try {
      await prisma.externalEventLog.create({
        data: {
          provider: 'auto-reply',
          externalId: `auto-reply-unsupported-${leadId}-${Date.now()}`,
          payload: JSON.stringify({
            leadId,
            messageId,
            contactId,
            channel,
            status: 'unsupported',
            reason: 'Channel not supported or no phone number',
            hasPhone: !!lead?.contact?.phone,
            timestamp: new Date().toISOString(),
          }),
        },
      })
    } catch (logError: any) {
      console.warn('Failed to log auto-reply unsupported:', logError.message)
    }
    
    return { replied: false, reason: 'Channel not supported or no phone number' }
  } catch (error: any) {
    console.error('Auto-reply error:', error)
    
    // Log error to database
    try {
      await prisma.externalEventLog.create({
        data: {
          provider: 'auto-reply',
          externalId: `auto-reply-error-${leadId}-${Date.now()}`,
          payload: JSON.stringify({
            leadId,
            messageId,
            contactId,
            channel,
            status: 'error',
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
          }),
        },
      })
    } catch (logError: any) {
      console.warn('Failed to log auto-reply error:', logError.message)
    }
    
    return { replied: false, error: error.message }
  }
}

