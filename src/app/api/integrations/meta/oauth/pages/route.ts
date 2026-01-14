/**
 * GET /api/integrations/meta/oauth/pages
 * Returns list of Facebook Pages with their Instagram Business Accounts
 * Uses stored OAuth state (long-lived user token)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getOAuthState } from '@/server/integrations/meta/oauthState'
import { getUserPages } from '@/server/integrations/meta/token'
import { getInstagramBusinessAccount, getPageAccessTokenFromUserToken } from '@/server/integrations/meta/token'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    console.log('[META-PAGES] Fetching pages list from OAuth state')

    // Get OAuth state from cookie
    const oauthState = await getOAuthState()

    if (!oauthState) {
      return NextResponse.json(
        { error: 'OAuth state not found or expired. Please start the connection process again.' },
        { status: 401 }
      )
    }

    const { longLivedUserToken } = oauthState

    // Get pages managed by the user
    let pages
    try {
      pages = await getUserPages(longLivedUserToken)
      console.log(`[META-PAGES] Found ${pages.length} pages`)
    } catch (error: any) {
      console.error('[META-PAGES] Failed to fetch pages:', error)
      return NextResponse.json(
        { 
          error: 'Failed to fetch pages', 
          details: error.message,
          hint: 'Make sure your token has "pages_show_list" permission'
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

    // Fetch IG Business Account for each page
    const pagesWithIg = await Promise.all(
      pages.map(async (page) => {
        let igAccount = null
        try {
          // Get page access token first
          const pageAccessToken = await getPageAccessTokenFromUserToken(page.id, longLivedUserToken)
          
          // Then get IG account
          igAccount = await getInstagramBusinessAccount(page.id, pageAccessToken)
          
          if (igAccount) {
            console.log(`[META-PAGES] Page ${page.name} has IG account: @${igAccount.username}`)
          }
        } catch (error: any) {
          // Page might not have IG account connected - that's OK
          console.log(`[META-PAGES] No Instagram account for page ${page.id}:`, error.message)
        }

        return {
          id: page.id,
          name: page.name,
          instagram_business_account: igAccount ? {
            id: igAccount.id,
            username: igAccount.username,
          } : null,
        }
      })
    )

    console.log(`[META-PAGES] Returning ${pagesWithIg.length} pages with IG account info`)

    return NextResponse.json({
      success: true,
      pages: pagesWithIg,
    })
  } catch (error: any) {
    console.error('[META-PAGES] Error fetching pages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pages', details: error.message },
      { status: 500 }
    )
  }
}
