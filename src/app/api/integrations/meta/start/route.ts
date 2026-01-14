/**
 * GET /api/integrations/meta/start
 * Initiates Meta OAuth flow
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'

const META_APP_ID = process.env.META_APP_ID
const META_OAUTH_REDIRECT_URI = process.env.META_OAUTH_REDIRECT_URI || process.env.META_REDIRECT_URI || process.env.META_REDIRECT_URI

export async function GET(req: NextRequest) {
  try {
    // Require admin authentication
    await requireAdmin()

    if (!META_APP_ID) {
      return NextResponse.json(
        { error: 'META_APP_ID not configured' },
        { status: 500 }
      )
    }

    if (!META_OAUTH_REDIRECT_URI) {
      return NextResponse.json(
        { error: 'META_OAUTH_REDIRECT_URI not configured' },
        { status: 500 }
      )
    }

    // Get workspace_id from query params (default to 1 for single-tenant)
    const workspaceId = req.nextUrl.searchParams.get('workspace_id') || '1'
    const returnUrl = req.nextUrl.searchParams.get('return_url') || '/admin/integrations'

    // Scopes for Instagram messaging and Facebook messaging
    const scopes = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'instagram_basic',
      'instagram_manage_messages',
      'pages_messaging',
      'pages_read_user_content',
      'leads_retrieval',
    ].join(',')

    // Generate state token with workspace_id and return_url
    const state = Buffer.from(
      JSON.stringify({
        workspace_id: workspaceId,
        return_url: returnUrl,
        timestamp: Date.now(),
      })
    ).toString('base64url')

    // Build OAuth URL
    const oauthUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth')
    oauthUrl.searchParams.set('client_id', META_APP_ID)
    oauthUrl.searchParams.set('redirect_uri', META_OAUTH_REDIRECT_URI)
    oauthUrl.searchParams.set('scope', scopes)
    oauthUrl.searchParams.set('state', state)
    oauthUrl.searchParams.set('response_type', 'code')

    console.log('[META-OAUTH] Redirecting to Meta OAuth', {
      appId: META_APP_ID,
      redirectUri: META_OAUTH_REDIRECT_URI,
      scopes,
    })

    // Redirect to Meta OAuth
    return NextResponse.redirect(oauthUrl.toString())
  } catch (error: any) {
    console.error('[META-OAUTH] OAuth start error:', error)
    return NextResponse.json(
      { error: 'Failed to start OAuth flow', details: error.message },
      { status: 500 }
    )
  }
}

