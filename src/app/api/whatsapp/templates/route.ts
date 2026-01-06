import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { getWhatsAppCredentials } from '@/lib/whatsapp'

const WHATSAPP_API_VERSION = 'v24.0'

/**
 * GET /api/whatsapp/templates
 * List approved WhatsApp message templates from Meta Graph API
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    // Get WABA ID from environment
    const wabaId = process.env.WHATSAPP_WABA_ID
    if (!wabaId) {
      return NextResponse.json(
        { error: 'WHATSAPP_WABA_ID environment variable not set' },
        { status: 500 }
      )
    }

    // Get access token
    const { accessToken } = await getWhatsAppCredentials()

    // Fetch templates from Meta Graph API
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${wabaId}/message_templates?fields=name,language,status,category,components`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('[WHATSAPP-TEMPLATES] API error:', error)
      return NextResponse.json(
        { error: error.error?.message || 'Failed to fetch templates' },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Filter only APPROVED templates and sort by name
    const approvedTemplates = (data.data || [])
      .filter((template: any) => template.status === 'APPROVED')
      .sort((a: any, b: any) => a.name.localeCompare(b.name))

    return NextResponse.json({
      ok: true,
      templates: approvedTemplates,
    })
  } catch (error: any) {
    console.error('[WHATSAPP-TEMPLATES] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch templates' },
      { status: 500 }
    )
  }
}
