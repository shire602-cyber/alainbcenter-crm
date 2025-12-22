/**
 * WhatsApp Cloud API integration
 * Uses Meta WhatsApp Cloud API (not Twilio or 360dialog)
 */

const WHATSAPP_API_VERSION = 'v21.0'

/**
 * Normalize phone number to E.164 format
 * E.164: +[country code][number] (e.g., +971501234567)
 */
export function normalizePhoneToE164(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '')

  if (!cleaned.startsWith('971') && cleaned.length <= 9) {
    cleaned = '971' + cleaned
  }

  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned
  }

  return cleaned
}

/**
 * Send WhatsApp message via Meta Cloud API
 */
export async function sendWhatsAppCloudMessage({
  phoneNumberId,
  accessToken,
  to,
  message,
  templateName,
  templateParams,
}: {
  phoneNumberId: string
  accessToken: string
  to: string
  message?: string
  templateName?: string
  templateParams?: Record<string, string>
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const normalizedPhone = normalizePhoneToE164(to)
    const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

    let payload: any

    if (templateName && templateParams) {
      payload = {
        messaging_product: 'whatsapp',
        to: normalizedPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: templateParams
            ? [
                {
                  type: 'body',
                  parameters: Object.entries(templateParams).map(([key, value]) => ({
                    type: 'text',
                    text: value,
                  })),
                },
              ]
            : [],
        },
      }
    } else if (message) {
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizedPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: message,
        },
      }
    } else {
      throw new Error('Either message or templateName must be provided')
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('WhatsApp API error:', data)
      return {
        success: false,
        error: data.error?.message || `API returned ${response.status}`,
      }
    }

    const messageId = data.messages?.[0]?.id || data.id

    return {
      success: true,
      messageId,
    }
  } catch (error: any) {
    console.error('WhatsApp Cloud API send error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Verify webhook signature (for incoming webhooks)
 */
export function verifyWhatsAppWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  const crypto = require('crypto')
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex')

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}

