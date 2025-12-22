import { NextRequest, NextResponse } from 'next/server'
import { requireAdminApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

/**
 * POST /api/webhooks/meta-leads/test
 * Admin-only test endpoint to fetch and ingest a Meta lead by leadgen_id
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdminApi()

    const body = await req.json()
    const { leadgenId } = body

    if (!leadgenId) {
      return NextResponse.json({ error: 'leadgenId is required' }, { status: 400 })
    }

    const accessToken = process.env.META_PAGE_ACCESS_TOKEN

    if (!accessToken) {
      return NextResponse.json(
        { error: 'META_PAGE_ACCESS_TOKEN not configured in environment' },
        { status: 500 }
      )
    }

    // Check for duplicate
    // Use type assertion since Prisma client may not be regenerated yet
    const existing = await (prisma as any).externalEvent.findUnique({
      where: {
        provider_eventId: {
          provider: 'meta',
          eventId: leadgenId,
        },
      },
    })

    if (existing) {
      return NextResponse.json({
        success: false,
        error: 'This lead has already been ingested',
        existing: true,
      })
    }

    // Fetch from Graph API
    const graphApiUrl = `https://graph.facebook.com/v18.0/${leadgenId}?access_token=${accessToken}`
    const response = await fetch(graphApiUrl)

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        {
          success: false,
          error: `Graph API error: ${response.status}`,
          details: errorText,
        },
        { status: response.status }
      )
    }

    const leadData = await response.json()

    // Map field_data
    const fieldMap: Record<string, string> = {}
    if (leadData.field_data && Array.isArray(leadData.field_data)) {
      for (const field of leadData.field_data) {
        if (field.name && field.values && field.values.length > 0) {
          fieldMap[field.name] = field.values[0]
        }
      }
    }

    // Determine source
    const isInstagram =
      leadData.page?.name?.toLowerCase().includes('instagram') ||
      leadData.page_id?.toString().includes('instagram')
    const source = isInstagram ? 'instagram_ad' : 'facebook_ad'

    // Build ingest payload
    const fullName =
      fieldMap.full_name ||
      (fieldMap.first_name && fieldMap.last_name
        ? `${fieldMap.first_name} ${fieldMap.last_name}`
        : 'Meta Lead')

    const phone = fieldMap.phone_number || fieldMap.mobile_number || ''
    
    // Validate phone number - required for lead ingestion
    if (!phone || phone.trim() === '') {
      return NextResponse.json(
        {
          success: false,
          error: 'Phone number is required but not provided in Meta lead data',
        },
        { status: 400 }
      )
    }

    const email = fieldMap.email || undefined
    const service = fieldMap.service || fieldMap.visa_type || fieldMap.interest || undefined

    const notes = [
      `Meta Lead Ads - Lead ID: ${leadgenId}`,
      leadData.form_id ? `Form ID: ${leadData.form_id}` : null,
      leadData.ad_id ? `Ad ID: ${leadData.ad_id}` : null,
      leadData.page_id ? `Page ID: ${leadData.page_id}` : null,
      '',
      'Lead Details:',
      ...Object.entries(fieldMap)
        .filter(
          ([key]) =>
            !['full_name', 'first_name', 'last_name', 'phone_number', 'mobile_number', 'email'].includes(key)
        )
        .map(([key, value]) => `${key}: ${value}`),
    ]
      .filter(Boolean)
      .join('\n')

    // Mark as ingested first to prevent duplicates
    // Use type assertion since Prisma client may not be regenerated yet
    await (prisma as any).externalEvent.create({
      data: {
        provider: 'meta',
        eventId: leadgenId,
      },
    })

    // Use shared ingest function
    const { ingestLead } = await import('@/lib/leadIngest')
    
    const result = await ingestLead({
      fullName,
      phone: phone.trim(), // Ensure trimmed phone
      email,
      service,
      source,
      notes,
    })

    // Log communication
    await prisma.communicationLog.create({
      data: {
        leadId: result.lead.id,
        channel: source === 'instagram_ad' ? 'instagram' : 'facebook',
        direction: 'inbound',
        messageSnippet: `New lead from ${source}`,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Lead ingested successfully',
      data: {
        fetchedFields: fieldMap,
        contact: {
          id: result.contact.id,
          fullName: result.contact.fullName,
          phone: result.contact.phone,
          email: result.contact.email,
        },
        lead: {
          id: result.lead.id,
          leadType: result.lead.leadType,
          source: (result.lead as any).source || source,
        },
      },
    })
  } catch (error: any) {
    console.error('Meta test endpoint error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to process test lead',
      },
      { status: error.statusCode || 500 }
    )
  }
}

