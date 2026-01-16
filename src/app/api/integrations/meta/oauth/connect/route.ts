/**
 * POST /api/integrations/meta/oauth/connect
 * Connect Meta using OAuth flow (long-lived user token)
 * Accepts pageId and stores connection with OAuth tokens
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getOAuthState, clearOAuthState } from '@/server/integrations/meta/oauthState'
import { getPageAccessTokenFromUserToken, getInstagramBusinessAccount } from '@/server/integrations/meta/token'
import { upsertConnection } from '@/server/integrations/meta/storage'
import { subscribePageToWebhook, subscribeInstagramAccountToWebhook } from '@/server/integrations/meta/subscribe'
import { setWebhookVerifyToken } from '@/server/integrations/meta/config'
import { getWebhookUrl } from '@/lib/publicUrl'
import { prisma } from '@/lib/prisma'
import { encryptToken } from '@/lib/integrations/meta/encryption'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const { pageId, webhookVerifyToken } = body

    if (!pageId || typeof pageId !== 'string') {
      return NextResponse.json(
        { error: 'pageId is required' },
        { status: 400 }
      )
    }

    console.log('[META-CONNECT] OAuth connect request for pageId:', pageId)

    // Get OAuth state from cookie
    const oauthState = await getOAuthState()

    if (!oauthState) {
      return NextResponse.json(
        { error: 'OAuth state not found or expired. Please start the connection process again.' },
        { status: 401 }
      )
    }

    const { longLivedUserToken, workspaceId, metaUserId } = oauthState

    // Auto-generate verify token if not provided
    let finalVerifyToken = webhookVerifyToken
    if (!finalVerifyToken || typeof finalVerifyToken !== 'string' || finalVerifyToken.trim() === '') {
      const randomBytes = crypto.randomBytes(16).toString('hex')
      finalVerifyToken = `meta-verify-${randomBytes}`
      console.log('[META-CONNECT] Auto-generated webhook verify token')
    }

    // Store verify token
    try {
      await setWebhookVerifyToken(finalVerifyToken)
      console.log('[META-CONNECT] Stored webhook verify token')
    } catch (error: any) {
      console.error('[META-CONNECT] Failed to store webhook verify token:', error)
      // Continue - connection can still succeed
    }

    // Get page access token from long-lived user token
    let pageAccessToken: string
    try {
      pageAccessToken = await getPageAccessTokenFromUserToken(pageId, longLivedUserToken)
      console.log('[META-CONNECT] Obtained page access token')
    } catch (error: any) {
      console.error('[META-CONNECT] Failed to get page access token:', error)
      return NextResponse.json(
        { 
          error: 'Failed to get page access token', 
          details: error.message,
          hint: 'Make sure you have permission to access this page'
        },
        { status: 500 }
      )
    }

    // Get page info
    const { getUserPages } = await import('@/server/integrations/meta/token')
    const pages = await getUserPages(longLivedUserToken)
    const page = pages.find(p => p.id === pageId)

    if (!page) {
      return NextResponse.json(
        { error: 'Page not found' },
        { status: 404 }
      )
    }

    // Get Instagram Business Account - REQUIRED for Instagram DM integration
    let igAccount = null
    try {
      igAccount = await getInstagramBusinessAccount(pageId, pageAccessToken)
    } catch (error: any) {
      console.error(`[META-CONNECT] Failed to get Instagram account for page ${pageId}:`, error.message)
      return NextResponse.json(
        {
          error: 'Instagram Business Account not found',
          details: error.message,
          hint: 'Selected Facebook Page does not have an Instagram Business Account connected. Please connect an IG account to this page in Meta Business Manager, then try again.'
        },
        { status: 400 }
      )
    }

    if (!igAccount || !igAccount.id) {
      return NextResponse.json(
        {
          error: 'Instagram Business Account not connected',
          hint: 'Selected Facebook Page does not have an Instagram Business Account connected. Please connect an IG account to this page in Meta Business Manager, then try again.'
        },
        { status: 400 }
      )
    }

    console.log(`[META-CONNECT] Found IG account: @${igAccount.username} (${igAccount.id})`)

    // Subscribe page to webhook (for Facebook Page messages)
    let pageSubscribed = false
    try {
      pageSubscribed = await subscribePageToWebhook(
        pageId,
        pageAccessToken,
        ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads', 'leadgen']
      )
      if (pageSubscribed) {
        console.log(`[META-CONNECT] Page ${pageId} subscribed to webhooks`)
      }
    } catch (error: any) {
      console.error(`[META-CONNECT] Failed to subscribe page ${pageId} to webhook:`, error.message)
      // Continue - subscription might already exist
    }

    // Subscribe Instagram Business Account to webhook (REQUIRED for Instagram DMs)
    let igSubscribed = false
    let igSubscriptionError: string | null = null
    try {
      console.log(`[META-CONNECT] Attempting to subscribe Instagram Business Account ${igAccount.id} to webhooks...`)
      const webhookUrl = getWebhookUrl('/api/webhooks/meta', req)
      
      igSubscribed = await subscribeInstagramAccountToWebhook(
        igAccount.id,
        pageAccessToken,
        ['messages', 'messaging_postbacks']
      )
      
      if (igSubscribed) {
        console.log(`[META-CONNECT] Instagram Business Account ${igAccount.id} webhook subscription succeeded`)
      } else {
        igSubscriptionError = 'API subscription failed - may not be supported for this account'
        console.warn(`[META-CONNECT] Instagram Business Account webhook subscription via API failed or is not supported.`)
      }
    } catch (error: any) {
      igSubscriptionError = error.message || 'Unknown error'
      console.error(`[META-CONNECT] Failed to subscribe Instagram Business Account ${igAccount.id} to webhook:`, {
        error: error.message,
        igBusinessId: igAccount.id,
        igUsername: igAccount.username,
      })
      // Don't fail the connection - user can configure manually if needed
    }

    const subscribed = pageSubscribed
    const connectionScopes = [
      'messages',
      'messaging_postbacks',
      'message_deliveries',
      'message_reads',
      'leadgen',
      'leads_retrieval',
    ]

    // Calculate token expiration
    const tokenExpiresAt = oauthState.expiresAt ? new Date(oauthState.expiresAt) : null
    const connectedAt = new Date()

    // Store connection in MetaConnection table with OAuth tokens
    let connection
    try {
      // Encrypt tokens
      const encryptedPageToken = encryptToken(pageAccessToken)
      const encryptedUserToken = encryptToken(longLivedUserToken)

      connection = await prisma.metaConnection.upsert({
        where: {
          workspaceId_pageId: {
            workspaceId: workspaceId ?? 1,
            pageId: pageId,
          },
        },
        update: {
          metaUserId: metaUserId || null,
          pageName: page.name || null,
          pageAccessToken: encryptedPageToken,
          metaUserAccessTokenLong: encryptedUserToken,
          metaUserTokenExpiresAt: tokenExpiresAt,
          metaConnectedAt: connectedAt,
          igBusinessId: igAccount.id,
          igUsername: igAccount.username,
          scopes: JSON.stringify(connectionScopes),
          triggerSubscribed: subscribed,
          status: 'connected',
          lastError: null,
          updatedAt: new Date(),
        },
        create: {
          workspaceId: workspaceId ?? 1,
          provider: 'meta',
          metaUserId: metaUserId || null,
          pageId: pageId,
          pageName: page.name || null,
          pageAccessToken: encryptedPageToken,
          metaUserAccessTokenLong: encryptedUserToken,
          metaUserTokenExpiresAt: tokenExpiresAt,
          metaConnectedAt: connectedAt,
          igBusinessId: igAccount.id,
          igUsername: igAccount.username,
          scopes: JSON.stringify(connectionScopes),
          triggerSubscribed: subscribed,
          status: 'connected',
        },
      })

      console.log('[META-CONNECT] Connection stored successfully:', {
        connectionId: connection.id,
        pageId: pageId,
        igUsername: igAccount.username,
      })
    } catch (error: any) {
      console.error('[META-CONNECT] Failed to store connection:', error)
      return NextResponse.json(
        { error: 'Failed to store connection', details: error.message },
        { status: 500 }
      )
    }

    if (pageSubscribed) {
      try {
        await prisma.metaLeadgenState.upsert({
          where: { workspaceId: workspaceId ?? 1 },
          update: { webhookSubscribedAt: new Date() },
          create: { workspaceId: workspaceId ?? 1, webhookSubscribedAt: new Date() },
        })
      } catch (error: any) {
        console.warn('[META-CONNECT] Failed to persist webhook subscription timestamp:', error.message)
      }
    }

    // Store persisted config in Integration table (for UI display)
    try {
      const integrationConfig = {
        pageId: page.id,
        pageName: page.name,
        igBusinessId: igAccount.id,
        igUsername: igAccount.username,
        webhookVerifyToken: finalVerifyToken,
        connectedAt: connectedAt.toISOString(),
        oauthFlow: true, // Mark as OAuth connection
      }

      await prisma.integration.upsert({
        where: { name: 'instagram-messaging' },
        update: {
          config: JSON.stringify(integrationConfig),
          isEnabled: true,
          provider: 'Meta Messaging API',
        },
        create: {
          name: 'instagram-messaging',
          provider: 'Meta Messaging API',
          isEnabled: true,
          config: JSON.stringify(integrationConfig),
        },
      })

      console.log('[META-CONNECT] Stored persisted config in Integration table')
    } catch (error: any) {
      console.error('[META-CONNECT] Failed to store Integration config:', error)
      // Don't fail the connection - this is for UI persistence only
    }

    // Clear OAuth state (connection complete)
    await clearOAuthState()
    console.log('[META-CONNECT] OAuth state cleared')

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        pageId: page.id,
        pageName: page.name,
        igBusinessId: igAccount.id,
        igUsername: igAccount.username,
        webhookVerifyToken: finalVerifyToken,
        webhookUrl: getWebhookUrl('/api/webhooks/meta', req),
        pageSubscribed: pageSubscribed,
        instagramSubscribed: igSubscribed,
        instagramSubscriptionError: igSubscriptionError || null,
        instagramSubscriptionNote: igSubscribed 
          ? 'Instagram webhook subscription succeeded via API'
          : igSubscriptionError
          ? `Instagram webhook subscription failed: ${igSubscriptionError}. Manual setup required in Meta Developer Console.`
          : 'Instagram webhook subscription status unknown - verify in Meta Developer Console',
        subscribed,
      },
      webhookVerifyToken: finalVerifyToken,
      warnings: !igSubscribed ? [
        'Instagram Business Account webhook subscription via API failed or is not supported.',
        'You may need to configure the webhook manually in Meta Developer Console:',
        'Meta Developers → Your App → Instagram → Webhooks',
        `Webhook URL: ${getWebhookUrl('/api/webhooks/meta', req)}`,
        `Verify Token: ${finalVerifyToken}`,
      ] : [],
    })
  } catch (error: any) {
    console.error('[META-CONNECT] OAuth connect error:', error)
    return NextResponse.json(
      { error: 'Failed to connect', details: error.message },
      { status: 500 }
    )
  }
}
