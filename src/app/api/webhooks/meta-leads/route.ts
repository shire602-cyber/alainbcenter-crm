import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { processLeadgenEvent } from '@/server/integrations/meta/leadgen'

/**
 * GET /api/webhooks/meta-leads
 * Webhook verification for Meta Lead Ads
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    const verifyToken = process.env.META_VERIFY_TOKEN

    if (!verifyToken) {
      return NextResponse.json(
        { error: 'META_VERIFY_TOKEN not configured' },
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
 * POST /api/webhooks/meta-leads
 * Receive Meta Lead Ads webhook events
 */
export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get('x-hub-signature-256')
    const appSecret = process.env.META_APP_SECRET

    if (!appSecret) {
      console.error('META_APP_SECRET not configured')
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
    }

    const body = await req.text()

    if (signature) {
      const expectedSignature = `sha256=${crypto
        .createHmac('sha256', appSecret)
        .update(body)
        .digest('hex')}`

      if (signature !== expectedSignature) {
        console.error('❌ Invalid Meta webhook signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    const payload = JSON.parse(body)

    if (payload.object === 'page') {
      for (const entry of payload.entry || []) {
        for (const change of entry.changes || []) {
          if (change.value && change.value.leadgen_id) {
            const leadgenId = change.value.leadgen_id

            processLeadgenEvent({
              payload: {
                leadgenId,
                formId: change.value.form_id || null,
                adId: change.value.ad_id || null,
                pageId: change.value.page_id || entry.id || null,
                createdTime: change.value.created_time || null,
              },
              source: 'webhook',
            }).catch((error) => {
              console.error(`❌ Error processing Meta lead ${leadgenId}:`, error)
            })
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Meta webhook POST error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 200 })
  }
}

