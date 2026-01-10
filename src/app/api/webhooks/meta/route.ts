/**
 * GET/POST /api/webhooks/meta
 * Meta webhook endpoint for Instagram DMs, Facebook Messenger, and Lead Ads
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { storeWebhookEvent, getConnectionByPageId, getConnectionByIgBusinessId, getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { normalizeWebhookEvent, type NormalizedWebhookEvent } from '@/server/integrations/meta/normalize'
import { handleInboundMessageAutoMatch } from '@/lib/inbound/autoMatchPipeline'
import { getWebhookVerifyToken, getAppSecret } from '@/server/integrations/meta/config'
import { fetchInstagramUserProfile } from '@/server/integrations/meta/profile'

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
      const userAgent = req.headers.get('user-agent') || 'unknown'
      const isMetaRequest = userAgent.includes('Meta') || userAgent.includes('facebookexternalhit')
      const source = isMetaRequest ? 'Meta' : 'Healthcheck'
      
      console.log(`✅ [META-WEBHOOK] Healthcheck request (no hub params)`, {
        source,
        userAgent,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        timestamp: new Date().toISOString(),
      })
      
      return NextResponse.json(
        { 
          ok: true, 
          mode: 'healthcheck',
          message: 'Webhook endpoint is accessible',
          source,
          timestamp: new Date().toISOString(),
        },
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
  // Log immediately when POST request arrives
  const requestTimestamp = new Date().toISOString()
  const userAgent = req.headers.get('user-agent') || 'unknown'
  const contentType = req.headers.get('content-type') || 'unknown'
  
  console.log('📥 [META-WEBHOOK-POST] POST request received', {
    timestamp: requestTimestamp,
    userAgent,
    contentType,
    path: req.nextUrl.pathname,
    method: req.method,
  })
  
  // Immediately return 200 OK to Meta
  const response = NextResponse.json({ success: true })

  try {
    // Verify webhook signature if app secret is configured (optional)
    const signature = req.headers.get('x-hub-signature-256')
    const body = await req.text()
    
    console.log('📥 [META-WEBHOOK-POST] Request body received', {
      bodyLength: body.length,
      hasSignature: !!signature,
      bodyPreview: body.substring(0, 200),
    })

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

    let payload
    try {
      payload = JSON.parse(body)
      console.log('📥 [META-WEBHOOK-POST] Payload parsed successfully', {
        object: payload.object,
        hasEntry: !!payload.entry,
        entryCount: payload.entry?.length || 0,
      })
    } catch (parseError: any) {
      console.error('❌ [META-WEBHOOK-POST] Failed to parse payload as JSON', {
        error: parseError.message,
        bodyPreview: body.substring(0, 500),
      })
      return response
    }

    // Process webhook asynchronously (don't block response)
    // Log immediately that we're starting async processing
    console.log('🔄 [META-WEBHOOK-POST] Starting async webhook processing', {
      object: payload.object,
      entryCount: payload.entry?.length || 0,
    })
    
    processWebhookPayload(payload)
      .then(() => {
        console.log('✅ [META-WEBHOOK-POST] Async webhook processing completed successfully', {
          object: payload.object,
          entryCount: payload.entry?.length || 0,
          isInstagram: payload.object === 'instagram',
          timestamp: new Date().toISOString(),
        })
        
        // Additional logging for Instagram to confirm processing completed
        if (payload.object === 'instagram') {
          console.log('✅ [META-WEBHOOK-INSTAGRAM] Processing status: Async webhook processing completed', {
            entryCount: payload.entry?.length || 0,
            note: 'Check logs above to see if events were processed into leads and messages',
          })
        }
      })
      .catch((error: any) => {
        // Capture full error object for debugging
        const errorMessage = error.message || String(error) || 'Unknown error'
        const errorName = error.name || 'UnknownError'
        const errorCode = error.code || 'NO_CODE'
        const errorStack = error.stack?.substring(0, 1000) || 'No stack trace'
        
        // Capture Prisma error details if available
        const prismaErrorDetails = error.code || error.meta ? {
          prismaCode: error.code,
          prismaMeta: error.meta,
          prismaClientVersion: error.clientVersion,
        } : null
        
        // Safely serialize error object
        let fullError = 'Could not serialize error'
        try {
          fullError = JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 1000)
        } catch (serializeError) {
          try {
            fullError = JSON.stringify({
              message: error.message,
              name: error.name,
              code: error.code,
              stack: error.stack,
              toString: String(error),
            }).substring(0, 1000)
          } catch {
            fullError = String(error).substring(0, 500)
          }
        }
        
        console.error('❌ [META-WEBHOOK-POST] Error processing Meta webhook:', {
          error: errorMessage,
          errorName,
          errorCode,
          errorStack,
          fullError,
          object: payload.object,
          entryCount: payload.entry?.length || 0,
          isInstagram: payload.object === 'instagram',
          timestamp: new Date().toISOString(),
          ...(prismaErrorDetails || {}),
        })
        
        // Additional logging for Instagram errors
        if (payload.object === 'instagram') {
          console.error('❌ [META-WEBHOOK-INSTAGRAM] Processing status: Async webhook processing FAILED', {
            error: errorMessage,
            errorName,
            errorCode,
            entryCount: payload.entry?.length || 0,
            ...(prismaErrorDetails || {}),
            warning: 'Instagram webhook processing failed - no leads or messages will be created for this webhook',
          })
          
          // Log full Prisma error if it's a Prisma error
          if (error.code && error.meta) {
            try {
              const prismaErrorJson = JSON.stringify({
                code: error.code,
                meta: error.meta,
                message: error.message,
              }, null, 2)
              console.error('❌ [META-WEBHOOK-INSTAGRAM] PRISMA ERROR IN processWebhookPayload:', prismaErrorJson)
            } catch (jsonError) {
              console.error('❌ [META-WEBHOOK-INSTAGRAM] Failed to serialize Prisma error:', jsonError)
            }
          }
        }
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
  console.log('🔄 [META-WEBHOOK-PROCESS] processWebhookPayload called', {
    object: payload.object,
    hasEntry: !!payload.entry,
    entryCount: payload.entry?.length || 0,
  })
  
  if (payload.object !== 'page' && payload.object !== 'instagram') {
    console.log('⚠️ [META-WEBHOOK-PROCESS] Ignoring non-page/instagram webhook object:', payload.object)
    return
  }
  
  console.log(`✅ [META-WEBHOOK-PROCESS] Processing ${payload.object} webhook`, {
    entryCount: payload.entry?.length || 0,
  })

  // CRITICAL: Log raw payload structure for debugging
  // This helps diagnose what Meta is actually sending
  const firstEntry = payload.entry?.[0]
  const isInstagram = payload.object === 'instagram'
  
  if (isInstagram) {
    // Comprehensive logging for Instagram webhooks
    console.log('📥 [META-WEBHOOK-INSTAGRAM-DEBUG] RAW PAYLOAD STRUCTURE:', JSON.stringify({
      object: payload.object,
      hasEntry: !!payload.entry,
      entryCount: payload.entry?.length || 0,
      firstEntryKeys: firstEntry ? Object.keys(firstEntry) : [],
      firstEntryId: firstEntry?.id || 'N/A',
      firstEntryStructure: firstEntry ? {
        id: firstEntry.id,
        hasMessaging: !!firstEntry.messaging,
        messagingCount: firstEntry.messaging?.length || 0,
        hasChanges: !!firstEntry.changes,
        changesCount: firstEntry.changes?.length || 0,
        changesFields: firstEntry.changes?.map((c: any) => c.field) || [],
        // Detailed change structure
        firstChange: firstEntry.changes?.[0] ? {
          field: firstEntry.changes[0].field,
          valueKeys: firstEntry.changes[0].value ? Object.keys(firstEntry.changes[0].value) : [],
          hasMessages: !!firstEntry.changes[0].value?.messages,
          messagesCount: firstEntry.changes[0].value?.messages?.length || 0,
          messageStructure: firstEntry.changes[0].value?.messages?.[0] ? {
            keys: Object.keys(firstEntry.changes[0].value.messages[0]),
            hasFrom: !!firstEntry.changes[0].value.messages[0].from,
            fromType: typeof firstEntry.changes[0].value.messages[0].from,
            fromValue: firstEntry.changes[0].value.messages[0].from,
            hasText: !!firstEntry.changes[0].value.messages[0].text,
            textValue: firstEntry.changes[0].value.messages[0].text,
            hasId: !!firstEntry.changes[0].value.messages[0].id,
            idValue: firstEntry.changes[0].value.messages[0].id,
            hasMid: !!firstEntry.changes[0].value.messages[0].mid,
            midValue: firstEntry.changes[0].value.messages[0].mid,
            hasTimestamp: !!firstEntry.changes[0].value.messages[0].timestamp,
            timestampValue: firstEntry.changes[0].value.messages[0].timestamp,
            hasAttachments: !!firstEntry.changes[0].value.messages[0].attachments,
            attachmentsCount: firstEntry.changes[0].value.messages[0].attachments?.length || 0,
          } : null,
        } : null,
        // Check if messaging array exists (Facebook Page style)
        firstMessaging: firstEntry.messaging?.[0] ? {
          keys: Object.keys(firstEntry.messaging[0]),
          hasSender: !!firstEntry.messaging[0].sender,
          hasRecipient: !!firstEntry.messaging[0].recipient,
          hasMessage: !!firstEntry.messaging[0].message,
          messageKeys: firstEntry.messaging[0].message ? Object.keys(firstEntry.messaging[0].message) : [],
        } : null,
      } : null,
    }, null, 2))
  } else {
    // Basic logging for non-Instagram webhooks
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
  }

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
      
      // Log connection lookup attempt
      console.log('🔍 [META-WEBHOOK-INSTAGRAM] Looking up connection', {
        object: payload.object,
        entryId: entry.id,
        igBusinessId: entryId,
        hasChanges: !!entry.changes,
        changesCount: entry.changes?.length || 0,
        hasMessaging: !!entry.messaging,
        messagingCount: entry.messaging?.length || 0,
        workspaceId: null, // Will be converted to 1 in getConnectionByIgBusinessId
      })
      
      // Query for connection using IG Business Account ID
      // Note: workspaceId null is converted to 1 in getConnectionByIgBusinessId (single-tenant)
      connection = await getConnectionByIgBusinessId(entryId, null)
      
      if (connection) {
        pageId = connection.pageId
        console.log('✅ [META-WEBHOOK-INSTAGRAM] Connection found', {
          connectionId: connection.id,
          workspaceId: connection.workspaceId ?? 'N/A',
          pageId: pageId || 'N/A',
          igBusinessId: connection.igBusinessId || 'N/A',
          igUsername: connection.igUsername || 'N/A',
          status: connection.status || 'N/A',
        })
      } else {
        console.error('❌ [META-WEBHOOK-INSTAGRAM] Connection NOT found', {
          entryId: entry.id,
          searchedIgBusinessId: entryId,
          workspaceId: null, // Searched with null, converted to 1
          warning: 'This Instagram webhook will NOT be processed - connection missing. Verify connection was created with correct igBusinessId.',
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

    // Log normalization input for Instagram
    if (payload.object === 'instagram') {
      console.log('📥 [META-WEBHOOK-INSTAGRAM-DEBUG] NORMALIZATION INPUT:', {
        entryId: entry.id,
        entryKeys: Object.keys(entry),
        hasChanges: !!entry.changes,
        changesCount: entry.changes?.length || 0,
        changesFields: entry.changes?.map((c: any) => c.field) || [],
        hasMessaging: !!entry.messaging,
        messagingCount: entry.messaging?.length || 0,
        fullEntryStructure: JSON.stringify(entry, null, 2).substring(0, 2000), // First 2000 chars
      })
    }

    // Normalize and process events (optional - only if safe inbox function exists)
    // Log immediately before normalization to confirm it's being called
    if (payload.object === 'instagram') {
      console.log('🔄 [META-WEBHOOK-INSTAGRAM] About to call normalizeWebhookEvent', {
        entryId: entry.id,
        hasConnection: !!connection,
        connectionId: connection?.id || 'NONE',
      })
    }
    
    const normalizedEvents = normalizeWebhookEvent(payload)
    
    // Log immediately after normalization to confirm it completed
    if (payload.object === 'instagram') {
      console.log('🔄 [META-WEBHOOK-INSTAGRAM] normalizeWebhookEvent completed', {
        entryId: entry.id,
        normalizedEventCount: normalizedEvents.length,
        hasEvents: normalizedEvents.length > 0,
      })
    }

    // Post-normalization validation logging
    if (payload.object === 'instagram') {
      console.log('📊 [META-WEBHOOK-INSTAGRAM-DEBUG] NORMALIZATION OUTPUT:', {
        entryId: entry.id,
        normalizedEventCount: normalizedEvents.length,
        eventTypes: normalizedEvents.map(e => e.eventType),
        events: normalizedEvents.map(e => ({
          eventType: e.eventType,
          senderId: e.senderId || 'N/A',
          recipientId: e.recipientId || 'N/A',
          messageId: e.messageId || 'N/A',
          hasText: !!e.text,
          textLength: e.text?.length || 0,
          textPreview: e.text ? `${e.text.substring(0, 50)}${e.text.length > 50 ? '...' : ''}` : '[no text]',
          hasTimestamp: !!e.timestamp,
          timestamp: e.timestamp?.toISOString() || 'N/A',
          rawPayloadKeys: e.rawPayload ? Object.keys(e.rawPayload) : [],
        })),
      })
    } else {
      console.log(`📊 [META-WEBHOOK] Normalization results:`, {
        object: payload.object,
        entryId: entry.id,
        normalizedEventCount: normalizedEvents.length,
        eventTypes: normalizedEvents.map(e => e.eventType),
        hasInstagramMessages: normalizedEvents.some(e => e.eventType === 'message' && payload.object === 'instagram'),
      })
    }

    // Verify normalization is working - log results
    if (payload.object === 'instagram') {
      if (normalizedEvents.length === 0) {
        console.warn('⚠️ [META-WEBHOOK-INSTAGRAM-DEBUG] Normalization produced ZERO events for Instagram webhook - attempting fallback', {
        entryId: entry.id,
        entryKeys: Object.keys(entry),
        hasChanges: !!entry.changes,
        changesCount: entry.changes?.length || 0,
        changesFields: entry.changes?.map((c: any) => c.field) || [],
        firstChange: entry.changes?.[0] ? {
          field: entry.changes[0].field,
          valueKeys: entry.changes[0].value ? Object.keys(entry.changes[0].value) : [],
          hasMessages: !!entry.changes[0].value?.messages,
          messagesCount: entry.changes[0].value?.messages?.length || 0,
        } : null,
        hasMessaging: !!entry.messaging,
        messagingCount: entry.messaging?.length || 0,
        fullPayloadPreview: JSON.stringify(payload).substring(0, 1000), // First 1000 chars for debugging
      })
      
      // FALLBACK: Attempt direct parsing if normalization failed
      console.log('🔄 [META-WEBHOOK-INSTAGRAM-DEBUG] Attempting fallback direct parsing...')
      try {
        // Try parsing from entry.changes[].value.messages[]
        if (entry.changes) {
          for (const change of entry.changes) {
            if (change.value?.messages && Array.isArray(change.value.messages)) {
              console.log('🔄 [META-WEBHOOK-INSTAGRAM-DEBUG] Fallback: Found messages in change.value.messages', {
                messageCount: change.value.messages.length,
              })
              for (const msg of change.value.messages) {
                const fallbackEvent: NormalizedWebhookEvent = {
                  pageId: entry.id,
                  eventType: 'message',
                  rawPayload: msg,
                  senderId: msg.from?.id || msg.from || undefined,
                  recipientId: msg.to?.id || msg.to || undefined,
                  messageId: msg.mid || msg.id || undefined,
                  text: msg.text || '',
                  timestamp: msg.timestamp ? new Date(typeof msg.timestamp === 'string' ? parseInt(msg.timestamp, 10) * 1000 : msg.timestamp * 1000) : undefined,
                }
                normalizedEvents.push(fallbackEvent)
                console.log('✅ [META-WEBHOOK-INSTAGRAM-DEBUG] Fallback: Created event from direct parsing', {
                  senderId: fallbackEvent.senderId,
                  messageId: fallbackEvent.messageId,
                  hasText: !!fallbackEvent.text,
                })
              }
            }
          }
        }
        
        // Try parsing from entry.messaging[] (Facebook Page style)
        if (normalizedEvents.length === 0 && entry.messaging) {
          console.log('🔄 [META-WEBHOOK-INSTAGRAM-DEBUG] Fallback: Trying entry.messaging[] structure', {
            messagingCount: entry.messaging.length,
          })
          for (const msgEvent of entry.messaging) {
            if (msgEvent.message && !msgEvent.message.is_echo) {
              const fallbackEvent: NormalizedWebhookEvent = {
                pageId: entry.id,
                eventType: 'message',
                rawPayload: msgEvent,
                senderId: msgEvent.sender?.id || undefined,
                recipientId: msgEvent.recipient?.id || undefined,
                messageId: msgEvent.message?.mid || msgEvent.message?.id || undefined,
                text: msgEvent.message?.text || '',
                timestamp: msgEvent.timestamp ? new Date(msgEvent.timestamp * 1000) : undefined,
              }
              normalizedEvents.push(fallbackEvent)
              console.log('✅ [META-WEBHOOK-INSTAGRAM-DEBUG] Fallback: Created event from messaging[] structure', {
                senderId: fallbackEvent.senderId,
                messageId: fallbackEvent.messageId,
                hasText: !!fallbackEvent.text,
              })
            }
          }
        }
        
        if (normalizedEvents.length > 0) {
          console.log('✅ [META-WEBHOOK-INSTAGRAM-DEBUG] Fallback parsing succeeded', {
            eventCount: normalizedEvents.length,
          })
        } else {
          console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] Fallback parsing also produced zero events', {
            entryStructure: JSON.stringify(entry).substring(0, 500),
          })
        }
      } catch (fallbackError: any) {
        console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] Fallback parsing error:', fallbackError.message, fallbackError.stack)
      }
      // Continue - still store webhook event for debugging
    }

    // Log entry into processing loop
    if (payload.object === 'instagram') {
      console.log('🔄 [META-WEBHOOK-INSTAGRAM] Entering event processing loop', {
        entryId: entry.id,
        normalizedEventCount: normalizedEvents.length,
        hasConnection: !!connection,
        connectionId: connection?.id || 'NONE',
        events: normalizedEvents.map((e, idx) => ({
          index: idx + 1,
          eventType: e.eventType,
          senderId: e.senderId || 'MISSING',
          messageId: e.messageId || 'MISSING',
          hasText: !!e.text,
          textLength: e.text?.length || 0,
        })),
      })
    }

    for (const event of normalizedEvents) {
      // Log each event being processed
      if (payload.object === 'instagram') {
        console.log('🔄 [META-WEBHOOK-INSTAGRAM] Processing event in loop', {
          eventIndex: normalizedEvents.indexOf(event) + 1,
          totalEvents: normalizedEvents.length,
          eventType: event.eventType,
          senderId: event.senderId || 'MISSING',
          messageId: event.messageId || 'MISSING',
        })
      }
      // Determine channel based on payload object
      // Pass uppercase to match AutoMatchInput interface - normalizeChannel will convert to lowercase
      const channel = payload.object === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK'
      const channelLower = payload.object === 'instagram' ? 'instagram' : 'facebook' // For logging
      
      // Detect message structure: Instagram has attachments directly, Facebook has nested message.attachments
      const isInstagramMessage = payload.object === 'instagram'
      const hasInstagramAttachments = isInstagramMessage && !!(event.rawPayload?.attachments && event.rawPayload.attachments.length > 0)
      const hasFacebookAttachments = !isInstagramMessage && !!(event.rawPayload?.message?.attachments && event.rawPayload.message.attachments.length > 0)
      const hasAttachments = hasInstagramAttachments || hasFacebookAttachments
      const hasText = !!event.text

      // Diagnostic logging for Instagram events - log ALL events, not just those that pass conditions
      if (channelLower === 'instagram') {
        console.log('🔍 [META-WEBHOOK-INSTAGRAM-DEBUG] Evaluating event for processing:', {
          eventType: event.eventType,
          senderId: event.senderId || 'MISSING',
          hasSenderId: !!event.senderId,
          hasText: !!event.text,
          textValue: event.text || '[no text]',
          textLength: event.text?.length || 0,
          hasAttachments: hasAttachments,
          attachmentsCount: event.rawPayload?.attachments?.length || 0,
          passesCondition: event.eventType === 'message' && event.senderId && (hasText || hasAttachments),
          conditionBreakdown: {
            isMessage: event.eventType === 'message',
            hasSender: !!event.senderId,
            hasTextOrAttachments: (hasText || hasAttachments),
            allConditions: event.eventType === 'message' && event.senderId && (hasText || hasAttachments),
          },
          rawPayloadPreview: JSON.stringify(event.rawPayload).substring(0, 500),
        })
      }
      
      // Check if event passes processing conditions
      const passesConditions = event.eventType === 'message' && event.senderId && (hasText || hasAttachments)
      
      // Log when events are skipped due to condition check failure
      if (!passesConditions) {
        if (channelLower === 'instagram') {
          const skipReason = !event.eventType ? 'missing eventType' :
                            !event.senderId ? 'missing senderId' :
                            !hasText && !hasAttachments ? 'no text or attachments' :
                            event.eventType !== 'message' ? `eventType is '${event.eventType}' not 'message'` :
                            'unknown'
          
          console.warn('⚠️ [META-WEBHOOK-INSTAGRAM] Event SKIPPED - does not pass conditions', {
            eventType: event.eventType || 'MISSING',
            hasSenderId: !!event.senderId,
            senderId: event.senderId || 'MISSING',
            hasText,
            textValue: event.text || '[no text]',
            textLength: event.text?.length || 0,
            hasAttachments,
            attachmentsCount: event.rawPayload?.attachments?.length || 0,
            reason: skipReason,
            conditionBreakdown: {
              isMessage: event.eventType === 'message',
              hasSender: !!event.senderId,
              hasTextOrAttachments: (hasText || hasAttachments),
              allConditions: event.eventType === 'message' && event.senderId && (hasText || hasAttachments),
            },
          })
        }
        continue // Skip this event
      }
      
      // Event passes conditions - proceed with processing (we already checked passesConditions above)
      if (channelLower === 'instagram') {
        console.log('🔄 [META-WEBHOOK-INSTAGRAM] About to process event - PASSED conditions', {
          eventType: event.eventType,
          senderId: event.senderId,
          messageId: event.messageId || 'N/A',
          hasText: !!event.text,
          hasAttachments,
          textPreview: event.text ? `${event.text.substring(0, 50)}${event.text.length > 50 ? '...' : ''}` : '[no text]',
        })
      }
      
      // Process the event (we already verified it passes conditions above, but keep the original check for safety)
      // Defensive logging for Instagram message ingestion
      if (channelLower === 'instagram') {
          console.log('📥 [META-WEBHOOK-INSTAGRAM] Instagram messaging event received - PASSING conditions', {
            object: payload.object,
            entryId: entry.id, // IG Business Account ID
            pageId: pageId || 'N/A',
            igBusinessId: entry.id,
            senderId: event.senderId || 'N/A',
            recipientId: event.recipientId || 'N/A',
            messageId: event.messageId || 'N/A',
            text: event.text ? `${event.text.substring(0, 50)}${event.text.length > 50 ? '...' : ''}` : '[no text]',
            hasText: !!event.text,
            textLength: event.text?.length || 0,
            hasAttachments: hasInstagramAttachments,
            attachmentsCount: event.rawPayload?.attachments?.length || 0,
            connectionId: connection?.id || 'NONE',
            workspaceId: workspaceId || 'NONE',
            timestamp: event.timestamp?.toISOString() || 'N/A',
          })
        }

        // Optionally insert into inbox using safe function
        // pageId should be set from connection at this point
        if (!pageId) {
          console.warn(`⚠️ [META-WEBHOOK] Cannot process message - pageId is null for connection ${connectionId}`)
          continue
        }

        // For Instagram messages, fetch user profile (name, username, profile photo) from Meta Graph API
        let instagramProfile: { name: string | null; username: string | null; profilePic: string | null } | null = null
        if (payload.object === 'instagram' && connection) {
          try {
            const pageAccessToken = await getDecryptedPageToken(connection.id)
            if (pageAccessToken && event.senderId) {
              instagramProfile = await fetchInstagramUserProfile(event.senderId, pageAccessToken)
              
              if (instagramProfile) {
                console.log('📸 [META-WEBHOOK-INSTAGRAM] Fetched Instagram user profile', {
                  senderId: event.senderId,
                  name: instagramProfile.name || 'N/A',
                  username: instagramProfile.username || 'N/A',
                  hasProfilePic: !!instagramProfile.profilePic,
                })
              } else {
                console.warn('⚠️ [META-WEBHOOK-INSTAGRAM] Failed to fetch Instagram user profile', {
                  senderId: event.senderId,
                  connectionId: connection.id,
                })
              }
            } else {
              console.warn('⚠️ [META-WEBHOOK-INSTAGRAM] Cannot fetch profile - missing access token or senderId', {
                hasToken: !!pageAccessToken,
                hasSenderId: !!event.senderId,
                connectionId: connection.id,
              })
            }
          } catch (profileError: any) {
            console.error('❌ [META-WEBHOOK-INSTAGRAM] Error fetching Instagram profile', {
              senderId: event.senderId,
              error: profileError.message,
              connectionId: connection.id,
            })
            // Continue processing message even if profile fetch fails
          }
        }

        try {
          // Extract attachments based on message structure
          // Instagram: rawPayload.attachments[] directly OR rawPayload.payload.attachments[] (check both)
          // Facebook: rawPayload.message.attachments[]
          let attachments = null
          if (isInstagramMessage) {
            // Try multiple possible locations for Instagram attachments
            if (event.rawPayload?.attachments && Array.isArray(event.rawPayload.attachments)) {
              attachments = event.rawPayload.attachments
            } else if (event.rawPayload?.payload?.attachments && Array.isArray(event.rawPayload.payload.attachments)) {
              attachments = event.rawPayload.payload.attachments
            } else if (event.rawPayload?.image || event.rawPayload?.video) {
              // Convert image/video objects to attachments array format
              attachments = []
              if (event.rawPayload.image) {
                attachments.push({ 
                  type: 'image', 
                  url: event.rawPayload.image.url || event.rawPayload.image.uri || null,
                  payload: event.rawPayload.image.payload || null,
                  ...event.rawPayload.image 
                })
              }
              if (event.rawPayload.video) {
                attachments.push({ 
                  type: 'video', 
                  url: event.rawPayload.video.url || event.rawPayload.video.uri || null,
                  payload: event.rawPayload.video.payload || null,
                  ...event.rawPayload.video 
                })
              }
            }
            
            if (channelLower === 'instagram') {
              console.log('📎 [META-WEBHOOK-INSTAGRAM-DEBUG] Extracted attachments:', {
                hasAttachments: !!attachments,
                attachmentsCount: attachments?.length || 0,
                checkedLocations: {
                  rawPayloadAttachments: !!event.rawPayload?.attachments,
                  rawPayloadPayloadAttachments: !!event.rawPayload?.payload?.attachments,
                  rawPayloadImage: !!event.rawPayload?.image,
                  rawPayloadVideo: !!event.rawPayload?.video,
                },
                attachmentStructure: attachments?.[0] ? {
                  keys: Object.keys(attachments[0]),
                  type: attachments[0].type,
                  hasUrl: !!attachments[0].url,
                  hasPayload: !!attachments[0].payload,
                  payloadKeys: attachments[0].payload ? Object.keys(attachments[0].payload) : [],
                } : null,
                fullRawPayloadKeys: event.rawPayload ? Object.keys(event.rawPayload) : [],
              })
            }
          } else {
            attachments = event.rawPayload?.message?.attachments || null
          }

          // Log what we're passing to processInboundMessage
          if (channelLower === 'instagram') {
            console.log('🔄 [META-WEBHOOK-INSTAGRAM-DEBUG] Calling processInboundMessage with:', {
              pageId: pageId || 'N/A',
              workspaceId: workspaceId ?? 1,
              senderId: event.senderId || 'N/A',
              messageText: event.text || '[no text]',
              messageId: event.messageId || 'N/A',
              hasAttachments: !!attachments,
              attachmentsCount: attachments?.length || 0,
              timestamp: event.timestamp?.toISOString() || new Date().toISOString(),
              channel: channel, // Should be 'INSTAGRAM'
            })
          }

          console.log(`🔍 [META-WEBHOOK] IMMEDIATELY BEFORE await processInboundMessage`, {
            pageId: pageId || 'N/A',
            workspaceId: workspaceId ?? 1,
            senderId: event.senderId || 'N/A',
            messageId: event.messageId || 'N/A',
            channel,
            channelLower,
            isInstagram: channelLower === 'instagram',
          })
          
          try {
            // For Instagram, use robust processing pipeline that prioritizes inbox display
            if (channelLower === 'instagram') {
              console.log('🚀 [META-WEBHOOK-INSTAGRAM] Using robust processing pipeline')
              await processInstagramMessageRobust({
                pageId: pageId!,
                workspaceId: workspaceId ?? 1,
                senderId: event.senderId!,
                message: { 
                  text: event.text, 
                  attachments: attachments,
                  mid: event.messageId || event.messageId || `meta_instagram_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                },
                timestamp: event.timestamp || new Date(),
                instagramProfile: instagramProfile || undefined,
                providerMessageId: event.messageId || `meta_instagram_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                metadata: {
                  mediaUrl: attachments?.[0]?.url || attachments?.[0]?.payload?.url || null,
                  mediaMimeType: attachments?.[0]?.type || attachments?.[0]?.mimeType || null,
                  providerMediaId: attachments?.[0]?.payload?.media_id || attachments?.[0]?.payload?.id || null,
                },
              })
            } else {
              // For Facebook, use standard processing
              await processInboundMessage({
                pageId: pageId!,
                workspaceId: workspaceId ?? 1,
                senderId: event.senderId!,
                message: { 
                  text: event.text, 
                  mid: event.messageId,
                  attachments: attachments,
                },
                timestamp: event.timestamp || new Date(),
                channel,
                instagramProfile: instagramProfile || undefined, // Pass Instagram profile if fetched
              })
            }

            console.log(`✅ [META-WEBHOOK] IMMEDIATELY AFTER await processInboundMessage - SUCCESS`, {
              senderId: event.senderId || 'N/A',
              messageId: event.messageId || 'N/A',
              channel,
              channelLower,
              isInstagram: channelLower === 'instagram',
            })

            // Defensive logging: Log successful Instagram message storage
            if (channelLower === 'instagram') {
              console.log('✅ [META-WEBHOOK-INSTAGRAM] processInboundMessage call completed (check logs above for actual storage)', {
                senderId: event.senderId || 'N/A',
                recipientId: event.recipientId || 'N/A',
                channel: 'instagram',
                igBusinessId: entry.id,
                pageId: pageId,
                messageId: event.messageId || 'N/A',
              })
            }
          } catch (processError: any) {
            console.error(`❌ [META-WEBHOOK] IMMEDIATELY AFTER await processInboundMessage - ERROR CAUGHT`, {
              error: processError.message || 'Unknown error',
              errorName: processError.name || 'UnknownError',
              errorCode: processError.code || 'NO_CODE',
              errorStack: processError.stack?.substring(0, 1000) || 'No stack trace',
              fullError: JSON.stringify(processError, Object.getOwnPropertyNames(processError)).substring(0, 1000),
              senderId: event.senderId || 'N/A',
              messageId: event.messageId || 'N/A',
              channel,
              channelLower,
              isInstagram: channelLower === 'instagram',
            })
            
            // Re-throw to trigger outer catch block
            throw processError
          }
        } catch (error: any) {
          // Capture full error object with all properties for debugging
          const errorMessage = error.message || String(error) || 'Unknown error'
          const errorName = error.name || 'UnknownError'
          const errorCode = error.code || 'NO_CODE'
          const errorStack = error.stack?.substring(0, 1000) || 'No stack trace'
          
          // Safely serialize error object
          let fullError = 'Could not serialize error'
          try {
            fullError = JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 1000)
          } catch (serializeError) {
            try {
              fullError = JSON.stringify({
                message: error.message,
                name: error.name,
                code: error.code,
                stack: error.stack,
                toString: String(error),
              }).substring(0, 1000)
            } catch {
              fullError = String(error).substring(0, 500)
            }
          }
          
          // Log detailed error information with Prisma-specific details
          if (channelLower === 'instagram') {
            // Capture Prisma error details if available
            const prismaErrorDetails = error.code || error.meta ? {
              prismaCode: error.code,
              prismaMeta: error.meta,
              prismaClientVersion: error.clientVersion,
            } : null
            
            console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] Error in processInboundMessage call', {
              error: errorMessage,
              errorName,
              errorCode,
              errorStack,
              fullError,
              senderId: event.senderId || 'N/A',
              messageId: event.messageId || 'N/A',
              pageId: pageId || 'N/A',
              igBusinessId: entry.id || 'N/A',
              connectionId: connection?.id || 'N/A',
              ...(prismaErrorDetails || {}),
            })
            
            // Log full Prisma error if it's a Prisma error
            if (error.code && error.meta) {
              try {
                const prismaErrorJson = JSON.stringify({
                  code: error.code,
                  meta: error.meta,
                  message: error.message,
                }, null, 2)
                console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] PRISMA ERROR DETAILS:', prismaErrorJson)
              } catch (jsonError) {
                console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] Failed to serialize Prisma error:', jsonError)
              }
            }
          }
          
          if (errorMessage === 'DUPLICATE_MESSAGE' || error.message === 'DUPLICATE_MESSAGE') {
            if (channelLower === 'instagram') {
              console.log('ℹ️ [META-WEBHOOK-INSTAGRAM] Duplicate Instagram message detected - skipping', {
                messageId: event.messageId || 'N/A',
                senderId: event.senderId || 'N/A',
              })
            } else {
              console.log(`ℹ️ [META-WEBHOOK] Duplicate ${channel} message detected - skipping`)
            }
          } else {
            if (channelLower === 'instagram') {
              // Capture Prisma error details if available
              const prismaErrorDetails = error.code || error.meta ? {
                prismaCode: error.code,
                prismaMeta: error.meta,
                prismaClientVersion: error.clientVersion,
              } : null
              
              console.error('❌ [META-WEBHOOK-INSTAGRAM] Error processing Instagram message:', {
                error: errorMessage,
                errorName,
                errorCode,
                errorStack,
                fullError,
                senderId: event.senderId || 'N/A',
                messageId: event.messageId || 'N/A',
                pageId: pageId || 'N/A',
                igBusinessId: entry.id,
                connectionId: connection?.id || 'NONE',
                workspaceId: workspaceId || 'NONE',
                ...(prismaErrorDetails || {}),
              })
              
              // Log full Prisma error if it's a Prisma error
              if (error.code && error.meta) {
                try {
                  const prismaErrorJson = JSON.stringify({
                    code: error.code,
                    meta: error.meta,
                    message: error.message,
                  }, null, 2)
                  console.error('❌ [META-WEBHOOK-INSTAGRAM] PRISMA ERROR DETAILS (full):', prismaErrorJson)
                } catch (jsonError) {
                  console.error('❌ [META-WEBHOOK-INSTAGRAM] Failed to serialize Prisma error:', jsonError)
                }
              }
            } else {
              console.error(`❌ [META-WEBHOOK] Error processing ${channel} message:`, {
                error: errorMessage,
                errorName,
                errorCode,
                errorStack,
                fullError,
                senderId: event.senderId,
                channel,
                pageId,
              })
            }
          }
          // Event is already stored, can be processed manually
        }
      }
    }
  }
}

/**
 * Process Instagram message with robust fallback pipeline
 * Creates conversation and message FIRST, then attempts lead creation (non-blocking)
 * This ensures messages appear in inbox even if lead creation fails
 */
