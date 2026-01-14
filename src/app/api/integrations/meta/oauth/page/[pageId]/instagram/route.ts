/**
 * GET /api/integrations/meta/oauth/page/[pageId]/instagram
 * Returns Instagram Business Account info for a specific page
 * Uses stored OAuth state (long-lived user token)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getOAuthState } from '@/server/integrations/meta/oauthState'
import { getInstagramBusinessAccount, getPageAccessTokenFromUserToken } from '@/server/integrations/meta/token'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    await requireAdmin()

    const resolvedParams = await params
    const pageId = resolvedParams.pageId

    if (!pageId) {
      return NextResponse.json(
        { error: 'pageId is required' },
        { status: 400 }
      )
    }

    console.log(`[META-ASSETS] Fetching Instagram account for page ${pageId}`)

    // Get OAuth state from cookie
    const oauthState = await getOAuthState()

    if (!oauthState) {
      return NextResponse.json(
        { error: 'OAuth state not found or expired. Please start the connection process again.' },
        { status: 401 }
      )
    }

    const { longLivedUserToken } = oauthState

    try {
      // Get page access token
      const pageAccessToken = await getPageAccessTokenFromUserToken(pageId, longLivedUserToken)
      
      // Get Instagram Business Account
      const igAccount = await getInstagramBusinessAccount(pageId, pageAccessToken)

      if (!igAccount) {
        return NextResponse.json(
          { 
            error: 'Instagram Business Account not found',
            hint: 'This Facebook Page does not have an Instagram Business Account connected. Please connect an Instagram account to this page in Meta Business Manager.'
          },
          { status: 404 }
        )
      }

      console.log(`[META-ASSETS] Found IG account for page ${pageId}: @${igAccount.username}`)

      return NextResponse.json({
        success: true,
        instagram_business_account: {
          id: igAccount.id,
          username: igAccount.username,
        },
      })
    } catch (error: any) {
      console.error(`[META-ASSETS] Error fetching IG account for page ${pageId}:`, error)
      return NextResponse.json(
        { 
          error: 'Failed to fetch Instagram account', 
          details: error.message,
          hint: 'This page may not have an Instagram Business Account connected.'
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('[META-ASSETS] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch Instagram account', details: error.message },
      { status: 500 }
    )
  }
}
