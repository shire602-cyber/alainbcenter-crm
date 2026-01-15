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
 * 
 * Priority:
 * 1. MetaConnection (OAuth flow) - preferred, uses encrypted page access token
 * 2. Legacy Integration table - fallback for older setups
 */
export async function getInstagramMetaConfig(): Promise<InstagramConfig | null> {
  // PRIORITY 1: Try MetaConnection (OAuth flow) first
  // This is the preferred method using the connected Facebook Page + IG Business Account
  try {
    const { getDecryptedPageToken } = await import('@/server/integrations/meta/storage')
    
    // Find an active MetaConnection with Instagram Business Account
    const connection = await prisma.metaConnection.findFirst({
      where: {
        status: 'connected',
      },
      select: {
        id: true,
        pageId: true,
        igBusinessId: true,
        igUsername: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
    
    // Validate that pageId and igBusinessId are set (required for IG messaging)
    if (connection && connection.pageId && connection.igBusinessId) {
      // Get decrypted page access token
      const accessToken = await getDecryptedPageToken(connection.id)
      
      if (accessToken) {
        console.log(`✅ [INSTAGRAM-META] Using MetaConnection OAuth config`, {
          connectionId: connection.id,
          pageId: connection.pageId,
          igBusinessId: connection.igBusinessId || 'N/A',
          igUsername: connection.igUsername || 'N/A',
        })
        
        return {
          pageId: connection.pageId,
          accessToken,
          appId: connection.igBusinessId || undefined,
        }
      } else {
        console.warn(`⚠️ [INSTAGRAM-META] MetaConnection found but failed to decrypt page token`, {
          connectionId: connection.id,
        })
      }
    }
  } catch (error: any) {
    console.warn(`⚠️ [INSTAGRAM-META] Failed to load MetaConnection config, trying legacy Integration:`, error.message)
  }
  
  // PRIORITY 2: Fallback to legacy Integration table
  const integration = await prisma.integration.findUnique({
    where: { name: 'instagram' },
  })

  if (!integration?.isEnabled || integration.provider !== 'Meta') {
    console.warn(`⚠️ [INSTAGRAM-META] No valid config found - neither MetaConnection nor Integration`)
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
    console.warn(`⚠️ [INSTAGRAM-META] Legacy Integration found but missing pageId or accessToken`)
    return null
  }

  console.log(`ℹ️ [INSTAGRAM-META] Using legacy Integration config (pageId: ${pageId})`)

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