async function processInstagramMessageRobust(data: {
  pageId: string
  workspaceId: number
  senderId: string
  message: any
  timestamp: Date
  instagramProfile?: { name: string | null; username: string | null; profilePic: string | null } | null
  providerMessageId: string
  metadata?: {
    mediaUrl?: string | null
    mediaMimeType?: string | null
    providerMediaId?: string | null
    [key: string]: any
  }
}) {
  const { senderId, message, timestamp, instagramProfile, providerMessageId, metadata } = data

  console.log('🚀 [INSTAGRAM-ROBUST] Starting robust Instagram message processing', {
    senderId,
    providerMessageId,
    hasText: !!message?.text,
    textLength: message?.text?.length || 0,
    hasAttachments: !!message?.attachments,
    timestamp: timestamp.toISOString(),
  })

  // Extract message text
  let text = message?.text || ''
  if (!text && message?.attachments) {
    text = '[Media message]'
  }

  if (!text && !message?.attachments) {
    console.warn('⚠️ [INSTAGRAM-ROBUST] Skipping empty message (no text and no attachments)')
    return
  }

  try {
    // Step 1: Upsert Contact (already working)
    const { getExternalThreadId } = await import('@/lib/conversation/getExternalThreadId')
    const { upsertConversation } = await import('@/lib/conversation/upsert')
    const { createInstagramLeadMinimal } = await import('@/lib/inbound/autoMatchPipeline')
    const { prisma } = await import('@/lib/prisma')
    const { upsertContact } = await import('@/lib/contact/upsert')

    // For Instagram, use senderId with 'ig:' prefix as phone
    const instagramPhone = `ig:${senderId}`
    const fromName = instagramProfile?.name || instagramProfile?.username || 'Instagram User'

    console.log('👤 [INSTAGRAM-ROBUST] Step 1: Upserting contact', {
      instagramPhone,
      fromName,
      senderId,
    })

    // Use the contact upsert function which requires prisma as first argument
    const contactResult = await upsertContact(prisma, {
      phone: instagramPhone,
      fullName: fromName,
      email: null,
      waId: null,
      webhookPayload: {
        sender: { id: senderId },
      },
    })

    // Fetch full contact details
    const contact = await prisma.contact.findUnique({
      where: { id: contactResult.id },
      select: {
        id: true,
        phone: true,
        fullName: true,
        phoneNormalized: true,
        waId: true,
      },
    })

    if (!contact) {
      throw new Error(`Failed to fetch contact after creation: ${contactResult.id}`)
    }

    console.log('✅ [INSTAGRAM-ROBUST] Contact upserted', {
      contactId: contact.id,
      phone: contact.phone,
      fullName: contact.fullName,
    })

    // Step 2: Create Conversation FIRST (before lead)
    const webhookPayloadForThreadId = {
      senderId: senderId,
      metadata: {
        senderId: senderId,
      },
    }

    const externalThreadId = getExternalThreadId(
      'INSTAGRAM',
      contactResult,
      webhookPayloadForThreadId
    )

    // Store Instagram profile pic in knownFields
    const knownFields = instagramProfile?.profilePic
      ? JSON.stringify({ instagramProfilePic: instagramProfile.profilePic })
      : null

    console.log('💬 [INSTAGRAM-ROBUST] Step 2: Creating conversation', {
      contactId: contactResult.id,
      externalThreadId,
      hasKnownFields: !!knownFields,
    })

    const conversationResult = await upsertConversation({
      contactId: contact.id,
      channel: 'INSTAGRAM',
      leadId: undefined, // Create without lead initially
      externalThreadId: externalThreadId,
      timestamp: timestamp,
      knownFields: knownFields,
    })

    console.log('✅ [INSTAGRAM-ROBUST] Conversation created', {
      conversationId: conversationResult.id,
    })

    // Step 3: Create Message SECOND (before lead)
    console.log('📨 [INSTAGRAM-ROBUST] Step 3: Creating message', {
      conversationId: conversationResult.id,
      providerMessageId,
      textLength: text.length,
      hasMedia: !!metadata?.mediaUrl || !!metadata?.providerMediaId,
    })

    // Create message directly
    const messageRecord = await prisma.message.create({
      data: {
        conversationId: conversationResult.id,
        contactId: contact.id,
        direction: 'INBOUND',
        channel: 'instagram', // Lowercase for database
        body: text,
        providerMessageId: providerMessageId,
        mediaUrl: metadata?.mediaUrl || null,
        mediaMimeType: metadata?.mediaMimeType || null,
        providerMediaId: metadata?.providerMediaId || null,
        createdAt: timestamp,
      },
    })

    console.log('✅ [INSTAGRAM-ROBUST] Message created', {
      messageId: messageRecord.id,
      conversationId: messageRecord.conversationId,
    })

    // Create communication log for lead linking (create without leadId initially)
    // Note: CommunicationLog is linked via leadId, not contactId directly
    // We'll create it after lead is created, or skip if lead creation fails
    let communicationLog: any = null

    // Update conversation unread count and last message timestamp
    await prisma.conversation.update({
      where: { id: conversationResult.id },
      data: {
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        unreadCount: {
          increment: 1,
        },
      },
    })

    console.log('✅ [INSTAGRAM-ROBUST] Conversation updated with unread count')

    // Step 4: Attempt Lead Creation LAST (non-blocking)
    console.log('🎯 [INSTAGRAM-ROBUST] Step 4: Attempting lead creation (non-blocking)')

    let lead = null
    try {
      // First try minimal lead creation
      lead = await createInstagramLeadMinimal(contact.id)

      if (lead) {
        console.log('✅ [INSTAGRAM-ROBUST] Lead created successfully', {
          leadId: lead.id,
          contactId: lead.contactId,
        })

        // Link conversation to lead
        await prisma.conversation.update({
          where: { id: conversationResult.id },
          data: {
            leadId: lead.id,
          },
        })

        // Create communication log linked to lead
        communicationLog = await prisma.communicationLog.create({
          data: {
            leadId: lead.id,
            channel: 'instagram',
            direction: 'inbound',
            messageSnippet: text.substring(0, 200),
            createdAt: timestamp,
          },
        })

        console.log('✅ [INSTAGRAM-ROBUST] Conversation and communication logs linked to lead')
      } else {
        console.warn('⚠️ [INSTAGRAM-ROBUST] Lead creation failed, but conversation and message are created')
      }
    } catch (leadError: any) {
      console.error('❌ [INSTAGRAM-ROBUST] Lead creation error (non-blocking)', {
        error: leadError.message,
        errorCode: leadError.code,
        contactId: contact.id,
        note: 'Conversation and message are already created, inbox will show the message',
      })
      // Don't throw - continue processing
    }

    console.log('✅ [INSTAGRAM-ROBUST] Robust processing completed', {
      contactId: contact.id,
      conversationId: conversationResult.id,
      messageId: messageRecord.id,
      leadId: lead?.id || null,
      messageInInbox: true,
    })

    return {
      contact: contact,
      conversation: { id: conversationResult.id },
      message: messageRecord,
      lead: lead,
    }
  } catch (error: any) {
    console.error('❌ [INSTAGRAM-ROBUST] Critical error in robust processing', {
      error: error.message,
      errorCode: error.code,
      errorStack: error.stack?.substring(0, 500),
      senderId,
      providerMessageId,
    })
    // Re-throw critical errors (contact/conversation/message creation failures)
    throw error
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
  instagramProfile?: { name: string | null; username: string | null; profilePic: string | null } | null
}) {
  const { senderId, message, timestamp, channel } = data
  const isInstagram = channel === 'INSTAGRAM'

  // Defensive logging at start of processInboundMessage
  if (isInstagram) {
    console.log('🔄 [META-WEBHOOK-INSTAGRAM-DEBUG] processInboundMessage called', {
      pageId: data.pageId,
      workspaceId: data.workspaceId,
      senderId: senderId || 'MISSING',
      messageKeys: message ? Object.keys(message) : [],
      messageText: message?.text || '[no text]',
      messageMid: message?.mid || '[no mid]',
      hasAttachments: !!message?.attachments,
      attachmentsCount: message?.attachments?.length || 0,
      timestamp: timestamp.toISOString(),
      channel: channel,
    })
  }

  // Extract message text
  let text = message.text || ''
  if (!text && message.attachments) {
    // Handle media messages
    text = '[Media message]'
  }

  if (!text && !message.attachments) {
    // Skip empty messages
    if (isInstagram) {
      console.warn('⚠️ [META-WEBHOOK-INSTAGRAM-DEBUG] Skipping empty message (no text and no attachments)', {
        senderId,
        messageKeys: message ? Object.keys(message) : [],
      })
    }
    return
  }

  // Use senderId as fromAddress (Instagram/Facebook user ID)
  const fromAddress = senderId

  if (!senderId) {
    console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] processInboundMessage: senderId is missing, cannot process', {
      message: message,
    })
    return
  }

  // Check if we have a safe function to insert messages
  // Use the autoMatchPipeline which is the safe, isolated function
  // Declare providerMessageId outside try block so it's accessible in catch
  const providerMessageId = message?.mid || `meta_${channel.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  
  try {

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
      
      if (isInstagram) {
        console.log('📎 [META-WEBHOOK-INSTAGRAM-DEBUG] Extracted attachment metadata', {
          mediaUrl: mediaUrl || 'N/A',
          providerMediaId: providerMediaId || 'N/A',
          mediaMimeType: mediaMimeType || 'N/A',
        })
      }
    }

    // For Instagram, use fetched profile name, or username as fallback, or "Instagram User" as last resort
    let fromName: string | null = null
    if (isInstagram && data.instagramProfile) {
      fromName = data.instagramProfile.name || data.instagramProfile.username || 'Instagram User'
    } else if (isInstagram) {
      fromName = 'Instagram User' // Fallback if profile fetch failed
    }

    const autoMatchInput = {
      channel: data.channel, // 'INSTAGRAM' or 'FACEBOOK' (will be normalized to lowercase by normalizeChannel)
      providerMessageId: providerMessageId,
      fromPhone: null, // Instagram/Facebook use user IDs, not phone numbers
      fromEmail: null,
      fromName: fromName, // Use fetched Instagram profile name, or fallback
      text: text,
      timestamp: timestamp,
      metadata: {
        providerMediaId: providerMediaId,
        mediaUrl: mediaUrl,
        mediaMimeType: mediaMimeType,
        senderId: senderId,
        pageId: data.pageId,
        // Store Instagram profile information in metadata
        instagramProfile: isInstagram && data.instagramProfile ? {
          name: data.instagramProfile.name,
          username: data.instagramProfile.username,
          profilePic: data.instagramProfile.profilePic,
        } : undefined,
      },
    }

    if (isInstagram) {
      console.log('🔄 [META-WEBHOOK-INSTAGRAM-DEBUG] Processing status: About to call handleInboundMessageAutoMatch', {
        channel: autoMatchInput.channel,
        providerMessageId: autoMatchInput.providerMessageId,
        textLength: autoMatchInput.text.length,
        textPreview: autoMatchInput.text.substring(0, 50),
        timestamp: autoMatchInput.timestamp.toISOString(),
        fromAddress: autoMatchInput.fromPhone || autoMatchInput.fromEmail || 'N/A',
        hasBody: !!autoMatchInput.text && autoMatchInput.text.trim().length > 0,
      })
    }

    try {
      await handleInboundMessageAutoMatch(autoMatchInput)

      // Defensive logging for Instagram message processing
      if (isInstagram) {
        console.log('✅ [META-WEBHOOK-INSTAGRAM-DEBUG] Processing status: handleInboundMessageAutoMatch completed successfully', {
          senderId: senderId,
          providerMessageId: providerMessageId,
          channel: 'instagram', // Stored as lowercase in DB
          textLength: text.length,
          fromAddress: autoMatchInput.fromPhone || autoMatchInput.fromEmail || 'N/A',
          note: 'This means contact, lead, conversation, and message should have been created/updated',
        })
      } else {
        console.log(`✅ Processed ${data.channel} message from ${senderId}`)
      }
    } catch (autoMatchError: any) {
      // Enhanced error logging for handleInboundMessageAutoMatch
      const errorMessage = autoMatchError.message || String(autoMatchError) || 'Unknown error'
      const errorName = autoMatchError.name || 'UnknownError'
      const errorCode = autoMatchError.code || 'NO_CODE'
      const errorStack = autoMatchError.stack?.substring(0, 1000) || 'No stack trace'
      
      // Capture Prisma error details if available
      const prismaErrorDetails = autoMatchError.code || autoMatchError.meta ? {
        prismaCode: autoMatchError.code,
        prismaMeta: autoMatchError.meta,
        prismaClientVersion: autoMatchError.clientVersion,
      } : null
      
      // Safely serialize error object
      let fullError = 'Could not serialize error'
      try {
        fullError = JSON.stringify(autoMatchError, Object.getOwnPropertyNames(autoMatchError)).substring(0, 1000)
      } catch (serializeError) {
        try {
          fullError = JSON.stringify({
            message: autoMatchError.message,
            name: autoMatchError.name,
            code: autoMatchError.code,
            stack: autoMatchError.stack,
            toString: String(autoMatchError),
          }).substring(0, 1000)
        } catch {
          fullError = String(autoMatchError).substring(0, 500)
        }
      }
      
      if (isInstagram) {
        console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] Processing status: handleInboundMessageAutoMatch FAILED', {
          error: errorMessage,
          errorName,
          errorCode,
          errorStack,
          fullError,
          senderId: senderId,
          providerMessageId: providerMessageId,
          channel: 'instagram',
          textLength: text.length,
          fromAddress: autoMatchInput.fromPhone || autoMatchInput.fromEmail || 'N/A',
          ...(prismaErrorDetails || {}),
        })
        
        // Log full Prisma error if it's a Prisma error
        if (autoMatchError.code && autoMatchError.meta) {
          try {
            const prismaErrorJson = JSON.stringify({
              code: autoMatchError.code,
              meta: autoMatchError.meta,
              message: autoMatchError.message,
            }, null, 2)
            console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] PRISMA ERROR IN handleInboundMessageAutoMatch:', prismaErrorJson)
          } catch (jsonError) {
            console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] Failed to serialize Prisma error:', jsonError)
          }
        }
      }
      
      // Re-throw to allow caller to handle
      throw autoMatchError
    }
    // Close inner try-catch - outer try continues
  } catch (error: any) {
    if (isInstagram) {
      console.error('❌ [META-WEBHOOK-INSTAGRAM-DEBUG] Error in processInboundMessage (outer catch)', {
        error: error.message,
        errorStack: error.stack?.substring(0, 500),
        senderId: senderId,
        providerMessageId: providerMessageId || message?.mid || 'N/A',
        channel: channel,
      })
    }
    console.error(`Error inserting ${channel} message into inbox:`, error)
    // Event is already stored in meta_webhook_events, so it can be processed manually
    throw error // Re-throw to allow caller to handle
  }
}

