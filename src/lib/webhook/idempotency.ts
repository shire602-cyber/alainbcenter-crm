/**
 * Webhook Idempotency Handler
 * 
 * Ensures each inbound message is processed exactly once, even with Meta retries
 */

import { prisma } from '../prisma'
import crypto from 'crypto'

export interface IdempotencyResult {
  isDuplicate: boolean
  dedupRecord?: any
  conversationId?: number
}

/**
 * Check if inbound message is duplicate (hard idempotency)
 * Returns immediately with 200 OK if duplicate
 */
export async function checkInboundIdempotency(
  provider: string,
  providerMessageId: string,
  conversationId?: number
): Promise<IdempotencyResult> {
  try {
    // Attempt to insert dedup record
    const dedupRecord = await prisma.inboundMessageDedup.create({
      data: {
        provider,
        providerMessageId,
        conversationId: conversationId || null,
        processingStatus: 'PROCESSING',
      },
    })
    
    console.log(`✅ [IDEMPOTENCY] New message - not duplicate: ${providerMessageId}`)
    return {
      isDuplicate: false,
      dedupRecord,
      conversationId: conversationId || undefined,
    }
  } catch (error: any) {
    // Unique constraint violation = duplicate
    if (error.code === 'P2002' || error.message?.includes('Unique constraint')) {
      console.log(`⚠️ [IDEMPOTENCY] Duplicate message detected: ${providerMessageId}`)
      
      // Fetch existing record
      const existing = await prisma.inboundMessageDedup.findUnique({
        where: { providerMessageId },
      })
      
      return {
        isDuplicate: true,
        dedupRecord: existing,
        conversationId: existing?.conversationId || undefined,
      }
    }
    
    // Other error - rethrow
    throw error
  }
}

/**
 * Mark inbound message as processed
 */
export async function markInboundProcessed(
  providerMessageId: string,
  success: boolean,
  error?: string
): Promise<void> {
  try {
    await prisma.inboundMessageDedup.update({
      where: { providerMessageId },
      data: {
        processingStatus: success ? 'COMPLETED' : 'FAILED',
        processedAt: new Date(),
        error: error || null,
      },
    })
  } catch (error: any) {
    console.error(`❌ [IDEMPOTENCY] Failed to mark processed: ${error.message}`)
  }
}

/**
 * Check if outbound reply was already sent for this inbound message
 */
export async function checkOutboundIdempotency(
  provider: string,
  triggerProviderMessageId: string
): Promise<{ alreadySent: boolean; logRecord?: any }> {
  try {
    const existing = await prisma.outboundMessageLog.findUnique({
      where: {
        provider_triggerProviderMessageId: {
          provider,
          triggerProviderMessageId,
        },
      },
    })
    
    if (existing) {
      console.log(`⚠️ [IDEMPOTENCY] Outbound already sent for inbound: ${triggerProviderMessageId}`)
      return { alreadySent: true, logRecord: existing }
    }
    
    return { alreadySent: false }
  } catch (error: any) {
    // If unique constraint doesn't exist yet, allow
    console.warn(`⚠️ [IDEMPOTENCY] Outbound check error (non-blocking): ${error.message}`)
    return { alreadySent: false }
  }
}

/**
 * Log outbound message (idempotency)
 */
export async function logOutboundMessage(
  provider: string,
  conversationId: number,
  triggerProviderMessageId: string | null,
  outboundText: string,
  outboundMessageId: number | null,
  flowStep?: string,
  lastQuestionKey?: string
): Promise<void> {
  try {
    // Create hash of message text for deduplication
    const textHash = crypto
      .createHash('sha256')
      .update(outboundText)
      .digest('hex')
    
    await prisma.outboundMessageLog.create({
      data: {
        provider,
        conversationId,
        triggerProviderMessageId: triggerProviderMessageId || null,
        outboundTextHash: textHash,
        outboundMessageId: outboundMessageId || null,
        flowStep: flowStep || null,
        lastQuestionKey: lastQuestionKey || null,
      },
    })
    
    console.log(`✅ [IDEMPOTENCY] Logged outbound message for inbound: ${triggerProviderMessageId || 'none'}`)
  } catch (error: any) {
    // If unique constraint violation, that's OK - already logged
    if (error.code === 'P2002') {
      console.log(`⚠️ [IDEMPOTENCY] Outbound already logged (duplicate): ${triggerProviderMessageId || 'none'}`)
    } else {
      console.error(`❌ [IDEMPOTENCY] Failed to log outbound: ${error.message}`)
    }
  }
}

