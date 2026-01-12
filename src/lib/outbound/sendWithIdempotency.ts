/**
 * HARD OUTBOUND IDEMPOTENCY - Transaction-based send
 * 
 * Guarantees: no duplicate outbound messages under webhook retries and concurrency
 * 
 * Process:
 * 1) Compute outboundDedupeKey = hash(conversationId + replyType + normalizedQuestionKey + dayBucket OR inboundMessageId)
 * 2) Insert OutboundMessageLog row FIRST with status="PENDING" using UNIQUE constraint on outboundDedupeKey
 * 3) If insert fails (unique violation) => DO NOT SEND, return early
 * 4) If insert succeeds => send WhatsApp message
 * 5) Update OutboundMessageLog to status="SENT" with provider id
 * 6) If send fails => status="FAILED" and store error
 */

import { prisma } from '../prisma'
import { createHash } from 'crypto'
import { sendTextMessage } from '../whatsapp'
import { withGlobalGreeting } from './globalGreeting'

export interface OutboundSendOptions {
  conversationId: number
  contactId: number
  leadId: number | null
  phone: string
  text: string | unknown // Allow unknown to catch JSON objects/strings
  provider: 'whatsapp' | 'email' | 'instagram' | 'facebook'
  triggerProviderMessageId?: string | null
  replyType?: 'greeting' | 'question' | 'answer' | 'closing' | 'manual' | 'test' | 'followup' | 'reminder'
  lastQuestionKey?: string | null
  flowStep?: string | null
}

export interface OutboundSendResult {
  success: boolean
  messageId?: string
  outboundLogId?: number
  wasDuplicate?: boolean
  error?: string
}

/**
 * Normalize outbound text to ensure it's always plain text (never JSON)
 * Handles:
 * - JSON strings like '{"reply":"Hello"}' -> extracts "Hello"
 * - JSON objects like {reply: "Hello"} -> extracts "Hello"
 * - Plain strings -> returns as-is
 * - Other types -> converts to string
 */
export function normalizeOutboundText(input: unknown): string {
  if (typeof input === 'string') {
    const t = input.trim()
    if (t.startsWith('{') && t.includes('"reply"')) {
      try {
        const obj = JSON.parse(t)
        if (obj && typeof obj.reply === 'string') return obj.reply.trim()
      } catch {}
    }
    return t
  }
  if (input && typeof input === 'object') {
    const anyObj: any = input
    if (typeof anyObj.reply === 'string') return anyObj.reply.trim()
    if (typeof anyObj.text === 'string') return anyObj.text.trim()
  }
  return String(input ?? '').trim()
}

/**
 * CRITICAL FIX D: Compute unified idempotency key
 * For auto-reply jobs (triggerProviderMessageId exists):
 * - Format: hash(conversationId + inboundProviderMessageId + channel + purpose=auto_reply)
 * - This matches the key used in OutboundJob
 * 
 * For manual/test/reminder sends (triggerProviderMessageId is null):
 * - Format: hash(conversationId + replyType + normalizedQuestionKey + dayBucket + textHash)
 * - Includes text hash to prevent same message sent twice in same day
 */
function computeOutboundDedupeKey(options: OutboundSendOptions): string {
  const { conversationId, replyType, lastQuestionKey, triggerProviderMessageId, text, provider } = options
  
  // CRITICAL FIX D: For auto-reply (triggerProviderMessageId exists), use unified key format
  if (triggerProviderMessageId) {
    const keyParts = [
      `conv:${conversationId}`,
      `inbound:${triggerProviderMessageId}`,
      `channel:${provider}`,
      `purpose:auto_reply`,
    ]
    const keyString = keyParts.join('|')
    return createHash('sha256').update(keyString).digest('hex')
  }
  
  // For manual sends, use existing logic with text hash
  const normalizedText = normalizeOutboundText(text)
  const normalizedQuestionKey = lastQuestionKey 
    ? lastQuestionKey.trim().toLowerCase().replace(/\s+/g, '_')
    : 'none'
  const textForHash = normalizedText.toLowerCase().replace(/\s+/g, ' ')
  const textHash = createHash('sha256').update(textForHash).digest('hex').substring(0, 16)
  const dayBucket = new Date().toISOString().split('T')[0]
  
  const keyParts = [
    `conv:${conversationId}`,
    `type:${replyType || 'unknown'}`,
    `q:${normalizedQuestionKey}`,
    `id:${dayBucket}`,
    `text:${textHash}`,
  ]
  
  const keyString = keyParts.join('|')
  return createHash('sha256').update(keyString).digest('hex')
}

