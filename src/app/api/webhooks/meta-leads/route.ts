import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

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

            try {
              await (prisma as any).externalEvent.create({
                data: {
                  provider: 'meta',
                  eventId: leadgenId,
                },
              })
            } catch (error: any) {
              if (error.code === 'P2002') {
                console.log(`⚠️ Duplicate Meta lead event: ${leadgenId}`)
                return NextResponse.json({ success: true, message: 'Duplicate event skipped' })
              }
              throw error
            }

            processMetaLead(leadgenId, change.value).catch((error) => {
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

async function processMetaLead(leadgenId: string, webhookData: any) {
  const accessToken = process.env.META_PAGE_ACCESS_TOKEN

  if (!accessToken) {
    throw new Error('META_PAGE_ACCESS_TOKEN not configured')
  }

  const graphApiUrl = `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${accessToken}`
  const response = await fetch(graphApiUrl)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Graph API error: ${response.status} - ${errorText}`)
  }

  const leadData = await response.json()

  const fieldMap: Record<string, string> = {}
  if (leadData.field_data && Array.isArray(leadData.field_data)) {
    for (const field of leadData.field_data) {
      if (field.name && field.values && field.values.length > 0) {
        fieldMap[field.name] = field.values[0]
      }
    }
  }

  const isInstagram =
    leadData.page?.name?.toLowerCase().includes('instagram') ||
    webhookData.page_id?.toString().includes('instagram') ||
    leadData.page_id?.toString().includes('instagram')
  const source = isInstagram ? 'instagram_ad' : 'facebook_ad'

  const phone = fieldMap.phone_number || fieldMap.mobile_number || ''
  
  if (!phone || phone.trim() === '') {
    throw new Error('Phone number is required but not provided in Meta lead data')
  }

  const ingestPayload = {
    fullName: fieldMap.full_name || (fieldMap.first_name && fieldMap.last_name ? `${fieldMap.first_name} ${fieldMap.last_name}` : 'Meta Lead'),
    phone: phone.trim(),
    email: fieldMap.email || undefined,
    service: fieldMap.service || fieldMap.visa_type || fieldMap.interest || undefined,
    source: source as 'website' | 'facebook_ad' | 'instagram_ad' | 'whatsapp' | 'manual',
    notes: buildNotesFromFields(fieldMap, leadgenId, webhookData, leadData),
    expiryDate: undefined,
  }

  await ingestLead(ingestPayload)
}

function buildNotesFromFields(
  fieldMap: Record<string, string>,
  leadgenId: string,
  webhookData: any,
  leadData: any
): string {
  const notes: string[] = []
  notes.push(`Meta Lead Ads - Lead ID: ${leadgenId}`)

  if (webhookData.form_id) notes.push(`Form ID: ${webhookData.form_id}`)
  if (webhookData.ad_id) notes.push(`Ad ID: ${webhookData.ad_id}`)
  if (webhookData.page_id) notes.push(`Page ID: ${webhookData.page_id}`)

  notes.push('')
  notes.push('Lead Details:')

  for (const [key, value] of Object.entries(fieldMap)) {
    if (key !== 'full_name' && key !== 'first_name' && key !== 'last_name' && key !== 'phone_number' && key !== 'mobile_number' && key !== 'email') {
      notes.push(`${key}: ${value}`)
    }
  }

  return notes.join('\n')
}

async function ingestLead(payload: {
  fullName: string
  phone: string
  email?: string | null
  service?: string | null
  source: string
  notes?: string | null
  expiryDate?: string | null
}) {
  const { ingestLead: ingestLeadFunction } = await import('@/lib/leadIngest')
  
  const result = await ingestLeadFunction({
    fullName: payload.fullName,
    phone: payload.phone,
    email: payload.email || undefined,
    service: payload.service || undefined,
    source: payload.source as 'website' | 'facebook_ad' | 'instagram_ad' | 'whatsapp' | 'manual',
    notes: payload.notes || undefined,
    expiryDate: payload.expiryDate || undefined,
  })

  await prisma.communicationLog.create({
    data: {
      leadId: result.lead.id,
      channel: payload.source === 'instagram_ad' ? 'instagram' : 'facebook',
      direction: 'inbound',
      messageSnippet: `New lead from ${payload.source}`,
    },
  })

  console.log(`✅ Meta lead ingested: Lead ID ${result.lead.id}, Contact ID ${result.contact.id}`)
  return result
}
