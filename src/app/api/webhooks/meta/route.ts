/**
 * GET/POST /api/webhooks/meta
 * Meta webhook endpoint for Instagram DMs, Facebook Messenger, and Lead Ads
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { storeWebhookEvent } from '@/server/integrations/meta/storage'
import { normalizeWebhookEvent } from '@/server/integrations/meta/normalize'
import { handleInboundMessageAutoMatch } from '@/lib/inbound/autoMatchPipeline'
import { getWebhookVerifyToken, getAppSecret } from '@/server/integrations/meta/config'

/**
 * GET /api/webhooks/meta
 * Webhook verification handshake
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    // Get verify token from database (or fallback to env var)
    const verifyToken = await getWebhookVerifyToken()

    if (!verifyToken) {
      console.error('Webhook verify token not configured')
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      )
    }

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Meta webhook verified successfully')
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      })
    }

    return NextResponse.json({ error: 'Invalid verification' }, { status: 403 })
  } catch (error: any) {
    console.error('Meta webhook verification error:', error)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
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

  const entries = payload.entry || []

  for (const entry of entries) {
    const pageId = entry.id

    // Resolve connection by page_id
    const connection = await prisma.metaConnection.findFirst({
      where: {
        pageId,
        status: 'connected',
      },
      select: {
        id: true,
        workspaceId: true,
      },
    })

    const connectionId = connection?.id ?? null
    const workspaceId = connection?.workspaceId ?? null

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

    for (const event of normalizedEvents) {
      if (event.eventType === 'message' && event.senderId && event.text) {
        // Determine channel based on page or event context
        const channel = payload.object === 'instagram' ? 'INSTAGRAM' : 'FACEBOOK'

        // Optionally insert into inbox using safe function
        try {
          await processInboundMessage({
            pageId,
            workspaceId: workspaceId ?? 1,
            senderId: event.senderId,
            message: { text: event.text, mid: event.messageId },
            timestamp: event.timestamp || new Date(),
            channel,
          })
        } catch (error: any) {
          console.error(`Error processing ${channel} message:`, error)
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

    await handleInboundMessageAutoMatch({
      channel: channel,
      providerMessageId: providerMessageId,
      fromPhone: null, // Instagram/Facebook use user IDs, not phone numbers
      fromEmail: null,
      fromName: null,
      text: text,
      timestamp: timestamp,
      metadata: {
        providerMediaId: message.attachments?.[0]?.payload?.media_id || null,
        mediaUrl: message.attachments?.[0]?.payload?.url || null,
        mediaMimeType: message.attachments?.[0]?.type || null,
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

