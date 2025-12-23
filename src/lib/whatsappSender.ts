// WhatsApp sender utility for Autopilot
// Wraps whatsappMeta.ts with error handling

import { getWhatsAppMetaConfig, sendWhatsAppViaMeta } from './whatsappMeta'
import { sendTemplateMessage } from './whatsapp'

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
 * 
 * @param phoneNumber - Phone number in E.164 format
 * @param message - Message text (for free-form) OR template name (if templateName is provided)
 * @param options - Optional: templateName, templateParams, language
 */
export async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string,
  options?: {
    templateName?: string
    templateParams?: string[]
    language?: string
  }
): Promise<SendResult> {
  try {
    // If template name is provided, use template message (works outside 24-hour window)
    if (options?.templateName) {
      try {
        const result = await sendTemplateMessage(
          phoneNumber,
          options.templateName,
          options.language || 'en_US',
          options.templateParams || []
        )
        
        return {
          ok: true,
          externalId: result.messageId,
          raw: { messageId: result.messageId, waId: result.waId },
        }
      } catch (error: any) {
        console.error('WhatsApp template sender error:', error)
        return {
          ok: false,
          error: error.message || 'Failed to send WhatsApp template message',
        }
      }
    }

    // Otherwise, send free-form text message (only works within 24-hour window)
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
























