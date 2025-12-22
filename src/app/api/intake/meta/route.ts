import { NextRequest, NextResponse } from 'next/server'
import { ingestLead } from '@/lib/leadIngest'
import { prisma } from '@/lib/prisma'

// POST /api/intake/meta
// Meta (Facebook/Instagram) Lead Ads webhook ingestion
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Meta webhook verification (for initial setup)
    if (body['hub.mode'] === 'subscribe' && body['hub.verify_token']) {
      const verifyToken = process.env.META_VERIFY_TOKEN || 'alainbcenter_meta_webhook'
      if (body['hub.verify_token'] === verifyToken) {
        return NextResponse.json(body['hub.challenge'], { status: 200 })
      }
      return NextResponse.json({ error: 'Invalid verify token' }, { status: 403 })
    }

    // Handle actual lead data
    // Meta sends lead data in entry[0].changes[0].value format
    const entry = body.entry?.[0]
    const change = entry?.changes?.[0]
    const leadData = change?.value

    if (!leadData) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    // Extract lead fields from Meta format
    // Meta Lead Ads format: https://developers.facebook.com/docs/marketing-api/leadgen
    const fieldData = leadData.field_data || []
    const fields: Record<string, string> = {}

    for (const field of fieldData) {
      fields[field.name] = field.values?.[0] || ''
    }

    // Map Meta fields to our format
    const fullName = `${fields.first_name || ''} ${fields.last_name || ''}`.trim() || fields.full_name || 'Unknown'
    const phone = fields.phone_number || fields.phone || ''
    const email = fields.email || ''
    const service = fields.service_interest || fields.service || fields.custom_question_1 || ''
    const notes = fields.additional_info || fields.message || fields.custom_question_2 || ''
    const nationality = fields.nationality || fields.country || ''

    // Determine source (Facebook or Instagram)
    const pageId = leadData.page_id || entry?.id
    const adId = leadData.ad_id || leadData.adgroup_id
    const source = leadData.form_id ? 'facebook_ad' : 'instagram_ad' // Heuristic: forms are usually Facebook

    if (!phone && !email) {
      return NextResponse.json(
        { error: 'Missing contact information (phone or email required)' },
        { status: 400 }
      )
    }

    // Use phone as primary identifier, fallback to email if no phone
    const contactPhone = phone || `email_${email}`

    // Store webhook event for audit
    try {
      await prisma.externalEventLog.create({
        data: {
          provider: source,
          externalId: leadData.leadgen_id || leadData.id || `meta_${Date.now()}`,
          payload: JSON.stringify(leadData),
        },
      })
    } catch (error) {
      // Ignore duplicate event errors
      console.warn('Duplicate Meta event detected:', error)
    }

    // Use shared ingest function
    const result = await ingestLead({
      fullName,
      phone: contactPhone,
      email: email || undefined,
      service: service || undefined,
      source: source as 'facebook_ad' | 'instagram_ad',
      notes: notes || `Meta Lead Ad - Ad ID: ${adId}`,
      nationality: nationality || undefined,
    })

    // Auto-qualify and set follow-up (already done in ingestLead)

    return NextResponse.json(
      {
        success: true,
        leadId: result.lead.id,
        aiScore: result.qualification.aiScore,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('POST /api/intake/meta error:', error)
    return NextResponse.json(
      { error: error?.message ?? 'Failed to process Meta lead' },
      { status: 500 }
    )
  }
}























