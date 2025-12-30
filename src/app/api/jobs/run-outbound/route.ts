/**
 * JOB RUNNER: Process Outbound Jobs
 * 
 * Picks queued jobs with FOR UPDATE SKIP LOCKED to avoid duplicates.
 * Marks job 'running', runs orchestrator, sends outbound, marks 'done'.
 * Retries with exponential backoff on transient errors.
 */

// Ensure Node.js runtime for Prisma compatibility
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateAIReply } from '@/lib/ai/orchestrator'
import { sendOutboundWithIdempotency } from '@/lib/outbound/sendWithIdempotency'

// Protect with token (set in env: JOB_RUNNER_TOKEN)
const JOB_RUNNER_TOKEN = process.env.JOB_RUNNER_TOKEN || 'dev-token-change-in-production'

/**
 * GET /api/jobs/run-outbound?token=...
 * Process queued outbound jobs
 */
export async function GET(req: NextRequest) {
  try {
    // Verify token
    const token = req.nextUrl.searchParams.get('token')
    if (token !== JOB_RUNNER_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const maxJobs = parseInt(req.nextUrl.searchParams.get('max') || '10')
    const processed: number[] = []
    const failed: number[] = []
    
    // Pick queued jobs with FOR UPDATE SKIP LOCKED (PostgreSQL)
    // This ensures only one worker processes each job
    const jobs = await prisma.$queryRaw<Array<{
      id: number
      conversationId: number
      inboundMessageId: number
      inboundProviderMessageId: string | null
      requestId: string | null
      attempts: number
      maxAttempts: number
    }>>`
      SELECT id, "conversationId", "inboundMessageId", "inboundProviderMessageId", "requestId", attempts, "maxAttempts"
      FROM "OutboundJob"
      WHERE status = 'queued'
        AND "runAt" <= NOW()
      ORDER BY "runAt" ASC
      LIMIT ${maxJobs}
      FOR UPDATE SKIP LOCKED
    `
    
    if (jobs.length === 0) {
      return NextResponse.json({ 
        ok: true, 
        message: 'No jobs to process',
        processed: 0,
      })
    }
    
    console.log(`📦 [JOB-RUNNER] Processing ${jobs.length} job(s)`)
    
    for (const job of jobs) {
      const requestId = job.requestId || `job_${job.id}_${Date.now()}`
      
      try {
        // Mark job as running
        await prisma.outboundJob.update({
          where: { id: job.id },
          data: {
            status: 'running',
            startedAt: new Date(),
            attempts: { increment: 1 },
          },
        })
        
        console.log(`✅ [JOB-RUNNER] picked jobId=${job.id} requestId=${requestId} conversationId=${job.conversationId} inboundProviderMessageId=${job.inboundProviderMessageId || 'N/A'}`)
        
        // TASK 4: Load conversation and message
        console.log(`📥 [JOB-RUNNER] Loading conversation jobId=${job.id} requestId=${requestId} conversationId=${job.conversationId}`)
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
        
        console.log(`✅ [JOB-RUNNER] Conversation loaded jobId=${job.id} requestId=${requestId} conversationId=${conversation.id} contactId=${conversation.contactId} leadId=${conversation.leadId || 'N/A'}`)
        
        // TASK 4: Load inbound message
        console.log(`📥 [JOB-RUNNER] Loading inbound message jobId=${job.id} requestId=${requestId} inboundMessageId=${job.inboundMessageId}`)
        const message = job.inboundMessageId 
          ? await prisma.message.findUnique({
              where: { id: job.inboundMessageId },
            })
          : null
        
        if (!message || message.direction !== 'INBOUND') {
          throw new Error(`Inbound message ${job.inboundMessageId} not found or not inbound`)
        }
        
        console.log(`✅ [JOB-RUNNER] Inbound message loaded jobId=${job.id} requestId=${requestId} messageId=${message.id} bodyLength=${message.body?.length || 0}`)
        
        if (!conversation.lead || !conversation.contact) {
          throw new Error(`Conversation ${job.conversationId} missing lead or contact`)
        }
        
        // Check if conversation is assigned to a user (skip auto-reply if assigned)
        if (conversation.assignedUserId !== null && conversation.assignedUserId !== undefined) {
          console.log(`⏭️ [JOB-RUNNER] Skipping job ${job.id} - conversation assigned to user ${conversation.assignedUserId}`)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'done',
              completedAt: new Date(),
            },
          })
          processed.push(job.id)
          continue
        }
        
        // Task C: Run orchestrator - log start and end
        console.log(`🎯 [JOB-RUNNER] orchestrator start jobId=${job.id} requestId=${requestId} conversationId=${conversation.id} inboundMessageId=${message.id}`)
        const orchestratorStartTime = Date.now()
        const orchestratorResult = await generateAIReply({
          conversationId: conversation.id,
          leadId: conversation.lead.id,
          contactId: conversation.contact.id,
          inboundText: message.body || '',
          inboundMessageId: message.id,
          channel: message.channel,
          language: 'en',
        })
        const orchestratorElapsed = Date.now() - orchestratorStartTime
        console.log(`✅ [JOB-RUNNER] orchestrator end jobId=${job.id} requestId=${requestId} elapsed=${orchestratorElapsed}ms replyLength=${orchestratorResult.replyText?.length || 0} hasHandover=${'handoverReason' in orchestratorResult}`)
        
        // Check if reply is empty (deduplication or stop)
        if (!orchestratorResult.replyText || orchestratorResult.replyText.trim().length === 0) {
          const reason = ('handoverReason' in orchestratorResult && orchestratorResult.handoverReason) || 'Empty reply'
          console.log(`⏭️ [JOB-RUNNER] Reply skipped for job ${job.id}: ${reason}`)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'done',
              completedAt: new Date(),
            },
          })
          processed.push(job.id)
          continue
        }
        
        // Send outbound with idempotency
        // sendWithIdempotency computes outboundDedupeKey internally using:
        // hash(conversationId + replyType + normalizedQuestionKey + dayBucket OR inboundMessageId + textHash)
        const questionKey = ('nextStepKey' in orchestratorResult && orchestratorResult.nextStepKey) || null
        const inboundProviderMessageId = job.inboundProviderMessageId || message.providerMessageId || null
        
        // Log outbound key components for debugging (actual key is hashed in sendWithIdempotency)
        const outboundKeyComponents = `${conversation.id}:${inboundProviderMessageId || 'unknown'}:${questionKey || 'reply'}`
        console.log(`📤 [JOB-RUNNER] Sending outbound for job ${job.id} (keyComponents: ${outboundKeyComponents}, requestId: ${requestId})`)
        
        // Use phoneNormalized if available, otherwise fallback to phone
        // This ensures E.164 format for WhatsApp sending
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
            console.log(`✅ [JOB-RUNNER] Normalized phone for outbound: ${conversation.contact.phone} → ${phoneForOutbound}`)
            
            // Update contact with normalized phone for future use
            await prisma.contact.update({
              where: { id: conversation.contact.id },
              data: { phoneNormalized: phoneForOutbound },
            })
          } catch (normalizeError: any) {
            // Log structured error and mark job as failed
            console.error(`❌ [JOB-RUNNER] Failed to normalize phone for outbound`, {
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
                status: 'failed',
                error: `INVALID_PHONE: ${normalizeError.message}`,
                completedAt: new Date(),
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
              console.log(`✅ [JOB-RUNNER] Created follow-up task for invalid phone (job ${job.id})`)
            } catch (taskError: any) {
              console.warn(`⚠️ [JOB-RUNNER] Failed to create follow-up task:`, taskError.message)
            }
            
            failed.push(job.id)
            continue // Skip to next job
          }
        }
        
        // Final validation: must be E.164 format
        if (!phoneForOutbound.startsWith('+') || !/^\+[1-9]\d{1,14}$/.test(phoneForOutbound)) {
          throw new Error(`Invalid phone number format for outbound: ${phoneForOutbound}. Must be E.164 format (e.g., +260777711059). Contact ID: ${conversation.contact.id}`)
        }
        
        // Task C: Log before sendOutboundWithIdempotency
        console.log(`📤 [JOB-RUNNER] send start jobId=${job.id} requestId=${requestId} conversationId=${conversation.id} phone=${phoneForOutbound} inboundProviderMessageId=${inboundProviderMessageId || 'N/A'}`)
        
        const sendStartTime = Date.now()
        const sendResult = await sendOutboundWithIdempotency({
          conversationId: conversation.id,
          contactId: conversation.contact.id,
          leadId: conversation.lead.id,
          phone: phoneForOutbound,
          text: orchestratorResult.replyText,
          provider: 'whatsapp',
          triggerProviderMessageId: inboundProviderMessageId,
          replyType: questionKey ? 'question' : 'answer',
          lastQuestionKey: questionKey,
          flowStep: null,
        })
        const sendElapsed = Date.now() - sendStartTime
        
        // Task C: Add logging after sendOutboundWithIdempotency result
        // Task C: Ensure job is marked DONE only if outbound send success=true
        if (sendResult.wasDuplicate) {
          console.log(`⚠️ [JOB-RUNNER] Duplicate outbound blocked jobId=${job.id} requestId=${requestId} keyComponents=${outboundKeyComponents}`)
          // Mark as done even if duplicate (idempotency worked - message already sent)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'done',
              completedAt: new Date(),
            },
          })
          processed.push(job.id)
          continue
        } else if (!sendResult.success) {
          // Task C: If send failed, throw error (will be caught and job marked failed)
          console.error(`❌ [JOB-RUNNER] outbound send failed jobId=${job.id} requestId=${requestId} error=${sendResult.error}`)
          throw new Error(`Failed to send outbound: ${sendResult.error}`)
        } else {
          // Task C: Send succeeded - log success
          console.log(`✅ [JOB-RUNNER] send end jobId=${job.id} requestId=${requestId} messageId=${sendResult.messageId} conversationId=${conversation.id} phone=${phoneForOutbound} inboundProviderMessageId=${inboundProviderMessageId || 'N/A'} success=${sendResult.success} elapsed=${sendElapsed}ms`)
        }
        
        // Task C: Verify Message row was created (for inbox UI)
        console.log(`🔍 [JOB-RUNNER] Message row check start jobId=${job.id} requestId=${requestId} providerMessageId=${sendResult.messageId || 'N/A'}`)
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
            console.log(`✅ [JOB-RUNNER] Message row confirmed jobId=${job.id} requestId=${requestId} messageRowId=${messageRow.id} status=${messageRow.status}`)
          } else {
            console.warn(`⚠️ [JOB-RUNNER] Message row not found jobId=${job.id} requestId=${requestId} providerMessageId=${sendResult.messageId || 'N/A'} - inbox may not show reply`)
          }
        } catch (messageCheckError: any) {
          console.warn(`⚠️ [JOB-RUNNER] Failed to verify Message row (non-critical) jobId=${job.id} requestId=${requestId}:`, messageCheckError.message)
        }
        
        // Task C: Mark job as done ONLY if send succeeded (success=true)
        // This is already in the else block above, but ensure it's explicit
        if (sendResult.success) {
          console.log(`💾 [JOB-RUNNER] Marking job DONE jobId=${job.id} requestId=${requestId} success=true`)
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'done',
              completedAt: new Date(),
            },
          })
          
          console.log(`✅ [JOB-RUNNER] job done jobId=${job.id} requestId=${requestId} status=done`)
          processed.push(job.id)
        } else {
          // This should not happen (we throw above), but defensive check
          throw new Error(`Job ${job.id} send result success=false but no error thrown`)
        }
        
      } catch (error: any) {
        console.error(`❌ [JOB-RUNNER] Job ${job.id} failed:`, error.message)
        
        // Check if we should retry
        const shouldRetry = job.attempts < job.maxAttempts
        
        if (shouldRetry) {
          // Exponential backoff: 2^attempts seconds
          const backoffSeconds = Math.pow(2, job.attempts)
          const runAt = new Date(Date.now() + backoffSeconds * 1000)
          
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'queued',
              runAt,
              error: error.message?.substring(0, 500) || 'Unknown error',
            },
          })
          
          console.log(`🔄 [JOB-RUNNER] Job ${job.id} will retry in ${backoffSeconds}s (attempt ${job.attempts + 1}/${job.maxAttempts})`)
        } else {
          // Max attempts reached - mark as failed
          await prisma.outboundJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              error: error.message?.substring(0, 500) || 'Unknown error',
              completedAt: new Date(),
            },
          })
          
          console.log(`❌ [JOB-RUNNER] Job ${job.id} failed after ${job.attempts} attempts`)
          failed.push(job.id)
        }
      }
    }
    
    return NextResponse.json({
      ok: true,
      processed: processed.length,
      failed: failed.length,
      jobIds: { processed, failed },
    })
  } catch (error: any) {
    console.error('❌ [JOB-RUNNER] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

