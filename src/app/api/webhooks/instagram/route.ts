import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { handleInboundMessageAutoMatch } from '@/lib/inbound/autoMatchPipeline'

/**
 * GET /api/webhooks/instagram
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

    console.log('📥 Instagram webhook verification request received:', {
      mode,
      tokenProvided: !!token,
      challengeProvided: !!challenge,
      url: req.url,
    })

    // First try to get verify token from Integration model
    let verifyToken: string | null = null
    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'instagram' },
      })

      if (integration?.config) {
        try {
          const config = typeof integration.config === 'string' 
            ? JSON.parse(integration.config) 
            : integration.config
          verifyToken = config.webhookVerifyToken || null
          console.log('✅ Found verify token in integration config')
        } catch (e) {
          console.error('❌ Failed to parse integration config:', e)
        }
      }
    } catch (e) {
      console.warn('⚠️ Could not fetch integration from DB:', e)
    }

    // Fallback to environment variable
    if (!verifyToken) {
      verifyToken = process.env.INSTAGRAM_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN || null
      if (verifyToken) {
        console.log('✅ Found verify token in environment variable')
      }
    }

    if (!verifyToken) {
      console.error('❌ Instagram webhook verify token not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    if (!mode || !token || !challenge) {
      console.warn('⚠️ Missing required webhook parameters:', { mode, token: !!token, challenge: !!challenge })
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (mode === 'subscribe' && token === verifyToken) {
      console.log('✅ Instagram webhook verified successfully!', {
        mode,
        tokenMatch: true,
        challengeLength: challenge.length,
      })
      
      // Log webhook event
      try {
        await prisma.externalEventLog.create({
          data: {
            provider: 'meta',
            externalId: `verify_${Date.now()}`,
            payload: JSON.stringify({ mode, verified: true }),
          },
        })
      } catch (e) {
        console.warn('Could not log webhook event:', e)
      }

      // Return challenge as plain text (Meta requires this format)
      return new Response(challenge, { 
        status: 200,
        headers: { 
          'Content-Type': 'text/plain',
          'Cache-Control': 'no-cache',
        },
      })
    }

    console.warn('⚠️ Instagram webhook verification failed', { 
      mode,
      modeMatches: mode === 'subscribe',
      tokenProvided: !!token,
      tokenMatches: token === verifyToken,
    })
    
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  } catch (error: any) {
    console.error('❌ Error in Instagram webhook verification:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/webhooks/instagram
 * Handle Instagram Direct Message webhooks
 * 
 * Events handled:
 * - messages: inbound messages from users
 * - messaging_postbacks: user interactions
 */
export async function POST(req: NextRequest) {
  let rawBody: string = ''
  let body: any = null

  try {
    // Get raw body for signature verification
    rawBody = await req.text()
    
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    // Verify webhook signature (optional but recommended)
    const signature = req.headers.get('x-hub-signature-256')
    
    // Get App Secret from Integration model first, then fallback to env var
    let appSecret: string | null = null
    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'instagram' },
      })

      if (integration?.config) {
        try {
          const config = typeof integration.config === 'string' 
            ? JSON.parse(integration.config) 
            : integration.config
          appSecret = integration.apiSecret || config.appSecret || null
        } catch {
          // Config parse error, continue to env var
        }
      }
      
      if (!appSecret && integration?.apiSecret) {
        appSecret = integration.apiSecret
      }
    } catch {
      // Integration model might not exist, continue to env var
    }

    // Fallback to environment variable
    if (!appSecret) {
      appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET || null
    }

    if (appSecret && signature) {
      try {
        const expectedSignature = 'sha256=' + crypto
          .createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex')

        const cleanSignature = signature.startsWith('sha256=')
          ? signature
          : `sha256=${signature}`

        if (!crypto.timingSafeEqual(Buffer.from(cleanSignature), Buffer.from(expectedSignature))) {
          console.error('⚠️ Invalid Instagram webhook signature')
          
          // Log failed verification
          try {
            await prisma.externalEventLog.create({
              data: {
                provider: 'meta',
                externalId: `invalid_sig_${Date.now()}`,
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

    // Log webhook event
    try {
      await prisma.externalEventLog.create({
        data: {
          provider: 'meta',
          externalId: `instagram_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          payload: JSON.stringify(body).substring(0, 10000), // Limit payload size
        },
      })
    } catch (e) {
      console.warn('Could not log webhook event:', e)
    }

    // Handle incoming messages
    if (value?.messages) {
      for (const message of value.messages) {
        const from = message.from?.id || message.from // Instagram user ID
        const messageId = message.mid || message.id
        const messageType = message.type || 'text'
        const timestamp = message.timestamp
          ? new Date(parseInt(message.timestamp) * 1000)
          : new Date()
        
        // Extract message text/content
        let messageText = message.text || ''
        let mediaUrl: string | null = null
        let mediaMimeType: string | null = null

        if (!messageText && messageType !== 'text') {
          // For non-text messages, create placeholder
          if (message.attachments) {
            const attachment = message.attachments[0]
            if (attachment.type === 'image') {
              messageText = '[image]'
              mediaUrl = attachment.url || attachment.payload?.url || null
              mediaMimeType = 'image/jpeg'
            } else if (attachment.type === 'video') {
              messageText = '[video]'
              mediaUrl = attachment.url || attachment.payload?.url || null
              mediaMimeType = 'video/mp4'
            } else if (attachment.type === 'audio') {
              messageText = '[audio]'
              mediaUrl = attachment.url || attachment.payload?.url || null
              mediaMimeType = 'audio/ogg'
            } else if (attachment.type === 'file') {
              messageText = `[file: ${attachment.name || 'file'}]`
              mediaUrl = attachment.url || attachment.payload?.url || null
              mediaMimeType = attachment.mimeType || 'application/octet-stream'
            } else {
              messageText = `[${messageType}]`
            }
          } else {
            messageText = `[${messageType}]`
          }
        }

        // Use new AUTO-MATCH pipeline
        try {
          const result = await handleInboundMessageAutoMatch({
            channel: 'INSTAGRAM',
            providerMessageId: messageId,
            fromPhone: null, // Instagram uses user IDs, not phone numbers
            fromEmail: null,
            fromName: message.from?.name || null,
            text: messageText,
            timestamp: timestamp,
            metadata: {
              externalId: from, // Instagram user ID
              rawPayload: message,
              mediaUrl: mediaUrl,
              mediaMimeType: mediaMimeType,
            },
          })

          console.log(`✅ Processed Instagram message ${messageId} from ${from}`)
        } catch (error: any) {
          console.error(`❌ Failed to process Instagram message from ${from}:`, error.message)
          // Continue processing other messages
        }
      }
    }

    // Handle messaging_postbacks (user interactions)
    if (value?.postbacks) {
      for (const postback of value.postbacks) {
        console.log('📥 Instagram postback received:', postback)
        // You can handle postbacks here if needed
      }
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('❌ Error processing Instagram webhook:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
