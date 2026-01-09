/**
 * GET/POST /api/webhooks/meta
 * Meta webhook endpoint for Instagram DMs, Facebook Messenger, and Lead Ads
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { storeWebhookEvent, getConnectionByPageId, getConnectionByIgBusinessId } from '@/server/integrations/meta/storage'
import { normalizeWebhookEvent } from '@/server/integrations/meta/normalize'
import { handleInboundMessageAutoMatch } from '@/lib/inbound/autoMatchPipeline'
import { getWebhookVerifyToken, getAppSecret } from '@/server/integrations/meta/config'

/**
 * GET /api/webhooks/meta
 * Webhook verification handshake + healthcheck
 * 
 * Supports two modes:
 * 1. Healthcheck: No hub.* params → returns 200 JSON { ok: true, mode: "healthcheck" }
 * 2. Verification: hub.mode=subscribe + hub.verify_token + hub.challenge → returns 200 text/plain challenge
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    // Helper to redact token for logging (show first 4 and last 4 chars)
    const redactToken = (t: string | null): string => {
      if (!t) return 'null'
      if (t.length <= 8) return '***' // Too short to redact meaningfully
      return `${t.substring(0, 4)}...${t.substring(t.length - 4)}`
    }

    // STEP 1: Healthcheck mode - no hub params
    // This allows the app UI to test if the webhook endpoint is reachable
    if (!mode && !token && !challenge) {
      console.log('✅ [META-WEBHOOK] Healthcheck request (no hub params)')
      return NextResponse.json(
        { ok: true, mode: 'healthcheck' },
        { status: 200 }
      )
    }

    // STEP 2: Verification mode - hub params present
    // This is a genuine Meta webhook verification attempt
    console.log('📥 [META-WEBHOOK-VERIFY] Verification request received', {
      mode,
      hasToken: !!token,
      hasChallenge: !!challenge,
    })

    // Get verify token from database (or fallback to env var)
    const verifyToken = await getWebhookVerifyToken()

    // Structured logging for webhook verification
    const tokenSource = verifyToken ? 'db' : 'env'
    const tokenMatch = mode === 'subscribe' && token && verifyToken && token.trim() === verifyToken.trim()

    console.log('📥 [META-WEBHOOK-VERIFY]', {
      mode,
      hasToken: !!token,
      hasChallenge: !!challenge,
      tokenSource,
      tokenLength: verifyToken?.length || 0,
      receivedTokenLength: token?.length || 0,
      tokenMatch,
    })

    // Validate verification mode parameters
    if (mode !== 'subscribe') {
      console.warn('⚠️ [META-WEBHOOK-VERIFY] Invalid mode (expected "subscribe")', { mode })
      return NextResponse.json(
        { error: 'Invalid mode', hint: 'Meta webhook verification requires hub.mode=subscribe' },
        { status: 400 }
      )
    }

    // Challenge is required for verification
    if (!challenge) {
      console.warn('⚠️ [META-WEBHOOK-VERIFY] Challenge parameter missing')
      return NextResponse.json(
        { error: 'Missing hub.challenge', hint: 'Meta requires hub.challenge for webhook verification' },
        { status: 400 }
      )
    }

    // Verify token is required for verification
    if (!token) {
      console.warn('⚠️ [META-WEBHOOK-VERIFY] Verify token parameter missing')
      return NextResponse.json(
        { error: 'Missing hub.verify_token', hint: 'Meta requires hub.verify_token for webhook verification' },
        { status: 400 }
      )
    }

    // Verify token must be configured in system
    if (!verifyToken) {
      console.error('❌ [META-WEBHOOK-VERIFY] Webhook verify token not configured in system')
      return NextResponse.json(
        { error: 'Webhook not configured', hint: 'Verify token must be set in Integration settings or META_VERIFY_TOKEN environment variable' },
        { status: 500 }
      )
    }

    // Trim whitespace from tokens for comparison
    const cleanedToken = token.trim()
    const cleanedVerifyToken = verifyToken.trim()

    // Compare tokens
    if (cleanedToken === cleanedVerifyToken) {
      console.log('✅ [META-WEBHOOK-VERIFY] Webhook verified successfully', {
        mode,
        tokenSource,
        challengeLength: challenge.length,
        tokenLength: cleanedToken.length,
      })
      
      // Return challenge as plain text (Meta requires this format)
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    // Token mismatch - log detailed information for debugging
    console.error('❌ [META-WEBHOOK-VERIFY] Token mismatch', {
      mode,
      tokenReceived: redactToken(token),
      tokenExpected: redactToken(verifyToken),
      tokenSource,
      receivedLength: token?.length || 0,
      expectedLength: verifyToken?.length || 0,
      tokensEqual: cleanedToken === cleanedVerifyToken,
    })

    return NextResponse.json(
      { 
        error: 'Invalid verification',
        hint: 'Verify token does not match. Check that the token configured in Meta Developer Console matches the token stored in Integration settings.'
      },
      { status: 403 }
    )
  } catch (error: any) {
    console.error('❌ [META-WEBHOOK-VERIFY] Verification error:', error)
    return NextResponse.json({ error: 'Verification failed', details: error.message }, { status: 500 })
  }
}

/**
 * POST /api/webhooks/meta
 * Receive webhook events from Meta
 */
