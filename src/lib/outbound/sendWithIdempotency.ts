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

export interface OutboundSendOptions {
  conversationId: number
  contactId: number
  leadId: number | null
  phone: string
  text: string
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
 * Compute outbound dedupe key
 * Format: hash(conversationId + replyType + normalizedQuestionKey + dayBucket OR inboundMessageId + textHash)
 * 
 * For manual/test/reminder sends (triggerProviderMessageId is null):
 * - Includes text hash to prevent same message sent twice in same day
 * - Uses dayBucket for day-based deduplication
 * 
 * For webhook-driven replies (triggerProviderMessageId exists):
 * - Uses inboundMessageId for stronger correlation
 * - Text hash still included for safety
 */
function computeOutboundDedupeKey(options: OutboundSendOptions): string {
  const { conversationId, replyType, lastQuestionKey, triggerProviderMessageId, text } = options
  
  // Normalize question key (remove whitespace, lowercase)
  const normalizedQuestionKey = lastQuestionKey 
    ? lastQuestionKey.trim().toLowerCase().replace(/\s+/g, '_')
    : 'none'
  
  // Normalize text for hash (trim, lowercase, remove extra whitespace)
  const normalizedText = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const textHash = createHash('sha256').update(normalizedText).digest('hex').substring(0, 16) // First 16 chars for shorter key
  
  // Use day bucket (YYYY-MM-DD) for day-based deduplication, or inboundMessageId if available
  const dayBucket = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const dedupeIdentifier = triggerProviderMessageId || dayBucket
  
  // Build key components
  // CRITICAL: Include text hash for manual sends to prevent same message sent twice in same day
  const keyParts = [
    `conv:${conversationId}`,
    `type:${replyType || 'unknown'}`,
    `q:${normalizedQuestionKey}`,
    `id:${dedupeIdentifier}`,
    `text:${textHash}`, // Include text hash for manual sends
  ]
  
  const keyString = keyParts.join('|')
  
  // Hash for consistent length and security
  return createHash('sha256').update(keyString).digest('hex')
}

/**
 * Send outbound message with hard idempotency
 */
export async function sendOutboundWithIdempotency(
  options: OutboundSendOptions
): Promise<OutboundSendResult> {
  const { conversationId, contactId, leadId, phone, text, provider, triggerProviderMessageId, replyType, lastQuestionKey, flowStep } = options
  
  // Step 1: Compute dedupe key
  const outboundDedupeKey = computeOutboundDedupeKey(options)
  
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
        outboundTextHash: createHash('sha256').update(text.trim().toLowerCase()).digest('hex'),
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
  
  // Step 3: Send message (only if insert succeeded)
  let messageId: string | undefined
  let sendError: Error | null = null
  
  try {
    if (provider === 'whatsapp') {
      const result = await sendTextMessage(phone, text, {
        contactId,
        leadId,
        skipIdempotency: true, // We're handling idempotency here
      })
      messageId = result.messageId
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
    
    console.log(`[OUTBOUND-IDEMPOTENCY] Message sent successfully: ${messageId}, log: ${outboundLogId}`)
    
    return {
      success: true,
      messageId,
      outboundLogId,
    }
  } catch (error: any) {
    sendError = error
    
    // Step 5: Update log to FAILED
    await prisma.outboundMessageLog.update({
      where: { id: outboundLogId },
      data: {
        status: 'FAILED',
        error: error.message || 'Unknown error',
        failedAt: new Date(),
      },
    })
    
    console.error(`[OUTBOUND-IDEMPOTENCY] Message send failed: ${error.message}, log: ${outboundLogId}`)
    
    return {
      success: false,
      outboundLogId,
      error: error.message || 'Unknown error',
    }
  }
}

