// Instagram Meta Graph API integration
// Handles sending messages via Meta Graph API

import { prisma } from './prisma'

type InstagramConfig = {
  pageId: string
  accessToken: string
  appId?: string
  appSecret?: string
}

/**
 * Get Instagram Meta Graph API configuration from database
 */
export async function getInstagramMetaConfig(): Promise<InstagramConfig | null> {
  const integration = await prisma.integration.findUnique({
    where: { name: 'instagram' },
  })

  if (!integration?.isEnabled || integration.provider !== 'Meta') {
    return null
  }

  // Parse config from JSON string
  let config: any = {}
  try {
    config = integration.config ? JSON.parse(integration.config) : {}
  } catch (e) {
    console.warn('Failed to parse integration config:', e)
  }

  const pageId = config.pageId || config.instagramPageId
  const accessToken = integration.accessToken || integration.apiKey
  const appId = config.businessAccountId || config.appId
  const appSecret = integration.apiSecret || config.appSecret

  if (!pageId || !accessToken) {
    return null
  }

  return {
    pageId,
    accessToken,
    appId: appId || undefined,
    appSecret: appSecret || undefined,
  }
}

/**
 * Send Instagram message via Meta Graph API
 * https://developers.facebook.com/docs/instagram-api/guides/messaging
 */
export async function sendInstagramViaMeta(
  instagramUserId: string,
  message: string,
  config: InstagramConfig
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Graph API endpoint for Instagram messaging
    const url = `https://graph.facebook.com/v20.0/${config.pageId}/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: {
          id: instagramUserId,
        },
        message: {
          text: message,
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Meta Instagram API error:', data)
      return {
        success: false,
        error: data.error?.message || `API returned ${response.status}`,
      }
    }

    return {
      success: true,
      messageId: data.message_id || data.id,
    }
  } catch (error: any) {
    console.error('Failed to send Instagram via Meta:', error)
    return {
      success: false,
      error: error.message || 'Unknown error',
    }
  }
}

/**
 * Test Instagram connection by fetching page info
 * GET https://graph.facebook.com/v20.0/{PAGE_ID}?fields=name,instagram_business_account
 */
export async function testInstagramConnection(
  config: InstagramConfig
): Promise<{
  success: boolean
  pageName?: string
  instagramAccountId?: string
  error?: string
  details?: any
}> {
  try {
    const url = `https://graph.facebook.com/v20.0/${config.pageId}?fields=name,instagram_business_account`

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
      pageName: data.name || null,
      instagramAccountId: data.instagram_business_account?.id || null,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to connect to Graph API',
    }
  }
}
