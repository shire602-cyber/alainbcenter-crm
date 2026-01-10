/**
 * GET /api/integrations/meta/verify-webhook-subscription
 * Verify webhook subscription status and configuration for Meta integration
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getAllConnections, getDecryptedPageToken } from '@/server/integrations/meta/storage'
import { 
  checkPageWebhookSubscription, 
  subscribeInstagramAccountToWebhook,
  subscribePageToWebhook 
} from '@/server/integrations/meta/subscribe'
import { prisma } from '@/lib/prisma'
import { getWebhookVerifyToken } from '@/server/integrations/meta/config'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const verifyToken = await getWebhookVerifyToken()
    const webhookUrl = `${req.nextUrl.origin}/api/webhooks/meta`
    
    // Get webhook verify token for display
    const verifyTokenDisplay = verifyToken 
      ? `${verifyToken.substring(0, 4)}...${verifyToken.substring(verifyToken.length - 4)}` 
      : 'NOT SET'
    
    const connections = await getAllConnections(null)
    
    if (connections.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No Meta connection found',
        webhookUrl,
        verifyToken: verifyTokenDisplay,
        verificationStatus: {
          configured: false,
          message: 'No connection found - connect a Meta account first',
        },
        subscriptions: [],
      })
    }

    // Check when last webhook was received
    const lastWebhookEvent = await prisma.metaWebhookEvent.findFirst({
      where: {
        eventType: 'instagram',
      },
      orderBy: {
        receivedAt: 'desc',
      },
      select: {
        receivedAt: true,
        eventType: true,
      },
    })

    const now = new Date()
    const hoursSinceLastWebhook = lastWebhookEvent 
      ? Math.floor((now.getTime() - lastWebhookEvent.receivedAt.getTime()) / (1000 * 60 * 60))
      : null

    const subscriptionStatuses = await Promise.all(
      connections.map(async (conn) => {
        let pageSubscription = null
        let instagramSubscriptionAttempt = null
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
              instagramSubscription: instagramSubscriptionAttempt,
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

          // Attempt to subscribe Instagram if not already subscribed
          // Note: We cannot check Instagram subscription via API, so we try to subscribe
          if (conn.igBusinessId) {
            try {
              // Attempt subscription (will fail gracefully if already subscribed or not supported)
              const subscribed = await subscribeInstagramAccountToWebhook(
                conn.igBusinessId,
                pageAccessToken,
                ['messages', 'messaging_postbacks']
              )
              instagramSubscriptionAttempt = {
                attempted: true,
                success: subscribed,
                message: subscribed 
                  ? 'Subscription attempt succeeded' 
                  : 'Subscription attempt failed - may need manual setup in Meta Developer Console',
                note: 'Instagram webhook subscription cannot be verified via API. Subscription is verified by receiving webhook POST events.',
              }
            } catch (error: any) {
              errors.push(`Instagram subscription attempt failed: ${error.message}`)
              instagramSubscriptionAttempt = {
                attempted: true,
                success: false,
                error: error.message,
                message: 'Subscription attempt failed',
                note: 'Instagram webhook subscription cannot be verified via API. Subscription is verified by receiving webhook POST events.',
              }
            }
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
          instagramSubscription: instagramSubscriptionAttempt,
          errors,
        }
      })
    )

    // Overall verification status
    const hasInstagramConnection = connections.some(c => c.igBusinessId)
    const verificationStatus = {
      configured: !!verifyToken && connections.length > 0,
      webhookUrl,
      verifyToken: verifyTokenDisplay,
      hasInstagramConnection,
      hasRecentWebhooks: hoursSinceLastWebhook !== null && hoursSinceLastWebhook < 24,
      hoursSinceLastWebhook,
      message: !verifyToken 
        ? 'Verify token not configured - set it in Integration settings or META_VERIFY_TOKEN env var'
        : !hasInstagramConnection
        ? 'No Instagram Business Account connected - connect an Instagram account'
        : hoursSinceLastWebhook === null
        ? 'No Instagram webhooks received yet - verify webhook subscription in Meta Developer Console'
        : hoursSinceLastWebhook >= 24
        ? `Last Instagram webhook received ${hoursSinceLastWebhook} hours ago - check webhook subscription`
        : 'Webhook configured - check subscription status below',
    }

    return NextResponse.json({
      success: true,
      verificationStatus,
      subscriptions: subscriptionStatuses,
      instructions: {
        webhookUrl,
        verifyToken: verifyToken || 'NOT SET',
        metaDeveloperConsoleUrl: 'https://developers.facebook.com/apps',
        steps: [
          '1. Go to Meta Developer Console → Your App → Instagram → Webhooks',
          '2. Enter Webhook URL: ' + webhookUrl,
          '3. Enter Verify Token: ' + (verifyToken || 'SET_IN_INTEGRATION_SETTINGS'),
          '4. Click "Verify and Save"',
          '5. Subscribe to fields: messages, messaging_postbacks',
          '6. Send a test Instagram DM to verify webhook delivery',
        ],
      },
    })
  } catch (error: any) {
    console.error('Webhook subscription verification error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to verify webhook subscription', 
        details: error.message,
      },
      { status: 500 }
    )
  }
}
