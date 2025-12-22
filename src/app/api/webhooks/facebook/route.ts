/**
 * POST /api/webhooks/facebook
 * 
 * Handle Facebook Messenger webhooks
 * 
 * Meta sends webhooks for Facebook Messenger messages.
 * This route handles both verification and message events.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { handleInboundMessage } from '@/lib/inbound'

/**
 * GET /api/webhooks/facebook
 * Webhook verification (Meta requires this for webhook setup)
 */
export async function GET(req: NextRequest) {
  try {
    const mode = req.nextUrl.searchParams.get('hub.mode')
    const token = req.nextUrl.searchParams.get('hub.verify_token')
    const challenge = req.nextUrl.searchParams.get('hub.challenge')

    console.log('📥 Facebook webhook verification request received:', {
      mode,
      tokenProvided: !!token,
      challengeProvided: !!challenge,
    })

    // Get verify token from Integration model or env
    let verifyToken: string | null = null
    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'facebook' },
      })

      if (integration?.config) {
        try {
          const config = typeof integration.config === 'string' 
            ? JSON.parse(integration.config) 
            : integration.config
          verifyToken = config.webhookVerifyToken || null
        } catch (e) {
          console.error('Failed to parse integration config:', e)
        }
      }
    } catch (e) {
      console.warn('Could not fetch integration from DB:', e)
    }

    if (!verifyToken) {
      verifyToken = process.env.FACEBOOK_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || null
    }

    if (!verifyToken) {
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    if (!mode || !token || !challenge) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Facebook webhook verified successfully!')
      return new Response(challenge, { 
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
        },
      })
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch (error: any) {
    console.error('❌ Error in Facebook webhook verification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/webhooks/facebook
 * Handle Facebook Messenger messages
 */
export async function POST(req: NextRequest) {
  let rawBody: string = ''
  let body: any = null

  try {
    rawBody = await req.text()
    body = JSON.parse(rawBody)

    // Verify webhook signature (optional but recommended)
    const signature = req.headers.get('x-hub-signature-256')
    
    // Get App Secret from Integration model or env
    let appSecret: string | null = null
    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'facebook' },
      })

      if (integration?.config) {
        try {
          const config = typeof integration.config === 'string' 
            ? JSON.parse(integration.config) 
            : integration.config
          appSecret = integration.apiSecret || config.appSecret || null
        } catch {}
      }
      
      if (!appSecret && integration?.apiSecret) {
        appSecret = integration.apiSecret
      }
    } catch {}

    if (!appSecret) {
      appSecret = process.env.FACEBOOK_APP_SECRET || process.env.META_APP_SECRET || null
    }

    if (appSecret && signature) {
      try {
        const expectedSignature = crypto
          .createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex')
        const providedSignature = signature.replace('sha256=', '')

        if (expectedSignature !== providedSignature) {
          console.warn('⚠️ Facebook webhook signature mismatch')
          return NextResponse.json({ error: 'Invalid signature' }, { status: 403 })
        }
      } catch (e) {
        console.warn('Could not verify signature:', e)
      }
    }

    // Handle webhook events
    const entry = body.entry?.[0]
    if (!entry) {
      return NextResponse.json({ ok: true })
    }

    // Handle messaging events (inbound messages)
    if (entry.messaging) {
      for (const event of entry.messaging) {
        // Skip if not a message event
        if (!event.message || event.message.is_echo) {
          continue
        }

        const senderId = event.sender?.id
        const recipientId = event.recipient?.id
        const messageId = event.message.mid || event.message.id
        const messageText = event.message.text || ''
        const timestamp = event.timestamp 
          ? new Date(event.timestamp * 1000) 
          : new Date()

        // Handle attachments
        let mediaUrl: string | null = null
        let mediaMimeType: string | null = null
        let processedText = messageText

        if (event.message.attachments) {
          const attachment = event.message.attachments[0]
          if (attachment.type === 'image') {
            processedText = processedText || '[image]'
            mediaUrl = attachment.payload?.url || null
            mediaMimeType = 'image/jpeg'
          } else if (attachment.type === 'video') {
            processedText = processedText || '[video]'
            mediaUrl = attachment.payload?.url || null
            mediaMimeType = 'video/mp4'
          } else if (attachment.type === 'audio') {
            processedText = processedText || '[audio]'
            mediaUrl = attachment.payload?.url || null
            mediaMimeType = 'audio/ogg'
          } else if (attachment.type === 'file') {
            processedText = processedText || `[file: ${attachment.name || 'file'}]`
            mediaUrl = attachment.payload?.url || null
            mediaMimeType = attachment.mimeType || 'application/octet-stream'
          }
        }

        if (!senderId) {
          console.warn('⚠️ Facebook message missing sender ID')
          continue
        }

        // Use common inbound handler
        try {
          const result = await handleInboundMessage({
            channel: 'FACEBOOK',
            externalId: senderId, // Use sender ID as conversation external ID
            externalMessageId: messageId,
            fromAddress: senderId,
            fromName: event.sender?.name || null,
            body: processedText || '[Facebook message]',
            rawPayload: event,
            receivedAt: timestamp,
            mediaUrl: mediaUrl,
            mediaMimeType: mediaMimeType,
          })

          console.log(`✅ Processed Facebook message ${messageId} from ${senderId}`)
        } catch (error: any) {
          console.error(`❌ Failed to process Facebook message from ${senderId}:`, error.message)
          // Continue processing other messages
        }
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('❌ Error processing Facebook webhook:', error)
    // Still return 200 to prevent retries
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
