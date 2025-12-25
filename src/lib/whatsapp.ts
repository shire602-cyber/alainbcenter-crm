/**
 * WhatsApp Cloud API client wrapper
 * Server-side only - never expose tokens to browser
 */

import { normalizeToE164 } from './phone'
import { prisma } from './prisma'

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

export async function getWhatsAppCredentials() {
  // PRIORITY: Check Integration model first (database), then fallback to env vars
  let accessToken: string | null = null
  let phoneNumberId: string | null = null

  try {
    const integration = await prisma.integration.findUnique({
      where: { name: 'whatsapp' },
    })

    if (integration) {
      // Get from config JSON
      if (integration.config) {
        try {
          const config = typeof integration.config === 'string'
            ? JSON.parse(integration.config)
            : integration.config
          
          accessToken = config.accessToken || integration.accessToken || integration.apiKey || null
          phoneNumberId = config.phoneNumberId || null
        } catch (e) {
          console.warn('Failed to parse integration config:', e)
        }
      } else {
        // Fallback to direct fields
        accessToken = integration.accessToken || integration.apiKey || null
      }
    }
  } catch (e) {
    console.warn('Could not fetch integration from DB:', e)
  }

  // Fallback to environment variables if not found in database
  if (!accessToken) accessToken = process.env.WHATSAPP_ACCESS_TOKEN || null
  if (!phoneNumberId) phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || null

  if (!accessToken || !phoneNumberId) {
    throw new Error(
      'WhatsApp not configured. Please configure it in /admin/integrations or set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID environment variables'
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
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials()

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
    console.log(`📤 [WHATSAPP-SEND] Sending to ${normalizedPhone} via ${phoneNumberId}`)
    console.log(`📤 [WHATSAPP-SEND] Payload:`, JSON.stringify(payload).substring(0, 200))
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    console.log(`📡 [WHATSAPP-SEND] Response status: ${response.status} ${response.statusText}`)
    
    const data = await response.json()
    console.log(`📡 [WHATSAPP-SEND] Response data:`, JSON.stringify(data).substring(0, 500))

    if (!response.ok) {
      const error = data as WhatsAppError
      const errorMessage = error.error?.message || `WhatsApp API error: ${response.status} ${response.statusText}`
      console.error(`❌ [WHATSAPP-SEND] API error:`, errorMessage)
      console.error(`❌ [WHATSAPP-SEND] Full error:`, JSON.stringify(error))
      throw new Error(errorMessage)
    }

    const result = data as WhatsAppResponse
    const messageId = result.messages?.[0]?.id

    if (!messageId) {
      console.error(`❌ [WHATSAPP-SEND] No message ID in response:`, JSON.stringify(result))
      throw new Error('WhatsApp API did not return a message ID')
    }

    console.log(`✅ [WHATSAPP-SEND] Success! Message ID: ${messageId}`)
    return {
      messageId,
      waId: result.contacts?.[0]?.wa_id,
    }
  } catch (error: any) {
    console.error(`❌ [WHATSAPP-SEND] Exception caught:`, error.message)
    console.error(`❌ [WHATSAPP-SEND] Stack:`, error.stack)
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
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials()

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

/**
 * Send a media message (image, document, video, audio) via WhatsApp Cloud API
 * 
 * @param toE164 - Phone number in E.164 format
 * @param mediaType - Type of media: 'image', 'document', 'video', 'audio'
 * @param mediaUrl - Public URL of the media file (must be HTTPS and accessible by Meta)
 * @param caption - Optional caption for image/video
 * @param filename - Optional filename for document
 * @returns WhatsApp message ID
 */
export async function sendMediaMessage(
  toE164: string,
  mediaType: 'image' | 'document' | 'video' | 'audio',
  mediaUrl: string,
  options?: {
    caption?: string
    filename?: string
  }
): Promise<{ messageId: string; waId?: string }> {
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials()

  const normalizedPhone = normalizeToE164(toE164)

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

  // Build payload based on media type
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone,
    type: mediaType,
  }

  if (mediaType === 'image') {
    payload.image = {
      link: mediaUrl,
      ...(options?.caption ? { caption: options.caption } : {}),
    }
  } else if (mediaType === 'video') {
    payload.video = {
      link: mediaUrl,
      ...(options?.caption ? { caption: options.caption } : {}),
    }
  } else if (mediaType === 'document') {
    payload.document = {
      link: mediaUrl,
      ...(options?.filename ? { filename: options.filename } : {}),
    }
  } else if (mediaType === 'audio') {
    payload.audio = {
      link: mediaUrl,
    }
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
    throw new Error(`Failed to send WhatsApp media: ${error.message}`)
  }
}

