/**
 * POST /api/integrations/meta/connect
 * Connect Meta using tester token
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { validateToken, getUserPages, getInstagramBusinessAccount } from '@/server/integrations/meta/token'
import { subscribePageToWebhook } from '@/server/integrations/meta/subscribe'
import { upsertConnection } from '@/server/integrations/meta/storage'
import { setWebhookVerifyToken } from '@/server/integrations/meta/config'

export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const { token, webhookVerifyToken } = body

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
      return NextResponse.json(
        { error: 'Invalid token', details: error.message },
        { status: 401 }
      )
    }

    // Get pages
    let pages
    try {
      pages = await getUserPages(token)
    } catch (error: any) {
      return NextResponse.json(
        { error: 'Failed to fetch pages', details: error.message },
        { status: 500 }
      )
    }

    if (pages.length === 0) {
      return NextResponse.json(
        { error: 'No Facebook pages found. Please create a page first.' },
        { status: 400 }
      )
    }

    // Use the first page (or allow page_id to be passed in the future)
    const page = pages[0]

    // Get Instagram Business Account
    let igAccount = null
    try {
      igAccount = await getInstagramBusinessAccount(page.id, page.access_token)
    } catch (error: any) {
      console.error(`Failed to get Instagram account for page ${page.id}:`, error.message)
      // Continue without Instagram account
    }

    // Subscribe page to webhook
    let subscribed = false
    try {
      subscribed = await subscribePageToWebhook(
        page.id,
        page.access_token,
        ['messages', 'messaging_postbacks', 'message_deliveries', 'message_reads', 'leadgen']
      )
    } catch (error: any) {
      console.error(`Failed to subscribe page ${page.id} to webhook:`, error.message)
      // Continue - subscription might already exist
    }

    // Store connection
    let connection
    try {
      connection = await upsertConnection({
        workspaceId: null, // Single-tenant, use null
        provider: 'meta',
        metaUserId: metaUser.id,
        pageId: page.id,
        pageName: page.name,
        pageAccessToken: page.access_token,
        igBusinessId: igAccount?.id ?? null,
        igUsername: igAccount?.username ?? null,
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

    return NextResponse.json({
      success: true,
      connection: {
        id: connection.id,
        pageId: page.id,
        pageName: page.name,
        igUsername: igAccount?.username,
        subscribed,
      },
    })
  } catch (error: any) {
    console.error('Meta connect error:', error)
    return NextResponse.json(
      { error: 'Failed to connect', details: error.message },
      { status: 500 }
    )
  }
}

