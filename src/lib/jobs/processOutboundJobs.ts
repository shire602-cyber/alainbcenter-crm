/**
 * SHARED JOB PROCESSING LOGIC
 * 
 * Core logic for processing outbound jobs.
 * Used by both:
 * - /api/jobs/run-outbound (manual/debug trigger)
 * - /api/cron/run-outbound-jobs (Vercel cron trigger)
 */

import { prisma } from '@/lib/prisma'
import { sendAiReply } from '@/lib/ai/orchestrator'

export interface ProcessOutboundJobsOptions {
  max?: number
  requestId?: string
  source: 'cron' | 'manual' | 'webhook'
}

export interface ProcessOutboundJobsResult {
  ok: boolean
  processed: number
  failed: number
  jobIds: {
    processed: number[]
    failed: number[]
  }
  message?: string
  error?: string
  code?: string
}

/**
 * Process queued outbound jobs
 */
export async function processOutboundJobs(
  options: ProcessOutboundJobsOptions
): Promise<ProcessOutboundJobsResult> {
  const { max = 10, requestId = `process_${Date.now()}`, source } = options
  
  const processed: number[] = []
  const failed: number[] = []
  
  try {
    // Stale job recovery - Reset jobs stuck in GENERATING or READY_TO_SEND for >5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const staleJobsRecoveredCount = await prisma.$executeRaw`
      UPDATE "OutboundJob"
      SET 
        status = 'PENDING',
        "claimedAt" = NULL,
        "lastAttemptAt" = NOW()
      WHERE status IN ('GENERATING', 'READY_TO_SEND')
        AND (
          "claimedAt" < ${fiveMinutesAgo}
          OR ("claimedAt" IS NULL AND "startedAt" < ${fiveMinutesAgo})
        )
    `
    if (staleJobsRecoveredCount > 0) {
      console.log(`🔄 [JOB-PROCESSOR] Recovered ${staleJobsRecoveredCount} stale job(s) source=${source} requestId=${requestId}`)
    }
    
    // Pick PENDING or READY_TO_SEND jobs with FOR UPDATE SKIP LOCKED (PostgreSQL)
    // PENDING: needs AI generation
    // READY_TO_SEND: AI content already generated, just needs sending
    // This ensures only one worker processes each job
    // Also claim the job by setting claimedAt for optimistic locking
    
    // First, check for jobs that are not due yet (for logging)
    const notDueJobs = await prisma.$queryRaw<Array<{ id: number; runAt: Date }>>`
      SELECT id, "runAt"
      FROM "OutboundJob"
      WHERE status IN ('PENDING', 'READY_TO_SEND')
        AND "runAt" > NOW()
      LIMIT 5
    `
    if (notDueJobs.length > 0) {
      console.log(`⏰ [JOB-PROCESSOR] ${notDueJobs.length} job(s) not due yet (scheduled in future) source=${source} requestId=${requestId}`, 
        notDueJobs.map(j => ({ jobId: j.id, runAt: j.runAt.toISOString() }))
      )
    }
    
    const jobs = await prisma.$queryRaw<Array<{
      id: number
      conversationId: number
      inboundMessageId: number
      inboundProviderMessageId: string | null
      requestId: string | null
      attempts: number
      maxAttempts: number
      status: string
      content: string | null
      runAt: Date
    }>>`
      SELECT id, "conversationId", "inboundMessageId", "inboundProviderMessageId", "requestId", attempts, "maxAttempts", status, content, "runAt"
      FROM "OutboundJob"
      WHERE status IN ('PENDING', 'READY_TO_SEND')
        AND "runAt" <= NOW()
        AND ("claimedAt" IS NULL OR "claimedAt" < NOW() - INTERVAL '5 minutes')
      ORDER BY 
        CASE status 
          WHEN 'READY_TO_SEND' THEN 0 
          WHEN 'PENDING' THEN 1 
        END,
        "runAt" ASC
      LIMIT ${max}
      FOR UPDATE SKIP LOCKED
    `
    
    if (jobs.length === 0) {
      return {
        ok: true,
        processed: 0,
        failed: 0,
        jobIds: { processed: [], failed: [] },
        message: 'No jobs to process',
      }
    }
    
    console.log(`📦 [JOB-PROCESSOR] Processing ${jobs.length} job(s) source=${source} requestId=${requestId}`)
    
    for (const job of jobs) {
      const jobRequestId = job.requestId || `job_${job.id}_${Date.now()}`
      
      try {
        // Handle job based on current status
        const now = new Date()
        let aiGeneratedContent: string | null = null
        let orchestratorResult: any = null
        
        if (job.status === 'READY_TO_SEND') {
          // Job already has AI content - skip generation, go straight to sending
          aiGeneratedContent = job.content
          console.log(`✅ [JOB-PROCESSOR] picked jobId=${job.id} requestId=${jobRequestId} status=READY_TO_SEND contentLength=${aiGeneratedContent?.length || 0} - skipping AI generation`)
        } else {
          // PENDING job - needs AI generation
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'GENERATING',
              startedAt: now,
              claimedAt: now, // Optimistic locking: claim the job
              attempts: { increment: 1 },
              lastAttemptAt: now, // Update last_attempt_at on every retry
            },
          })
          
          console.log(`✅ [JOB-PROCESSOR] picked jobId=${job.id} requestId=${jobRequestId} conversationId=${job.conversationId} inboundProviderMessageId=${job.inboundProviderMessageId || 'N/A'} status=GENERATING claimedAt=${now.toISOString()}`)
        }
        
        // Load conversation and message
        console.log(`📥 [JOB-PROCESSOR] Loading conversation jobId=${job.id} requestId=${jobRequestId} conversationId=${job.conversationId}`)
        const conversation = await prisma.conversation.findUnique({
          where: { id: job.conversationId },
          include: {
            contact: true,
            lead: {
              include: {
                serviceType: true,
              },
            },
          },
        })
        
        if (!conversation) {
          throw new Error(`Conversation ${job.conversationId} not found`)
        }
        
        console.log(`✅ [JOB-PROCESSOR] Conversation loaded jobId=${job.id} requestId=${jobRequestId} conversationId=${conversation.id} contactId=${conversation.contactId} leadId=${conversation.leadId || 'N/A'}`)
        
        // Load inbound message
        console.log(`📥 [JOB-PROCESSOR] Loading inbound message jobId=${job.id} requestId=${jobRequestId} inboundMessageId=${job.inboundMessageId}`)
        const message = job.inboundMessageId 
          ? await prisma.message.findUnique({
              where: { id: job.inboundMessageId },
            })
          : null
        
        if (!message || message.direction !== 'INBOUND') {
          throw new Error(`Inbound message ${job.inboundMessageId} not found or not inbound`)
        }
        
        console.log(`✅ [JOB-PROCESSOR] Inbound message loaded jobId=${job.id} requestId=${jobRequestId} messageId=${message.id} bodyLength=${message.body?.length || 0}`)
        
        if (!conversation.lead || !conversation.contact) {
          throw new Error(`Conversation ${job.conversationId} missing lead or contact`)
        }
        
        // Check if conversation is assigned to a user (skip auto-reply if assigned)
        if (conversation.assignedUserId !== null && conversation.assignedUserId !== undefined) {
          console.log(`⏭️ [JOB-PROCESSOR] Skipping job ${job.id} - conversation assigned to user ${conversation.assignedUserId}`)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'SENT',
              completedAt: new Date(),
            },
          })
          processed.push(job.id)
          continue
        }
        
        // CRITICAL: Use sendAiReply wrapper (provides idempotency + locking)
        // This replaces the old generateAIReply + sendOutboundWithIdempotency flow
        if (job.status === 'PENDING' || !aiGeneratedContent) {
          console.log(`🎯 [JOB-PROCESSOR] sendAiReply start jobId=${job.id} requestId=${jobRequestId} conversationId=${conversation.id} inboundMessageId=${message.id}`)
          const sendStartTime = Date.now()
          
          try {
            const sendResult = await sendAiReply({
              conversationId: conversation.id,
              leadId: conversation.lead.id,
              contactId: conversation.contact.id,
              inboundText: message.body || '',
              inboundMessageId: message.id,
              channel: message.channel,
              language: 'en',
            }, 'auto_reply')
            
            const sendElapsed = Date.now() - sendStartTime
            
            if (sendResult.wasDuplicate || sendResult.skipped) {
              console.log(`⏭️ [JOB-PROCESSOR] Reply skipped for job ${job.id}: ${sendResult.skipReason || 'Duplicate'}`)
              await prisma.outboundJob.update({
                where: { id: job.id },
                data: {
                  status: 'SENT',
                  completedAt: new Date(),
                },
              })
              processed.push(job.id)
              continue
            }
            
            if (sendResult.success && sendResult.messageId) {
              console.log(`✅ [JOB-PROCESSOR] sendAiReply end jobId=${job.id} requestId=${jobRequestId} messageId=${sendResult.messageId} elapsed=${sendElapsed}ms`)
              
              await prisma.outboundJob.update({
                where: { id: job.id },
                data: {
                  status: 'SENT',
                  completedAt: new Date(),
                },
              })
              
              processed.push(job.id)
            } else {
              throw new Error(sendResult.error || 'Send failed')
            }
          } catch (sendError: any) {
            // If send fails, save error and mark as FAILED
            console.error(`❌ [JOB-PROCESSOR] sendAiReply failed jobId=${job.id}:`, sendError.message)
            await prisma.outboundJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                error: `Send failed: ${sendError.message}`,
                errorLog: JSON.stringify({
                  error: sendError.message,
                  stack: sendError.stack,
                  timestamp: new Date().toISOString(),
                }),
                completedAt: new Date(),
              },
            })
            failed.push(job.id)
            continue
          }
        } else {
          // READY_TO_SEND status - content already generated, but we should still use sendAiReply for idempotency
          // However, since content is already generated, we can skip AI generation and just send
          // This is a legacy path - new jobs should always go through sendAiReply
          console.warn(`⚠️ [JOB-PROCESSOR] Job ${job.id} has READY_TO_SEND status - legacy path, should use sendAiReply`)
          
          // For now, mark as done (content was already sent in previous attempt)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'SENT',
              completedAt: new Date(),
            },
          })
          processed.push(job.id)
        }
        
      } catch (error: any) {
        console.error(`❌ [JOB-PROCESSOR] Job ${job.id} failed:`, error.message)
        console.error(`❌ [JOB-PROCESSOR] Error stack:`, error.stack)
        
        // Log Meta API response if error contains WhatsApp API details
        if (error.message && typeof error.message === 'string' && (error.message.includes('WhatsApp API') || error.message.includes('Meta'))) {
          console.error(`❌ [JOB-PROCESSOR] Meta API error response jobId=${job.id} requestId=${jobRequestId} errorMessage="${error.message}" errorCode=${error.code || 'N/A'}`)
        }
        
        // Check if we should retry
        const shouldRetry = job.attempts < job.maxAttempts
        
        if (shouldRetry) {
          // Exponential backoff: 2^attempts seconds
          const backoffSeconds = Math.pow(2, job.attempts)
          const runAt = new Date(Date.now() + backoffSeconds * 1000)
          
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'PENDING', // Updated to new status enum
              runAt,
              error: error.message?.substring(0, 500) || 'Unknown error',
              errorLog: JSON.stringify({
                error: error.message,
                stack: error.stack?.substring(0, 1000),
                timestamp: new Date().toISOString(),
                attempt: job.attempts + 1,
              }),
              lastAttemptAt: new Date(), // Update last_attempt_at on retry
              claimedAt: null, // Release claim for retry
            },
          })
          
          console.log(`🔄 [JOB-PROCESSOR] Job ${job.id} will retry in ${backoffSeconds}s (attempt ${job.attempts + 1}/${job.maxAttempts})`)
        } else {
          // Max attempts reached - mark as failed
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'FAILED', // Updated to new status enum
              error: error.message?.substring(0, 500) || 'Unknown error',
              errorLog: JSON.stringify({
                error: error.message,
                stack: error.stack?.substring(0, 1000),
                timestamp: new Date().toISOString(),
                finalAttempt: true,
              }),
              completedAt: new Date(),
              lastAttemptAt: new Date(), // Update last_attempt_at
            },
          })
          
          console.log(`❌ [JOB-PROCESSOR] Job ${job.id} failed after ${job.attempts} attempts`)
          failed.push(job.id)
        }
      }
    }
    
    return {
      ok: true,
      processed: processed.length,
      failed: failed.length,
      jobIds: { processed, failed },
    }
  } catch (error: any) {
    console.error(`❌ [JOB-PROCESSOR] Error:`, error)
    return {
      ok: false,
      processed: processed.length,
      failed: failed.length,
      jobIds: { processed, failed },
      error: error.message || 'Internal server error',
      code: 'PROCESSING_ERROR',
    }
  }
}