export async function POST(req: NextRequest) {
  // Immediately return 200 OK to Meta
  const response = NextResponse.json({ success: true })

  try {
    // Verify webhook signature if app secret is configured (optional)
    const signature = req.headers.get('x-hub-signature-256')
    const body = await req.text()

    const appSecret = getAppSecret()
    if (appSecret && signature) {
      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', appSecret)
        .update(body)
        .digest('hex')}`

      if (signature !== expectedSignature) {
        console.error('❌ Invalid Meta webhook signature')
        // Still return 200 to avoid retries, but log the error
        return response
      }
    } else if (!appSecret) {
      // Signature verification is optional for internal apps
      // Log at debug level only
      console.log('ℹ️ META_APP_SECRET not configured - skipping signature verification (optional)')
    }

    const payload = JSON.parse(body)

    // Process webhook asynchronously (don't block response)
    processWebhookPayload(payload).catch((error) => {
      console.error('Error processing Meta webhook:', error)
    })

    return response
  } catch (error: any) {
    console.error('Meta webhook POST error:', error)
    // Always return 200 to prevent Meta from retrying
    return response
  }
}

/**
 * Process webhook payload
 * Stores events and optionally creates inbound messages
 */
async function processWebhookPayload(payload: any) {
  if (payload.object !== 'page' && payload.object !== 'instagram') {
    console.log('Ignoring non-page/instagram webhook object:', payload.object)
    return
  }

  // CRITICAL: Log raw payload structure for debugging
  // This helps diagnose what Meta is actually sending
  const firstEntry = payload.entry?.[0]
  console.log('📥 [META-WEBHOOK] Raw payload structure:', {
    object: payload.object,
    hasEntry: !!payload.entry,
    entryCount: payload.entry?.length || 0,
    firstEntryKeys: firstEntry ? Object.keys(firstEntry) : [],
    firstEntryId: firstEntry?.id || 'N/A',
    hasMessaging: !!firstEntry?.messaging,
    messagingCount: firstEntry?.messaging?.length || 0,
    hasChanges: !!firstEntry?.changes,
    changesCount: firstEntry?.changes?.length || 0,
    firstChangeField: firstEntry?.changes?.[0]?.field || 'N/A',
    hasValueMessages: !!firstEntry?.changes?.[0]?.value?.messages,
    messagesCount: firstEntry?.changes?.[0]?.value?.messages?.length || 0,
    firstMessageKeys: firstEntry?.changes?.[0]?.value?.messages?.[0] ? Object.keys(firstEntry.changes[0].value.messages[0]) : [],
  })

  // Log webhook entry for debugging
  console.log(`📥 [META-WEBHOOK] Received webhook: object=${payload.object}, entries=${payload.entry?.length || 0}`)

  const entries = payload.entry || []

  for (const entry of entries) {
    const entryId = entry.id

    // Determine lookup key based on payload.object
    let connection = null
    let pageId: string | null = null
    let igBusinessId: string | null = null

    if (payload.object === 'instagram') {
      // For Instagram events, entry.id is the IG Business Account ID
      igBusinessId = entryId
      console.log(`📸 [META-WEBHOOK] Instagram event - entry.id=${entryId} (IG Business Account ID)`)
      
      // Query for connection using IG Business Account ID
      // Note: workspaceId null is converted to 1 in getConnectionByIgBusinessId (single-tenant)
      connection = await getConnectionByIgBusinessId(entryId, null)
      
      if (connection) {
        pageId = connection.pageId
        console.log(`✅ [META-WEBHOOK] Resolved connection by igBusinessId:`, {
          connectionId: connection.id,
          pageId: pageId,
          igBusinessId: connection.igBusinessId,
          igUsername: connection.igUsername || 'N/A',
          workspaceId: connection.workspaceId,
          status: connection.status,
        })
      } else {
        console.warn(`⚠️ [META-WEBHOOK] No connection found for IG Business Account ID: ${entryId}`, {
          searchedIgBusinessId: entryId,
          hint: 'Verify the connection was created with the correct igBusinessId during setup',
        })
      }
    } else if (payload.object === 'page') {
      // For Page events, entry.id is the Facebook Page ID
      pageId = entryId
      console.log(`📘 [META-WEBHOOK] Page event - entry.id=${entryId} (Page ID)`)
      
      connection = await getConnectionByPageId(entryId, null)
      
      if (connection) {
        igBusinessId = connection.igBusinessId || null
        console.log(`✅ [META-WEBHOOK] Resolved connection by pageId: connection=${connection.id}, igUsername=${connection.igUsername || 'N/A'}, igBusinessId=${igBusinessId || 'N/A'}`)
      } else {
        console.warn(`⚠️ [META-WEBHOOK] No connection found for Page ID: ${entryId}`)
      }
    }

    // If no connection found, log detailed warning
    if (!connection) {
      console.warn(`❌ [META-WEBHOOK] No connection found for object=${payload.object}, entry.id=${entryId}, igBusinessId=${igBusinessId || 'N/A'}, pageId=${pageId || 'N/A'}`)
      // Still store event without connection for debugging
      try {
        await storeWebhookEvent({
          connectionId: null,
          workspaceId: null,
          pageId: pageId || null,
          eventType: payload.object || 'unknown',
          payload,
        })
      } catch (error: any) {
        console.error('Failed to store webhook event without connection:', error)
      }
      continue
    }

    const connectionId = connection.id
    const workspaceId = connection.workspaceId ?? null

    // Store raw webhook event
    try {
      await storeWebhookEvent({
        connectionId,
        workspaceId,
        pageId: pageId || null,
        eventType: payload.object || 'unknown',
        payload,
      })
    } catch (error: any) {
      console.error('Failed to store webhook event:', error)
    }

    // Normalize and process events (optional - only if safe inbox function exists)
    const normalizedEvents = normalizeWebhookEvent(payload)

    // Post-normalization validation logging
    console.log(`📊 [META-WEBHOOK] Normalization results:`, {
      object: payload.object,
      entryId: entry.id,
      normalizedEventCount: normalizedEvents.length,
      eventTypes: normalizedEvents.map(e => e.eventType),
      hasInstagramMessages: normalizedEvents.some(e => e.eventType === 'message' && payload.object === 'instagram'),
    })

    if (normalizedEvents.length === 0 && payload.object === 'instagram') {
      console.warn(`⚠️ [META-WEBHOOK] Normalization produced zero events for Instagram webhook. Payload structure may be unexpected.`, {
        entryId: entry.id,
        hasChanges: !!entry.changes,
        changesCount: entry.changes?.length || 0,
        firstChangeField: entry.changes?.[0]?.field,
        hasValueMessages: !!entry.changes?.[0]?.value?.messages,
      })
      // Continue - still store webhook event for debugging
    }

    for (const event of normalizedEvents) {
      // Determine channel based on page or event context
      const channel = payload.object === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK'
      
      // Detect message structure: Instagram has attachments directly, Facebook has nested message.attachments
      const isInstagramMessage = payload.object === 'instagram'
      const hasInstagramAttachments = isInstagramMessage && !!(event.rawPayload?.attachments && event.rawPayload.attachments.length > 0)
      const hasFacebookAttachments = !isInstagramMessage && !!(event.rawPayload?.message?.attachments && event.rawPayload.message.attachments.length > 0)
      const hasAttachments = hasInstagramAttachments || hasFacebookAttachments
      const hasText = !!event.text

      if (event.eventType === 'message' && event.senderId && (hasText || hasAttachments)) {
        // Log structured information for Instagram message ingestion
        if (channel === 'INSTAGRAM') {
          console.log('📥 [META-WEBHOOK] Instagram message received', {
            object: payload.object,
            entryId: entry.id, // IG Business Account ID
            pageId: pageId || 'N/A',
            igBusinessId: entry.id,
            senderId: event.senderId,
            hasText: !!event.text,
            hasAttachments: hasInstagramAttachments,
            attachmentsCount: event.rawPayload?.attachments?.length || 0,
            connectionId: connection?.id || 'NONE',
            workspaceId: workspaceId || 'NONE',
            messageId: event.messageId || 'N/A',
          })
        }

        // Optionally insert into inbox using safe function
        // pageId should be set from connection at this point
        if (!pageId) {
          console.warn(`⚠️ [META-WEBHOOK] Cannot process message - pageId is null for connection ${connectionId}`)
          continue
        }

        try {
          // Extract attachments based on message structure
          // Instagram: rawPayload.attachments[] directly
          // Facebook: rawPayload.message.attachments[]
          let attachments = null
          if (isInstagramMessage) {
            attachments = event.rawPayload?.attachments || null
          } else {
            attachments = event.rawPayload?.message?.attachments || null
          }

          await processInboundMessage({
            pageId,
            workspaceId: workspaceId ?? 1,
            senderId: event.senderId,
            message: { 
              text: event.text, 
              mid: event.messageId,
              attachments: attachments,
            },
            timestamp: event.timestamp || new Date(),
            channel,
          })

          // Log successful ingestion (after processInboundMessage completes)
          if (channel === 'INSTAGRAM') {
            console.log('✅ [META-WEBHOOK] Instagram message ingested', {
              senderId: event.senderId,
              channel: 'INSTAGRAM',
              igBusinessId: entry.id,
              pageId: pageId,
              messageId: event.messageId || 'N/A',
            })
          }
        } catch (error: any) {
          if (error.message === 'DUPLICATE_MESSAGE') {
            console.log(`ℹ️ [META-WEBHOOK] Duplicate ${channel} message detected - skipping`)
          } else {
            console.error(`❌ [META-WEBHOOK] Error processing ${channel} message:`, {
              error: error.message,
              senderId: event.senderId,
              channel,
              pageId,
            })
          }
          // Event is already stored, can be processed manually
        }
      }
    }
  }
}

/**
 * Process inbound message and optionally insert into inbox
 */
async function processInboundMessage(data: {
  pageId: string
  workspaceId: number
  senderId: string
  message: any
  timestamp: Date
  channel: 'INSTAGRAM' | 'FACEBOOK'
}) {
  const { senderId, message, timestamp, channel } = data

  // Extract message text
  let text = message.text || ''
  if (!text && message.attachments) {
    // Handle media messages
    text = '[Media message]'
  }

  if (!text && !message.attachments) {
    // Skip empty messages
    return
  }

  // Use senderId as fromAddress (Instagram/Facebook user ID)
  const fromAddress = senderId

  // Check if we have a safe function to insert messages
  // Use the autoMatchPipeline which is the safe, isolated function
  try {
    const providerMessageId = message.mid || `meta_${channel.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Extract attachment metadata - handle both Instagram and Facebook structures
    // Instagram: attachment.url or attachment.payload.url
    // Facebook: attachment.payload.url
    let mediaUrl: string | null = null
    let mediaMimeType: string | null = null
    let providerMediaId: string | null = null

    if (message.attachments && message.attachments.length > 0) {
      const attachment = message.attachments[0]
      
      // Instagram structure: attachment.url or attachment.payload.url
      // Facebook structure: attachment.payload.url
      mediaUrl = attachment.url || attachment.payload?.url || null
      
      // Media ID can be in payload.media_id (Facebook) or payload.id (Instagram)
      providerMediaId = attachment.payload?.media_id || attachment.payload?.id || null
      
      // MIME type: attachment.type (both) or attachment.mimeType (Instagram files)
      mediaMimeType = attachment.type || attachment.mimeType || null
    }

    await handleInboundMessageAutoMatch({
      channel: channel,
      providerMessageId: providerMessageId,
      fromPhone: null, // Instagram/Facebook use user IDs, not phone numbers
      fromEmail: null,
      fromName: null,
      text: text,
      timestamp: timestamp,
      metadata: {
        providerMediaId: providerMediaId,
        mediaUrl: mediaUrl,
        mediaMimeType: mediaMimeType,
        senderId: senderId,
        pageId: data.pageId,
      },
    })

    console.log(`✅ Processed ${channel} message from ${senderId}`)
  } catch (error: any) {
    console.error(`Error inserting ${channel} message into inbox:`, error)
    // Event is already stored in meta_webhook_events, so it can be processed manually
  }
}

