/**
 * GET /api/integrations/meta/subscription-status
 * Verify webhook subscription status for Page and Instagram Business Account
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getAllConnections, getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { checkPageWebhookSubscription } from '@/server/integrations/meta/subscribe'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const connections = await getAllConnections(null)
    
    if (connections.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No Meta connection found',
        subscriptions: [],
      })
    }

    const subscriptionStatuses = await Promise.all(
      connections.map(async (conn) => {
        let pageSubscription = null
        let instagramSubscription = null
        let errors: string[] = []

        try {
          const pageAccessToken = await getDecryptedPageToken(conn.id)
          
          if (!pageAccessToken) {
            errors.push('Failed to decrypt page access token')
            return {
              connectionId: conn.id,
              pageId: conn.pageId,
              pageName: conn.pageName,
              igBusinessId: conn.igBusinessId,
              igUsername: conn.igUsername,
              pageSubscription,
              instagramSubscription,
              errors,
            }
          }

          // Check Page subscription
          if (conn.pageId) {
            try {
              pageSubscription = await checkPageWebhookSubscription(
                conn.pageId,
                pageAccessToken
              )
            } catch (error: any) {
              errors.push(`Page subscription check failed: ${error.message}`)
            }
          }

          // Instagram Business Account subscription cannot be checked via Graph API
          // IGUser node type does not support subscribed_apps field
          // Subscription is verified by actual webhook delivery (POST events received)
          if (conn.igBusinessId) {
            instagramSubscription = null // API check not supported - webhook delivery is the proof
          }
        } catch (error: any) {
          errors.push(`Subscription check error: ${error.message}`)
        }

        return {
          connectionId: conn.id,
          pageId: conn.pageId,
          pageName: conn.pageName,
          igBusinessId: conn.igBusinessId,
          igUsername: conn.igUsername,
          pageSubscription,
          instagramSubscription,
          errors,
        }
      })
    )

    return NextResponse.json({
      success: true,
      subscriptions: subscriptionStatuses,
    })
  } catch (error: any) {
    console.error('Subscription status check error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to check subscription status', 
        details: error.message,
      },
      { status: 500 }
    )
  }
}

