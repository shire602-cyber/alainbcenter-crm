/**
 * Webhook subscription management
 * Isolated module for subscribing pages and Instagram Business Accounts to webhook fields
 */

import { graphAPIPost, graphAPIGet } from './graph'

const WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
  'message_deliveries',
  'message_reads',
  'leadgen',
]

const INSTAGRAM_WEBHOOK_FIELDS = [
  'messages',
  'messaging_postbacks',
]

/**
 * Subscribe a page to webhook fields
 * 
 * Note: This subscribes to webhook fields for the Page object ONLY.
 * Instagram messaging requires separate subscription via subscribeInstagramAccountToWebhook().
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
    return false
  }
}

/**
 * Subscribe an Instagram Business Account to webhook fields
 * 
 * This subscribes the Instagram Business Account (not the Page) to receive Instagram messaging webhooks.
 * Instagram is a separate product from Facebook Pages and requires its own webhook subscription.
 * 
 * Note: Some Instagram accounts may not support API-based subscription and must be configured
 * manually in Meta Developer Console UI. If this API call fails, check Meta Developer Console
 * and configure the webhook manually for the Instagram product.
 * 
 * @param igBusinessAccountId - The Instagram Business Account ID (IG user ID)
 * @param pageAccessToken - Page access token (works because Page and IG are linked)
 * @param fields - Webhook fields to subscribe to (default: messages, messaging_postbacks)
 * @returns true if subscription succeeded, false otherwise
 */
export async function subscribeInstagramAccountToWebhook(
  igBusinessAccountId: string,
  pageAccessToken: string,
  fields: string[] = INSTAGRAM_WEBHOOK_FIELDS
): Promise<boolean> {
  try {
    const result = await graphAPIPost<{ success: boolean }>(
      `/${igBusinessAccountId}/subscribed_apps`,
      pageAccessToken,
      {
        subscribed_fields: fields.join(','),
      }
    )
    console.log(`✅ Successfully subscribed Instagram Business Account ${igBusinessAccountId} to webhook fields: ${fields.join(', ')}`)
    return true
  } catch (error: any) {
    console.error(`❌ Failed to subscribe Instagram Business Account ${igBusinessAccountId} to webhook:`, error.message)
    console.error(`   Error details:`, error)
    console.warn(`   ⚠️  Instagram webhook subscription via API may not be supported for this account.`)
    console.warn(`   ⚠️  You may need to configure the webhook manually in Meta Developer Console:`)
    console.warn(`   ⚠️  Meta Developers → Your App → Instagram → Webhooks`)
    // Don't throw - subscription might need to be done via UI
    return false
  }
}

/**
 * Check if a page is subscribed to webhooks
 * 
 * @param pageId - The Facebook Page ID
 * @param pageAccessToken - Page access token
 * @returns Object with subscription status and subscribed fields, or null if check fails
 */
export async function checkPageWebhookSubscription(
  pageId: string,
  pageAccessToken: string
): Promise<{ subscribed: boolean; fields: string[] } | null> {
  try {
    const result = await graphAPIGet<{
      data: Array<{ subscribed_fields: string[] }>
    }>(`/${pageId}/subscribed_apps`, pageAccessToken)
    
    if (result.data && result.data.length > 0) {
      // Get all subscribed fields from all app subscriptions
      const allFields = new Set<string>()
      result.data.forEach((sub) => {
        if (sub.subscribed_fields) {
          sub.subscribed_fields.forEach((field) => allFields.add(field))
        }
      })
      return {
        subscribed: allFields.size > 0,
        fields: Array.from(allFields),
      }
    }
    return { subscribed: false, fields: [] }
  } catch (error: any) {
    console.error(`❌ Failed to check page ${pageId} webhook subscription:`, error.message)
    return null
  }
}

/**
 * Check if an Instagram Business Account is subscribed to webhooks
 * 
 * Note: Instagram Business Accounts (IGUser) do NOT support the `subscribed_apps` field via Graph API.
 * The subscription status can only be verified manually in Meta Developer Console or by checking if
 * webhook events are actually being received. This function attempts the check but will fail gracefully.
 * 
 * @param igBusinessAccountId - The Instagram Business Account ID
 * @param pageAccessToken - Page access token (works because Page and IG are linked)
 * @returns Object with subscription status and subscribed fields, or null if check fails
 */
export async function checkInstagramWebhookSubscription(
  igBusinessAccountId: string,
  pageAccessToken: string
): Promise<{ subscribed: boolean; fields: string[] } | null> {
  try {
    // Attempt to check subscription - this will likely fail as IGUser doesn't support subscribed_apps
    const result = await graphAPIGet<{
      data: Array<{ subscribed_fields: string[] }>
    }>(`/${igBusinessAccountId}/subscribed_apps`, pageAccessToken)
    
    if (result.data && result.data.length > 0) {
      // Get all subscribed fields from all app subscriptions
      const allFields = new Set<string>()
      result.data.forEach((sub) => {
        if (sub.subscribed_fields) {
          sub.subscribed_fields.forEach((field) => allFields.add(field))
        }
      })
      return {
        subscribed: allFields.size > 0,
        fields: Array.from(allFields),
      }
    }
    return { subscribed: false, fields: [] }
  } catch (error: any) {
    // Expected error: IGUser node type doesn't support subscribed_apps field
    if (error.message?.includes('nonexisting field') || error.message?.includes('IGUser')) {
      console.warn(`⚠️ Instagram Business Account ${igBusinessAccountId} subscription status cannot be checked via API`)
      console.warn(`⚠️ Instagram Business Accounts do not support subscribed_apps field`)
      console.warn(`⚠️ Subscription must be verified manually in Meta Developer Console or by receiving webhook events`)
      // Return null to indicate status is unknown (requires manual verification)
      return null
    }
    console.error(`❌ Failed to check Instagram Business Account ${igBusinessAccountId} webhook subscription:`, error.message)
    return null
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

