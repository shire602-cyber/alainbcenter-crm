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

    const { accessToken, wabaId, phoneNumberId } = credentials

    // CRITICAL: Validate and fetch WABA ID
    // Application IDs often contain dashes or are very long - reject them immediately
    const looksLikeApplicationId = wabaId && (wabaId.includes('-') || wabaId.length > 20 || !/^\d+$/.test(wabaId))
    
    let effectiveWabaId: string | null = null
    
    // Only use stored wabaId if it looks valid (numeric, reasonable length)
    if (wabaId && !looksLikeApplicationId) {
      effectiveWabaId = wabaId
      console.log(`[WHATSAPP-TEMPLATES] Using stored WABA ID: ${wabaId.substring(0, 10)}...`)
    } else if (wabaId && looksLikeApplicationId) {
      console.warn(`[WHATSAPP-TEMPLATES] Stored wabaId looks like Application ID (${wabaId.substring(0, 20)}...), will attempt auto-fetch`)
    }
    
    // ALWAYS try to auto-fetch from phone_number_id if we don't have a valid WABA ID
    if (!effectiveWabaId && phoneNumberId) {
      try {
        console.log(`[WHATSAPP-TEMPLATES] Attempting to fetch WABA ID from phone_number_id: ${phoneNumberId.substring(0, 10)}...`)
        
        // Method 1: Query phone_number_id directly for whatsapp_business_account
        const phoneInfoUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=whatsapp_business_account{id}`
        const phoneInfoResponse = await fetch(phoneInfoUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })
        
        if (phoneInfoResponse.ok) {
          const phoneInfo = await phoneInfoResponse.json()
          const fetchedWabaId = phoneInfo.whatsapp_business_account?.id || phoneInfo.whatsapp_business_account
          
          if (fetchedWabaId && typeof fetchedWabaId === 'string') {
            console.log(`[WHATSAPP-TEMPLATES] ✅ Successfully fetched WABA ID: ${fetchedWabaId.substring(0, 10)}...`)
            effectiveWabaId = fetchedWabaId
          }
        } else {
          // Method 2: Try alternative field name or simpler query
          const altUrl = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}?fields=whatsapp_business_account`
          const altResponse = await fetch(altUrl, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })
          
          if (altResponse.ok) {
            const altData = await altResponse.json()
            if (altData.whatsapp_business_account) {
              const fetchedId = typeof altData.whatsapp_business_account === 'string' 
                ? altData.whatsapp_business_account 
                : altData.whatsapp_business_account.id
              if (fetchedId) {
                console.log(`[WHATSAPP-TEMPLATES] Successfully fetched WABA ID via alternative method: ${fetchedId.substring(0, 10)}...`)
                effectiveWabaId = fetchedId
              }
            }
          }
        }
      } catch (e) {
        console.warn('[WHATSAPP-TEMPLATES] Failed to get WABA ID from phone_number_id:', e)
      }
    }

    if (!effectiveWabaId) {
      const storedIdPreview = wabaId ? `${wabaId.substring(0, 20)}...` : 'not set'
      return NextResponse.json(
        {
          ok: false,
          error: 'missing_waba_id',
          message: 'WABA ID not configured and could not be auto-fetched from phone_number_id.',
          hint: 'WABA ID is required to fetch templates. Find it in Meta Business Manager → WhatsApp → Settings → WhatsApp Business Account ID (numeric ID, no dashes)',
          details: {
            storedIdPreview: wabaId ? storedIdPreview : null,
            looksLikeApplicationId: looksLikeApplicationId,
            phoneNumberIdPresent: !!phoneNumberId,
            suggestion: 'Update your Integration config with the correct WABA ID (numeric, typically 15-18 digits)',
          },
        },
        { status: 500 }
      )
    }

    // Final validation: WABA ID should be numeric
    if (!/^\d+$/.test(effectiveWabaId)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'invalid_waba_id_format',
          message: `WABA ID format is invalid: ${effectiveWabaId.substring(0, 20)}... (should be numeric only)`,
          hint: 'WABA ID must be a numeric string. Check Meta Business Manager → WhatsApp → Settings',
        },
        { status: 400 }
      )
    }

    // Get last 4 chars for debug (never return full ID)
    const wabaIdLast4 = effectiveWabaId.length >= 4 ? effectiveWabaId.slice(-4) : '****'

    // Fetch templates with pagination
    const allTemplates: any[] = []
    let nextUrl: string | null = `https://graph.facebook.com/${graphVersion}/${effectiveWabaId}/message_templates?fields=name,language,status,category,components&limit=250`
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
          const errorMessage = errorData.error?.message || `Graph API returned ${response.status}`
          const errorCode = errorData.error?.code
          
          // CRITICAL: Handle "Application" node type error - means we're using wrong ID
          if (errorCode === 100 && errorMessage.includes('Application') && errorMessage.includes('message_templates')) {
            console.error('[WHATSAPP-TEMPLATES] Error: Using Application ID instead of WABA ID')
            return NextResponse.json(
              {
                ok: false,
                error: 'invalid_waba_id',
                message: 'The provided ID appears to be an Application ID, not a WABA ID. Templates must be fetched using the WhatsApp Business Account ID (WABA ID).',
                hint: 'Find your WABA ID in Meta Business Manager → WhatsApp → Settings → WhatsApp Business Account ID',
                details: {
                  errorCode: 100,
                  providedIdLast4: wabaIdLast4,
                  suggestion: 'Use the WABA ID (WhatsApp Business Account ID), not the Application ID or Phone Number ID',
                },
              },
              { status: 400 }
            )
          }
          
          return NextResponse.json(
            {
              ok: false,
              error: 'graph_error',
              details: errorData,
              status: response.status,
              message: errorMessage,
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
