import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { getWhatsAppCredentials } from '@/lib/whatsapp'
import { normalizeToE164 } from '@/lib/phone'

const WHATSAPP_API_VERSION = 'v24.0'

/**
 * POST /api/whatsapp/send-template
 * Send a WhatsApp template message via Meta Graph API
 * 
 * Body:
 * {
 *   to: string (E.164 format),
 *   templateName: string,
 *   language: string (e.g. "en_US"),
 *   variables?: string[] (for body placeholders),
 *   headerMediaId?: string (optional)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuthApi()

    const body = await req.json()
    const { to, templateName, language, variables = [], headerMediaId } = body

    if (!to || !templateName || !language) {
      return NextResponse.json(
        { error: 'Missing required fields: to, templateName, language' },
        { status: 400 }
      )
    }

    // Get credentials
    const { accessToken, phoneNumberId } = await getWhatsAppCredentials()

    // Normalize phone number to E.164
    const normalizedPhone = normalizeToE164(to)

    // Build template payload
    const components: any[] = []

    // Add body parameters if variables provided
    if (variables.length > 0) {
      components.push({
        type: 'body',
        parameters: variables.map((v: string) => ({
          type: 'text',
          text: v,
        })),
      })
    }

    // Add header media if provided
    if (headerMediaId) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'image',
            image: {
              id: headerMediaId,
            },
          },
        ],
      })
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: language,
        },
        ...(components.length > 0 && { components }),
      },
    }

    // Send to Meta Graph API
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('[WHATSAPP-SEND-TEMPLATE] API error:', data)
      return NextResponse.json(
        { 
          ok: false,
          error: data.error?.message || 'Failed to send template message',
          metaError: data.error,
        },
        { status: response.status }
      )
    }

    return NextResponse.json({
      ok: true,
      messageId: data.messages?.[0]?.id,
      metaResponse: data,
    })
  } catch (error: any) {
    console.error('[WHATSAPP-SEND-TEMPLATE] Error:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to send template message' },
      { status: 500 }
    )
  }
}

