/**
 * AI-Powered Inbound Message Reply System
 * 
 * Generates AI replies when messages arrive (no queue/worker)
 * All replies are AI-generated based on inbound messages - no saved templates
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

  // Rate limiting: CRITICAL FIX - Only prevent true spam, allow second messages
  // For follow-up messages (not first), use a very short rate limit (10 seconds) to allow quick replies
  // @ts-ignore
  if (!isFirstMessage && lead.lastAutoReplyAt) {
    // @ts-ignore
    const secondsSinceLastReply = (Date.now() - lead.lastAutoReplyAt.getTime()) / 1000
    
    // CRITICAL: For follow-up messages, use a very short rate limit (3 seconds) to allow quick replies
    // This ensures second messages get replies quickly, regardless of agent's rateLimitMinutes
    const followUpRateLimitSeconds = 3 // Always allow replies after 3 seconds for follow-ups (reduced from 5s)
    console.log(`⏱️ [RATE-LIMIT] Last auto-reply was ${secondsSinceLastReply.toFixed(1)} seconds ago (follow-up rate limit: ${followUpRateLimitSeconds}s)`)
    
    // Only block if it's been less than 3 seconds (prevent spam, but allow normal follow-ups)
    if (secondsSinceLastReply < followUpRateLimitSeconds) {
      console.log(`⏭️ [RATE-LIMIT] BLOCKED: replied ${secondsSinceLastReply.toFixed(1)} seconds ago (minimum ${followUpRateLimitSeconds}s for follow-ups)`)
      return { shouldReply: false, reason: `Rate limit: replied ${secondsSinceLastReply.toFixed(0)} seconds ago`, agent: agent || undefined }
    } else {
      console.log(`✅ [RATE-LIMIT] PASSED: ${secondsSinceLastReply.toFixed(1)} seconds since last reply (>= ${followUpRateLimitSeconds}s) - allowing reply`)
    }
  } else if (isFirstMessage && agent && !agent.firstMessageImmediate) {
    // Agent can disable immediate first message replies
    // Use agent's rateLimitMinutes for first messages
    const rateLimitMinutes = agent?.rateLimitMinutes || 0.17 // 10 seconds default
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

  // Business hours check: CRITICAL FIX - User wants 24/7 auto-reply for sales leads
  // Only check business hours if explicitly disabled, otherwise allow 24/7
  // @ts-ignore
  const allowOutside = agent?.allowOutsideHours ?? lead.allowOutsideHours ?? true // DEFAULT TO TRUE for 24/7
  
  if (allowOutside) {
    console.log(`✅ 24/7 auto-reply enabled (allowOutsideHours: true)`)
  } else {
    // Only enforce business hours if explicitly disabled
    if (agent) {
      // Use agent's business hours
      if (!isWithinBusinessHours(agent)) {
        console.log(`⏭️ Outside agent business hours (${agent.businessHoursStart} - ${agent.businessHoursEnd} ${agent.timezone})`)
        return { shouldReply: false, reason: `Outside business hours (${agent.businessHoursStart} - ${agent.businessHoursEnd})`, agent }
      }
      console.log(`✅ Within agent business hours (${agent.businessHoursStart} - ${agent.businessHoursEnd} ${agent.timezone})`)
    } else {
      // Fallback to default Dubai business hours (only if allowOutsideHours is explicitly false)
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
 * Handle AI-generated reply for inbound message
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

  console.log(`🤖 AI reply handler called for lead ${leadId}, message: "${messageText.substring(0, 50)}..."`)

  // Create structured log entry (will be updated throughout the process)
  let autoReplyLog: any = null
  try {
    // Use type assertion since table may not exist until migration is run
    autoReplyLog = await (prisma as any).autoReplyLog.create({
      data: {
          leadId,
          contactId,
          messageId,
        channel: channel.toLowerCase(),
        messageText: messageText.substring(0, 500), // Truncate for storage
        inboundParsed: JSON.stringify({
          messageText: messageText.substring(0, 200),
          channel,
          timestamp: new Date().toISOString(),
        }),
        decision: 'processing',
        autoReplyEnabled: true, // Will be updated
      },
    })
    console.log(`📝 Created AutoReplyLog entry: ${autoReplyLog.id}`)
  } catch (logError: any) {
    console.warn('Failed to create AutoReplyLog (table may not exist yet - run migration):', logError.message)
    // Continue even if logging fails
  }

  try {
    // Step 1: Check if we already processed THIS specific message (prevent duplicate replies)
    // Check for both uppercase and lowercase for backward compatibility
    const channelLower = channel.toLowerCase()
    
    // CRITICAL FIX: Check AutoReplyLog first - most reliable way to prevent duplicates
    // This checks if we already processed THIS specific messageId (not other messages)
    // IMPORTANT: Only block if we already replied to THIS exact messageId, not if we replied to a different message
    const existingLog = await (prisma as any).autoReplyLog.findFirst({
          where: {
        messageId: messageId, // CRITICAL: Only check THIS specific messageId
        leadId: leadId,
            channel: channelLower,
        OR: [
          { decision: 'replied' },
          { replySent: true },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    
    if (existingLog) {
      console.log(`⏭️ [DUPLICATE-CHECK] Already processed THIS message ${messageId} (log ${existingLog.id}, decision: ${existingLog.decision})`)
      
      // Update current log to mark as duplicate attempt
      if (autoReplyLog) {
        try {
          await (prisma as any).autoReplyLog.update({
            where: { id: autoReplyLog.id },
            data: {
              decision: 'skipped',
              skippedReason: `Duplicate attempt - already replied to this exact message (log ${existingLog.id})`,
            },
          })
        } catch (logError) {
          console.warn('Failed to update AutoReplyLog with duplicate:', logError)
        }
      }
      
      return { replied: false, reason: 'Already replied to this exact message' }
    } else {
      console.log(`✅ [DUPLICATE-CHECK] No existing reply for message ${messageId} - proceeding with AI reply`)
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
      
    // Update log with autoReplyEnabled status
    if (autoReplyLog) {
      try {
        await (prisma as any).autoReplyLog.update({
          where: { id: autoReplyLog.id },
          data: {
            autoReplyEnabled: shouldReply.shouldReply,
            decision: shouldReply.shouldReply ? 'processing' : 'skipped',
            skippedReason: shouldReply.reason || null,
          },
        })
      } catch (logError) {
        console.warn('Failed to update AutoReplyLog:', logError)
      }
    }
    
    if (!shouldReply.shouldReply) {
      console.log(`⏭️ Skipping AI reply for lead ${leadId}: ${shouldReply.reason}`)
      return { replied: false, reason: shouldReply.reason }
    }
    
    const agent = shouldReply.agent
    if (agent) {
      console.log(`🤖 Using agent profile: ${agent.name} (ID: ${agent.id})`)
    }
    
    console.log(`✅ AI reply approved for lead ${leadId} (isFirstMessage: ${isFirstMessage})`)

    // Step 3: Check if needs human attention (use agent's escalate patterns)
    // CRITICAL: High-risk messages (angry/legal/threat/payment dispute) should NOT auto-reply
    // Instead: create human task and optionally send brief "we'll get back" message
    const humanCheck = needsHumanAttention(messageText, agent)
    if (humanCheck.needsHuman) {
      console.log(`⚠️ High-risk message detected for lead ${leadId}: ${humanCheck.reason}`)
      
      // Create task for human (required)
      let taskCreated = false
      try {
        await createAgentTask(leadId, 'human_request', {
          messageText,
          confidence: 100,
        })
        taskCreated = true
        console.log(`✅ Created human task for high-risk message`)
      } catch (error: any) {
        console.error('Failed to create agent task:', error.message)
      }
      
      // Update log with human task creation
      if (autoReplyLog) {
        try {
          await (prisma as any).autoReplyLog.update({
            where: { id: autoReplyLog.id },
            data: {
              decision: 'notified_human',
              decisionReason: humanCheck.reason,
              humanTaskCreated: taskCreated,
              humanTaskReason: humanCheck.reason,
            },
          })
        } catch (logError) {
          console.warn('Failed to update AutoReplyLog:', logError)
        }
      }
      
      // Optionally send brief acknowledgment message (user requirement: "optionally send a brief 'we'll get back' message")
      // For now, we'll skip auto-reply entirely for high-risk messages to avoid escalating the situation
      // This can be enabled later if needed
      const sendAcknowledgment = false // Set to true if you want to send "We'll get back to you" message
      
      if (sendAcknowledgment) {
        // Brief acknowledgment (default to English for high-risk messages)
        const acknowledgments: Record<string, string> = {
          en: "Thank you for your message. We'll get back to you shortly.",
          ar: "شكراً لرسالتك. سنعود إليك قريباً.",
        }
        const ackText = acknowledgments.en // Use English for high-risk acknowledgment
        
        // Send acknowledgment (code continues below, but we'll return early for now)
        // For now, we skip sending to avoid any risk
      }
      
      return { replied: false, reason: humanCheck.reason }
    }

    // Step 4: Load lead and contact (also get conversation for logging)
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
    
    // Get conversation for logging
    const conversation = await prisma.conversation.findFirst({
      where: {
        contactId: contactId,
        leadId: leadId,
        channel: channel.toLowerCase(),
      },
      select: { id: true },
    })
    
    // Update log with conversation ID
    if (autoReplyLog && conversation) {
      try {
        await (prisma as any).autoReplyLog.update({
          where: { id: autoReplyLog.id },
          data: {
            conversationId: conversation.id,
          },
        })
      } catch (logError) {
        console.warn('Failed to update AutoReplyLog with conversation:', logError)
      }
    }

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
    // CRITICAL FIX: Retrieval must NEVER block replies
    // Policy: If autoReplyEnabled and not muted/rate-limited:
    //   - Always send a reply
    //   - If retrieval returns useful context -> use it
    //   - If retrieval empty/low similarity -> send safe fallback reply
    //   - If message is high-risk -> do NOT auto reply; create human task
    let retrievalResult: any = null
    let hasUsefulContext = false
    let retrievalError: string | null = null
    
    if (!isFirstMessage) {
      try {
        const similarityThreshold = agent?.similarityThreshold ?? parseFloat(process.env.AI_SIMILARITY_THRESHOLD || '0.7')
        retrievalResult = await retrieveAndGuard(messageText, {
          similarityThreshold,
          topK: 5,
          // Use agent's training documents if specified
          trainingDocumentIds: agent?.trainingDocumentIds || undefined,
        })

        // Check if retrieval found useful context
        hasUsefulContext = retrievalResult.canRespond && retrievalResult.relevantDocuments.length > 0
        
        if (hasUsefulContext) {
          console.log(`✅ Retrieval found relevant training: ${retrievalResult.relevantDocuments.length} documents, similarity scores: ${retrievalResult.relevantDocuments.map((d: any) => d.similarity.toFixed(2)).join(', ')}`)
        } else {
          console.log(`⚠️ No relevant training found (reason: ${retrievalResult.reason}), will use fallback reply`)
        }
        
        // Update log with retrieval results
        if (autoReplyLog) {
          try {
            const maxSimilarity = retrievalResult.relevantDocuments.length > 0
              ? Math.max(...retrievalResult.relevantDocuments.map((d: any) => d.similarity))
              : null
            await (prisma as any).autoReplyLog.update({
              where: { id: autoReplyLog.id },
              data: {
                retrievalDocsCount: retrievalResult.relevantDocuments.length,
                retrievalSimilarity: maxSimilarity,
                  retrievalReason: retrievalResult.reason,
                hasUsefulContext,
              },
            })
          } catch (logError) {
            console.warn('Failed to update AutoReplyLog with retrieval:', logError)
          }
        }
      } catch (retrievalErr: any) {
        // If retrieval fails, log but ALWAYS continue - don't block replies
        retrievalError = retrievalErr.message
        console.warn('Retriever chain error (non-blocking, continuing with fallback):', retrievalError)
        
        // Update log with retrieval error
        if (autoReplyLog) {
          try {
            await (prisma as any).autoReplyLog.update({
              where: { id: autoReplyLog.id },
              data: {
                retrievalReason: `Error: ${retrievalError}`,
                hasUsefulContext: false,
              },
            })
          } catch (logError) {
            console.warn('Failed to update AutoReplyLog with retrieval error:', logError)
          }
        }
        // Don't return - always allow reply to proceed
      }
    } else {
      // First message - always respond with greeting
      console.log(`👋 First message detected - sending greeting for lead ${leadId}`)
      
      // Update log for first message
      if (autoReplyLog) {
        try {
          await (prisma as any).autoReplyLog.update({
            where: { id: autoReplyLog.id },
            data: {
              retrievalReason: 'First message - no retrieval needed',
              hasUsefulContext: false,
            },
          })
        } catch (logError) {
          console.warn('Failed to update AutoReplyLog for first message:', logError)
        }
      }
    }

    // Step 8: Generate AI reply (with language detection)
    // CRITICAL: Always generate a reply - use retrieval context if available, otherwise use fallback
    // CRITICAL: Current inbound message must be FIRST in context so AI responds to it
    const aiContext: AIMessageContext = {
      lead,
      contact: lead.contact,
      recentMessages: [
        // CRITICAL: Add current inbound message FIRST so AI responds to it
        {
          direction: 'INBOUND',
          body: messageText, // Current inbound message - AI will respond to this
          createdAt: new Date(),
        },
        // Then add previous messages for context (exclude current if already included)
        ...lead.messages
          .filter(m => m.id !== messageId)
          .map(m => ({
        direction: m.direction,
        body: m.body || '',
        createdAt: m.createdAt,
      })),
      ],
      mode: 'QUALIFY' as AIMessageMode, // Default mode
      channel: channel.toUpperCase() as 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT',
      language: detectedLanguage, // Pass detected language to AI context
    }

    console.log(`🤖 Generating AI reply with language: ${detectedLanguage}, agent: ${agent?.name || 'default'}, hasContext: ${hasUsefulContext}`)
    
    // CRITICAL: Always try to generate AI reply first (never use saved/cached messages)
    // Only use fallback if AI generation fails
    let aiResult: { text: string; success: boolean; error?: string; confidence?: number } | null = null
    let usedFallback = false
    
    try {
      // Always generate fresh AI reply (not saved/cached)
    // Pass agent to AI generation for custom prompts and settings
      console.log(`🤖 [AI-GEN] Calling generateAIAutoresponse with context:`, {
        leadId: aiContext.lead.id,
        messageCount: aiContext.recentMessages?.length || 0,
        firstMessage: aiContext.recentMessages?.[0]?.body?.substring(0, 50) || '',
        mode: aiContext.mode,
        channel: aiContext.channel,
        language: aiContext.language,
        agentName: agent?.name,
      })
      
      aiResult = await generateAIAutoresponse(aiContext, agent)
      
      if (!aiResult || !aiResult.success || !aiResult.text) {
        console.error(`⚠️ [AI-GEN] AI generation failed or returned empty:`, {
          success: aiResult?.success,
          error: aiResult?.error,
          hasText: !!aiResult?.text,
          messageText: messageText.substring(0, 100),
          leadId,
        })
        console.error(`⚠️ [AI-GEN] This will trigger context-aware fallback based on: "${messageText.substring(0, 100)}"`)
        usedFallback = true
      } else if (aiResult && aiResult.text) {
        const replyText = aiResult.text // Store in local variable for type narrowing
        const replyPreview = replyText.substring(0, 150)
        console.log(`✅ [AI-GEN] AI generated fresh reply (${replyText.length} chars): "${replyPreview}..."`)
        
        // CRITICAL: Validate reply is NOT a template - REJECT if it contains ANY template pattern
        // This is STRICT validation - we want AI-generated responses, not templates
        const templatePatterns = [
          'thank you for your interest',
          'to better assist you',
          'could you please share',
          'what specific service',
          'what is your timeline',
          'looking forward to helping you',
          'please share: 1.',
          'please share: 2.',
          'to better assist',
        ]
        const lowerReply = replyText.toLowerCase()
        const hasTemplatePattern = templatePatterns.some(pattern => lowerReply.includes(pattern))
        
        // REJECT if it contains ANY template pattern - we want fresh AI responses only
        if (hasTemplatePattern) {
          console.error(`❌ [AI-GEN] REJECTED: Generated reply contains FORBIDDEN template patterns!`)
          console.error(`   Reply: "${replyText.substring(0, 200)}..."`)
          console.error(`   This message will NOT be sent. Generating context-aware fallback instead.`)
          
          // Minimal fallback - AI should handle all responses, this is only for when AI fails
          const contactNameForFallback = lead.contact?.fullName || 'there'
          const messagePreview = messageText.length > 50 ? messageText.substring(0, 50) + '...' : messageText
          const contextAwareFallback = `Hi ${contactNameForFallback}, I received your message. Let me get back to you with the information you need.`
          
          aiResult = {
            text: contextAwareFallback,
            success: true,
            confidence: 40, // Low confidence for rejected template
          }
          usedFallback = true
        }
      }
    } catch (aiError: any) {
      console.error(`❌ [AI-GEN] AI generation error: ${aiError.message}`, aiError.stack)
      usedFallback = true
      aiResult = null
    }
    
    // If AI generation failed or returned empty, use context-aware fallback reply
    if (!aiResult || !aiResult.success || !aiResult.text) {
      console.log(`📝 [FALLBACK] Using context-aware fallback reply (aiSuccess: ${aiResult?.success || false}, error: ${aiResult?.error || 'none'})`)
      console.log(`📝 [FALLBACK] User message: "${messageText.substring(0, 100)}"`)
      
      // Generate context-aware fallback based on user's actual message
      const userMessage = messageText.toLowerCase()
      const contactName = lead.contact?.fullName || 'there'
      
      console.log(`📝 [FALLBACK] Detecting context from message (lowercase): "${userMessage.substring(0, 100)}"`)
      
      let fallbackText = ''
      
      // CRITICAL: Fallback MUST match user's message context - check in order of specificity
      // Check visa/family FIRST (most specific service requests)
      if (userMessage.includes('visa') || userMessage.includes('permit') || userMessage.includes('residence') || userMessage.includes('family')) {
        console.log(`📝 [FALLBACK] Matched: visa/family context`)
        // More specific message for family visa with actual helpful information
        if (userMessage.includes('family')) {
          fallbackText = detectedLanguage === 'ar'
            ? `مرحباً ${contactName}، سأساعدك في تأشيرة العائلة. للحصول على أفضل خدمة، يرجى إرسال: 1) جنسية مقدم الطلب 2) عدد أفراد العائلة 3) تاريخ انتهاء التأشيرة الحالية (إن وجدت)`
            : `Hi ${contactName}, I'll help you with family visa services. To provide the best service, please share: 1) Your nationality 2) Number of family members 3) Current visa expiry date (if applicable)`
        } else {
          fallbackText = detectedLanguage === 'ar'
            ? `مرحباً ${contactName}، سأساعدك في خدمات التأشيرة. يرجى إرسال: 1) نوع التأشيرة المطلوبة 2) جنسيتك 3) موقعك الحالي (داخل أو خارج الإمارات)`
            : `Hi ${contactName}, I'll help you with visa services. Please share: 1) Type of visa needed 2) Your nationality 3) Your current location (inside or outside UAE)`
        }
      } else if (userMessage.includes('business') || userMessage.includes('setup') || userMessage.includes('company') || userMessage.includes('incorporat')) {
        console.log(`📝 [FALLBACK] Matched: business/setup context`)
        fallbackText = detectedLanguage === 'ar' 
          ? `مرحباً ${contactName}، يسعدني مساعدتك في خدمات تأسيس الشركات. سأجمع التفاصيل وأعود إليك قريباً.`
          : `Hi ${contactName}, I'd be happy to help you with business setup services. Let me gather the details and get back to you shortly.`
      } else if (userMessage.includes('price') || userMessage.includes('cost') || userMessage.includes('fee') || userMessage.includes('how much') || userMessage.includes('pricing')) {
        console.log(`📝 [FALLBACK] Matched: pricing context`)
        fallbackText = detectedLanguage === 'ar'
          ? `مرحباً ${contactName}، سأحضر معلومات الأسعار لك الآن.`
          : `Hi ${contactName}, I'll get the pricing information for you right away.`
      } else if (userMessage.includes('renew') || userMessage.includes('expir') || userMessage.includes('expiry') || userMessage.includes('renewal')) {
        console.log(`📝 [FALLBACK] Matched: renewal context`)
        fallbackText = detectedLanguage === 'ar'
          ? `مرحباً ${contactName}، سأتحقق من تفاصيل التجديد لك.`
          : `Hi ${contactName}, I'll check the renewal details for you.`
      } else if (userMessage.includes('doc') || userMessage.includes('document') || userMessage.includes('paper') || userMessage.includes('requirement')) {
        console.log(`📝 [FALLBACK] Matched: document context`)
        fallbackText = detectedLanguage === 'ar'
          ? `مرحباً ${contactName}، سأتحقق من متطلبات المستندات لك.`
          : `Hi ${contactName}, I'll check the document requirements for you.`
      } else {
        // Generic fallback - but MUST reference their actual message
        const messagePreview = messageText.length > 40 ? messageText.substring(0, 40) + '...' : messageText
        const hasQuestion = userMessage.includes('?') || userMessage.includes('what') || userMessage.includes('how') || userMessage.includes('when') || userMessage.includes('where') || userMessage.includes('why') || userMessage.includes('info')
        const hasUrgent = userMessage.includes('urgent') || userMessage.includes('asap') || userMessage.includes('quick') || userMessage.includes('immediately')
        
        if (hasUrgent) {
          console.log(`📝 [FALLBACK] Matched: urgent context`)
          fallbackText = detectedLanguage === 'ar'
            ? `مرحباً ${contactName}، أفهم أن هذا عاجل. سأعود إليك قريباً.`
            : `Hi ${contactName}, I understand this is urgent. I'll get back to you shortly.`
        } else if (hasQuestion) {
          console.log(`📝 [FALLBACK] Matched: question context`)
          // For "what details" after family visa, check conversation history
          if (userMessage.includes('detail')) {
            // Check if previous messages mentioned visa/family
            const previousMessages = lead.messages?.filter(m => m.id !== messageId && m.direction === 'INBOUND').slice(-3) || []
            const hasVisaContext = previousMessages.some(m => {
              const body = (m.body || '').toLowerCase()
              return body.includes('family') || body.includes('visa')
            })
            
            if (hasVisaContext) {
              fallbackText = detectedLanguage === 'ar'
                ? `مرحباً ${contactName}، لتأشيرة العائلة نحتاج: جواز السفر، شهادة الزواج، شهادات ميلاد الأطفال، شهادة الراتب، سجل الإقامة. ما هي جنسيتك وعدد أفراد العائلة؟`
                : `Hi ${contactName}, for family visa we need: passport, marriage certificate, children birth certificates, salary certificate, residence record. What's your nationality and number of family members?`
            } else {
              fallbackText = detectedLanguage === 'ar'
                ? `مرحباً ${contactName}، شكراً لسؤالك. يرجى توضيح نوع الخدمة التي تحتاجها (تأشيرة، تأسيس شركة، تجديد) وسأساعدك بالتفاصيل.`
                : `Hi ${contactName}, thanks for your question. Please specify the service you need (visa, business setup, renewal) and I'll provide the details.`
            }
          } else {
            fallbackText = detectedLanguage === 'ar'
              ? `مرحباً ${contactName}، شكراً لسؤالك. يرجى توضيح نوع الخدمة التي تحتاجها وسأساعدك بالتفاصيل.`
              : `Hi ${contactName}, thanks for your question. Please specify the service you need and I'll provide the details.`
          }
        } else {
          console.log(`📝 [FALLBACK] Matched: generic context with message reference`)
          // For simple greetings, provide helpful next steps
          if (userMessage === 'hi' || userMessage === 'hello' || userMessage === 'hey' || userMessage.length < 5) {
            fallbackText = detectedLanguage === 'ar'
              ? `مرحباً ${contactName}، أهلاً بك في مركز عين الأعمال! كيف يمكنني مساعدتك اليوم؟ نحن متخصصون في: تأشيرات العائلة، تأسيس الشركات، تجديد التأشيرات.`
              : `Hi ${contactName}, welcome to Al Ain Business Center! How can I help you today? We specialize in: family visas, business setup, visa renewals.`
          } else {
            fallbackText = detectedLanguage === 'ar'
              ? `مرحباً ${contactName}، تلقيت رسالتك عن "${messagePreview}". يرجى توضيح نوع الخدمة التي تحتاجها (تأشيرة، تأسيس شركة، تجديد) وسأساعدك.`
              : `Hi ${contactName}, I received your message about "${messagePreview}". Please specify the service you need (visa, business setup, renewal) and I'll help you.`
          }
        }
      }
      
      aiResult = {
        text: fallbackText,
        success: true,
        confidence: 50, // Lower confidence for fallback
      }
      
      usedFallback = true
      
      // Update log with fallback usage
      if (autoReplyLog) {
        try {
          await (prisma as any).autoReplyLog.update({
            where: { id: autoReplyLog.id },
            data: {
              usedFallback: true,
              replyText: fallbackText.substring(0, 500),
            },
          })
        } catch (logError) {
          console.warn('Failed to update AutoReplyLog with fallback:', logError)
        }
      }
    } else {
      // Update log that we used AI (not fallback)
      if (autoReplyLog) {
        try {
          await (prisma as any).autoReplyLog.update({
            where: { id: autoReplyLog.id },
            data: {
              usedFallback: false,
              replyText: aiResult.text.substring(0, 500),
            },
          })
        } catch (logError) {
          console.warn('Failed to update AutoReplyLog with AI reply:', logError)
        }
      }
    }
    
    if (!aiResult || !aiResult.text) {
      // Last resort: create task if we can't generate any reply
      try {
        await createAgentTask(leadId, 'complex_query', {
          messageText,
        })
      } catch (error: any) {
        console.error('Failed to create agent task:', error.message)
      }
      
      return { replied: false, error: 'Failed to generate any reply (AI and fallback both failed)' }
    }

    // Step 9: Send reply immediately
    // At this point, aiResult.text is guaranteed to exist (checked above)
    const replyText = aiResult.text
    const channelUpper = channel.toUpperCase()
    console.log(`🔍 Checking channel support: ${channelUpper}, has phone: ${!!phoneNumber}`)
    
    if (channelUpper === 'WHATSAPP' && phoneNumber) {
      try {
        console.log(`📤 Sending WhatsApp message to ${phoneNumber} (lead ${leadId})`)
        console.log(`📝 Message text (first 100 chars): ${replyText.substring(0, 100)}...`)
        
        const result = await sendTextMessage(phoneNumber, replyText)
        
        console.log(`📨 WhatsApp API response:`, { messageId: result?.messageId, waId: result?.waId })
        
        if (!result || !result.messageId) {
          throw new Error('No message ID returned from WhatsApp API')
        }

        // Step 7: Save outbound message (conversation already loaded above)
        if (conversation) {
          await prisma.message.create({
            data: {
              conversationId: conversation.id,
              leadId: leadId,
              contactId: contactId,
              direction: 'OUTBOUND',
              channel: channel.toLowerCase(),
              type: 'text',
              body: replyText,
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

        console.log(`✅ AI reply sent successfully to lead ${leadId} via ${channel} (messageId: ${result.messageId})`)
        
        // Update structured log with success
        if (autoReplyLog) {
          try {
            // Get conversation ID for log
            const conversation = await prisma.conversation.findFirst({
              where: {
                contactId: contactId,
                leadId: leadId,
                channel: channel.toLowerCase(),
              },
              select: { id: true },
            })
            
            await (prisma as any).autoReplyLog.update({
              where: { id: autoReplyLog.id },
            data: {
                conversationId: conversation?.id || null,
                decision: 'replied',
                decisionReason: 'AI reply sent successfully',
                replySent: true,
                replyText: aiResult.text.substring(0, 500),
                replyStatus: 'sent',
                replyError: null,
            },
          })
        } catch (logError: any) {
            console.warn('Failed to update AutoReplyLog with success:', logError.message)
          }
        }
        
        return { replied: true }
      } catch (error: any) {
        console.error(`❌ Failed to send auto-reply to lead ${leadId}:`, {
          error: error.message,
          stack: error.stack,
          phone: phoneNumber,
          channel: channel,
        })
        
        // Update structured log with error
        if (autoReplyLog) {
          try {
            await (prisma as any).autoReplyLog.update({
              where: { id: autoReplyLog.id },
              data: {
                decision: 'skipped',
                decisionReason: 'Send failed',
                replySent: false,
                replyStatus: 'failed',
                replyError: error.message || 'Unknown error',
              },
            })
          } catch (logError) {
            console.warn('Failed to update AutoReplyLog with error:', logError)
          }
        }
        
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

