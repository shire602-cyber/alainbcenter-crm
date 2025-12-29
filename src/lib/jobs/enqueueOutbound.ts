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
  
  try {
    // Try to create job (unique constraint on inboundProviderMessageId prevents duplicates)
    const job = await prisma.outboundJob.create({
      data: {
        conversationId: input.conversationId,
        inboundMessageId: input.inboundMessageId,
        inboundProviderMessageId: input.inboundProviderMessageId,
        status: 'queued',
        runAt: new Date(), // Run immediately
        requestId,
      },
    })
    
    console.log(`✅ [JOB-ENQUEUE] Job ${job.id} enqueued for conversation ${input.conversationId}, message ${input.inboundMessageId} (requestId: ${requestId})`)
    
    return { jobId: job.id, wasDuplicate: false }
  } catch (error: any) {
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

