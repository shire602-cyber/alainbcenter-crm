/**
 * GET /api/integrations/meta/callback
 * Handles Meta OAuth callback
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import {
  exchangeCodeForToken,
  exchangeLongLivedUserToken,
  getUserPages,
  getInstagramBusinessAccount,
} from '@/lib/integrations/meta/api'
import { storeOAuthState } from '@/server/integrations/meta/oauthState'
import { validateToken } from '@/server/integrations/meta/token'

const META_APP_ID = process.env.META_APP_ID
const META_APP_SECRET = process.env.META_APP_SECRET
const META_OAUTH_REDIRECT_URI = process.env.META_OAUTH_REDIRECT_URI || process.env.META_REDIRECT_URI

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
      console.error('[META-OAUTH] OAuth error:', error, errorReason)
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

    console.log('[META-OAUTH] OAuth callback received, exchanging code for token')

    // Step 1: Exchange code for short-lived access token
    const shortLivedTokenData = await exchangeCodeForToken(
      code,
      META_OAUTH_REDIRECT_URI!,
      META_APP_ID!,
      META_APP_SECRET!
    )

    const shortLivedToken = shortLivedTokenData.access_token
    console.log('[META-OAUTH] Short-lived token obtained')

    // Step 2: Exchange short-lived token for long-lived token (60 days)
    const longLivedTokenData = await exchangeLongLivedUserToken(
      shortLivedToken,
      META_APP_ID!,
      META_APP_SECRET!
    )

    const longLivedUserToken = longLivedTokenData.access_token
    const expiresIn = longLivedTokenData.expires_in || 5184000 // Default 60 days in seconds
    console.log('[META-OAUTH] Long-lived token obtained, expires in', expiresIn, 'seconds')

    // Step 3: Get user info for metaUserId
    const metaUser = await validateToken(longLivedUserToken)
    const workspaceId = parseInt(stateData.workspace_id) || 1

    // Step 4: Store OAuth state (long-lived token) in encrypted cookie
    const expiresAt = Date.now() + (expiresIn * 1000) // Convert to milliseconds
    await storeOAuthState({
      longLivedUserToken,
      expiresAt,
      workspaceId,
      metaUserId: metaUser.id,
    })

    console.log('[META-OAUTH] OAuth state stored, redirecting to wizard')

    // Step 5: Redirect to integrations page with OAuth success flag
    // The wizard will fetch pages using the stored OAuth state
    const returnUrl = stateData.return_url || '/admin/integrations'
    return NextResponse.redirect(
      `${returnUrl}?meta_oauth=success`
    )
  } catch (error: any) {
    console.error('[META-OAUTH] OAuth callback error:', error)
    return NextResponse.redirect(
      `/admin/integrations?error=callback_failed&message=${encodeURIComponent(error.message)}`
    )
  }
}

