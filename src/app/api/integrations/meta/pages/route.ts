/**
 * GET /api/integrations/meta/pages
 * List available Facebook Pages with their Instagram Business Accounts
 * 
 * Accepts accessToken in query parameter or request body
 * Returns array of pages with their IG account info
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth-server'
import { getUserPages, getInstagramBusinessAccount } from '@/server/integrations/meta/token'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin()

    const searchParams = req.nextUrl.searchParams
    const accessToken = searchParams.get('accessToken')

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'accessToken is required as query parameter' },
        { status: 400 }
      )
    }

    // Fetch pages
    let pages
    try {
      pages = await getUserPages(accessToken)
    } catch (error: any) {
      console.error('Failed to fetch pages:', error)
      return NextResponse.json(
        { 
          error: 'Failed to fetch pages', 
          details: error.message,
          hint: 'Make sure your token has "pages_read_engagement" permission'
        },
        { status: 500 }
      )
    }

    // Fetch IG Business Account for each page
    const pagesWithIg = await Promise.all(
      pages.map(async (page) => {
        let igAccount = null
        try {
          igAccount = await getInstagramBusinessAccount(page.id, page.access_token)
        } catch (error: any) {
          // Page might not have IG account connected - that's OK
          console.log(`No Instagram account for page ${page.id}:`, error.message)
        }

        return {
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token, // Note: This is a page token, not user token
          hasIg: !!igAccount,
          igBusinessId: igAccount?.id ?? null,
          igUsername: igAccount?.username ?? null,
        }
      })
    )

    return NextResponse.json({
      success: true,
      pages: pagesWithIg,
    })
  } catch (error: any) {
    console.error('Meta pages endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pages', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/integrations/meta/pages
 * Alternative endpoint that accepts token in body
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()

    const body = await req.json()
    const { accessToken } = body

    if (!accessToken || typeof accessToken !== 'string') {
      return NextResponse.json(
        { error: 'accessToken is required in request body' },
        { status: 400 }
      )
    }

    // Fetch pages
    let pages
    try {
      pages = await getUserPages(accessToken)
    } catch (error: any) {
      console.error('Failed to fetch pages:', error)
      return NextResponse.json(
        { 
          error: 'Failed to fetch pages', 
          details: error.message,
          hint: 'Make sure your token has "pages_read_engagement" permission'
        },
        { status: 500 }
      )
    }

    // Fetch IG Business Account for each page
    const pagesWithIg = await Promise.all(
      pages.map(async (page) => {
        let igAccount = null
        try {
          igAccount = await getInstagramBusinessAccount(page.id, page.access_token)
        } catch (error: any) {
          // Page might not have IG account connected - that's OK
          console.log(`No Instagram account for page ${page.id}:`, error.message)
        }

        return {
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          hasIg: !!igAccount,
          igBusinessId: igAccount?.id ?? null,
          igUsername: igAccount?.username ?? null,
        }
      })
    )

    return NextResponse.json({
      success: true,
      pages: pagesWithIg,
    })
  } catch (error: any) {
    console.error('Meta pages endpoint error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pages', details: error.message },
      { status: 500 }
    )
  }
}

