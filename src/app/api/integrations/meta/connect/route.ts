/**
 * POST /api/integrations/meta/connect
 * Connect Meta using tester token
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { validateToken, getUserPages, getInstagramBusinessAccount } from '@/server/integrations/meta/token'
import { subscribePageToWebhook, subscribeInstagramAccountToWebhook } from '@/server/integrations/meta/subscribe'
import { upsertConnection } from '@/server/integrations/meta/storage'
import { setWebhookVerifyToken } from '@/server/integrations/meta/config'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const { token, webhookVerifyToken, pageId, igBusinessId } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    // Store webhook verify token if provided
    if (webhookVerifyToken && typeof webhookVerifyToken === 'string') {
      try {
        await setWebhookVerifyToken(webhookVerifyToken)
      } catch (error: any) {
        console.error('Failed to store webhook verify token:', error)
        // Continue - token might be set later
      }
    }

    // Validate token
    let metaUser
    try {
      metaUser = await validateToken(token)
    } catch (error: any) {
      console.error('Token validation error:', error)
      // Extract more detailed error message
      const errorMessage = error.message || 'Unknown error'
      const isGraphAPIError = errorMessage.includes('Graph API error')
      
      return NextResponse.json(
        { 
          error: isGraphAPIError ? errorMessage : 'Invalid token',
          details: errorMessage,
          hint: isGraphAPIError 
            ? 'Make sure your tester token has the correct permissions (pages_read_engagement, pages_manage_metadata, instagram_basic, instagram_manage_messages)'
            : 'Please check that your token is valid and not expired'
        },
        { status: 401 }
      )
    }

    // Get pages
    let pages
    try {
      pages = await getUserPages(token)
    } catch (error: any) {
      console.error('Get pages error:', error)
      const errorMessage = error.message || 'Unknown error'
      return NextResponse.json(
        { 
          error: 'Failed to fetch pages', 
          details: errorMessage,
          hint: 'Make sure your token has "pages_read_engagement" permission and you have at least one Facebook Page'
        },
        { status: 500 }
      )
    }

    if (pages.length === 0) {
      return NextResponse.json(
        { error: 'No Facebook pages found. Please create a page first.' },
        { status: 400 }
      )
    }

    // Require pageId to be provided (no default selection)
    if (!pageId || typeof pageId !== 'string') {
      return NextResponse.json(
        { 
          error: 'pageId is required',
          hint: 'Please select a Facebook Page from the dropdown. The page must have an Instagram Business Account connected.'
        },
        { status: 400 }
      )
    }

    // Find selected page
    const selectedPage = pages.find((p) => p.id === pageId)
    if (!selectedPage) {
      return NextResponse.json(
        { 
          error: 'Specified page not found', 
          hint: `Page ID "${pageId}" not found in available pages. Available page IDs: ${pages.map((p) => p.id).join(', ')}`
        },
        { status: 400 }
      )
    }
    const page = selectedPage
    console.log(`✅ Using selected page: ${page.name} (${page.id})`)

    // Get Instagram Business Account - REQUIRED for Instagram DM integration
    let igAccount = null
    try {
      igAccount = await getInstagramBusinessAccount(page.id, page.access_token)
    } catch (error: any) {
      console.error(`Failed to get Instagram account for page ${page.id}:`, error.message)
      // Return error if IG account is required but not found
      return NextResponse.json(
        {
          error: 'Instagram Business Account not found',
          details: error.message,
          hint: 'Selected Facebook Page does not have an Instagram Business Account connected. Please connect an IG account to this page in Meta Business Manager, then try again.'
        },
        { status: 400 }
      )
    }

    // Validate IG account exists
    if (!igAccount || !igAccount.id) {
      return NextResponse.json(
        {
          error: 'Instagram Business Account not connected',
          hint: 'Selected Facebook Page does not have an Instagram Business Account connected. Please connect an IG account to this page in Meta Business Manager, then try again.'
        },
        { status: 400 }
      )
    }

    // Subscribe page to webhook (for Facebook Page messages)
    let pageSubscribed = false
    try {
      pageSubscribed = await subscribePageToWebhook(
        page.id,
        page.access_token,
        ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads', 'leadgen']
      )
    } catch (error: any) {
      console.error(`Failed to subscribe page ${page.id} to webhook:`, error.message)
      // Continue - subscription might already exist
    }

    // Subscribe Instagram Business Account to webhook (REQUIRED for Instagram DMs)
    // Note: Instagram is a separate product and requires its own webhook subscription
    let igSubscribed = false
    try {
      console.log(`Attempting to subscribe Instagram Business Account ${igAccount.id} to webhooks...`)
      igSubscribed = await subscribeInstagramAccountToWebhook(
        igAccount.id,
        page.access_token,
        ['messages', 'messaging_postbacks']
      )
      if (!igSubscribed) {
        console.warn(`⚠️ Instagram Business Account webhook subscription via API failed or is not supported.`)
        console.warn(`⚠️ You may need to configure the webhook manually in Meta Developer Console:`)
        console.warn(`⚠️ Meta Developers → Your App → Instagram → Webhooks`)
        console.warn(`⚠️ Webhook URL: ${process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com'}/api/webhooks/meta`)
      }
    } catch (error: any) {
      console.error(`Failed to subscribe Instagram Business Account ${igAccount.id} to webhook:`, error.message)
      console.warn(`⚠️ Instagram webhook subscription may require manual setup in Meta Developer Console UI`)
      // Don't fail the connection - user can configure manually if needed
    }

    // Connection is considered subscribed if at least Page is subscribed
    // Instagram subscription failure is logged but doesn't block connection
    const subscribed = pageSubscribed

    // Store connection in MetaConnection table (for runtime webhook routing)
    let connection
    try {
      connection = await upsertConnection({
        workspaceId: null, // Single-tenant, use null
        provider: 'meta',
        metaUserId: metaUser.id,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        igBusinessId: igAccount.id,
        igUsername: igAccount.username,
        scopes: ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads', 'leadgen'],
        triggerSubscribed: subscribed,
        status: 'connected',
        lastError: null,
      })
    } catch (error: any) {
      console.error('Failed to store connection:', error)
      return NextResponse.json(
        { error: 'Failed to store connection', details: error.message },
        { status: 500 }
      )
    }

    // Store persisted config in Integration table (for UI display and persistence)
    try {
      const integrationConfig = {
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token, // Required for API calls
        igBusinessId: igAccount.id,
        igUsername: igAccount.username,
        webhookVerifyToken: webhookVerifyToken || null,
        connectedAt: new Date().toISOString(),
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

      console.log('✅ Stored persisted config in Integration table')
    } catch (error: any) {
      console.error('Failed to store Integration config:', error)
      // Don't fail the connection - this is for UI persistence only
      // MetaConnection is the source of truth for runtime
    }

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        pageId: page.id,
        pageName: page.name,
        igUsername: igAccount.username,
        igBusinessId: igAccount.id,
        pageSubscribed,
        igSubscribed,
        subscribed, // Legacy: true if page is subscribed (for backward compatibility)
      },
      warnings: !igSubscribed ? [
        'Instagram Business Account webhook subscription via API failed or is not supported.',
        'You may need to configure the webhook manually in Meta Developer Console:',
        'Meta Developers → Your App → Instagram → Webhooks',
        `Webhook URL: ${process.env.NEXT_PUBLIC_APP_URL || 'https://yourdomain.com'}/api/webhooks/meta`,
      ] : [],
    })
  } catch (error: any) {
    console.error('Meta connect error:', error)
    return NextResponse.json(
      { error: 'Failed to connect', details: error.message },
      { status: 500 }
    )
  }
}

