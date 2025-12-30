/**
 * SHARED JOB PROCESSING LOGIC
 * 
 * Core logic for processing outbound jobs.
 * Used by both:
 * - /api/jobs/run-outbound (manual/debug trigger)
 * - /api/cron/run-outbound-jobs (Vercel cron trigger)
 */

import { prisma } from '@/lib/prisma'
import { generateAIReply } from '@/lib/ai/orchestrator'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'

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
        
        // Generate AI content if job is PENDING (not READY_TO_SEND)
        if (job.status === 'PENDING' || !aiGeneratedContent) {
          console.log(`🎯 [JOB-PROCESSOR] orchestrator start jobId=${job.id} requestId=${jobRequestId} conversationId=${conversation.id} inboundMessageId=${message.id}`)
          const orchestratorStartTime = Date.now()
          
          try {
            orchestratorResult = await generateAIReply({
              conversationId: conversation.id,
              leadId: conversation.lead.id,
              contactId: conversation.contact.id,
              inboundText: message.body || '',
              inboundMessageId: message.id,
              channel: message.channel,
              language: 'en',
            })
            aiGeneratedContent = orchestratorResult.replyText || null
          } catch (orchestratorError: any) {
            // If AI generation fails, save error and mark as FAILED
            console.error(`❌ [JOB-PROCESSOR] Orchestrator failed jobId=${job.id}:`, orchestratorError.message)
            await prisma.outboundJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                error: `AI generation failed: ${orchestratorError.message}`,
                errorLog: JSON.stringify({
                  error: orchestratorError.message,
                  stack: orchestratorError.stack,
                  timestamp: new Date().toISOString(),
                }),
                completedAt: new Date(),
              },
            })
            failed.push(job.id)
            continue
          }
          
          const orchestratorElapsed = Date.now() - orchestratorStartTime
          console.log(`✅ [JOB-PROCESSOR] orchestrator end jobId=${job.id} requestId=${jobRequestId} elapsed=${orchestratorElapsed}ms replyLength=${orchestratorResult.replyText?.length || 0} hasHandover=${'handoverReason' in orchestratorResult}`)
          
          // Check if reply is empty (deduplication or stop)
          if (!orchestratorResult.replyText || orchestratorResult.replyText.trim().length === 0) {
            const reason = ('handoverReason' in orchestratorResult && orchestratorResult.handoverReason) || 'Empty reply'
            console.log(`⏭️ [JOB-PROCESSOR] Reply skipped for job ${job.id}: ${reason}`)
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
          
          // Save AI-generated content and mark as READY_TO_SEND
          // This decouples AI generation from Meta API call (avoids 60s timeout)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'READY_TO_SEND',
              content: aiGeneratedContent, // Store AI-generated reply
            },
          })
          console.log(`✅ [JOB-PROCESSOR] AI content saved jobId=${job.id} contentLength=${aiGeneratedContent?.length || 0} status=READY_TO_SEND`)
        }
        
        // Use stored content (from job.content or just generated)
        if (!aiGeneratedContent) {
          throw new Error(`Job ${job.id} has no content to send`)
        }
        
        // Use phoneNormalized if available, otherwise fallback to phone
        let phoneForOutbound = conversation.contact.phoneNormalized || conversation.contact.phone
        
        // Validate phone format - must be E.164 (starts with +) or digits-only international
        if (!phoneForOutbound) {
          throw new Error(`No phone number available for outbound. Contact ID: ${conversation.contact.id}`)
        }
        
        // If phone doesn't start with +, try to normalize it
        if (!phoneForOutbound.startsWith('+')) {
          try {
            const { normalizeInboundPhone } = await import('@/lib/phone-inbound')
            phoneForOutbound = normalizeInboundPhone(phoneForOutbound)
            console.log(`✅ [JOB-PROCESSOR] Normalized phone for outbound: ${conversation.contact.phone} → ${phoneForOutbound}`)
            
            // Update contact with normalized phone for future use
            await prisma.contact.update({
              where: { id: conversation.contact.id },
              data: { phoneNormalized: phoneForOutbound },
            })
          } catch (normalizeError: any) {
            // Log structured error and mark job as failed
            console.error(`❌ [JOB-PROCESSOR] Failed to normalize phone for outbound`, {
              conversationId: conversation.id,
              inboundProviderMessageId: job.inboundProviderMessageId,
              rawFrom: conversation.contact.phone,
              normalizedPhoneAttempt: phoneForOutbound,
              error: normalizeError.message,
              jobId: job.id,
            })
            
            // Mark job as failed with reason
            await prisma.outboundJob.update({
              where: { id: job.id },
              data: {
                status: 'FAILED',
                error: `INVALID_PHONE: ${normalizeError.message}`,
                errorLog: JSON.stringify({
                  error: normalizeError.message,
                  stack: normalizeError.stack,
                  timestamp: new Date().toISOString(),
                }),
                completedAt: new Date(),
                lastAttemptAt: new Date(),
              },
            })
            
            // Create task for human follow-up (optional)
            try {
              await prisma.task.create({
                data: {
                  leadId: conversation.lead.id,
                  conversationId: conversation.id,
                  title: `Invalid phone number - manual follow-up needed`,
                  type: 'OTHER',
                  status: 'OPEN',
                  dueAt: new Date(),
                },
              })
              console.log(`✅ [JOB-PROCESSOR] Created follow-up task for invalid phone (job ${job.id})`)
            } catch (taskError: any) {
              console.warn(`⚠️ [JOB-PROCESSOR] Failed to create follow-up task:`, taskError.message)
            }
            
            failed.push(job.id)
            continue // Skip to next job
          }
        }
        
        // Final validation: must be E.164 format
        if (!phoneForOutbound.startsWith('+') || !/^\+[1-9]\d{1,14}$/.test(phoneForOutbound)) {
          throw new Error(`Invalid phone number format for outbound: ${phoneForOutbound}. Must be E.164 format (e.g., +260777711059). Contact ID: ${conversation.contact.id}`)
        }
        
        // Check 24-hour window before sending
        const lastInboundAt = conversation.lastInboundAt || message.createdAt
        const nowFor24hCheck = new Date()
        const hoursSinceLastInbound = lastInboundAt 
          ? (nowFor24hCheck.getTime() - new Date(lastInboundAt).getTime()) / (1000 * 60 * 60)
          : 0
        
        const within24HourWindow = hoursSinceLastInbound <= 24
        
        if (!within24HourWindow) {
          // Outside 24h window - must use template instead of free-form text
          console.warn(`⚠️ [JOB-PROCESSOR] Outside 24h window jobId=${job.id} hoursSinceLastInbound=${Math.round(hoursSinceLastInbound * 10) / 10} - must use template`)
          
          // For now, mark as FAILED with clear error (template logic to be implemented in sendWithIdempotency)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              error: `Outside 24-hour window: ${Math.round(hoursSinceLastInbound * 10) / 10} hours since last inbound. Must use template.`,
              errorLog: JSON.stringify({
                hoursSinceLastInbound: Math.round(hoursSinceLastInbound * 10) / 10,
                lastInboundAt: lastInboundAt?.toISOString(),
                requiresTemplate: true,
                timestamp: nowFor24hCheck.toISOString(),
              }),
              completedAt: new Date(),
            },
          })
          failed.push(job.id)
          continue
        }
        
        // Extract question key and provider message ID for sendWithIdempotency
        const questionKey = (orchestratorResult && 'nextStepKey' in orchestratorResult && orchestratorResult.nextStepKey) || null
        const inboundProviderMessageId = job.inboundProviderMessageId || message.providerMessageId || null
        
        // Log outbound key components for debugging
        const outboundKeyComponents = `${conversation.id}:${inboundProviderMessageId || 'unknown'}:${questionKey || 'reply'}`
        console.log(`📤 [JOB-PROCESSOR] Sending outbound for job ${job.id} (keyComponents: ${outboundKeyComponents}, requestId: ${jobRequestId})`)
        
        // Log before sendOutboundWithIdempotency
        console.log(`📤 [JOB-PROCESSOR] send start jobId=${job.id} requestId=${jobRequestId} conversationId=${conversation.id} phone=${phoneForOutbound} inboundProviderMessageId=${inboundProviderMessageId || 'N/A'} within24h=${within24HourWindow}`)
        const sendStartTime = Date.now()
        const sendResult = await sendOutboundWithIdempotency({
          conversationId: conversation.id,
          contactId: conversation.contact.id,
          leadId: conversation.lead.id,
          phone: phoneForOutbound,
          text: aiGeneratedContent!, // Use stored/generated content
          provider: 'whatsapp',
          triggerProviderMessageId: inboundProviderMessageId,
          replyType: questionKey ? 'question' : 'answer',
          lastQuestionKey: questionKey,
          flowStep: null,
        })
        const sendElapsed = Date.now() - sendStartTime
        
        // Handle send result
        if (sendResult.wasDuplicate) {
          console.log(`⚠️ [JOB-PROCESSOR] Duplicate outbound blocked jobId=${job.id} requestId=${jobRequestId} keyComponents=${outboundKeyComponents}`)
          // Mark as done even if duplicate (idempotency worked - message already sent)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'SENT',
              completedAt: new Date(),
            },
          })
          processed.push(job.id)
          continue
        } else if (!sendResult.success) {
          // If send failed, log Meta response details and throw error (will be caught and job marked failed)
          console.error(`❌ [JOB-PROCESSOR] outbound send failed jobId=${job.id} requestId=${jobRequestId} error=${sendResult.error}`)
          // Log Meta API response if available in error details
          if (sendResult.error && typeof sendResult.error === 'string' && sendResult.error.includes('WhatsApp API')) {
            console.error(`❌ [JOB-PROCESSOR] Meta API error details jobId=${job.id} requestId=${jobRequestId} error=${sendResult.error}`)
          }
          throw new Error(`Failed to send outbound: ${sendResult.error}`)
        } else {
          // Send succeeded - log success
          console.log(`✅ [JOB-PROCESSOR] send end jobId=${job.id} requestId=${jobRequestId} messageId=${sendResult.messageId} conversationId=${conversation.id} phone=${phoneForOutbound} inboundProviderMessageId=${inboundProviderMessageId || 'N/A'} success=${sendResult.success} elapsed=${sendElapsed}ms`)
        }
        
        // Verify Message row was created (for inbox UI)
        console.log(`🔍 [JOB-PROCESSOR] Message row check start jobId=${job.id} requestId=${jobRequestId} providerMessageId=${sendResult.messageId || 'N/A'}`)
        try {
          const messageRow = await prisma.message.findFirst({
            where: {
              conversationId: conversation.id,
              direction: 'OUTBOUND',
              providerMessageId: sendResult.messageId || null,
            },
            select: { id: true, status: true },
            orderBy: { createdAt: 'desc' },
          })
          
          if (messageRow) {
            console.log(`✅ [JOB-PROCESSOR] Message row confirmed jobId=${job.id} requestId=${jobRequestId} messageRowId=${messageRow.id} status=${messageRow.status}`)
          } else {
            console.warn(`⚠️ [JOB-PROCESSOR] Message row not found jobId=${job.id} requestId=${jobRequestId} providerMessageId=${sendResult.messageId || 'N/A'} - inbox may not show reply`)
          }
        } catch (messageCheckError: any) {
          console.warn(`⚠️ [JOB-PROCESSOR] Failed to verify Message row (non-critical) jobId=${job.id} requestId=${jobRequestId}:`, messageCheckError.message)
        }
        
        // Mark job as SENT only if send succeeded
        if (sendResult.success) {
          console.log(`💾 [JOB-PROCESSOR] Marking job SENT jobId=${job.id} requestId=${jobRequestId} success=true`)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'SENT',
              completedAt: new Date(),
            },
          })
          
          console.log(`✅ [JOB-PROCESSOR] job done jobId=${job.id} requestId=${jobRequestId} status=SENT`)
          processed.push(job.id)
        } else {
          // This should not happen (we throw above), but defensive check
          throw new Error(`Job ${job.id} send result success=false but no error thrown`)
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

