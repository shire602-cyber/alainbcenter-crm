/**
 * GET /api/integrations/meta/callback
 * Handles Meta OAuth callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'
import {
  exchangeCodeForToken,
  getUserPages,
  getPageAccessToken,
  getInstagramBusinessAccount,
  subscribePageToWebhook,
} from '@/lib/integrations/meta/api'
import { encryptToken } from '@/lib/integrations/meta/encryption'

const META_APP_ID = process.env.META_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET
const META_OAUTH_REDIRECT_URI = process.env.META_OAUTH_REDIRECT_URI
const META_WEBHOOK_URL = process.env.META_WEBHOOK_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.com'}/api/webhooks/meta`
const META_VERIFY_TOKEN = process.env.META_VERIFY_TOKEN

export async function GET(req: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin()

    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorReason = searchParams.get('error_reason')

    if (error) {
      console.error('Meta OAuth error:', error, errorReason)
      return NextResponse.redirect(
        `/admin/integrations?error=oauth_failed&reason=${encodeURIComponent(errorReason || error)}`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        '/admin/integrations?error=missing_params'
      )
    }

    if (!META_APP_ID || !META_APP_SECRET || !META_OAUTH_REDIRECT_URI) {
      return NextResponse.redirect(
        '/admin/integrations?error=not_configured'
      )
    }

    // Decode state
    let stateData: { workspace_id: string; return_url: string; timestamp: number }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString())
    } catch {
      return NextResponse.redirect('/admin/integrations?error=invalid_state')
    }

    // Exchange code for access token
    const tokenData = await exchangeCodeForToken(
      code,
      META_OAUTH_REDIRECT_URI,
      META_APP_ID,
      META_APP_SECRET
    )

    const userAccessToken = tokenData.access_token
    const workspaceId = parseInt(stateData.workspace_id) || 1

    // Get pages managed by the user
    const pages = await getUserPages(userAccessToken)

    if (pages.length === 0) {
      return NextResponse.redirect(
        '/admin/integrations?error=no_pages&message=' + encodeURIComponent('No Facebook pages found. Please create a page first.')
      )
    }

    // Process each page
    const connections = []
    for (const page of pages) {
      try {
        // Get page access token
        const pageAccessToken = await getPageAccessToken(page.id, userAccessToken)

        // Get Instagram Business Account if connected
        const igAccount = await getInstagramBusinessAccount(page.id, pageAccessToken)

        // Subscribe page to webhook
        if (META_VERIFY_TOKEN) {
          await subscribePageToWebhook(
            page.id,
            pageAccessToken,
            META_WEBHOOK_URL,
            META_VERIFY_TOKEN,
            ['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads', 'leadgen']
          )
        }

        // Encrypt and store connection
        const encryptedToken = encryptToken(pageAccessToken)

        // Upsert connection using Prisma models
        await prisma.metaConnection.upsert({
          where: {
            workspaceId_pageId: {
              workspaceId,
              pageId: page.id,
            },
          },
          update: {
            pageName: page.name || null,
            pageAccessToken: encryptedToken,
            igBusinessId: igAccount?.id || null,
            igUsername: igAccount?.username || null,
            scopes: JSON.stringify(['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads', 'leadgen']),
            status: 'active',
            updatedAt: new Date(),
          },
          create: {
            workspaceId,
            pageId: page.id,
            pageName: page.name || null,
            pageAccessToken: encryptedToken,
            igBusinessId: igAccount?.id || null,
            igUsername: igAccount?.username || null,
            scopes: JSON.stringify(['messages', 'messaging_postbacks', 'messaging_optins', 'message_deliveries', 'message_reads', 'leadgen']),
            status: 'active',
          },
        })

        connections.push({
          pageId: page.id,
          pageName: page.name,
          igUsername: igAccount?.username,
        })
      } catch (pageError: any) {
        console.error(`Error processing page ${page.id}:`, pageError)
        // Continue with other pages
      }
    }

    if (connections.length === 0) {
      return NextResponse.redirect(
        '/admin/integrations?error=connection_failed'
      )
    }

    // Redirect back to integrations page
    const returnUrl = stateData.return_url || '/admin/integrations'
    return NextResponse.redirect(
      `${returnUrl}?success=meta_connected&pages=${connections.length}`
    )
  } catch (error: any) {
    console.error('Meta OAuth callback error:', error)
    return NextResponse.redirect(
      `/admin/integrations?error=callback_failed&message=${encodeURIComponent(error.message)}`
    )
  }
}

