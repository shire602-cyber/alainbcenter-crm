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
import { 
  getAgentProfileForLead, 
  matchesSkipPatterns, 
  matchesEscalatePatterns,
  isWithinBusinessHours,
  type AgentProfile 
} from './ai/agentProfile'

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
 * @param messageText - Message text (for skip/escalate pattern matching)
 */
async function shouldAutoReply(
  leadId: number, 
  isFirstMessage: boolean = false,
  messageText?: string
): Promise<{ shouldReply: boolean; reason?: string; agent?: AgentProfile }> {
  console.log(`🔍 Checking shouldAutoReply for lead ${leadId} (isFirstMessage: ${isFirstMessage})`)
  
  // Get agent profile for this lead
  const agent = await getAgentProfileForLead(leadId)
  if (!agent) {
    console.log(`⚠️ No agent profile found for lead ${leadId}, using defaults`)
  } else {
    console.log(`🤖 Using agent profile: ${agent.name} (ID: ${agent.id})`)
  }

  // Fetch lead with all fields (fields exist in schema but Prisma types may not be updated)
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
  }) as any // Type assertion: fields exist in DB schema (autoReplyEnabled, mutedUntil, lastAutoReplyAt, allowOutsideHours)

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
  // @ts-ignore - Prisma types may not be updated yet
  if (lead.autoReplyEnabled === false) {
    console.log(`⏭️ Auto-reply disabled for lead ${leadId}`)
    return { shouldReply: false, reason: 'Auto-reply disabled for this lead', agent: agent || undefined }
  }
  // If NULL or undefined, default to true (for leads created before migration)
  // @ts-ignore
  console.log(`✅ Auto-reply enabled for lead ${leadId} (autoReplyEnabled: ${lead.autoReplyEnabled ?? 'null/undefined - defaulting to true'})`)

  // Check if muted
  // @ts-ignore
  if (lead.mutedUntil && lead.mutedUntil > new Date()) {
    // @ts-ignore
    console.log(`⏭️ Lead ${leadId} muted until ${lead.mutedUntil.toISOString()}`)
    // @ts-ignore
    return { shouldReply: false, reason: `Lead muted until ${lead.mutedUntil.toISOString()}`, agent: agent || undefined }
  }

  // Check skip patterns from agent profile
  if (messageText && agent) {
    if (matchesSkipPatterns(messageText, agent.skipAutoReplyRules)) {
      console.log(`⏭️ Message matches skip pattern - skipping auto-reply`)
      return { shouldReply: false, reason: 'Message matches skip pattern', agent }
    }
  }

  // Rate limiting: use agent's rateLimitMinutes, or default to 2 minutes
  const rateLimitMinutes = agent?.rateLimitMinutes || 2
  // BUT: Always allow first message replies (24/7, no rate limit) unless agent says otherwise
  // AND: Allow replies if it's been more than 1 minute (less strict for follow-ups)
  // @ts-ignore
  if (!isFirstMessage && lead.lastAutoReplyAt) {
    // @ts-ignore
    const minutesSinceLastReply = (Date.now() - lead.lastAutoReplyAt.getTime()) / (1000 * 60)
    console.log(`⏱️ Last auto-reply was ${minutesSinceLastReply.toFixed(1)} minutes ago (rate limit: ${rateLimitMinutes} min)`)
    // FIX: Only rate limit if it's been less than 1 minute (prevent spam, but allow quick follow-ups)
    if (minutesSinceLastReply < Math.min(1, rateLimitMinutes)) {
      console.log(`⏭️ Rate limit: replied ${minutesSinceLastReply.toFixed(1)} minutes ago`)
      return { shouldReply: false, reason: `Rate limit: replied ${minutesSinceLastReply.toFixed(1)} minutes ago`, agent: agent || undefined }
    }
  } else if (isFirstMessage && agent && !agent.firstMessageImmediate) {
    // Agent can disable immediate first message replies
    console.log(`⏭️ Agent ${agent.name} has firstMessageImmediate=false - applying rate limit`)
    // @ts-ignore
    if (lead.lastAutoReplyAt) {
      // @ts-ignore
      const minutesSinceLastReply = (Date.now() - lead.lastAutoReplyAt.getTime()) / (1000 * 60)
      if (minutesSinceLastReply < rateLimitMinutes) {
        return { shouldReply: false, reason: 'Rate limit: replied recently', agent }
      }
    }
  } else if (isFirstMessage) {
    console.log(`✅ First message - rate limit bypassed`)
  }

  // Business hours check: use agent's settings
  if (!isFirstMessage || (agent && !agent.firstMessageImmediate)) {
    // Check agent's allowOutsideHours or lead's allowOutsideHours
    // @ts-ignore
    const allowOutside = agent?.allowOutsideHours ?? lead.allowOutsideHours ?? false
    
    if (allowOutside) {
      console.log(`✅ allowOutsideHours=true - 24/7 auto-reply enabled`)
    } else if (agent) {
      // Use agent's business hours
      if (!isWithinBusinessHours(agent)) {
        console.log(`⏭️ Outside agent business hours (${agent.businessHoursStart} - ${agent.businessHoursEnd} ${agent.timezone})`)
        return { shouldReply: false, reason: `Outside business hours (${agent.businessHoursStart} - ${agent.businessHoursEnd})`, agent }
      }
      console.log(`✅ Within agent business hours (${agent.businessHoursStart} - ${agent.businessHoursEnd} ${agent.timezone})`)
    } else {
      // Fallback to default Dubai business hours
      const now = new Date()
      const utcHour = now.getUTCHours()
      const utcMinutes = now.getUTCMinutes()
      const dubaiHour = (utcHour + 4) % 24
      const dubaiMinutes = utcMinutes
      const dubaiTime = dubaiHour * 60 + dubaiMinutes
      const startTime = 7 * 60
      const endTime = 21 * 60 + 30
      
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
  return { shouldReply: true, agent: agent || undefined }
}

/**
 * Detect if message needs human attention (payment dispute, angry, legal threat, etc.)
 * Uses agent's escalate patterns if available, otherwise uses default patterns
 */
function needsHumanAttention(messageText: string, agent?: AgentProfile): { needsHuman: boolean; reason?: string } {
  // First check agent's escalate patterns
  if (agent && matchesEscalatePatterns(messageText, agent.escalateToHumanRules)) {
    return { needsHuman: true, reason: 'Message matches agent escalate pattern' }
  }
  
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
    
    // Step 2: Check if auto-reply should run (with first message context and messageText for pattern matching)
    const shouldReply = await shouldAutoReply(leadId, isFirstMessage, messageText)
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
    
    const agent = shouldReply.agent
    if (agent) {
      console.log(`🤖 Using agent profile: ${agent.name} (ID: ${agent.id})`)
    }
    
    console.log(`✅ Auto-reply approved for lead ${leadId} (isFirstMessage: ${isFirstMessage})`)

    // Step 3: Check if needs human attention (use agent's escalate patterns)
    const humanCheck = needsHumanAttention(messageText, agent)
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

    // CRITICAL: If contact doesn't have phone number, try to get it from the message
    // This handles cases where contact was created from a different channel
    let phoneNumber = lead.contact.phone?.trim() || null
    
    if (!phoneNumber) {
      console.warn(`⚠️ Contact ${lead.contact.id} has no phone number - attempting to get from message`)
      // Try to get phone from the inbound message's conversation
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              contact: {
                select: { phone: true },
              },
            },
          },
        },
      })
      
      if (message?.conversation?.contact?.phone) {
        phoneNumber = message.conversation.contact.phone.trim()
        console.log(`✅ Found phone number from message conversation: ${phoneNumber}`)
        
        // Update contact with phone number for future use
        try {
          await prisma.contact.update({
            where: { id: lead.contact.id },
            data: { phone: phoneNumber },
          })
          console.log(`✅ Updated contact ${lead.contact.id} with phone number ${phoneNumber}`)
        } catch (updateError: any) {
          console.warn(`⚠️ Failed to update contact phone: ${updateError.message}`)
        }
      }
    }
    
    if (!phoneNumber) {
      console.log(`⏭️ Auto-reply skipped: Contact ${lead.contact.id} has no phone number and couldn't retrieve from message`)
      return { replied: false, reason: 'Contact has no phone number' }
    }

    // @ts-ignore
    console.log(`✅ Lead ${leadId} loaded: contact phone=${phoneNumber}, autoReplyEnabled=${lead.autoReplyEnabled ?? 'null (defaulting to true)'}`)

    // Step 5: Detect language from message (use agent's language settings)
    let detectedLanguage = agent?.defaultLanguage || 'en'
    if (agent?.autoDetectLanguage !== false) {
      detectedLanguage = detectLanguage(messageText)
    }
    console.log(`🌐 Detected language: ${detectedLanguage} (agent: ${agent?.name || 'none'}, autoDetect: ${agent?.autoDetectLanguage ?? true})`)

    // Step 6: Log message count (already determined in Step 1)
    console.log(`📨 Message count for lead ${leadId}: ${messageCount} (isFirstMessage: ${isFirstMessage})`)

    // Step 7: Check if AI can respond (retriever-first chain)
    // CRITICAL: User requirement - AI should ALWAYS reply unless it's clearly spam/abuse
    // Skip retriever check for first messages - always greet and collect info
    // For follow-ups, ONLY block if it's clearly spam/abuse (not just "no training found")
    let retrievalResult: any = null
    if (!isFirstMessage) {
      try {
        const similarityThreshold = agent?.similarityThreshold ?? parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.7')
        retrievalResult = await retrieveAndGuard(messageText, {
          similarityThreshold,
          topK: 5,
          // Use agent's training documents if specified
          trainingDocumentIds: agent?.trainingDocumentIds || undefined,
        })

        // CRITICAL FIX: Only block if it's clearly spam/abuse, NOT if training is missing
        // User requirement: "AI should always reply, only escalate to human when it doesn't know what to do"
        // "No training found" is NOT a reason to block - AI should still reply and ask for clarification
        // Only block if the message itself is spam/abuse (detected by needsHumanAttention check above)
        
        // Check if message is spam/abuse first (this is the real blocker)
        const spamCheck = needsHumanAttention(messageText, agent)
        if (spamCheck.needsHuman) {
          console.log(`🚫 Blocking auto-reply: Spam/abuse detected - ${spamCheck.reason}`)
          return { replied: false, reason: spamCheck.reason }
        }
        
        // If retrieval found relevant training, use it (will be included in prompt)
        if (retrievalResult.canRespond) {
          console.log(`✅ Retrieval found relevant training: ${retrievalResult.relevantDocuments.length} documents`)
        } else {
          // No training found or low similarity - but STILL REPLY (user requirement)
          // Just log it for monitoring, but don't block
          console.log(`⚠️ No relevant training found (similarity: ${retrievalResult.reason}), but continuing with reply (user requirement: always reply)`)
          
          // Log for monitoring but don't block
          try {
            await prisma.externalEventLog.create({
              data: {
                provider: 'auto-reply',
                externalId: `no-training-${leadId}-${Date.now()}`,
                payload: JSON.stringify({
                  leadId,
                  messageId,
                  messageText: messageText.substring(0, 200),
                  retrievalReason: retrievalResult.reason,
                  action: 'continuing_with_reply',
                }),
              },
            })
          } catch (logError) {
            console.warn('Failed to log no-training event:', logError)
          }
        }
      } catch (retrievalError: any) {
        // If retrieval fails, log but ALWAYS continue - don't block replies
        console.warn('Retriever chain error (non-blocking, continuing):', retrievalError.message)
        // Don't return - always allow reply to proceed
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

    console.log(`🤖 Generating AI reply with language: ${detectedLanguage}, agent: ${agent?.name || 'default'}`)
    // Pass agent to AI generation for custom prompts and settings
    const aiResult = await generateAIAutoresponse(aiContext, agent)

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
    console.log(`🔍 Checking channel support: ${channelUpper}, has phone: ${!!phoneNumber}`)
    
    if (channelUpper === 'WHATSAPP' && phoneNumber) {
      try {
        console.log(`📤 Sending WhatsApp message to ${phoneNumber} (lead ${leadId})`)
        console.log(`📝 Message text (first 100 chars): ${aiResult.text.substring(0, 100)}...`)
        
        const result = await sendTextMessage(phoneNumber, aiResult.text)
        
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
            // @ts-ignore - Prisma types may not be updated yet
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
          phone: phoneNumber,
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

