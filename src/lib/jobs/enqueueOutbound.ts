/**
 * ENQUEUE OUTBOUND JOB
 * 
 * Fast, async job enqueueing for webhook handlers.
 * Webhook returns <300ms after enqueuing job.
 * Job runner processes jobs asynchronously.
 */

import { prisma } from '../prisma'
import { randomUUID } from 'crypto'

export interface EnqueueOutboundJobInput {
  conversationId: number
  inboundMessageId: number
  inboundProviderMessageId: string | null
  requestId?: string
}

/**
 * Enqueue an outbound job for async processing
 * Returns immediately (webhook can return 200)
 */
export async function enqueueOutboundJob(
  input: EnqueueOutboundJobInput
): Promise<{ jobId: number; wasDuplicate: boolean }> {
  const requestId = input.requestId || `req_${Date.now()}_${randomUUID().substring(0, 8)}`
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'jobs/enqueueOutbound.ts:23',message:'enqueueOutboundJob entry',data:{conversationId:input.conversationId,inboundMessageId:input.inboundMessageId,inboundProviderMessageId:input.inboundProviderMessageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  try {
    // Try to create job (unique constraint on inboundProviderMessageId prevents duplicates)
    // Status: PENDING (will be picked up by job runner)
    const job = await prisma.outboundJob.create({
      data: {
        conversationId: input.conversationId,
        inboundMessageId: input.inboundMessageId,
        inboundProviderMessageId: input.inboundProviderMessageId,
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

