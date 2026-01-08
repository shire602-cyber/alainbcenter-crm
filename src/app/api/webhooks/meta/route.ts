/**
 * GET/POST /api/webhooks/meta
 * Meta webhook endpoint for Instagram DMs, Facebook Messenger, and Lead Ads
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decryptToken } from '@/lib/integrations/meta/encryption'
import crypto from 'crypto'
import { handleInboundMessageAutoMatch } from '@/lib/inbound/autoMatchPipeline'

const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN
const META_APP_SECRET = process.env.META_APP_SECRET

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

    if (!META_VERIFY_TOKEN) {
      console.error('META_VERIFY_TOKEN not configured')
      return NextResponse.json(
        { error: 'Webhook not configured' },
        { status: 500 }
      )
    }

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN) {
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
    // Verify webhook signature if app secret is configured
    const signature = req.headers.get('x-hub-signature-256')
    const body = await req.text()

    if (META_APP_SECRET && signature) {
      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', META_APP_SECRET)
        .update(body)
        .digest('hex')}`

      if (signature !== expectedSignature) {
        console.error('❌ Invalid Meta webhook signature')
        // Still return 200 to avoid retries, but log the error
        return response
      }
    } else if (!META_APP_SECRET) {
      console.warn('⚠️ META_APP_SECRET not configured - skipping signature verification')
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

    // Resolve workspace_id from page_id
    const connection = await prisma.$queryRaw<Array<{
      workspace_id: number
      page_access_token: string
    }>>`
      SELECT workspace_id, page_access_token
      FROM meta_connections
      WHERE page_id = ${pageId}
      AND status = 'active'
      LIMIT 1
    `

    const workspaceId = connection.length > 0 ? connection[0].workspace_id : 1

    // Store raw webhook event
    // After running migration and regenerating Prisma client, you can use:
    // await prisma.metaWebhookEvent.create({ ... })
    try {
      await prisma.$executeRaw`
        INSERT INTO meta_webhook_events (workspace_id, page_id, event_type, payload, received_at)
        VALUES (${workspaceId}, ${pageId || null}, ${payload.object || 'unknown'}, ${JSON.stringify(payload)}, NOW())
      `
    } catch (error: any) {
      console.error('Failed to store webhook event:', error)
    }

    // Process messaging events
    const messagingEvents = entry.messaging || []
    const instagramMessagingEvents = entry.messaging || []

    // Process Facebook Messenger messages
    for (const event of messagingEvents) {
      if (event.message && event.sender) {
        await processInboundMessage({
          pageId,
          workspaceId,
          senderId: event.sender.id,
          message: event.message,
          timestamp: event.timestamp ? new Date(event.timestamp * 1000) : new Date(),
          channel: 'FACEBOOK',
        }).catch((error) => {
          console.error('Error processing Facebook message:', error)
        })
      }
    }

    // Process Instagram messages
    for (const event of instagramMessagingEvents) {
      if (event.message && event.sender) {
        await processInboundMessage({
          pageId,
          workspaceId,
          senderId: event.sender.id,
          message: event.message,
          timestamp: event.timestamp ? new Date(event.timestamp * 1000) : new Date(),
          channel: 'INSTAGRAM',
        }).catch((error) => {
          console.error('Error processing Instagram message:', error)
        })
      }
    }

    // Process leadgen events (store for manual processing)
    const changes = entry.changes || []
    for (const change of changes) {
      if (change.field === 'leadgen' && change.value) {
        console.log('Leadgen event received:', change.value.leadgen_id)
        // Store in webhook_events for manual processing
        // TODO: Implement lead processing if needed
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

