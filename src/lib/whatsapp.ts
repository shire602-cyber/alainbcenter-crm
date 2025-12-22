/**
 * WhatsApp Cloud API client wrapper
 * Server-side only - never expose tokens to browser
 */

import { normalizeToE164 } from './phone'

const WHATSAPP_API_VERSION = 'v21.0'

interface WhatsAppResponse {
  messaging_product: string
  contacts: Array<{ input: string; wa_id: string }>
  messages: Array<{ id: string }>
}

interface WhatsAppError {
  error: {
    message: string
    type: string
    code: number
    error_subcode?: number
    fbtrace_id?: string
  }
}

function getWhatsAppCredentials() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      'WhatsApp not configured. Please set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in .env.local'
    )
  }

  return { accessToken, phoneNumberId }
}

/**
 * Send a text message via WhatsApp Cloud API
 * 
 * @param toE164 - Phone number in E.164 format (e.g., +971501234567)
 * @param body - Message text content
 * @returns WhatsApp message ID
 */
export async function sendTextMessage(
  toE164: string,
  body: string
): Promise<{ messageId: string; waId?: string }> {
  const { accessToken, phoneNumberId } = getWhatsAppCredentials()

  const normalizedPhone = normalizeToE164(toE164)

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone,
    type: 'text',
    text: {
      preview_url: false,
      body: body,
    },
  }

  try {
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
      const error = data as WhatsAppError
      throw new Error(
        error.error?.message || `WhatsApp API error: ${response.status} ${response.statusText}`
      )
    }

    const result = data as WhatsAppResponse
    const messageId = result.messages?.[0]?.id

    if (!messageId) {
      throw new Error('WhatsApp API did not return a message ID')
    }

    return {
      messageId,
      waId: result.contacts?.[0]?.wa_id,
    }
  } catch (error: any) {
    if (error.message.includes('WhatsApp')) {
      throw error
    }
    throw new Error(`Failed to send WhatsApp message: ${error.message}`)
  }
}

/**
 * Send a template message via WhatsApp Cloud API
 * Templates must be pre-approved by Meta
 * 
 * @param toE164 - Phone number in E.164 format
 * @param templateName - Name of the approved template
 * @param language - Language code (default: "en_US")
 * @param params - Array of parameter values for template variables {{1}}, {{2}}, etc.
 * @returns WhatsApp message ID
 */
export async function sendTemplateMessage(
  toE164: string,
  templateName: string,
  language: string = 'en_US',
  params: string[] = []
): Promise<{ messageId: string; waId?: string }> {
  const { accessToken, phoneNumberId } = getWhatsAppCredentials()

  const normalizedPhone = normalizeToE164(toE164)

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

  const components: any[] = []

  if (params.length > 0) {
    components.push({
      type: 'body',
      parameters: params.map((param) => ({
        type: 'text',
        text: param,
      })),
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
      components: components.length > 0 ? components : undefined,
    },
  }

  try {
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
      const error = data as WhatsAppError
      throw new Error(
        error.error?.message || `WhatsApp API error: ${response.status} ${response.statusText}`
      )
    }

    const result = data as WhatsAppResponse
    const messageId = result.messages?.[0]?.id

    if (!messageId) {
      throw new Error('WhatsApp API did not return a message ID')
    }

    return {
      messageId,
      waId: result.contacts?.[0]?.wa_id,
    }
  } catch (error: any) {
    if (error.message.includes('WhatsApp')) {
      throw error
    }
    throw new Error(`Failed to send WhatsApp template: ${error.message}`)
  }
}

