/**
 * GET /api/integrations/meta/status
 * Get current Meta connection status
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getAllConnections, getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'
import { getWebhookUrl } from '@/lib/publicUrl'
import { checkPageWebhookSubscription } from '@/server/integrations/meta/subscribe'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    // Get active connections from MetaConnection table (runtime status)
    const connections = await getAllConnections(null) // Single-tenant, use null
    
    // Get persisted config from Integration table (UI persistence)
    let persistedConfig = null
    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'instagram-messaging' },
        select: { config: true, isEnabled: true },
      })

      if (integration?.config) {
        try {
          const config = JSON.parse(integration.config)
          persistedConfig = {
            pageId: config.pageId || null,
            pageName: config.pageName || null,
            igBusinessId: config.igBusinessId || null,
            igUsername: config.igUsername || null,
            connectedAt: config.connectedAt || null,
            webhookVerifyToken: config.webhookVerifyToken || null,
            oauthFlow: config.oauthFlow || false, // Indicates if connection was via OAuth
          }
        } catch (e) {
          console.warn('Failed to parse Integration config:', e)
        }
      }
    } catch (error: any) {
      console.warn('Failed to read Integration config:', error.message)
    }

    const webhookVerifyToken = await getWebhookVerifyToken()
    const webhookUrl = getWebhookUrl('/api/webhooks/meta', req)

    // Check webhook subscription status for each connection
    const connectionsWithSubscriptionStatus = await Promise.all(
      connections.map(async (conn) => {
        let pageSubscriptionStatus = null
        let igSubscriptionStatus = null

        try {
          const pageAccessToken = await getDecryptedPageToken(conn.id)
          if (pageAccessToken) {
            // Check Page webhook subscription (Facebook Page only)
            if (conn.pageId) {
              pageSubscriptionStatus = await checkPageWebhookSubscription(
                conn.pageId,
                pageAccessToken
              )
            }

            // Instagram Business Account subscription status cannot be checked via Graph API
            // Instagram Business Accounts (IGUser) do NOT support subscribed_apps field
            // Subscription status must be verified by actual webhook delivery (POST events received)
            // Set status to null to indicate "unknown" - subscription is confirmed when webhooks arrive
            if (conn.igBusinessId) {
              igSubscriptionStatus = null // API check not supported - use webhook delivery as truth
            }
          }
        } catch (error: any) {
          console.error(`Failed to check subscription status for connection ${conn.id}:`, error.message)
          // Continue - subscription check failures shouldn't block status endpoint
        }

        return {
          id: conn.id,
          pageId: conn.pageId,
          pageName: conn.pageName,
          igUsername: conn.igUsername,
          igBusinessId: conn.igBusinessId,
          triggerSubscribed: conn.triggerSubscribed, // Legacy field (Page subscription)
          pageSubscriptionStatus, // Detailed Page subscription status
          igSubscriptionStatus, // Detailed Instagram subscription status
          status: conn.status,
          lastError: conn.lastError,
          // OAuth connection details
          metaUserTokenExpiresAt: (conn as any).metaUserTokenExpiresAt?.toISOString() || null,
          metaConnectedAt: (conn as any).metaConnectedAt?.toISOString() || null,
          hasOAuthToken: !!(conn as any).metaUserAccessTokenLong, // Indicates OAuth flow was used
          createdAt: conn.createdAt.toISOString(),
          updatedAt: conn.updatedAt.toISOString(),
        }
      })
    )

    return NextResponse.json({
      success: true,
      webhookUrl,
      webhookVerifyToken: webhookVerifyToken || null, // Include actual token for UI display
      webhookVerifyTokenConfigured: !!webhookVerifyToken,
      persistedConfig, // Config from Integration table (which page/IG was selected)
      activeConnections: connectionsWithSubscriptionStatus,
      // Legacy: keep 'connections' for backward compatibility
      connections: connectionsWithSubscriptionStatus.map((conn) => ({
        id: conn.id,
        pageId: conn.pageId,
        pageName: conn.pageName,
        igUsername: conn.igUsername,
        igBusinessId: conn.igBusinessId,
        triggerSubscribed: conn.triggerSubscribed,
        status: conn.status,
        lastError: conn.lastError,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      })),
    })
  } catch (error: any) {
    console.error('Meta status error:', error)
    return NextResponse.json(
      { error: 'Failed to get status', details: error.message },
      { status: 500 }
    )
  }
}

