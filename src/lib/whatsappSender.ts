// WhatsApp sender utility for Autopilot
// Wraps whatsappMeta.ts with error handling

import { getWhatsAppMetaConfig, sendWhatsAppViaMeta } from './whatsappMeta'

export type SendResult = {
  ok: boolean
  externalId?: string
  raw?: any
  error?: string
}

/**
 * Send WhatsApp message via Meta Cloud API
 * Reads config from IntegrationSettings or env vars fallback
 * Never throws - always returns result object
 */
export async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<SendResult> {
  try {
    // Get config from database
    const config = await getWhatsAppMetaConfig()

    if (!config) {
      // Fallback to env vars
      const envToken = process.env.WHATSAPP_ACCESS_TOKEN
      const envNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

      if (!envToken || !envNumberId) {
        return {
          ok: false,
          error: 'WhatsApp integration not configured. Please configure in /admin/integrations',
        }
      }

      const result = await sendWhatsAppViaMeta(phoneNumber, message, {
        numberId: envNumberId,
        accessToken: envToken,
      })

      if (result.success) {
        return {
          ok: true,
          externalId: result.messageId,
          raw: { messageId: result.messageId },
        }
      } else {
        return {
          ok: false,
          error: result.error || 'Failed to send WhatsApp message',
        }
      }
    }

    // Use database config
    const result = await sendWhatsAppViaMeta(phoneNumber, message, config)

    if (result.success) {
      return {
        ok: true,
        externalId: result.messageId,
        raw: { messageId: result.messageId },
      }
    } else {
      return {
        ok: false,
        error: result.error || 'Failed to send WhatsApp message',
      }
    }
  } catch (error: any) {
    console.error('WhatsApp sender error:', error)
    return {
      ok: false,
      error: error.message || 'Unknown error sending WhatsApp message',
    }
  }
}























