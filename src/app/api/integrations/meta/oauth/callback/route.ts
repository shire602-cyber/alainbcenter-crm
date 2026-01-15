/**
 * GET /api/integrations/meta/oauth/callback
 * 
 * Meta OAuth Callback Endpoint
 * Handles the OAuth redirect from Facebook Login
 * 
 * META SETTINGS REQUIRED:
 * - App Domains: implseai.com
 * - Valid OAuth Redirect URIs: https://implseai.com/api/integrations/meta/oauth/callback
 * 
 * Flow:
 * 1. Validate state (CSRF protection)
 * 2. Exchange code for short-lived access token
 * 3. Exchange for long-lived user token (60 days)
 * 4. Fetch user's Pages and Instagram Business Accounts
 * 5. Persist to MetaConnection
 * 6. Redirect with success or error
 */

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  exchangeCodeForToken,
  exchangeLongLivedUserToken,
  getUserPages,
  getInstagramBusinessAccount,
} from '@/lib/integrations/meta/api'
import { upsertConnection } from '@/server/integrations/meta/storage'
import { encryptToken } from '@/lib/integrations/meta/encryption'
import { getCurrentUser } from '@/lib/auth-server'

const META_APP_ID = process.env.META_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET
const META_OAUTH_REDIRECT_URI = process.env.META_OAUTH_REDIRECT_URI || process.env.META_REDIRECT_URI

// CSRF state cookie name (must match start route)
const STATE_COOKIE_NAME = 'meta_oauth_csrf_state'
const POST_OAUTH_REDIRECT_COOKIE = 'meta_oauth_post_redirect'
const DEFAULT_RETURN_URL = '/admin/integrations'

function sanitizeReturnUrl(value: string | null | undefined): string {
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

function resolvePostOauthRedirect(cookieValue: string | undefined, returnUrl?: string): string {
  const fallback = buildRelativeRedirect(sanitizeReturnUrl(returnUrl), { meta: 'connected' })
  return sanitizeReturnUrl(cookieValue ?? '') !== DEFAULT_RETURN_URL
    ? sanitizeReturnUrl(cookieValue ?? '')
    : fallback
}

/**
 * Build redirect URL with query params
 */
function buildRedirectUrl(base: string, params: Record<string, string>): string {
  const url = new URL(base, process.env.NEXT_PUBLIC_APP_URL || 'https://implseai.com')
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value)
  })
  return url.toString()
}

/**
 * GET handler for Meta OAuth callback
 */
