import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { normalizeInboundPhone, findContactByPhone } from '@/lib/phone-inbound'
import { prepareInboundContext, buildWhatsAppExternalId } from '@/lib/whatsappInbound'
import { handleInboundMessage } from '@/lib/inbound'
import { checkInboundIdempotency, markInboundProcessed } from '@/lib/webhook/idempotency'

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
        
        // CRITICAL FIX #1: Inbound idempotency check (hard dedupe)
        // Check BEFORE any processing - return 200 OK immediately if duplicate
        const idempotencyCheck = await checkInboundIdempotency('whatsapp', messageId)
        
        if (idempotencyCheck.isDuplicate) {
          console.log(`✅ [IDEMPOTENCY] Duplicate message ${messageId} - returning 200 OK immediately (dedupeHit: true)`)
          // Log for debugging
          console.log(`📊 [WEBHOOK-LOG] providerMessageId: ${messageId}, contact: ${from}, dedupeHit: true, conversationId: ${idempotencyCheck.conversationId || 'unknown'}`)
          // Continue to next message (don't process this one)
          continue
        }
        
        console.log(`✅ [IDEMPOTENCY] New message ${messageId} - proceeding with processing (dedupeHit: false)`)
        
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

        // CRITICAL FIX #4: Return 200 OK immediately after idempotency check
        // Process in background to prevent Meta retries (<1s response time)
        const phoneNumberId = value.metadata?.phone_number_id
        const externalId = buildWhatsAppExternalId(phoneNumberId, from)
        
        // Process in background (don't await) - fire and forget
        ;(async () => {
          try {
            const result = await handleInboundMessage({
              channel: 'WHATSAPP',
              externalId: externalId,
              externalMessageId: messageId,
              fromAddress: from,
              body: messageText,
              rawPayload: message,
              receivedAt: timestamp,
              mediaUrl: mediaUrl,
              mediaMimeType: mediaMimeType,
            })

            console.log(`✅ [WEBHOOK] Successfully processed inbound message`, {
              messageId,
              conversationId: result.conversation.id,
              leadId: result.lead.id,
              contactId: result.contact.id,
              messageCreated: !!result.message,
              createdMessageId: result.message?.id,
              messageBody: result.message?.body?.substring(0, 50),
            })
            
            // Log for debugging
            console.log(`📊 [WEBHOOK-LOG] providerMessageId: ${messageId}, contact: ${from}, conversationId: ${result.conversation.id}, dedupeHit: false`)
            
            // Update idempotency record with conversation ID
            if (idempotencyCheck.dedupRecord) {
              await prisma.inboundMessageDedup.update({
                where: { id: idempotencyCheck.dedupRecord.id },
                data: { conversationId: result.conversation.id },
              })
            }

            // CRITICAL: Trigger AI reply from webhook level to ensure it always runs
            // Even if handleInboundMessage had issues, we still have the result
            console.log(`🔍 [WEBHOOK] Checking conditions for AI reply trigger...`)
            const canTriggerReply = result.message && result.message.body && result.message.body.trim().length > 0 && result.lead && result.lead.id && result.contact && result.contact.id
            console.log(`🔍 [WEBHOOK] Can trigger reply: ${canTriggerReply}`, {
              hasMessage: !!result.message,
              hasBody: !!result.message?.body,
              bodyLength: result.message?.body?.length || 0,
              bodyTrimmed: result.message?.body?.trim().length || 0,
              hasLead: !!result.lead,
              leadId: result.lead?.id,
              hasContact: !!result.contact,
              contactId: result.contact?.id,
            })
            
            if (canTriggerReply) {
              console.log(`🚀 [WEBHOOK] CRITICAL: Triggering AI reply from webhook level NOW!`)
              console.log(`🚀 [WEBHOOK] Input:`, {
                leadId: result.lead.id,
                messageId: result.message.id,
                messageText: result.message.body.substring(0, 100),
                channel: result.message.channel,
                contactId: result.contact.id,
              })
              try {
                const { handleInboundAutoReply } = await import('@/lib/autoReply')
                console.log(`📞 [WEBHOOK] About to call handleInboundAutoReply...`)
                const replyResult = await handleInboundAutoReply({
                  leadId: result.lead.id,
                  messageId: result.message.id,
                  messageText: result.message.body,
                  channel: result.message.channel,
                  contactId: result.contact.id,
                  triggerProviderMessageId: messageId, // Pass for outbound idempotency
                })
                console.log(`📊 [WEBHOOK] AI reply result (webhook level):`, {
                  replied: replyResult.replied,
                  reason: replyResult.reason,
                  error: replyResult.error,
                })
                if (replyResult.replied) {
                  console.log(`✅ [WEBHOOK] SUCCESS: AI reply was sent!`)
                } else {
                  console.error(`❌ [WEBHOOK] FAILED: AI reply was NOT sent. Reason: ${replyResult.reason || replyResult.error}`)
                }
                
                // Mark as processed
                await markInboundProcessed(messageId, replyResult.replied, replyResult.error || undefined)
              } catch (autoReplyError: any) {
                console.error(`❌ [WEBHOOK] CRITICAL ERROR: AI reply threw exception!`)
                console.error(`❌ [WEBHOOK] Error message: ${autoReplyError.message}`)
                console.error(`❌ [WEBHOOK] Error stack:`, autoReplyError.stack)
                await markInboundProcessed(messageId, false, autoReplyError.message)
              }
            } else {
              console.error(`❌ [WEBHOOK] BLOCKED: Cannot trigger AI reply - missing required data!`, {
                hasMessage: !!result.message,
                hasBody: !!result.message?.body,
                bodyLength: result.message?.body?.length || 0,
                hasLead: !!result.lead,
                leadId: result.lead?.id,
                hasContact: !!result.contact,
                contactId: result.contact?.id,
              })
              await markInboundProcessed(messageId, false, 'Missing required data for reply')
            }

            // Update conversation with WhatsApp-specific fields (if schema supports them)
            const waUserWaId = from
            const waConversationId = phoneNumberId 
              ? `${phoneNumberId}_${from}`
              : null

            if (waConversationId || waUserWaId) {
              try {
                await prisma.conversation.update({
                  where: { id: result.conversation.id },
                  data: {
                    ...(result.conversation.waUserWaId !== undefined ? { waUserWaId: waUserWaId || result.conversation.waUserWaId } : {}),
                    ...(result.conversation.waConversationId !== undefined ? { waConversationId: waConversationId || result.conversation.waConversationId } : {}),
                    // Ensure externalId is set if not already
                    externalId: result.conversation.externalId || externalId,
                  },
                })
              } catch (e) {
                // Fields might not exist in schema - that's OK
                console.warn('Could not update WhatsApp-specific fields:', e)
              }
            }

            // Create chat message (legacy, for backward compatibility)
            try {
              await prisma.chatMessage.create({
                data: {
                  contactId: result.lead.contactId || result.lead.contact?.id,
                  leadId: result.lead.id,
                  channel: 'whatsapp',
                  direction: 'inbound',
                  message: messageText || 'Inbound message',
                  senderPhone: from,
                },
              })
            } catch (error: any) {
              // ChatMessage might not exist - that's OK
              console.warn('ChatMessage creation skipped:', error?.message)
            }

            // Log successful inbound message
            try {
              const payloadStr = JSON.stringify(body).substring(0, 20000)
              await prisma.externalEventLog.create({
                data: {
                  provider: 'whatsapp',
                  externalId: `msg-${messageId}`,
                  payload: payloadStr,
                },
              })
            } catch {}
          } catch (error: any) {
            console.error(`❌ [WEBHOOK] Error processing inbound message (background):`, {
              error: error.message,
              stack: error.stack,
              messageId,
              from,
              errorCode: error.code,
            })
            await markInboundProcessed(messageId, false, error.message)
            
            // Log error with full details
            try {
              await prisma.externalEventLog.create({
                data: {
                  provider: 'whatsapp',
                  externalId: `error-${Date.now()}-${messageId}`,
                  payload: JSON.stringify({ 
                    error: error.message, 
                    stack: error.stack,
                    messageId,
                    from,
                    errorCode: error.code,
                    timestamp: new Date().toISOString(),
                  }).substring(0, 20000),
                },
              })
            } catch (logError) {
              console.error('Failed to log error:', logError)
            }
          }
        })() // End async IIFE - don't await, process in background
      }
    }

    // CRITICAL FIX #4: Always return 200 OK immediately (<1s) to prevent Meta retries
    // Processing continues in background
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
