import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { normalizeInboundPhone, findContactByPhone } from '@/lib/phone-inbound'
import { prepareInboundContext, buildWhatsAppExternalId } from '@/lib/whatsappInbound'
import { handleInboundMessageAutoMatch } from '@/lib/inbound/autoMatchPipeline'
import { markInboundProcessed } from '@/lib/webhook/idempotency'
import { resolveWhatsAppMedia } from '@/lib/media/resolveWhatsAppMedia'
import { detectMediaType, extractMediaInfo, MEDIA_TYPES } from '@/lib/media/extractMediaId'

// Ensure this runs in Node.js runtime (not Edge) for Prisma compatibility
export const runtime = 'nodejs'
// Prevent Vercel caching
export const dynamic = 'force-dynamic'

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
// File-based logging for webhook debugging
import fs from 'fs'
import path from 'path'

const WEBHOOK_LOG_FILE = path.join(process.cwd(), '.next', 'webhook-debug.log')

function logToFile(message: string, data?: any) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      data,
    }
    fs.appendFileSync(WEBHOOK_LOG_FILE, JSON.stringify(logEntry) + '\n')
  } catch (e) {
    // Silently fail if file write doesn't work
  }
}

export async function POST(req: NextRequest) {
  // ===== WEBHOOK TAP: Record ALL deliveries at the VERY TOP =====
  const requestId = `wa_${Date.now()}_${Math.random().toString(16).slice(2)}`
  
  // Read body first (before any processing)
  const rawText = await req.text()
  const rawBody = rawText // Keep for error handling
  
  // Parse body for tap recording (but don't fail if parsing fails)
  let body: any = null
  try {
    body = JSON.parse(rawText)
  } catch (e) {
    body = { rawText: rawText.slice(0, 100) } // Store first 100 chars if parse fails
  }
  
  const entry = body?.entry?.[0]
  const changes = entry?.changes?.[0]
  const value = changes?.value
  
  // Top-level log
  console.log('[WA-WEBHOOK-IN]', {
    requestId,
    hasBody: !!body,
    entryCount: body?.entry?.length || 0,
  })
  
  // ALWAYS store minimal ExternalEventLog row for debugging (even for text)
  try {
    const tapPayload = JSON.stringify({
      requestId,
      hasMessages: !!(value?.messages?.length),
      hasStatuses: !!(value?.statuses?.length),
      messagesSample: (value?.messages || []).slice(0, 2).map((m: any) => ({
        id: m.id,
        type: m.type,
        from: m.from,
        hasContext: !!m.context,
      })),
      statusesSample: (value?.statuses || []).slice(0, 2).map((s: any) => ({
        id: s.id,
        status: s.status,
        timestamp: s.timestamp,
      })),
    })
    
    await prisma.externalEventLog.create({
      data: {
        provider: 'whatsapp',
        externalId: requestId, // Use requestId, not messageId
        payload: tapPayload,
        receivedAt: new Date(),
      },
    })
    console.log('[WA-WEBHOOK-TAP] ✅ Webhook tap recorded', { requestId })
  } catch (e: any) {
    // Never break webhook delivery - log and continue
    console.error('[WA-WEBHOOK-TAP] ❌ Failed to record tap', {
      requestId,
      error: e.message,
      errorCode: e.code,
    })
  }
  // ===== END WEBHOOK TAP =====
  
  // CRITICAL DEBUG: Log webhook entry immediately (both console and file)
  const entryMsg = `🚨🚨🚨 [WEBHOOK-ENTRY] POST /api/webhooks/whatsapp called at ${new Date().toISOString()}`
  console.error(entryMsg)
  logToFile('WEBHOOK-ENTRY', { timestamp: new Date().toISOString() })
  
  // #region agent log
  try {
    fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:POST-entry',message:'Webhook POST entry',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'W0'})}).catch((e)=>{console.error('[DEBUG-LOG] Failed to send log:',e)});
  } catch (e) {}
  // #endregion
  console.log(`📥 [WEBHOOK] WhatsApp webhook received at ${new Date().toISOString()}`)
  
  // Body is already read and parsed above, continue with existing logic
  
  // Debug: Record raw webhook to debug endpoint (browser-visible) - optional
  try {
    // Construct base URL from request URL or environment
    let baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    if (!baseUrl) {
      const url = new URL(req.url)
      baseUrl = `${url.protocol}//${url.host}`
    }
    
    await fetch(`${baseUrl}/api/debug/wa-last-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: rawText,
    }).catch((e) => {
      console.warn('[WEBHOOK] Failed to record to debug endpoint', e.message)
    })
  } catch (e) {
    // Don't break webhook if debug recording fails
    console.warn('[WEBHOOK] Debug recording error', e)
  }

  try {
    console.log('📥 WhatsApp webhook POST received')
    
      console.log('✅ Parsed webhook body:', {
        hasEntry: !!body.entry,
        entryCount: body.entry?.length || 0,
        firstEntryHasChanges: !!body.entry?.[0]?.changes,
        firstChangeHasValue: !!body.entry?.[0]?.changes?.[0]?.value,
        hasMessages: !!body.entry?.[0]?.changes?.[0]?.value?.messages,
        hasStatuses: !!body.entry?.[0]?.changes?.[0]?.value?.statuses,
      })

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

    // entry, changes, value already extracted in webhook tap above (lines 230-232)
    // Reuse those variables - no need to extract again

    // ===== PROCESS MESSAGES FIRST (before statuses) =====
    // 1) Process messages FIRST if present
    if (value?.messages && Array.isArray(value.messages) && value.messages.length > 0) {
      console.log(`📨 Processing ${value.messages.length} incoming message(s)`)
      
      // Step 1: Create ExternalEventLog for ALL messages (before filtering)
      console.log('[WEBHOOK] Starting ExternalEventLog upsert for ALL messages', {
        messageCount: value.messages.length,
        messageIds: value.messages.map((m: any) => m.id),
      })

      for (const message of value.messages) {
        const providerMessageId = message.id

        if (!providerMessageId) {
          console.warn('[WEBHOOK] Message missing id, skipping ExternalEventLog upsert', {
            messageKeys: Object.keys(message),
            messageType: message.type,
          })
          continue
        }

        // Upsert per-message ExternalEventLog keyed by wamid... (BEFORE filtering)
        try {
          const payload = JSON.stringify({
            providerMessageId,
            type: message.type,
            image: !!message.image,
            document: !!message.document,
            audio: !!message.audio,
            video: !!message.video,
            sticker: !!message.sticker,
            // store media id directly if present
            providerMediaId:
              message?.image?.id ||
              message?.document?.id ||
              message?.audio?.id ||
              message?.video?.id ||
              message?.sticker?.id ||
              null,
          })

          const result = await prisma.externalEventLog.upsert({
            where: {
              provider_externalId: {
                provider: 'whatsapp',
                externalId: providerMessageId,
              },
            },
            update: {
              payload,
              receivedAt: new Date(),
            },
            create: {
              provider: 'whatsapp',
              externalId: providerMessageId,
              payload,
              receivedAt: new Date(),
            },
          })

          console.log('[WEBHOOK] ✅ ExternalEventLog upserted for message', {
            providerMessageId,
            externalEventLogId: result.id,
            type: message.type,
            hasMediaId: !!(message?.image?.id || message?.document?.id || message?.audio?.id || message?.video?.id || message?.sticker?.id),
            providerMediaId: message?.image?.id || message?.document?.id || message?.audio?.id || message?.video?.id || message?.sticker?.id || null,
          })
        } catch (e: any) {
          console.error('[WEBHOOK] ❌ Failed to upsert ExternalEventLog for message', {
            providerMessageId,
            error: e.message,
            errorCode: e.code,
            errorStack: e.stack?.substring(0, 500),
            providerMessageIdType: typeof providerMessageId,
            providerMessageIdLength: providerMessageId?.length,
          })
          // Continue processing - don't break webhook delivery
        }
      }

      console.log('[WEBHOOK] Completed ExternalEventLog upsert for all messages')

      // Step 2: Filter and process actual customer messages
      // CRITICAL: Only process actual user messages (not status updates, not echo messages, not system messages)
      const businessPhoneNumberId = value.metadata?.phone_number_id
      const businessDisplay = (value.metadata?.display_phone_number || '').replace(/\D/g, '') // digits only

      const actualMessages = value.messages.filter((msg: any) => {
        // Ignore status objects accidentally inside messages
        if (msg.type === 'status' || msg.status) return false

        // Must have sender
        if (!msg.from) return false

        // Echo messages are when the sender IS us (NOT msg.context.from)
        const fromDigits = String(msg.from).replace(/\D/g, '')
        const isEcho =
          (businessPhoneNumberId && msg.from === businessPhoneNumberId) ||
          (businessDisplay && fromDigits === businessDisplay)

        if (isEcho) {
          console.log(`⏭️ [WEBHOOK] Ignoring echo message (sender is us): ${msg.id}`, {
            msgFrom: msg.from,
            businessPhoneNumberId,
            businessDisplay,
            hasContext: !!msg.context,
          })
          return false
        }

        return true
      })
      
      console.log('[WEBHOOK] FILTER RESULT', {
        totalMessages: value.messages?.length || 0,
        actualMessages: actualMessages.length,
        businessPhoneNumberId: value.metadata?.phone_number_id || null,
        displayPhoneNumber: value.metadata?.display_phone_number || null,
        sample: (value.messages || []).slice(0, 3).map((m: any) => ({
          id: m.id,
          type: m.type,
          from: m.from,
          hasContext: !!m.context,
          contextFrom: m.context?.from || null,
        })),
      })
      
      console.log(`📨 Filtered to ${actualMessages.length} actual customer messages (ignored ${value.messages.length - actualMessages.length} status/echo)`)
      
      // Step 3: Process each actual message (continue with existing handleInboundMessageAutoMatch logic)
      // #region agent log
      try {
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:messages-detected',message:'Messages detected in webhook',data:{messagesCount:value.messages.length,messageIds:value.messages.map((m:any)=>m.id),messageTypes:value.messages.map((m:any)=>m.type)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'W0'})}).catch((e)=>{console.error('[DEBUG-LOG] Failed to send log:',e)});
      } catch (e) {}
      // #endregion
      
      // Process each actual message - the loop continues below (existing code)
    }

    // ===== THEN PROCESS STATUSES (but DO NOT return early) =====
    // 2) Process statuses if present (but DO NOT return early)
    if (value?.statuses && Array.isArray(value.statuses) && value.statuses.length > 0) {
      console.log(`📊 [WEBHOOK] Processing ${value.statuses.length} status update(s)`)

    // Handle status updates (delivery receipts) - update both CommunicationLog and Message models
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
          // HOTFIX: Wrap in try/catch to prevent webhook failure from Prisma mismatch
          try {
            await prisma.message.update({
              where: { id: message.id },
              data: {
                status: messageStatus,
              },
            })
          } catch (err: any) {
            const msg = String(err?.message ?? err)
            if (msg.includes("Unknown argument `providerMediaId`") || msg.includes("Unknown argument providerMediaId")) {
              console.warn('[WEBHOOK] Prisma schema mismatch in message.update, continuing without update', {
                messageId: message.id,
                messageStatus,
              })
              // Continue execution - don't break webhook
            } else {
              throw err
            }
          }

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

    // ===== PROCESS ACTUAL CUSTOMER MESSAGES (after ExternalEventLog upsert) =====
    // Continue with existing message processing logic (filter and process actual customer messages)
    // NOTE: ExternalEventLog was already upserted for ALL messages above (line ~360)
    // Now we filter and process only actual customer messages
    if (value?.messages && Array.isArray(value.messages) && value.messages.length > 0) {
      // #region agent log
      try {
        fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:messages-detected',message:'Messages detected in webhook',data:{messagesCount:value.messages.length,messageIds:value.messages.map((m:any)=>m.id),messageTypes:value.messages.map((m:any)=>m.type)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'W0'})}).catch((e)=>{console.error('[DEBUG-LOG] Failed to send log:',e)});
      } catch (e) {}
      // #endregion
      
      // CRITICAL: Only process actual user messages (not status updates, not echo messages, not system messages)
      const businessPhoneNumberId = value.metadata?.phone_number_id
      const businessDisplay = (value.metadata?.display_phone_number || '').replace(/\D/g, '') // digits only

      const actualMessages = value.messages.filter((msg: any) => {
        // Ignore status objects accidentally inside messages
        if (msg.type === 'status' || msg.status) return false

        // Must have sender
        if (!msg.from) return false

        // Echo messages are when the sender IS us (NOT msg.context.from)
        const fromDigits = String(msg.from).replace(/\D/g, '')
        const isEcho =
          (businessPhoneNumberId && msg.from === businessPhoneNumberId) ||
          (businessDisplay && fromDigits === businessDisplay)

        if (isEcho) {
          console.log(`⏭️ [WEBHOOK] Ignoring echo message (sender is us): ${msg.id}`, {
            msgFrom: msg.from,
            businessPhoneNumberId,
            businessDisplay,
            hasContext: !!msg.context,
          })
          return false
        }

        return true
      })
      
      console.log('[WEBHOOK] FILTER RESULT', {
        totalMessages: value.messages?.length || 0,
        actualMessages: actualMessages.length,
        businessPhoneNumberId: value.metadata?.phone_number_id || null,
        displayPhoneNumber: value.metadata?.display_phone_number || null,
        sample: (value.messages || []).slice(0, 3).map((m: any) => ({
          id: m.id,
          type: m.type,
          from: m.from,
          hasContext: !!m.context,
          contextFrom: m.context?.from || null,
        })),
      })
      
      console.log(`📨 Filtered to ${actualMessages.length} actual customer messages (ignored ${value.messages.length - actualMessages.length} status/echo)`)
      
      for (const message of actualMessages) {
        const from = message.from // Phone number without + (e.g., "971501234567")
        const messageId = message.id
        let messageType = message.type // 'text', 'image', 'audio', 'document', etc. - MUST be let, not const, so we can override for media
        const timestamp = message.timestamp
          ? new Date(parseInt(message.timestamp) * 1000)
          : new Date()
        
        // ===== CRITICAL: Store ExternalEventLog per message with externalId = providerMessageId =====
        // NOTE: This will be updated AFTER providerMediaId is computed (see below)
        // ===== END CRITICAL BLOCK =====
        
        const debug0Data = {
          messageId,
          from,
          messageType,
          timestamp: timestamp.toISOString(),
          hasAudio: !!message.audio,
          hasImage: !!message.image,
          hasDocument: !!message.document,
          hasVideo: !!message.video,
          hasSticker: !!message.sticker,
        }
        console.error("🚨🚨🚨 [DEBUG-0] WEBHOOK MESSAGE LOOP ENTRY", JSON.stringify(debug0Data, null, 2))
        logToFile('DEBUG-0', debug0Data)
        
        console.log(`📨 [WEBHOOK] Processing message ${messageId} from ${from}, type: ${messageType}`)
        
        // #region agent log
        try {
          // CRITICAL: Log the ENTIRE message object to see the actual webhook structure
          const fullMessageStr = JSON.stringify(message)
          console.log(`🔍 [WEBHOOK-FULL] Full message object for ${messageId}:`, fullMessageStr)
          fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:processing-message',message:'Processing message - FULL PAYLOAD',data:{messageId,from,messageType,hasAudio:!!message.audio,hasImage:!!message.image,hasDocument:!!message.document,hasVideo:!!message.video,fullMessageObject:fullMessageStr,messageKeys:Object.keys(message)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'W1'})}).catch((e)=>{console.error('[DEBUG-LOG] Failed to send log:',e)});
        } catch (e) {
          console.error('[WEBHOOK] Failed to log full message:', e)
        }
        // #endregion
        
        // CRITICAL DEBUG: Log full message structure for media messages to understand payload
        // Use MEDIA_TYPES set for consistent checking
        if (MEDIA_TYPES.has(messageType)) {
          const mediaDebug = {
            messageId,
            type: messageType,
            hasAudio: !!message.audio,
            hasImage: !!message.image,
            hasDocument: !!message.document,
            hasVideo: !!message.video,
            audioKeys: message.audio ? Object.keys(message.audio) : [],
            imageKeys: message.image ? Object.keys(message.image) : [],
            documentKeys: message.document ? Object.keys(message.document) : [],
            videoKeys: message.video ? Object.keys(message.video) : [],
            messageKeys: Object.keys(message),
            audioObject: message.audio || null,
            imageObject: message.image || null,
            documentObject: message.document || null,
            videoObject: message.video || null,
            stickerObject: message.sticker || null,
          }
          console.log(`🔍 [WEBHOOK-DEBUG] Media message ${messageId} full structure:`, JSON.stringify(mediaDebug, null, 2))
          
          // #region agent log
          try {
            fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:media-debug',message:'Media message debug structure',data:mediaDebug,timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'W2'})}).catch((e)=>{console.error('[DEBUG-LOG] Failed to send log:',e)});
          } catch (e) {}
          // #endregion
        }
        
        // Extract message text/content and media info
        let messageText = message.text?.body || ''
        
        // PRIMARY EXTRACTION PATH: Use proven extractor (detectMediaType + extractMediaInfo)
        // This is authoritative for WhatsApp webhook messages
        const detected = detectMediaType(message)
        const isMediaByDetected = MEDIA_TYPES.has(detected)
        
        // Primary extraction (authoritative for WhatsApp webhook messages)
        const extracted = isMediaByDetected ? extractMediaInfo(message, detected) : null
        
        // Fallback to resolver only if extractor can't find id
        const resolver = resolveWhatsAppMedia(message, undefined, undefined, { messageId, from, timestamp })
        
        // Determine final type: prefer detected type if it's media, otherwise use resolver
        const finalType = (isMediaByDetected ? detected : resolver.finalType)
        
        // Determine providerMediaId: prefer extracted, then resolver, then null
        const providerMediaId =
          extracted?.providerMediaId ||
          resolver.providerMediaId ||
          null
        
        // Extract all media metadata with priority: extracted > resolver > null
        const mediaMimeType =
          extracted?.mediaMimeType ||
          resolver.mediaMimeType ||
          null
        
        const filename =
          extracted?.filename ||
          resolver.filename ||
          null
        
        const mediaSize =
          extracted?.mediaSize ||
          resolver.size ||
          null
        
        const mediaSha256 =
          extracted?.mediaSha256 ||
          resolver.sha256 ||
          null
        
        const caption =
          extracted?.caption ||
          resolver.caption ||
          null
        
        const mediaUrl = providerMediaId // Legacy compatibility
        
        // Determine if this is a media message
        const isMediaMessage = MEDIA_TYPES.has(finalType)
        
        // ===== CRITICAL: Store minimal ExternalEventLog per message AFTER providerMediaId is computed =====
        // This upsert uses externalId = providerMessageId (wamid...) for both media and non-media messages
        // MUST run for ALL messages (text and media) to enable recovery
        const providerMessageId = messageId
        try {
          const minimalPayload = JSON.stringify({
            providerMessageId,
            type: finalType ?? messageType ?? message?.type ?? null,
            providerMediaId: providerMediaId ?? null,
            ts: message.timestamp ?? null,
            // optional small hints for recovery:
            hasImage: !!message.image,
            hasDocument: !!message.document,
            hasAudio: !!message.audio,
            hasVideo: !!message.video,
            hasSticker: !!message.sticker,
          }).substring(0, 50000)

          const result = await prisma.externalEventLog.upsert({
            where: {
              provider_externalId: {
                provider: 'whatsapp',
                externalId: providerMessageId,
              },
            },
            update: {
              payload: minimalPayload,
              receivedAt: new Date(),
            },
            create: {
              provider: 'whatsapp',
              externalId: providerMessageId,
              payload: minimalPayload,
              receivedAt: new Date(),
            },
          })

          console.log('[WEBHOOK] ExternalEventLog upserted (minimal)', {
            messageId: providerMessageId,
            externalEventLogId: result.id,
            providerMediaId: providerMediaId ?? null,
            finalType: finalType ?? messageType ?? message?.type ?? null,
            payloadLength: minimalPayload.length,
            payloadPreview: minimalPayload.substring(0, 100),
          })
        } catch (e: any) {
          console.error('[WEBHOOK] Failed to upsert ExternalEventLog (minimal)', {
            messageId: providerMessageId,
            error: e.message,
            errorCode: e.code,
            errorStack: e.stack,
            providerMessageIdValue: providerMessageId,
            providerMessageIdType: typeof providerMessageId,
            providerMessageIdLength: providerMessageId?.length,
          })
          // do not break webhook delivery
        }
        // ===== END CRITICAL BLOCK =====
        
        // Create ingest-debug payload for browser debugging
        const ingestDebug = {
          detectedType: detected,
          extracted: extracted ?? null,
          resolver: {
            isMedia: resolver?.isMedia ?? null,
            finalType: resolver?.finalType ?? null,
            providerMediaId: resolver?.providerMediaId ?? null,
            source: resolver?.debug?.source ?? null,
          },
          finalType,
          finalProviderMediaId: providerMediaId,
          originalMessageType: message?.type ?? null,
          hasImage: !!message?.image,
          hasDocument: !!message?.document,
          hasAudio: !!message?.audio,
          hasVideo: !!message?.video,
          hasSticker: !!message?.sticker,
        }
        
        // DEBUG LOG #1: Always log extraction result (for ALL messages, not just media)
        const debug1Data = {
          messageId,
          detectedType: detected,
          isMediaByDetected,
          extractedKeys: extracted ? Object.keys(extracted) : null,
          extracted: extracted ? {
            providerMediaId: extracted.providerMediaId,
            mediaMimeType: extracted.mediaMimeType,
            filename: extracted.filename,
            mediaSize: extracted.mediaSize,
            mediaSha256: extracted.mediaSha256,
            caption: extracted.caption,
          } : null,
          resolverProviderMediaId: resolver?.providerMediaId ?? null,
          resolverFinalType: resolver?.finalType ?? null,
          resolverIsMedia: resolver?.isMedia ?? null,
          finalProviderMediaId: providerMediaId,
          finalType,
          isMediaMessage,
        }
        console.error("🚨🚨🚨 [DEBUG-1] INBOUND EXTRACTION RESULT", JSON.stringify(debug1Data, null, 2))
        logToFile('DEBUG-1', debug1Data)
        
        // Override messageType with finalType for media messages
        if (isMediaMessage) {
          messageType = finalType
        }
        
        // CRITICAL: Log error if media message but providerMediaId is still null
        if (isMediaMessage && !providerMediaId) {
          console.error('[INBOUND-MEDIA] providerMediaId missing after extraction', {
            messageId,
            finalType,
            originalType: message.type,
            hasKeys: Object.keys(message || {}),
            extractedProviderMediaId: extracted?.providerMediaId,
            resolverProviderMediaId: resolver.providerMediaId,
            detected,
            isMediaByDetected,
          })
        }
        
        // Set message text placeholders based on finalType
        if (isMediaMessage) {
          if (finalType === 'image') {
            messageText = '[Image]'
          } else if (finalType === 'audio') {
            messageText = '[Audio]' // Will be replaced with transcript if transcription succeeds
          } else if (finalType === 'document') {
            messageText = '[Document]'
          } else if (finalType === 'video') {
            messageText = '[Video]'
          } else if (finalType === 'sticker') {
            messageText = '[Sticker]'
          }
          
          // Log media extraction
          console.log(`[INGEST-MEDIA]`, {
            messageId,
            providerMessageId: messageId,
            type: finalType,
            providerMediaId,
            mime: mediaMimeType,
            filename,
            hasSha256: !!mediaSha256,
            hasCaption: !!caption,
            resolverSource: resolver.debug?.source,
            resolverTypeSource: resolver.debug?.typeSource,
          })
          
          // Log success if providerMediaId was found
          if (providerMediaId) {
            console.log(`✅ [WEBHOOK] ${finalType} message ${messageId} has providerMediaId: ${providerMediaId}`)
          }
          
          // CRITICAL: Audio transcription (keep existing logic)
          if (finalType === 'audio' && providerMediaId) {
          try {
            const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN
              if (accessToken) {
              // Get media URL from Meta API
                const mediaResponse = await fetch(`https://graph.facebook.com/v18.0/${providerMediaId}`, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                },
              })
              
              if (mediaResponse.ok) {
                const mediaData = await mediaResponse.json()
                const audioUrl = mediaData.url
                
                if (audioUrl) {
                  // Transcribe audio
                  const { transcribeAudio } = await import('@/lib/ai/transcribeAudio')
                  const transcriptResult = await transcribeAudio(audioUrl)
                  
                  if (transcriptResult.transcript) {
                    messageText = transcriptResult.transcript
                    console.log(`✅ [WEBHOOK] Audio transcribed: ${transcriptResult.transcript.substring(0, 100)}...`)
                  } else {
                      messageText = '[Audio]'
                    console.warn(`⚠️ [WEBHOOK] Audio transcription failed: ${transcriptResult.error}`)
                  }
                } else {
                    messageText = '[Audio]'
                  console.warn(`⚠️ [WEBHOOK] Could not get audio URL from Meta API`)
                }
              } else {
                  messageText = '[Audio]'
                console.warn(`⚠️ [WEBHOOK] Failed to fetch audio media: ${mediaResponse.statusText}`)
              }
            } else {
                messageText = '[Audio]'
              console.warn(`⚠️ [WEBHOOK] No access token configured for audio transcription`)
            }
          } catch (audioError: any) {
              messageText = '[Audio]'
            console.error(`❌ [WEBHOOK] Audio transcription error:`, audioError.message)
          }
          }
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
          messageType,
          hasMediaUrl: !!mediaUrl,
          mediaUrl,
          mediaMimeType,
          timestamp: timestamp.toISOString(),
        }))
        
        const webhookStartTime = Date.now()
        
        try {
          // Use new AUTO-MATCH pipeline (handles deduplication internally)
          // Pass full webhook entry for waId extraction
          const waId = value.contacts?.[0]?.wa_id || message.from
          // #region agent log
          try {
            fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:handleInboundMessageAutoMatch',message:'Calling handleInboundMessageAutoMatch with media',data:{messageId,messageType,mediaUrl,mediaUrlType:typeof mediaUrl,mediaMimeType,filename,hasMediaUrl:!!mediaUrl,hasMediaMimeType:!!mediaMimeType,messageKeys:Object.keys(message||{}),hasMessageAudio:!!message.audio,hasMessageImage:!!message.image,hasMessageDocument:!!message.document},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'W1'})}).catch(()=>{});
          } catch (e) {}
          // #endregion
          
          // CRITICAL: ALWAYS store rawPayload for ALL messages (text and media)
          // Persist canonical wrapper so recovery/backfill can always work
          const rawPayloadToPass = JSON.stringify({
            message,        // value.messages[i]
            rawWebhook: body, // whole webhook payload
            value,          // entry.changes[0].value
            entry: entry || body.entry?.[0] || null,
            receivedAt: new Date().toISOString(),
          })
          
          console.log(`📤 [WEBHOOK] Passing to pipeline with rawPayload:`, {
            messageId,
            hasRawPayload: !!rawPayloadToPass,
            rawPayloadType: typeof rawPayloadToPass,
            rawPayloadLength: typeof rawPayloadToPass === 'string' ? rawPayloadToPass.length : 0,
            providerMediaId: providerMediaId || 'NULL',
          })
          
          // CRITICAL: Log final values before pipeline call
          console.log('[INBOUND-MEDIA-FINAL]', { messageId, finalType, providerMediaId, isMedia: isMediaMessage, originalType: message.type })
          
          const result = await handleInboundMessageAutoMatch({
            channel: 'WHATSAPP',
            providerMessageId: messageId,
            fromPhone: from,
            fromName: null, // WhatsApp doesn't provide name in webhook
            text: messageText,
            timestamp: timestamp,
            // TOP-LEVEL fields (pipeline may ignore metadata.*, so duplicate here)
            rawPayload: rawPayloadToPass,
            payload: ingestDebug ? JSON.stringify(ingestDebug) : null,
            messageType: finalType,          // duplicate of metadata.messageType
            providerMediaId: providerMediaId, // duplicate of metadata.providerMediaId
            mediaUrl: providerMediaId,        // legacy compatibility
            mediaMimeType: mediaMimeType,
            mediaFilename: filename,
            mediaSize: mediaSize,
            mediaSha256: mediaSha256,
            mediaCaption: caption,
            metadata: {
              externalId: externalId,
              rawPayload: rawPayloadToPass, // CRITICAL: Always pass rawPayload for recovery (canonical wrapper)
              payload: JSON.stringify(ingestDebug), // Ingest-debug payload for browser debugging
              webhookEntry: entry || body.entry?.[0], // Full entry for waId extraction
              webhookValue: value, // Full value for waId extraction
              // CRITICAL: Pass messageType so pipeline knows it's a media message (use finalType)
              messageType: finalType, // This is the detected/corrected type (audio, image, etc.)
              // CRITICAL: Pass providerMediaId (REQUIRED) - Meta Graph API media ID
              providerMediaId: providerMediaId,
              mediaUrl: providerMediaId, // Legacy compatibility - same as providerMediaId
              mediaMimeType: mediaMimeType,
              mediaFilename: filename,
              mediaSize: mediaSize,
              mediaSha256: mediaSha256,
              mediaCaption: caption, // Store caption for images/videos
            },
          } as any) // Type assertion: pipeline may accept top-level fields even if TypeScript doesn't know about them
          
          // ===== DIRECT MEDIA PERSIST (KEYED BY providerMessageId) =====
          try {
            const providerMessageId = message.id

            // Extract media id DIRECTLY from WhatsApp message object (no resolver)
            const directMediaId =
              message?.image?.id ||
              message?.document?.id ||
              message?.audio?.id ||
              message?.video?.id ||
              message?.sticker?.id ||
              null

            const directMime =
              message?.image?.mime_type ||
              message?.document?.mime_type ||
              message?.audio?.mime_type ||
              message?.video?.mime_type ||
              message?.sticker?.mime_type ||
              null

            // Infer type directly from object presence
            const directType =
              message?.image ? 'image' :
              message?.document ? 'document' :
              message?.audio ? 'audio' :
              message?.video ? 'video' :
              message?.sticker ? 'sticker' :
              null

            // Only run for media-ish messages
            const isMediaPlaceholder =
              typeof messageText === 'string' && /\[(image|document|audio|video|sticker)/i.test(messageText)

            console.log('[WEBHOOK] Direct media persist check', {
              messageId: providerMessageId,
              directType,
              directMediaId,
              directMime,
              isMediaPlaceholder,
              messageText,
              hasImage: !!message.image,
              hasDocument: !!message.document,
              hasAudio: !!message.audio,
              hasVideo: !!message.video,
              hasSticker: !!message.sticker,
              willRun: !!(directType && (directMediaId || isMediaPlaceholder)),
            })

            if (directType && (directMediaId || isMediaPlaceholder)) {
              const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

              console.log('[WEBHOOK] Starting direct media persist retry loop', {
                messageId: providerMessageId,
                directType,
                directMediaId,
                directMime,
              })

              // Wait up to 30 seconds total for the pipeline to create the Message row
              // HOTFIX: Only include media fields when they exist (never null/undefined)
              const dataUpdate: any = {
                type: directType,
              }
              
              // ONLY ADD MEDIA FIELDS WHEN THEY EXIST
              if (directMediaId) {
                dataUpdate.providerMediaId = directMediaId
                dataUpdate.mediaUrl = directMediaId // legacy compatibility
              }
              
              if (directMime) {
                dataUpdate.mediaMimeType = directMime
              }
              
              if (messageText) {
                dataUpdate.body = messageText
              }

              for (let i = 0; i < 60; i++) {
                try {
                  const updated = await prisma.message.updateMany({
                    where: { providerMessageId },
                    data: dataUpdate,
                  })

                  // updateMany returns { count }
                  if (updated.count && updated.count > 0) {
                    console.log('[WEBHOOK] Direct media persist succeeded', {
                      messageId: providerMessageId,
                      directType,
                      directMediaId,
                      directMime,
                      attempt: i + 1,
                      updatedCount: updated.count,
                    })
                    break
                  }

                  if (i === 0 || i % 10 === 0) {
                    // Log every 10th attempt or first attempt
                    console.log('[WEBHOOK] Direct media persist waiting for Message row', {
                      messageId: providerMessageId,
                      attempt: i + 1,
                      providerMessageId,
                    })
                  }
                } catch (err: any) {
                  const msg = String(err?.message ?? err)
                  if (msg.includes("Unknown argument `providerMediaId`") || msg.includes("Unknown argument providerMediaId")) {
                    // Fallback: Strip media fields and retry
                    const {
                      providerMediaId: _providerMediaId,
                      mediaUrl: _mediaUrl,
                      mediaMimeType: _mediaMimeType,
                      ...dataFallback
                    } = dataUpdate
                    try {
                      const updated = await prisma.message.updateMany({
                        where: { providerMessageId },
                        data: dataFallback,
                      })
                      if (updated.count && updated.count > 0) {
                        console.warn('[WEBHOOK] Direct media persist succeeded (fallback, no media fields)', {
                          messageId: providerMessageId,
                          directType,
                        })
                        break
                      }
                    } catch (fallbackErr: any) {
                      console.warn('[WEBHOOK] Direct media persist fallback also failed, continuing', {
                        messageId: providerMessageId,
                        error: fallbackErr.message,
                      })
                      // Continue loop - don't break webhook
                    }
                  } else {
                    // Re-throw non-mismatch errors
                    throw err
                  }
                }

                await sleep(500)
              }

              // Final check: verify the update actually happened
              const finalCheck = await prisma.message.findFirst({
                where: { providerMessageId },
              }) as any

              if (finalCheck) {
                console.log('[WEBHOOK] Direct media persist final check', {
                  messageId: providerMessageId,
                  finalType: finalCheck.type,
                  finalProviderMediaId: finalCheck.providerMediaId,
                  finalMediaMimeType: finalCheck.mediaMimeType,
                  success: finalCheck.type === directType && finalCheck.providerMediaId === directMediaId,
                })
              } else {
                console.error('[WEBHOOK] Direct media persist failed - Message row not found after retries', {
                  messageId: providerMessageId,
                  providerMessageId,
                })
              }
            } else {
              console.log('[WEBHOOK] Direct media persist skipped (condition not met)', {
                messageId: providerMessageId,
                directType,
                directMediaId,
                isMediaPlaceholder,
              })
            }
          } catch (e) {
            // never break webhook delivery
            console.error('[WEBHOOK] Direct media persist failed', {
              messageId: message.id,
              error: e instanceof Error ? e.message : String(e),
              stack: e instanceof Error ? e.stack : undefined,
            })
          }
          // ===== END DIRECT MEDIA PERSIST =====
          
          // DEBUG LOG #2: Always check what was saved (for ALL messages)
          const debugSaved = await prisma.message.findFirst({
            where: { providerMessageId: messageId },
          }) as any
          
          const debug2Data = {
            messageId,
            webhookProviderMediaId: providerMediaId,
            webhookMediaMimeType: mediaMimeType,
            webhookMediaFilename: filename,
            webhookMediaSize: mediaSize,
            webhookFinalType: finalType,
            savedMessage: debugSaved,
            providerMediaIdMatch: debugSaved?.providerMediaId === providerMediaId,
            providerMediaIdLost: providerMediaId && !debugSaved?.providerMediaId,
          }
          console.error("🚨🚨🚨 [DEBUG-2] SAVED MESSAGE AFTER PIPELINE", JSON.stringify(debug2Data, null, 2))
          logToFile('DEBUG-2', debug2Data)
          
          // #region agent log
          try {
            fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:handleInboundMessageAutoMatch',message:'handleInboundMessageAutoMatch completed',data:{messageId,passedMediaUrl:mediaUrl,resultMessageId:result?.message?.id,resultLeadId:result?.lead?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'W3'})}).catch(()=>{});
          } catch (e) {}
          // #endregion

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
            // Step 1d: Add P2022 handling for conversation lookup
            let conversation: { assignedUserId: number | null } | null = null
            try {
              conversation = await prisma.conversation.findUnique({
                where: { id: result.conversation.id },
                select: { assignedUserId: true },
              })
            } catch (error: any) {
              // Step 1d: Loud failure for schema mismatch
              if (error.code === 'P2022' || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
                console.error('[DB-MISMATCH] Conversation.deletedAt column does not exist. DB migrations not applied. Route: /api/webhooks/whatsapp')
                // Don't fail webhook - log and continue (job will be enqueued anyway)
                console.warn(`⚠️ [WEBHOOK] Schema mismatch detected but continuing - job will be enqueued requestId=${requestId}`)
                conversation = null // Treat as unassigned
              } else {
                throw error
              }
            }
            
            const isAssignedToUser = conversation?.assignedUserId !== null && conversation?.assignedUserId !== undefined
            
            if (isAssignedToUser && conversation) {
              console.log(`⏭️ [WEBHOOK] Skipping auto-reply requestId=${requestId} - conversation assigned to user ${conversation.assignedUserId}`)
            } else {
              // Enqueue outbound job
              const { enqueueOutboundJob } = await import('@/lib/jobs/enqueueOutbound')
              
              try {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:574',message:'Before enqueueOutboundJob',data:{conversationId:result.conversation.id,inboundMessageId:result.message.id,messageId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                const enqueueResult = await enqueueOutboundJob({
                  conversationId: result.conversation.id,
                  inboundMessageId: result.message.id,
                  inboundProviderMessageId: messageId,
                  requestId,
                })
                
                const totalElapsed = Date.now() - webhookStartTime
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'webhooks/whatsapp/route.ts:582',message:'After enqueueOutboundJob',data:{jobId:enqueueResult.jobId,wasDuplicate:enqueueResult.wasDuplicate,elapsed:totalElapsed},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                // #endregion
                console.log(`✅ [WEBHOOK] Job enqueued requestId=${requestId} jobId=${enqueueResult.jobId} wasDuplicate=${enqueueResult.wasDuplicate} elapsed=${totalElapsed}ms`)
                
                if (enqueueResult.wasDuplicate) {
                  console.log(`⚠️ [WEBHOOK] Duplicate job blocked requestId=${requestId} inboundProviderMessageId=${messageId}`)
                } else {
                  // Job enqueued - will be processed by cron (runs every minute)
                  // No HTTP kick - webhook must remain fast and independent
                  console.log(`✅ [WEBHOOK] Job enqueued, will be processed by cron requestId=${requestId} jobId=${enqueueResult.jobId}`)
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
            
            // CRITICAL: Check if error is database-related (missing column)
            const errorMessage = String(error?.message || '')
            const isDatabaseError = 
              error?.code === 'P2022' || 
              errorMessage.includes('lastProcessedInboundMessageId') || 
              errorMessage.includes('lastProcessedInboundMessageld') || 
              errorMessage.includes('does not exist') ||
              errorMessage.includes('Unknown column')
            
            if (isDatabaseError) {
              console.error(`❌ [WEBHOOK] Database error processing message requestId=${requestId} - this should be fixed by upsertConversation fallback:`, {
                error: error.message,
                errorCode: error.code,
                messageId,
                from,
                elapsed: `${Date.now() - webhookStartTime}ms`,
                stack: error.stack?.substring(0, 500),
              })
              // This error should not happen if upsertConversation fix is working
              // Log it prominently for debugging
            }
            
            // Other errors - log but still return 200 (don't cause webhook retries)
            console.error(`❌ [WEBHOOK] Error processing message requestId=${requestId}:`, {
              error: error.message,
              errorCode: error.code,
              messageId,
              from,
              elapsed: `${Date.now() - webhookStartTime}ms`,
              isDatabaseError,
              stack: error.stack?.substring(0, 500),
            })
            
            // Log error
            try {
              await prisma.externalEventLog.create({
                data: {
                  provider: 'whatsapp',
                  externalId: `error-${Date.now()}-${messageId}`,
                  payload: JSON.stringify({ 
                    error: error.message, 
                    errorCode: error.code,
                    messageId,
                    from,
                    requestId,
                    isDatabaseError,
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
