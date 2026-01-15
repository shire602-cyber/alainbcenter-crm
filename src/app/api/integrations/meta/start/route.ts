/**
 * GET /api/integrations/meta/start
 * Initiates Meta OAuth flow
 * 
 * META SETTINGS REQUIRED:
 * - App Domains: implseai.com
 * - Valid OAuth Redirect URIs: https://implseai.com/api/integrations/meta/oauth/callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdmin } from '@/lib/auth-server'
import crypto from 'crypto'

const META_APP_ID = process.env.META_APP_ID
const META_OAUTH_REDIRECT_URI = process.env.META_OAUTH_REDIRECT_URI || process.env.META_REDIRECT_URI

// CSRF state cookie name (must match callback route)
const STATE_COOKIE_NAME = 'meta_oauth_csrf_state'
const POST_OAUTH_REDIRECT_COOKIE = 'meta_oauth_post_redirect'

const DEFAULT_RETURN_URL = '/admin/integrations'

function sanitizeReturnUrl(value: string | null): string {
  if (!value) return DEFAULT_RETURN_URL
  if (!value.startsWith('/') || value.startsWith('//')) {
    return DEFAULT_RETURN_URL
  }
  return value
}

function buildRelativeRedirect(basePath: string, params: Record<string, string>): string {
  const url = new URL(basePath, 'http://localhost')
  Object.entries(params).forEach(([key, val]) => {
    url.searchParams.set(key, val)
  })
  return `${url.pathname}${url.search}${url.hash}`
}

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
    const workspaceId = parseInt(req.nextUrl.searchParams.get('workspace_id') || '1', 10)
    const returnUrl = sanitizeReturnUrl(req.nextUrl.searchParams.get('return_url'))
    const postOauthRedirect = buildRelativeRedirect(returnUrl, { meta: 'connected' })

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

    // Generate CSRF nonce
    const nonce = crypto.randomBytes(16).toString('hex')

    // Store nonce in cookie for validation on callback
    const cookieStore = await cookies()
    cookieStore.set(STATE_COOKIE_NAME, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })
    cookieStore.set(POST_OAUTH_REDIRECT_COOKIE, postOauthRedirect, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    })

    // Generate state token with nonce, workspace_id, and timestamp
    const state = Buffer.from(
      JSON.stringify({
        nonce,
        workspace_id: workspaceId,
        timestamp: Date.now(),
        return_url: returnUrl,
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
      workspaceId,
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

