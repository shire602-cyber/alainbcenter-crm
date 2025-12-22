import { NextRequest, NextResponse } from 'next/server'
import { ingestLead } from '@/lib/leadIngest'

// POST /api/leads/ingest
// Unified endpoint for external sources (website, Facebook, Instagram, WhatsApp)
//
// Example: Website form submission
// fetch('/api/leads/ingest', {
//   method: 'POST',
//   headers: { 'Content-Type': 'application/json' },
//   body: JSON.stringify({
//     fullName: 'John Doe',
//     phone: '+971501234567',
//     email: 'john@example.com',
//     service: 'Family Visa',
//     source: 'website',
//     notes: 'Interested in family visa application'
//   })
// })
//
// Example: Facebook/Instagram Lead Ads webhook
// Map webhook payload to this format:
// {
//   fullName: webhookData.first_name + ' ' + webhookData.last_name,
//   phone: webhookData.phone_number,
//   email: webhookData.email,
//   service: webhookData.service_interest,
//   source: 'facebook_ad', // or 'instagram_ad'
//   notes: webhookData.additional_info
// }
//
// Example: WhatsApp bot webhook
// {
//   fullName: messageData.name,
//   phone: messageData.from,
//   service: extractService(messageData.text),
//   source: 'whatsapp',
//   notes: messageData.text
// }
export async function POST(req: NextRequest) {
  try {
    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.fullName || !body.phone) {
      return NextResponse.json(
        { error: 'Missing required fields: fullName and phone are required' },
        { status: 400 }
      )
    }

    // Normalize source - map variations to allowed values
    const sourceMap: Record<string, 'website' | 'facebook_ad' | 'instagram_ad' | 'whatsapp' | 'manual'> = {
      'website': 'website',
      'web': 'website',
      'facebook_ad': 'facebook_ad',
      'facebook_ads': 'facebook_ad',
      'facebook': 'facebook_ad',
      'instagram_ad': 'instagram_ad',
      'instagram_ads': 'instagram_ad',
      'instagram': 'instagram_ad',
      'whatsapp': 'whatsapp',
      'wa': 'whatsapp',
      'manual': 'manual',
    }
    const source = sourceMap[body.source?.toLowerCase()] || 'manual'

    // Use shared ingest function
    const result = await ingestLead({
      fullName: body.fullName,
      phone: body.phone,
      email: body.email,
      service: body.service,
      leadType: body.leadType,
      source: source,
      notes: body.notes,
      message: body.message,
      expiryDate: body.expiryDate,
      nextFollowUpAt: body.nextFollowUpAt,
      nationality: body.nationality,
    })

    return NextResponse.json(
      { 
        success: true,
        lead: result.lead,
        aiScore: result.qualification.aiScore,
        aiNotes: result.qualification.aiNotes,
      },
      { status: 201 }
    )
  } catch (error: any) {
    console.error('POST /api/leads/ingest error:', error)
    // Return 400 for validation errors (invalid dates), 500 for other errors
    const status = error.message?.includes('Invalid date format') ? 400 : 500
    return NextResponse.json(
      { error: error?.message ?? 'Unknown error in POST /api/leads/ingest' },
      { status }
    )
  }
}



