/**
 * WhatsApp Client - Unified WhatsApp sending via Meta Cloud API
 * 
 * Reads configuration from Integration settings and sends messages
 */

import { prisma } from './prisma'
import { getWhatsAppMetaConfig } from './whatsappMeta'
import { sendWhatsAppViaMeta } from './whatsappMeta'

export interface WhatsAppSendResult {
  success: boolean
  messageId?: string
  error?: string
  rawResponse?: any
}

/**
 * Send WhatsApp message using configured integration
 */
export async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string
): Promise<WhatsAppSendResult> {
  try {
    // Get WhatsApp configuration
    const config = await getWhatsAppMetaConfig()

    if (!config) {
      // Fallback to environment variables
      const envToken = process.env.WHATSAPP_ACCESS_TOKEN
      const envNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

      if (!envToken || !envNumberId) {
        return {
          success: false,
          error: 'WhatsApp integration not configured. Please configure in /admin/integrations',
        }
      }

      const result = await sendWhatsAppViaMeta(phoneNumber, message, {
        numberId: envNumberId,
        accessToken: envToken,
      })

      return {
        success: result.success,
        messageId: result.messageId,
        error: result.error,
      }
    }

    // Use database config
    const result = await sendWhatsAppViaMeta(phoneNumber, message, config)

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    }
  } catch (error: any) {
    console.error('WhatsApp client error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error sending WhatsApp message',
    }
  }
}

