/**
 * Send outbound message with hard idempotency
 */
export async function sendOutboundWithIdempotency(
  options: OutboundSendOptions
): Promise<OutboundSendResult> {
  const { conversationId, contactId, leadId, phone, text: rawText, provider, triggerProviderMessageId, replyType, lastQuestionKey, flowStep } = options
  
  // CRITICAL: Normalize text to ensure it's always plain text (never JSON)
  let text = normalizeOutboundText(rawText)
  
  // CRITICAL FIX 2: Sanitize reply text (last line of defense before sending)
  const { sanitizeReplyText } = await import('../ai/sanitizeReplyText')
  const sanitized = sanitizeReplyText(text)
  if (sanitized.wasJson) {
    console.warn(`[OUTBOUND-IDEMPOTENCY] Sanitized JSON reply before send: ${text.substring(0, 100)} -> ${sanitized.text.substring(0, 100)}`)
  }
  text = sanitized.text
  
  // Step 0.5: DUPLICATE QUESTION SEND BLOCKER
  // If this is a question (replyType='question' and lastQuestionKey exists),
  // check if we already sent this question recently (within last 60 minutes)
  if (replyType === 'question' && lastQuestionKey) {
    const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000)
    
    const recentQuestion = await prisma.outboundMessageLog.findFirst({
      where: {
        conversationId,
        replyType: 'question',
        lastQuestionKey: lastQuestionKey,
        status: 'SENT',
        sentAt: {
          gte: sixtyMinutesAgo,
        },
      },
      orderBy: {
        sentAt: 'desc',
      },
      take: 1,
    })
    
    if (recentQuestion) {
      console.log(`[OUTBOUND-IDEMPOTENCY] Duplicate question blocked: ${lastQuestionKey} was sent ${Math.round((Date.now() - recentQuestion.sentAt!.getTime()) / 1000 / 60)} minutes ago`)
      return {
        success: false,
        wasDuplicate: true,
        error: `Duplicate question blocked: ${lastQuestionKey} was sent recently`,
      }
    }
  }
  
  // Step 0.6: SANITIZE FORBIDDEN TERMS
  // Replace "Freelance Permit" and "Freelance Visa" with "Freelance (self-sponsored)"
  // C) BLOCK SERVICE LISTS: Remove any text containing service lists (e.g., "(Family Visa / Visit Visa / ...)")
  text = text.replace(/Freelance Permit/gi, 'Freelance (self-sponsored)')
  text = text.replace(/Freelance Visa/gi, 'Freelance (self-sponsored)')
  
  // Block service lists: Remove patterns like "(Family Visa / Visit Visa / ...)"
  const serviceListPattern = /\([^)]*(?:Visa|Permit|Setup|Services)[^)]*\)/gi
  if (serviceListPattern.test(text)) {
    console.warn(`⚠️ [OUTBOUND] Blocked service list in outbound text - sanitizing`)
    text = text.replace(serviceListPattern, '')
    text = text.trim()
    // If text becomes empty after removing list, use fallback
    if (!text || text.length === 0) {
      text = 'How can I help you today?'
    }
  }
  
  // Step 0: Detect first outbound message (before applying greeting)
  // This is safer than counting messages during retries
  let isFirstOutboundMessage = false
  
  if (provider === 'whatsapp') {
    // Check conversation's knownFields for firstGreetingSentAt
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { knownFields: true },
    })
    
    let knownFields: any = {}
    if (conversation?.knownFields) {
      try {
        knownFields = typeof conversation.knownFields === 'string'
          ? JSON.parse(conversation.knownFields)
          : conversation.knownFields
      } catch {
        knownFields = {}
      }
    }
    
    // Check if first greeting was already sent
    const firstGreetingSentAt = knownFields.firstGreetingSentAt
    
    if (!firstGreetingSentAt) {
      // This is the first outbound message
      isFirstOutboundMessage = true
      
      // Also check outbound message count as fallback
      const outboundCount = await prisma.message.count({
        where: {
          conversationId,
          direction: 'OUTBOUND',
        },
      })
      
      // If count is 0, confirm it's first message
      if (outboundCount === 0) {
        isFirstOutboundMessage = true
      } else {
        // Count > 0 but firstGreetingSentAt not set - likely a race condition
        // Don't add greeting to be safe
        isFirstOutboundMessage = false
      }
    } else {
      // First greeting already sent - not first message
      isFirstOutboundMessage = false
    }
    
    // CRITICAL: Normalize text BEFORE applying greeting (ensure it's a string, never JSON)
    const normalizedTextBeforeGreeting = normalizeOutboundText(text)
    // Apply global greeting prefix for WhatsApp messages (context-aware)
    text = withGlobalGreeting(normalizedTextBeforeGreeting, {
      isFirstOutboundMessage,
      conversationId,
    })
  } else {
    // For non-WhatsApp, still normalize text
    text = normalizeOutboundText(text)
  }
  
  // Step 1: Compute dedupe key (using normalized text, greeting applied if needed)
  const outboundDedupeKey = computeOutboundDedupeKey({ ...options, text })
  
  // CRITICAL FIX D: For auto-reply (triggerProviderMessageId exists), check OutboundJob idempotencyKey
  if (triggerProviderMessageId) {
    // Compute unified idempotency key (same format as OutboundJob)
    const jobIdempotencyKeyParts = [
      `conv:${conversationId}`,
      `inbound:${triggerProviderMessageId}`,
      `channel:${provider}`,
      `purpose:auto_reply`,
    ]
    const jobIdempotencyKey = createHash('sha256').update(jobIdempotencyKeyParts.join('|')).digest('hex')
    
    // Check if OutboundJob with this idempotencyKey already exists and is SENT
    const existingJob = await prisma.outboundJob.findUnique({
      where: { idempotencyKey: jobIdempotencyKey },
      select: { id: true, status: true },
    })
    
    if (existingJob && existingJob.status === 'SENT') {
      console.log(`[OUTBOUND-IDEMPOTENCY] OutboundJob ${existingJob.id} already SENT for idempotencyKey: ${jobIdempotencyKey.substring(0, 16)}...`)
      return {
        success: false,
        wasDuplicate: true,
        error: `OutboundJob already SENT for this inbound message`,
      }
    }
  }
  
  // Step 2: Try to insert OutboundMessageLog with status="PENDING"
  // This uses the UNIQUE constraint on outboundDedupeKey to prevent duplicates
  let outboundLogId: number
  let wasDuplicate = false
  
  try {
    const outboundLog = await prisma.outboundMessageLog.create({
      data: {
        provider,
        conversationId,
        triggerProviderMessageId: triggerProviderMessageId || null,
        outboundTextHash: createHash('sha256').update(text.toLowerCase()).digest('hex'),
        outboundDedupeKey, // UNIQUE constraint - will fail if duplicate
        status: 'PENDING',
        replyType: replyType || null,
        lastQuestionKey: lastQuestionKey || null,
        flowStep: flowStep || null,
        dayBucket: new Date().toISOString().split('T')[0],
      },
    })
    
    outboundLogId = outboundLog.id
    console.log(`[OUTBOUND-IDEMPOTENCY] Created PENDING log: ${outboundLogId}, dedupeKey: ${outboundDedupeKey.substring(0, 16)}...`)
  } catch (error: any) {
    // Check if it's a unique constraint violation (duplicate)
    if (error.code === 'P2002' && error.meta?.target?.includes('outboundDedupeKey')) {
      console.log(`[OUTBOUND-IDEMPOTENCY] Duplicate detected - dedupeKey: ${outboundDedupeKey.substring(0, 16)}...`)
      
      // Find existing log
      const existing = await prisma.outboundMessageLog.findUnique({
        where: { outboundDedupeKey },
        select: { id: true, status: true, providerMessageId: true },
      })
      
      return {
        success: false,
        wasDuplicate: true,
        outboundLogId: existing?.id,
        error: `Duplicate outbound message blocked by dedupe key`,
      }
    }
    
    // Other error - rethrow
    throw error
  }
  
  // Step 3: Text is already normalized above, but log before sending
  const textPreview = text.substring(0, 120)
  const textLength = text.length
  
  // Log BEFORE Meta API call
  console.log(`📤 [OUTBOUND-IDEMPOTENCY] Sending to Meta API conversationId=${conversationId} phone=${phone} textLength=${textLength} preview="${textPreview}${textLength > 120 ? '...' : ''}"`)
  
  // Step 4: Send message (only if insert succeeded)
  let messageId: string | undefined
  let sendError: Error | null = null
  
  try {
    if (provider === 'whatsapp') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'outbound/sendWithIdempotency.ts:286',message:'Before sendTextMessage call',data:{phone,textLength:text.length,provider},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      const result = await sendTextMessage(phone, text, { // Use normalized text (already normalized above)
        contactId,
        leadId,
        skipIdempotency: true, // We're handling idempotency here
      })
      messageId = result.messageId
      
      // Log AFTER send with messageId
      console.log(`✅ [OUTBOUND-IDEMPOTENCY] Meta API send succeeded messageId=${messageId} conversationId=${conversationId}`)
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'outbound/sendWithIdempotency.ts:293',message:'sendTextMessage succeeded',data:{messageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
    } else if (provider === 'instagram') {
      // Get Instagram configuration
      const { getInstagramMetaConfig, sendInstagramViaMeta } = await import('../instagramMeta')
      const config = await getInstagramMetaConfig()
      
      if (!config) {
        throw new Error('Instagram integration not configured. Please configure in /admin/integrations')
      }
      
      // Extract Instagram user ID from phone (remove 'ig:' prefix if present)
      const instagramUserId = phone.startsWith('ig:') ? phone.substring(3) : phone
      
      console.log(`📤 [OUTBOUND-IDEMPOTENCY] Sending Instagram message to ${instagramUserId} (conversationId: ${conversationId})`)
      
      const result = await sendInstagramViaMeta(instagramUserId, text, config)
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to send Instagram message')
      }
      
      messageId = result.messageId
      console.log(`✅ [OUTBOUND-IDEMPOTENCY] Instagram API send succeeded messageId=${messageId} conversationId=${conversationId}`)
    } else {
      // Other providers not implemented yet
      throw new Error(`Provider ${provider} not implemented`)
    }
    
    // Step 4: Update log to SENT
    await prisma.outboundMessageLog.update({
      where: { id: outboundLogId },
      data: {
        status: 'SENT',
        providerMessageId: messageId || null,
        sentAt: new Date(),
      },
    })
    
    // Task D: Create Message record for Inbox UI visibility
    // This ensures outbound messages appear in the Inbox and conversation history
    // Task D: After WhatsApp send succeeds and OutboundMessageLog is marked SENT
    // Task D: Wrap DB writes in try/catch so send success does not get reversed by UI logging failure
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'outbound/sendWithIdempotency.ts:312',message:'Before Message row creation',data:{conversationId,messageId,provider},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
    // #endregion
    try {
      const channelUpper = provider.toUpperCase() as 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'
      const sentAt = new Date()
      
      // Task D: Create Message row (OUTBOUND) with providerMessageId and final text
      // Use normalizedText (never raw text which might be JSON)
      await prisma.message.create({
        data: {
          conversationId,
          contactId,
          leadId,
          direction: 'OUTBOUND',
          channel: channelUpper,
          type: 'text',
          body: text, // Use normalized text (already normalized above, never JSON)
          providerMessageId: messageId || null,
          status: 'SENT',
          sentAt,
        },
      })
      
      // Task D: Update conversation timestamps (lastOutboundAt, lastMessageAt)
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          lastOutboundAt: sentAt,
          lastMessageAt: sentAt,
        },
      })
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'outbound/sendWithIdempotency.ts:338',message:'Message row created',data:{conversationId,messageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      console.log(`[OUTBOUND-IDEMPOTENCY] Message row created conversationId=${conversationId} messageId=${messageId} providerMessageId=${messageId || 'N/A'}`)
    } catch (messageError: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'outbound/sendWithIdempotency.ts:341',message:'Message row creation failed',data:{conversationId,messageId,error:messageError.message,code:messageError.code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      // Task D: DO log errors but don't fail the send (send success should not be reversed)
      // This could fail if Message already exists (unique constraint on providerMessageId)
      console.warn(`[OUTBOUND-IDEMPOTENCY] Message row creation failed (non-critical) conversationId=${conversationId} messageId=${messageId} error="${messageError.message}"`)
    }
    
    // Step 4.6: If this was the first outbound message, persist firstGreetingSentAt
    if (isFirstOutboundMessage && provider === 'whatsapp') {
      try {
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { knownFields: true },
        })
        
        let knownFields: any = {}
        if (conversation?.knownFields) {
          try {
            knownFields = typeof conversation.knownFields === 'string'
              ? JSON.parse(conversation.knownFields)
              : conversation.knownFields
          } catch {
            knownFields = {}
          }
        }
        
        // Only set if not already set (idempotent)
        if (!knownFields.firstGreetingSentAt) {
          knownFields.firstGreetingSentAt = new Date().toISOString()
          
          await prisma.conversation.update({
            where: { id: conversationId },
            data: {
              knownFields: JSON.stringify(knownFields),
            },
          })
          
          console.log(`[OUTBOUND-IDEMPOTENCY] Marked first greeting as sent for conversation ${conversationId}`)
        }
      } catch (error: any) {
        // Non-critical - log but don't fail
        console.warn(`[OUTBOUND-IDEMPOTENCY] Failed to persist firstGreetingSentAt:`, error.message)
      }
    }
    
    console.log(`[OUTBOUND-IDEMPOTENCY] Message sent successfully: ${messageId}, log: ${outboundLogId}`)
    
    return {
      success: true,
      messageId,
      outboundLogId,
    }
  } catch (error: any) {
    sendError = error
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'outbound/sendWithIdempotency.ts:408',message:'sendWithIdempotency error caught',data:{errorMessage:error.message,errorStack:error.stack?.substring(0,200),errorCode:error.code,outboundLogId,conversationId,phone},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
    // #endregion
    
    // Enhanced error logging for debugging
    console.error(`[OUTBOUND-IDEMPOTENCY] Message send failed: ${error.message}, log: ${outboundLogId}`)
    console.error(`[OUTBOUND-IDEMPOTENCY] Error details:`, {
      errorMessage: error.message,
      errorCode: error.code,
      errorStack: error.stack?.substring(0, 500),
      conversationId,
      phone,
      provider,
    })
    
    // Step 5: Update log to FAILED
    try {
      await prisma.outboundMessageLog.update({
        where: { id: outboundLogId },
        data: {
          status: 'FAILED',
          error: error.message || 'Unknown error',
          failedAt: new Date(),
        },
      })
    } catch (updateError: any) {
      console.error(`[OUTBOUND-IDEMPOTENCY] Failed to update log status:`, updateError.message)
    }
    
    return {
      success: false,
      outboundLogId,
      error: error.message || 'Unknown error',
    }
  }
}

