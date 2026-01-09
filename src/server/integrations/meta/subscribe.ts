/**
 * Webhook subscription management
 * Isolated module for subscribing pages to webhook fields
 */

import { graphAPIPost } from './graph'

const WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_deliveries',
  'message_reads',
  'leadgen',
]

/**
 * Subscribe a page to webhook fields
 * 
 * Note: This subscribes to webhook fields for the Page object.
 * For Instagram messaging, webhook must also be configured in Meta Developer Console
 * for the Instagram product separately (object: 'instagram').
 */
export async function subscribePageToWebhook(
  pageId: string,
  pageAccessToken: string,
  fields: string[] = WEBHOOK_FIELDS
): Promise<boolean> {
  try {
    const result = await graphAPIPost<{ success: boolean }>(
      `/${pageId}/subscribed_apps`,
      pageAccessToken,
      {
        subscribed_fields: fields.join(','),
      }
    )
    console.log(`✅ Successfully subscribed page ${pageId} to webhook fields: ${fields.join(', ')}`)
    return true
  } catch (error: any) {
    console.error(`❌ Failed to subscribe page ${pageId} to webhook:`, error.message)
    // Don't throw - subscription might already exist or fail for other reasons
    // Meta may require webhook configuration in Developer Console UI for Instagram product
    return false
  }
}

/**
 * Unsubscribe a page from webhook
 */
export async function unsubscribePageFromWebhook(
  pageId: string,
  pageAccessToken: string
): Promise<boolean> {
  try {
    await graphAPIPost<{ success: boolean }>(
      `/${pageId}/subscribed_apps`,
      pageAccessToken
    )
    return true
  } catch (error: any) {
    console.error(`Failed to unsubscribe page ${pageId} from webhook:`, error.message)
    return false
  }
}

