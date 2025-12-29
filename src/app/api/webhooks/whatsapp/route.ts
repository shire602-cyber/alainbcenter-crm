import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { normalizeInboundPhone, findContactByPhone } from '@/lib/phone-inbound'
import { prepareInboundContext, buildWhatsAppExternalId } from '@/lib/whatsappInbound'
import { handleInboundMessageAutoMatch } from '@/lib/inbound/autoMatchPipeline'
import { markInboundProcessed } from '@/lib/webhook/idempotency'

// Ensure this runs in Node.js runtime (not Edge) for Prisma compatibility
export const runtime = 'nodejs'

/**
 * GET /api/webhooks/whatsapp
 * Webhook verification (Meta requires this for webhook setup)
 * 
 * Meta will call this with:
 * - hub.mode=subscribe
 * - hub.verify_token=<your token>
 * - hub.challenge=<random string>
 * 
 * You must return the hub.challenge if verify_token matches
 */
export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get('hub.mode')
    const token = req.nextUrl.searchParams.get('hub.verify_token')
    const challenge = req.nextUrl.searchParams.get('hub.challenge')

    console.log('📥 Webhook verification request received:', {
      mode,
      tokenProvided: !!token,
      challengeProvided: !!challenge,
      url: req.url,
      queryParams: Object.fromEntries(req.nextUrl.searchParams),
    })

    // PRIORITY: Environment variable (most reliable for production)
    let verifyToken: string | null = process.env.WHATSAPP_VERIFY_TOKEN || null
    let integrationData: any = null
    let tokenSource: 'env' | 'database' | 'none' = 'none'
    
    if (verifyToken) {
      tokenSource = 'env'
      console.log('✅ Found verify token in environment variable WHATSAPP_VERIFY_TOKEN', {
        tokenLength: verifyToken.length,
        tokenPreview: `${verifyToken.substring(0, 10)}...${verifyToken.substring(verifyToken.length - 5)}`,
      })
    } else {
      // Fallback to Integration model (if env var not set)
      try {
        const integration = await prisma.integration.findUnique({
          where: { name: 'whatsapp' },
        })

        integrationData = integration

        if (integration?.config) {
          try {
            const config = typeof integration.config === 'string' 
              ? JSON.parse(integration.config) 
              : integration.config
            verifyToken = config.webhookVerifyToken || null
            
            if (verifyToken) {
              tokenSource = 'database'
              console.log('✅ Found verify token in integration config (fallback)', {
                tokenLength: verifyToken.length,
                tokenPreview: `${verifyToken.substring(0, 10)}...${verifyToken.substring(verifyToken.length - 5)}`,
              })
            }
          } catch (e: any) {
            console.error('❌ Failed to parse integration config:', {
              error: e.message,
            })
          }
        }
      } catch (e: any) {
        console.warn('⚠️ Could not fetch integration from DB:', {
          error: e.message,
          errorCode: e.code,
        })
      }
    }

    if (!verifyToken) {
      console.error('❌ WhatsApp verify token not configured in integration settings or environment variables')
      return NextResponse.json({ 
        error: 'Webhook not configured',
        hint: 'Configure verify token in /admin/integrations or set WHATSAPP_VERIFY_TOKEN environment variable'
      }, { status: 500 })
    }

    // Meta requires all three parameters, but let's be flexible
    if (!mode || !token) {
      console.warn('⚠️ Missing required webhook parameters:', { mode, token: !!token, challenge: !!challenge })
      return NextResponse.json({ 
        error: 'Missing required parameters',
        hint: 'Meta requires hub.mode and hub.verify_token parameters'
      }, { status: 400 })
    }

    // Challenge is required for verification, but we can log if missing
    if (!challenge) {
      console.warn('⚠️ Challenge parameter missing - cannot complete verification')
      return NextResponse.json({ 
        error: 'Missing challenge parameter',
        hint: 'Meta requires hub.challenge parameter for webhook verification'
      }, { status: 400 })
    }

    // Trim whitespace from tokens (in case of copy-paste issues)
    const cleanedToken = token?.trim()
    const cleanedVerifyToken = verifyToken?.trim()
    
    if (mode === 'subscribe' && cleanedToken && cleanedVerifyToken && cleanedToken === cleanedVerifyToken) {
      console.log('✅ WhatsApp webhook verified successfully!', {
        mode,
        tokenMatch: true,
        challengeLength: challenge.length,
        tokenLength: cleanedToken.length,
      })
      
      // Log webhook event
      try {
        await prisma.externalEventLog.create({
          data: {
            provider: 'whatsapp',
            externalId: `verify-${Date.now()}`,
            payload: JSON.stringify({ mode, timestamp: new Date().toISOString() }),
          },
        })
      } catch (e) {
        console.warn('Could not log webhook event:', e)
      }

      // Return challenge as plain text (Meta requires this format)
      // IMPORTANT: Must return ONLY the challenge value, no JSON, no extra text
      return new Response(challenge, { 
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
        },
      })
    }

    // Detailed comparison for debugging (cleanedToken already defined above)
    console.warn('⚠️ WhatsApp webhook verification failed', { 
      mode,
      modeMatches: mode === 'subscribe',
      tokenProvided: !!token,
      tokenLength: token?.length,
      tokenLengthAfterTrim: cleanedToken?.length,
      expectedTokenLength: verifyToken?.length,
      expectedTokenLengthAfterTrim: cleanedVerifyToken?.length,
      tokenMatches: token === verifyToken,
      tokenMatchesAfterTrim: cleanedToken === cleanedVerifyToken,
      tokenPreview: token ? `${token.substring(0, 10)}...${token.substring(token.length - 5)}` : 'none',
      expectedPreview: verifyToken ? `${verifyToken.substring(0, 10)}...${verifyToken.substring(verifyToken.length - 5)}` : 'none',
      // Show first and last 5 chars for easier debugging
      tokenStart: token ? token.substring(0, 5) : null,
      tokenEnd: token ? token.substring(token.length - 5) : null,
      expectedStart: verifyToken ? verifyToken.substring(0, 5) : null,
      expectedEnd: verifyToken ? verifyToken.substring(verifyToken.length - 5) : null,
      // Character-by-character comparison (first 20 chars)
      tokenChars: cleanedToken ? cleanedToken.substring(0, 20).split('').map((c, i) => ({ pos: i, char: c, code: c.charCodeAt(0) })) : null,
      expectedChars: cleanedVerifyToken ? cleanedVerifyToken.substring(0, 20).split('').map((c, i) => ({ pos: i, char: c, code: c.charCodeAt(0) })) : null,
      integrationExists: !!integrationData,
      integrationConfigExists: !!integrationData?.config,
      tokenSource: tokenSource,
    })
    
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch (error: any) {
    console.error('❌ Error in webhook verification:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/webhooks/whatsapp
 * Handle WhatsApp delivery status webhooks and inbound messages
 * 
 * Events handled:
 * - statuses: sent, delivered, read, failed
 * - messages: inbound messages from users
 */
export async function POST(req: NextRequest) {
  console.log(`📥 [WEBHOOK] WhatsApp webhook received at ${new Date().toISOString()}`)
  let rawBody: string = ''
  let body: any = null

  try {
    console.log('📥 WhatsApp webhook POST received')
    
    // Get raw body for signature verification
    rawBody = await req.text()
    
    try {
      body = JSON.parse(rawBody)
      console.log('✅ Parsed webhook body:', {
        hasEntry: !!body.entry,
        entryCount: body.entry?.length || 0,
        firstEntryHasChanges: !!body.entry?.[0]?.changes,
        firstChangeHasValue: !!body.entry?.[0]?.changes?.[0]?.value,
        hasMessages: !!body.entry?.[0]?.changes?.[0]?.value?.messages,
        hasStatuses: !!body.entry?.[0]?.changes?.[0]?.value?.statuses,
      })
    } catch {
      console.error('❌ Failed to parse webhook JSON')
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Verify webhook signature (optional but recommended)
    const signature = req.headers.get('x-hub-signature-256')
    
    // Get App Secret from Integration model first, then fallback to env var
    let appSecret: string | null = null
    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'whatsapp' },
      })

      if (integration?.config) {
        try {
          const config = typeof integration.config === 'string' 
            ? JSON.parse(integration.config) 
            : integration.config
          // App Secret is stored in apiSecret field or config
          appSecret = integration.apiSecret || config.appSecret || null
        } catch {
          // Config parse error, continue to env var
        }
      }
      
      // Also try from apiSecret field directly
      if (!appSecret && integration?.apiSecret) {
        appSecret = integration.apiSecret
      }
    } catch {
      // Integration model might not exist, continue to env var
    }

    // Fallback to environment variable
    if (!appSecret) {
      appSecret = process.env.WHATSAPP_APP_SECRET || null
    }

    if (appSecret && signature) {
      try {
        // Meta uses format: sha256=<hash>
        const expectedSignature = 'sha256=' + crypto
          .createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex')

        const cleanSignature = signature.startsWith('sha256=')
          ? signature
          : `sha256=${signature}`

        if (!crypto.timingSafeEqual(Buffer.from(cleanSignature), Buffer.from(expectedSignature))) {
          console.error('⚠️ Invalid WhatsApp webhook signature')
          
          // Log failed verification
          try {
            await prisma.externalEventLog.create({
              data: {
                provider: 'whatsapp',
                externalId: `invalid-sig-${Date.now()}`,
                payload: JSON.stringify({ error: 'Invalid signature' }),
              },
            })
          } catch {}

          return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
        }
      } catch (error: any) {
        console.error('Signature verification error:', error)
        // Continue processing if signature verification fails (for development)
      }
    }

    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    // A) HARD-IGNORE STATUS-ONLY WEBHOOK EVENTS
    // If payload has no messages OR messages.length===0 => return 200 immediately
    // Do NOT call orchestrator, do NOT create tasks, do NOT send outbound for statuses-only events
    const hasMessages = value?.messages && Array.isArray(value.messages) && value.messages.length > 0
    const hasStatuses = value?.statuses && Array.isArray(value.statuses) && value.statuses.length > 0
    
    if (!hasMessages && hasStatuses) {
      // Status-only webhook - process statuses and return immediately
      console.log(`📊 [WEBHOOK] Status-only webhook (${value.statuses.length} statuses, 0 messages) - processing statuses only`)
    } else if (!hasMessages) {
      // No messages and no statuses - invalid webhook
      console.log(`⚠️ [WEBHOOK] Webhook has no messages and no statuses - returning 200`)
      return NextResponse.json({ success: true, message: 'No messages or statuses to process' })
    }

    // Handle status updates (delivery receipts) - update both CommunicationLog and Message models
    if (value?.statuses) {
      for (const status of value.statuses) {
        const messageId = status.id
        const statusType = status.status // 'sent' | 'delivered' | 'read' | 'failed'
        const timestamp = status.timestamp
          ? new Date(parseInt(status.timestamp) * 1000)
          : new Date()

        // Map Meta status to our MessageStatus enum
        let messageStatus = 'SENT'
        if (statusType === 'delivered') messageStatus = 'DELIVERED'
        else if (statusType === 'read') messageStatus = 'READ'
        else if (statusType === 'failed') messageStatus = 'FAILED'

        // Find Message by providerMessageId (new schema)
        const message = await prisma.message.findFirst({
          where: {
            providerMessageId: messageId,
            channel: 'whatsapp',
            direction: 'outbound',
          },
          include: {
            conversation: true,
          },
        })

        if (message) {
          // Update Message status
          await prisma.message.update({
            where: { id: message.id },
            data: {
              status: messageStatus,
            },
          })

          // Create MessageStatusEvent for audit trail
          try {
            await prisma.messageStatusEvent.create({
              data: {
                messageId: message.id,
                conversationId: message.conversationId,
                status: messageStatus,
                providerStatus: statusType,
                errorMessage: statusType === 'failed' 
                  ? (status.errors?.[0]?.title || status.errors?.[0]?.message || 'Unknown error')
                  : null,
                rawPayload: JSON.stringify(status),
              },
            })
          } catch (e) {
            console.warn('Failed to create MessageStatusEvent:', e)
          }

          console.log(`✅ Updated Message ${message.id} (${messageId}) status to ${messageStatus}`)
        }

        // Also update CommunicationLog (legacy) for backward compatibility
        const log = await prisma.communicationLog.findFirst({
          where: {
            whatsappMessageId: messageId,
            channel: 'whatsapp',
            direction: 'outbound',
          },
        })

        if (log) {
          const updateData: any = {
            deliveryStatus: statusType,
          }

          if (statusType === 'delivered') {
            updateData.deliveredAt = timestamp
          } else if (statusType === 'read') {
            updateData.readAt = timestamp
            updateData.isRead = true
          } else if (statusType === 'failed') {
            updateData.failedAt = timestamp
            updateData.failureReason =
              status.errors?.[0]?.title || status.errors?.[0]?.message || 'Unknown error'
          }

          await prisma.communicationLog.update({
            where: { id: log.id },
            data: updateData,
          })
        }
      }

      // Log status update webhook
      try {
        const payloadStr = JSON.stringify(body).substring(0, 20000) // Truncate to ~20kb
        await prisma.externalEventLog.create({
          data: {
            provider: 'whatsapp',
            externalId: `status-${Date.now()}`,
            payload: payloadStr,
          },
        })
      } catch {}
    }

    // Handle incoming messages (IMPROVED - create contacts/leads if needed)
    if (value?.messages) {
      console.log(`📨 Processing ${value.messages.length} incoming message(s)`)
      
      // CRITICAL: Ignore status updates and echo messages (from our own number)
      const actualMessages = value.messages.filter((msg: any) => {
        // Ignore if it's a status update
        if (msg.type === 'status' || msg.status) {
          console.log(`⏭️ [WEBHOOK] Ignoring status update message: ${msg.id}`)
          return false
        }
        // Ignore echo messages (messages we sent)
        if (msg.context?.from === value.metadata?.phone_number_id) {
          console.log(`⏭️ [WEBHOOK] Ignoring echo message (from our number): ${msg.id}`)
          return false
        }
        return true
      })
      
      console.log(`📨 Filtered to ${actualMessages.length} actual customer messages (ignored ${value.messages.length - actualMessages.length} status/echo)`)
      
      for (const message of actualMessages) {
        const from = message.from // Phone number without + (e.g., "971501234567")
        const messageId = message.id
        const messageType = message.type // 'text', 'image', 'audio', 'document', etc.
        const timestamp = message.timestamp
          ? new Date(parseInt(message.timestamp) * 1000)
          : new Date()
        
        console.log(`📨 [WEBHOOK] Processing message ${messageId} from ${from}, type: ${messageType}`)
        
        // Extract message text/content and media info
        let messageText = message.text?.body || ''
        let mediaUrl: string | null = null
        let mediaMimeType: string | null = null
        
        if (messageType === 'image' && message.image) {
          messageText = message.image.caption || '[image]'
          mediaUrl = message.image.id // Store media ID (can fetch URL later)
          mediaMimeType = message.image.mime_type || 'image/jpeg'
        } else if (messageType === 'audio' && message.audio) {
          messageText = '[audio]'
          mediaUrl = message.audio.id
          mediaMimeType = message.audio.mime_type || 'audio/ogg'
        } else if (messageType === 'document' && message.document) {
          messageText = `[document: ${message.document.filename || 'file'}]`
          mediaUrl = message.document.id
          mediaMimeType = message.document.mime_type || 'application/pdf'
        } else if (messageType === 'video' && message.video) {
          messageText = message.video.caption || '[video]'
          mediaUrl = message.video.id
          mediaMimeType = message.video.mime_type || 'video/mp4'
        } else if (messageType === 'location' && message.location) {
          messageText = `[location: ${message.location.latitude}, ${message.location.longitude}]`
        }

        // Use new AUTO-MATCH pipeline (replaces handleInboundMessage)
        // Pipeline handles: deduplication, contact/conversation/lead creation, field extraction, task creation
        const phoneNumberId = value.metadata?.phone_number_id
        const externalId = buildWhatsAppExternalId(phoneNumberId, from)
        
        // Extract waId for externalThreadId
        const waId = value.contacts?.[0]?.wa_id || message.from
        
        // 1) WEBHOOK MUST BE FAST + ASYNC ORCHESTRATION
        // Generate requestId for structured logging
        const requestId = `webhook_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
        
        // DIAGNOSTIC LOG: webhook inbound entry
        console.log(`[WEBHOOK] INBOUND-ENTRY requestId=${requestId}`, JSON.stringify({
          providerMessageId: messageId,
          fromPhone: from,
          waId,
          channel: 'WHATSAPP',
          channelLower: 'whatsapp',
          externalThreadId: waId,
          messageTextLength: messageText?.length || 0,
          timestamp: timestamp.toISOString(),
        }))
        
        const webhookStartTime = Date.now()
        
        try {
          // Use new AUTO-MATCH pipeline (handles deduplication internally)
          // Pass full webhook entry for waId extraction
          const waId = value.contacts?.[0]?.wa_id || message.from
          const result = await handleInboundMessageAutoMatch({
            channel: 'WHATSAPP',
            providerMessageId: messageId,
            fromPhone: from,
            fromName: null, // WhatsApp doesn't provide name in webhook
            text: messageText,
            timestamp: timestamp,
            metadata: {
              externalId: externalId,
              rawPayload: message,
              webhookEntry: entry || body.entry?.[0], // Full entry for waId extraction
              webhookValue: value, // Full value for waId extraction
              mediaUrl: mediaUrl,
              mediaMimeType: mediaMimeType,
            },
          })

          const autoMatchElapsed = Date.now() - webhookStartTime
          console.log(`✅ [WEBHOOK] AUTO-MATCH pipeline completed requestId=${requestId}`, {
            messageId,
            conversationId: result.conversation?.id,
            leadId: result.lead?.id,
            contactId: result.contact?.id,
            tasksCreated: result.tasksCreated,
            extractedFields: Object.keys(result.extractedFields),
            elapsed: `${autoMatchElapsed}ms`,
          })
          
          // Log structured log
          console.log(`📊 [WEBHOOK-LOG] requestId=${requestId} providerMessageId=${messageId} contact=${from} conversationId=${result.conversation?.id} dedupeHit=false tasksCreated=${result.tasksCreated}`)
          
          // Update idempotency record with conversation ID
          try {
            await prisma.inboundMessageDedup.updateMany({
              where: { providerMessageId: messageId },
              data: { 
                conversationId: result.conversation?.id || null,
                processingStatus: 'COMPLETED',
                processedAt: new Date(),
              },
            })
          } catch (updateError: any) {
            console.warn(`⚠️ [WEBHOOK] Failed to update dedup record requestId=${requestId}:`, updateError.message)
          }

          // 1) ENQUEUE OUTBOUND JOB (async processing)
          // Webhook returns <300ms after enqueuing job
          // Job runner processes orchestrator + sends outbound asynchronously
          if (result.message && result.message.body && result.message.body.trim().length > 0 && 
              result.lead && result.lead.id && result.contact && result.contact.id && 
              result.conversation?.id) {
            
            // Check if conversation is assigned to a user (skip auto-reply if assigned)
            const conversation = await prisma.conversation.findUnique({
              where: { id: result.conversation.id },
              select: { assignedUserId: true },
            })
            
            const isAssignedToUser = conversation?.assignedUserId !== null && conversation?.assignedUserId !== undefined
            
            if (isAssignedToUser) {
              console.log(`⏭️ [WEBHOOK] Skipping auto-reply requestId=${requestId} - conversation assigned to user ${conversation.assignedUserId}`)
            } else {
              // Enqueue outbound job
              const { enqueueOutboundJob } = await import('@/lib/jobs/enqueueOutbound')
              
              try {
                const enqueueResult = await enqueueOutboundJob({
                  conversationId: result.conversation.id,
                  inboundMessageId: result.message.id,
                  inboundProviderMessageId: messageId,
                  requestId,
                })
                
                const totalElapsed = Date.now() - webhookStartTime
                console.log(`✅ [WEBHOOK] Job enqueued requestId=${requestId} jobId=${enqueueResult.jobId} wasDuplicate=${enqueueResult.wasDuplicate} elapsed=${totalElapsed}ms`)
                
                if (enqueueResult.wasDuplicate) {
                  console.log(`⚠️ [WEBHOOK] Duplicate job blocked requestId=${requestId} inboundProviderMessageId=${messageId}`)
                }
              } catch (enqueueError: any) {
                console.error(`❌ [WEBHOOK] Failed to enqueue job requestId=${requestId}:`, enqueueError.message)
                // Don't fail webhook - job can be retried later
              }
            }
          }
          
          const totalElapsed = Date.now() - webhookStartTime
          
          // Return 200 immediately (<300ms target)
          if (totalElapsed > 300) {
            console.warn(`⚠️ [WEBHOOK] Webhook took ${totalElapsed}ms (target: <300ms) requestId=${requestId}`)
          }
          
          return NextResponse.json({ 
            success: true, 
            message: 'Inbound processed, job enqueued',
            requestId,
            elapsed: `${totalElapsed}ms`,
          })
          } catch (error: any) {
            // Handle duplicate message error from pipeline
            if (error.message === 'DUPLICATE_MESSAGE') {
              console.log(`✅ [WEBHOOK] Duplicate message ${messageId} detected by pipeline requestId=${requestId} - returning 200 OK`)
              console.log(`📊 [WEBHOOK-LOG] requestId=${requestId} providerMessageId=${messageId} contact=${from} dedupeHit=true`)
              return NextResponse.json({ success: true, message: 'Duplicate message', requestId })
            }
            
            // Other errors - log but still return 200 (don't cause webhook retries)
            console.error(`❌ [WEBHOOK] Error processing message requestId=${requestId}:`, {
              error: error.message,
              messageId,
              from,
              elapsed: `${Date.now() - webhookStartTime}ms`,
            })
            
            // Log error
            try {
              await prisma.externalEventLog.create({
                data: {
                  provider: 'whatsapp',
                  externalId: `error-${Date.now()}-${messageId}`,
                  payload: JSON.stringify({ 
                    error: error.message, 
                    messageId,
                    from,
                    requestId,
                    timestamp: new Date().toISOString(),
                  }).substring(0, 20000),
                },
              })
            } catch (logError) {
              console.error('Failed to log error:', logError)
            }
            
            // Still return 200 to prevent webhook retries
            return NextResponse.json({ 
              success: true, 
              message: 'Error processing, but acknowledged',
              requestId,
              error: error.message,
            })
          }
        }
      }

    // Return 200 OK after processing all messages
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    console.error('POST /api/webhooks/whatsapp error:', error)

    // Log error
    try {
      const payloadStr = rawBody ? rawBody.substring(0, 20000) : JSON.stringify(body).substring(0, 20000)
      await prisma.externalEventLog.create({
        data: {
          provider: 'whatsapp',
          externalId: `error-${Date.now()}`,
          payload: payloadStr,
        },
      })
    } catch {}

    // Still return 200 to Meta to prevent retries
    return NextResponse.json({ success: true }, { status: 200 })
  }
}