export async function GET(req: NextRequest) {
  console.log('[META-OAUTH-CB] Callback received', {
    url: req.url,
    timestamp: new Date().toISOString(),
  })

  const baseRedirect = '/admin/integrations'

  try {
    // 1. Parse query parameters
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorReason = searchParams.get('error_reason')
    const errorDescription = searchParams.get('error_description')

    // Handle OAuth errors from Meta
    if (error) {
      console.error('[META-OAUTH-CB] OAuth error from Meta:', {
        error,
        errorReason,
        errorDescription,
      })
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: errorReason || error,
        })
      )
    }

    // Validate required params
    if (!code || !state) {
      console.error('[META-OAUTH-CB] Missing code or state', { hasCode: !!code, hasState: !!state })
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'missing_code_or_state',
        })
      )
    }

    // 2. Validate environment variables
    if (!META_APP_ID || !META_APP_SECRET || !META_OAUTH_REDIRECT_URI) {
      console.error('[META-OAUTH-CB] Missing env vars', {
        hasAppId: !!META_APP_ID,
        hasAppSecret: !!META_APP_SECRET,
        hasRedirectUri: !!META_OAUTH_REDIRECT_URI,
      })
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'missing_env',
        })
      )
    }

    // 3. Validate CSRF state
    const cookieStore = await cookies()
    const storedState = cookieStore.get(STATE_COOKIE_NAME)?.value

    if (!storedState) {
      console.error('[META-OAUTH-CB] No stored state cookie found')
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'no_state_cookie',
        })
      )
    }

    // Decode and validate state
    let stateData: { nonce: string; workspace_id: number; timestamp: number; return_url?: string }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString())
    } catch {
      console.error('[META-OAUTH-CB] Failed to decode state')
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'invalid_state_format',
        })
      )
    }

    // Compare nonce with stored value
    if (stateData.nonce !== storedState) {
      console.error('[META-OAUTH-CB] State mismatch (CSRF validation failed)', {
        expected: storedState.substring(0, 8) + '...',
        received: stateData.nonce?.substring(0, 8) + '...',
      })
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'invalid_state',
        })
      )
    }

    // Check state age (max 10 minutes)
    const stateAge = Date.now() - stateData.timestamp
    if (stateAge > 10 * 60 * 1000) {
      console.error('[META-OAUTH-CB] State expired', { ageMs: stateAge })
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'state_expired',
        })
      )
    }

    console.log('[META-OAUTH-CB] State validated successfully', {
      workspaceId: stateData.workspace_id,
      stateAgeMs: stateAge,
    })

    const postOauthRedirect = resolvePostOauthRedirect(
      cookieStore.get(POST_OAUTH_REDIRECT_COOKIE)?.value,
      stateData.return_url
    )

    const currentUser = await getCurrentUser()
    if (!currentUser) {
      cookieStore.delete(STATE_COOKIE_NAME)
      cookieStore.delete(POST_OAUTH_REDIRECT_COOKIE)
      return NextResponse.redirect(
        buildRedirectUrl('/login', {
          next: postOauthRedirect,
        })
      )
    }

    // Clear state cookie
    cookieStore.delete(STATE_COOKIE_NAME)
    cookieStore.delete(POST_OAUTH_REDIRECT_COOKIE)

    // 4. Exchange code for short-lived token
    console.log('[META-OAUTH-TOKEN] Exchanging code for token...')
    let shortLivedToken: string
    try {
      const tokenData = await exchangeCodeForToken(
        code,
        META_OAUTH_REDIRECT_URI,
        META_APP_ID,
        META_APP_SECRET
      )
      shortLivedToken = tokenData.access_token
      console.log('[META-OAUTH-TOKEN] Short-lived token obtained')
    } catch (tokenError: any) {
      console.error('[META-OAUTH-TOKEN] Failed to exchange code:', tokenError.message)
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'token_exchange_failed',
        })
      )
    }

    // 5. Exchange for long-lived user token
    console.log('[META-OAUTH-TOKEN] Exchanging for long-lived token...')
    let longLivedUserToken: string
    let tokenExpiresIn: number
    try {
      const longLivedData = await exchangeLongLivedUserToken(
        shortLivedToken,
        META_APP_ID,
        META_APP_SECRET
      )
      longLivedUserToken = longLivedData.access_token
      tokenExpiresIn = longLivedData.expires_in || 5184000 // Default 60 days
      console.log('[META-OAUTH-TOKEN] Long-lived token obtained', { expiresIn: tokenExpiresIn })
    } catch (tokenError: any) {
      console.error('[META-OAUTH-TOKEN] Failed to get long-lived token:', tokenError.message)
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'long_lived_token_failed',
        })
      )
    }

    // 6. Fetch user's Pages
    console.log('[META-OAUTH-ASSETS] Fetching user pages...')
    let pages: Awaited<ReturnType<typeof getUserPages>>
    try {
      pages = await getUserPages(longLivedUserToken)
      console.log('[META-OAUTH-ASSETS] Pages found:', pages.length)
    } catch (pagesError: any) {
      console.error('[META-OAUTH-ASSETS] Failed to fetch pages:', pagesError.message)
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'pages_fetch_failed',
        })
      )
    }

    if (pages.length === 0) {
      console.warn('[META-OAUTH-ASSETS] No pages found for user')
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'no_pages',
        })
      )
    }

    // 7. For each page, fetch IG business account and persist
    console.log('[META-OAUTH-ASSETS] Fetching Instagram accounts for each page...')
    const savedConnections: Array<{ pageId: string; pageName: string; igId?: string; igUsername?: string }> = []
    const workspaceId = stateData.workspace_id || 1
    const tokenExpiresAt = new Date(Date.now() + tokenExpiresIn * 1000)

    for (const page of pages) {
      if (!page.access_token) {
        console.warn('[META-OAUTH-ASSETS] Page missing access_token:', page.id)
        continue
      }

      // Fetch Instagram Business Account
      let igAccount: Awaited<ReturnType<typeof getInstagramBusinessAccount>> = null
      try {
        igAccount = await getInstagramBusinessAccount(page.id, page.access_token)
        if (igAccount) {
          console.log('[META-OAUTH-ASSETS] IG account found for page', {
            pageId: page.id,
            igId: igAccount.id,
            igUsername: igAccount.username,
          })
        }
      } catch (igError: any) {
        console.warn('[META-OAUTH-ASSETS] Failed to fetch IG for page:', page.id, igError.message)
      }

      // Persist to MetaConnection
      try {
        await upsertConnection({
          workspaceId,
          provider: 'meta',
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          metaUserAccessTokenLong: longLivedUserToken,
          metaUserTokenExpiresAt: tokenExpiresAt,
          metaConnectedAt: new Date(),
          igBusinessId: igAccount?.id ?? null,
          igUsername: igAccount?.username ?? null,
          scopes: ['pages_show_list', 'pages_messaging', 'instagram_basic', 'instagram_manage_messages'],
          status: 'connected',
        })

        savedConnections.push({
          pageId: page.id,
          pageName: page.name,
          igId: igAccount?.id,
          igUsername: igAccount?.username,
        })

        console.log('[META-OAUTH-SAVED] Connection saved', {
          pageId: page.id,
          pageName: page.name,
          hasIg: !!igAccount,
        })
      } catch (saveError: any) {
        console.error('[META-OAUTH-SAVED] Failed to save connection:', page.id, saveError.message)
      }
    }

    // 8. Final result
    if (savedConnections.length === 0) {
      console.error('[META-OAUTH-CB] No connections were saved')
      return NextResponse.redirect(
        buildRedirectUrl(baseRedirect, {
          meta: 'error',
          reason: 'save_failed',
        })
      )
    }

    console.log('[META-OAUTH-CB] OAuth complete', {
      savedCount: savedConnections.length,
      connections: savedConnections.map(c => ({ page: c.pageName, ig: c.igUsername })),
    })

    // Success redirect
    return NextResponse.redirect(buildRedirectUrl(postOauthRedirect, {}))
  } catch (error: any) {
    console.error('[META-OAUTH-CB] Unexpected error:', error)
    return NextResponse.redirect(
      buildRedirectUrl(baseRedirect, {
        meta: 'error',
        reason: 'unexpected_error',
      })
    )
  }
}
