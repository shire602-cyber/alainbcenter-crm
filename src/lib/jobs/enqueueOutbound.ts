/**
 * ENQUEUE OUTBOUND JOB
 * 
 * Fast, async job enqueueing for webhook handlers.
 * Webhook returns <300ms after enqueuing job.
 * Job runner processes jobs asynchronously.
 */

import { prisma } from '../prisma'
import { randomUUID } from 'crypto'
import { createHash } from 'crypto'

export interface EnqueueOutboundJobInput {
  conversationId: number
  inboundMessageId: number
  inboundProviderMessageId: string | null
  requestId?: string
  channel?: string // For idempotency key computation
}

/**
 * CRITICAL FIX D: Compute unified idempotency key
 * Format: hash(conversationId + inboundProviderMessageId + channel + purpose=auto_reply)
 * This matches the key used in sendWithIdempotency
 */
export function computeIdempotencyKey(
  conversationId: number,
  inboundProviderMessageId: string | null,
  channel: string = 'whatsapp'
): string {
  const keyParts = [
    `conv:${conversationId}`,
    `inbound:${inboundProviderMessageId || 'none'}`,
    `channel:${channel}`,
    `purpose:auto_reply`,
  ]
  const keyString = keyParts.join('|')
  return createHash('sha256').update(keyString).digest('hex')
}

/**
 * Enqueue an outbound job for async processing
 * Returns immediately (webhook can return 200)
 */
export async function enqueueOutboundJob(
  input: EnqueueOutboundJobInput
): Promise<{ jobId: number; wasDuplicate: boolean }> {
  const requestId = input.requestId || `req_${Date.now()}_${randomUUID().substring(0, 8)}`
  const channel = input.channel || 'whatsapp'
  
  // CRITICAL FIX D: Compute unified idempotency key
  const idempotencyKey = computeIdempotencyKey(
    input.conversationId,
    input.inboundProviderMessageId,
    channel
  )
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'jobs/enqueueOutbound.ts:23',message:'enqueueOutboundJob entry',data:{conversationId:input.conversationId,inboundMessageId:input.inboundMessageId,inboundProviderMessageId:input.inboundProviderMessageId,idempotencyKey},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  try {
    // CRITICAL FIX D: Check for existing job by idempotencyKey first
    const existingJob = await prisma.outboundJob.findUnique({
      where: { idempotencyKey },
      select: { id: true, status: true },
    })
    
    if (existingJob) {
      console.log(`⚠️ [JOB-ENQUEUE] Duplicate job blocked by idempotencyKey: ${idempotencyKey.substring(0, 16)}... (job ${existingJob.id}, status: ${existingJob.status})`)
      return { jobId: existingJob.id, wasDuplicate: true }
    }
    
    // Try to create job (unique constraint on inboundProviderMessageId prevents duplicates)
    // Status: PENDING (will be picked up by job runner)
    const job = await prisma.outboundJob.create({
      data: {
        conversationId: input.conversationId,
        inboundMessageId: input.inboundMessageId,
        inboundProviderMessageId: input.inboundProviderMessageId,
        idempotencyKey, // CRITICAL FIX D: Store unified idempotency key
        status: 'PENDING', // New status enum: PENDING | GENERATING | READY_TO_SEND | SENT | FAILED
        runAt: new Date(), // Run immediately
        requestId,
      },
    })
    
    console.log(`✅ [JOB-ENQUEUE] Job ${job.id} enqueued for conversation ${input.conversationId}, message ${input.inboundMessageId} (requestId: ${requestId})`)
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'jobs/enqueueOutbound.ts:41',message:'Job enqueued successfully',data:{jobId:job.id,conversationId:input.conversationId,wasDuplicate:false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return { jobId: job.id, wasDuplicate: false }
  } catch (error: any) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'jobs/enqueueOutbound.ts:44',message:'enqueueOutboundJob error',data:{errorCode:error.code,errorMessage:error.message,isDuplicate:error.code==='P2002'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    // Check if it's a unique constraint violation (duplicate inboundProviderMessageId)
    if (error.code === 'P2002' && error.meta?.target?.includes('inboundProviderMessageId')) {
      console.log(`⚠️ [JOB-ENQUEUE] Duplicate job blocked for inboundProviderMessageId: ${input.inboundProviderMessageId} (requestId: ${requestId})`)
      
      // Return existing job ID
      // Convert null to undefined for Prisma where clause
      const existingJob = await prisma.outboundJob.findUnique({
        where: { inboundProviderMessageId: input.inboundProviderMessageId ?? undefined },
        select: { id: true },
      })
      
      return { 
        jobId: existingJob?.id || 0, 
        wasDuplicate: true 
      }
    }
    
    // Re-throw other errors
    throw error
  }
}

