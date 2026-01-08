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
 */
export async function subscribePageToWebhook(
  pageId: string,
  pageAccessToken: string,
  fields: string[] = WEBHOOK_FIELDS
): Promise<boolean> {
  try {
    await graphAPIPost<{ success: boolean }>(
      `/${pageId}/subscribed_apps`,
      pageAccessToken,
      {
        subscribed_fields: fields.join(','),
      }
    )
    return true
  } catch (error: any) {
    console.error(`Failed to subscribe page ${pageId} to webhook:`, error.message)
    // Don't throw - subscription might already exist or fail for other reasons
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

