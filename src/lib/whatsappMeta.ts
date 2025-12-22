// WhatsApp Meta Cloud API integration
// Handles sending messages via Meta Graph API

import { prisma } from './prisma'

type WhatsAppConfig = {
  numberId: string
  accessToken: string
  appId?: string
  appSecret?: string
}

/**
 * Get WhatsApp Meta Cloud API configuration from database
 */
export async function getWhatsAppMetaConfig(): Promise<WhatsAppConfig | null> {
  const integration = await prisma.integration.findUnique({
    where: { name: 'whatsapp' },
  })

  if (!integration?.isEnabled || integration.provider !== 'Meta Cloud API') {
    return null
  }

  // Parse config from JSON string
  let config: any = {}
  try {
    config = integration.config ? JSON.parse(integration.config) : {}
  } catch (e) {
    console.warn('Failed to parse integration config:', e)
  }

  const numberId = config.phoneNumberId || config.numberId
  const accessToken = integration.accessToken || integration.apiKey
  const appId = config.businessAccountId || config.appId
  const appSecret = integration.apiSecret || config.appSecret

  if (!numberId || !accessToken) {
    return null
  }

  return {
    numberId,
    accessToken,
    appId: appId || undefined,
    appSecret: appSecret || undefined,
  }
}

/**
 * Send WhatsApp message via Meta Cloud API (Graph API)
 * https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages
 */
export async function sendWhatsAppViaMeta(
  phoneNumber: string,
  message: string,
  config: WhatsAppConfig
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Format phone number to E.164 format (required by Meta)
    // Remove all non-digits, then ensure it starts with country code
    let cleanPhone = phoneNumber.replace(/[^0-9+]/g, '')
    
    // If starts with +, remove it temporarily
    if (cleanPhone.startsWith('+')) {
      cleanPhone = cleanPhone.substring(1)
    }
    
    // Ensure UAE country code (971)
    let e164Phone: string
    if (cleanPhone.startsWith('971')) {
      e164Phone = `+${cleanPhone}`
    } else if (cleanPhone.startsWith('0')) {
      // UAE local format (0501234567) -> +971501234567
      e164Phone = `+971${cleanPhone.substring(1)}`
    } else if (cleanPhone.length >= 9) {
      // Assume UAE number without country code
      e164Phone = `+971${cleanPhone}`
    } else {
      // Fallback: try to use as-is
      e164Phone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`
    }

    // Graph API endpoint
    const url = `https://graph.facebook.com/v20.0/${config.numberId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: e164Phone,
        type: 'text',
        text: {
          body: message,
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Meta WhatsApp API error:', data)
      return {
        success: false,
        error: data.error?.message || `API returned ${response.status}`,
      }
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    }
  } catch (error: any) {
    console.error('Failed to send WhatsApp via Meta:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Test WhatsApp connection by fetching phone number info
 * GET https://graph.facebook.com/v20.0/{PHONE_NUMBER_ID}?fields=display_phone_number,verified_name
 */
export async function testWhatsAppConnection(
  config: WhatsAppConfig
): Promise<{
  success: boolean
  verified_name?: string
  display_phone_number?: string
  error?: string
  details?: any
}> {
  try {
    const url = `https://graph.facebook.com/v20.0/${config.numberId}?fields=display_phone_number,verified_name`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
      },
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || `API returned ${response.status}`,
        details: data.error,
      }
    }

    return {
      success: true,
      verified_name: data.verified_name?.name || null,
      display_phone_number: data.display_phone_number || null,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to connect to Graph API',
    }
  }
}

/**
 * Test webhook reachability
 * Attempts to verify webhook URL is accessible
 */
export async function testWebhookReachability(
  webhookUrl: string,
  verifyToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const testUrl = new URL(webhookUrl)
    testUrl.searchParams.set('hub.mode', 'subscribe')
    testUrl.searchParams.set('hub.verify_token', verifyToken)
    testUrl.searchParams.set('hub.challenge', 'test123')

    const response = await fetch(testUrl.toString(), {
      method: 'GET',
    })

    const text = await response.text()

    if (response.ok && text === 'test123') {
      return { success: true }
    }

    return {
      success: false,
      error: `Webhook returned ${response.status}: ${text.substring(0, 100)}`,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to reach webhook URL',
    }
  }
}























