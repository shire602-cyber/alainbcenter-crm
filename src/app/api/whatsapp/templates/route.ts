import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'

/**
 * GET /api/whatsapp/templates
 * 
 * List WhatsApp message templates from Meta Graph API
 * 
 * Query params:
 * - onlyApproved=1: Filter to only APPROVED templates
 * - debug=1: Include debug info (graphVersion, usedWabaIdLast4, tokenPresent)
 * 
 * Returns:
 * - ok: true/false
 * - templates: Array of template objects
 * - approvedCount: Number of approved templates
 * - total: Total templates fetched
 * - wabaIdLast4: Last 4 chars of WABA ID (for debugging)
 * - error: Error details if ok: false
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuthApi()

    const searchParams = req.nextUrl.searchParams
    const onlyApproved = searchParams.get('onlyApproved') === '1'
    const debug = searchParams.get('debug') === '1'

    // Get Graph API version (optional, default v24.0)
    const graphVersion = process.env.META_GRAPH_VERSION || 'v24.0'

    // CRITICAL: Use DB-first credentials (from Integration table)
    const { getWhatsAppCredentials } = await import('@/lib/whatsapp')
    let credentials
    try {
      credentials = await getWhatsAppCredentials()
    } catch (error: any) {
      return NextResponse.json(
        {
          ok: false,
          error: 'missing_credentials',
          message: error.message || 'WhatsApp credentials not configured',
          hint: 'Configure WhatsApp in /admin/integrations or set environment variables',
        },
        { status: 500 }
      )
    }

    const { accessToken, wabaId } = credentials

    if (!wabaId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'missing_waba_id',
          message: 'WABA ID not configured. Set it in Integrations (preferred) or env WHATSAPP_BUSINESS_ACCOUNT_ID / META_WABA_ID / WHATSAPP_WABA_ID',
          hint: 'WABA ID is required to fetch templates from Meta Graph API',
        },
        { status: 500 }
      )
    }

    // Get last 4 chars for debug (never return full ID)
    const wabaIdLast4 = wabaId.length >= 4 ? wabaId.slice(-4) : '****'

    // Fetch templates with pagination
    const allTemplates: any[] = []
    let nextUrl: string | null = `https://graph.facebook.com/${graphVersion}/${wabaId}/message_templates?fields=name,language,status,category,components&limit=250`
    let pageCount = 0
    const maxPages = 4 // Max 1000 templates (4 * 250)

    while (nextUrl && pageCount < maxPages) {
      try {
        const response: Response = await fetch(nextUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (!response.ok) {
          // Graph API returned an error
          const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
          
          return NextResponse.json(
            {
              ok: false,
              error: 'graph_error',
              details: errorData,
              status: response.status,
              message: errorData.error?.message || `Graph API returned ${response.status}`,
            },
            { status: response.status }
          )
        }

        const data = await response.json()

        // Add templates from this page
        if (data.data && Array.isArray(data.data)) {
          allTemplates.push(...data.data)
        }

        // Check for next page
        nextUrl = data.paging?.next || null
        pageCount++

        // If no more pages, break
        if (!nextUrl) {
          break
        }
      } catch (fetchError: any) {
        // Network or parsing error
        return NextResponse.json(
          {
            ok: false,
            error: 'fetch_error',
            message: fetchError.message || 'Failed to fetch templates from Graph API',
            details: { error: fetchError.toString() },
          },
          { status: 500 }
        )
      }
    }

    // Filter by status if requested
    let filteredTemplates = allTemplates
    if (onlyApproved) {
      filteredTemplates = allTemplates.filter((t: any) => t.status === 'APPROVED')
    }

    // Sort by name
    filteredTemplates.sort((a: any, b: any) => a.name.localeCompare(b.name))

    // Count approved templates
    const approvedCount = allTemplates.filter((t: any) => t.status === 'APPROVED').length

    // Build response
    const response: any = {
      ok: true,
      wabaIdLast4,
      templates: filteredTemplates,
      approvedCount,
      total: allTemplates.length,
    }

    // Add debug info if requested
    if (debug) {
      response.debug = {
        graphVersion,
        usedWabaIdLast4: wabaIdLast4,
        tokenPresent: !!accessToken,
        tokenSource: credentials.tokenSource,
        pagesFetched: pageCount,
        credentialsFrom: credentials.tokenSource === 'db' ? 'Integration table' : 'Environment variables',
      }
    }

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('[WHATSAPP-TEMPLATES] Error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: 'server_error',
        message: error.message || 'Failed to fetch templates',
      },
      { status: 500 }
    )
  }
}
