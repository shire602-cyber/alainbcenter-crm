import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'

/**
 * GET /api/media?url=...
 * SAME-ORIGIN media proxy with Range support
 * 
 * This endpoint proxies media requests to support:
 * - Audio/video seeking (Range requests → 206 Partial Content)
 * - CORS-free media access
 * - Auth cookie forwarding
 * 
 * CRITICAL: This is a same-origin proxy, not a CORS fix.
 * All media URLs should route through this endpoint.
 */
export async function GET(req: NextRequest) {
  try {
    // Auth check
    await requireAuthApi()

    const urlParam = req.nextUrl.searchParams.get('url')
    if (!urlParam) {
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          },
        }
      )
    }

    // Decode the URL
    let targetUrl: string
    try {
      targetUrl = decodeURIComponent(urlParam)
    } catch {
      targetUrl = urlParam
    }

    // Validate URL (must be http/https)
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      return NextResponse.json(
        { error: 'Invalid URL - must be http or https' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          },
        }
      )
    }

    // Get Range header from request (for audio/video seeking)
    const rangeHeader = req.headers.get('range')
    
    // Build fetch headers
    const fetchHeaders: HeadersInit = {}
    
    // Forward Range header if present
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader
    }

    // Forward auth if target is same-origin or we have credentials
    // For WhatsApp media, we'll need to add auth token separately
    const cookieHeader = req.headers.get('cookie')
    if (cookieHeader) {
      fetchHeaders['Cookie'] = cookieHeader
    }

    // Fetch media from target URL
    const mediaResponse = await fetch(targetUrl, {
      headers: fetchHeaders,
    })

    // FIX: Handle expired media (410 Gone)
    if (mediaResponse.status === 410) {
      return NextResponse.json(
        { 
          error: 'upstream_expired',
          reason: 'Media URL expired. Ask customer to resend.',
        },
        { 
          status: 410,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          },
        }
      )
    }
    
    if (!mediaResponse.ok) {
      return NextResponse.json(
        { 
          error: 'upstream_failed',
          reason: `Failed to fetch media: ${mediaResponse.status}`,
        },
        { 
          status: mediaResponse.status,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          },
        }
      )
    }

    // Get response headers
    const contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream'
    const contentLength = mediaResponse.headers.get('content-length')
    const contentRange = mediaResponse.headers.get('content-range')
    const acceptRanges = mediaResponse.headers.get('accept-ranges') || 'bytes'

    // Get media body
    const arrayBuffer = await mediaResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Build response headers
    const responseHeaders: HeadersInit = {
      'Content-Type': contentType,
      'Accept-Ranges': acceptRanges,
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*', // FIX: CORS headers
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    }

    // Add Content-Length if available
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength
    }

    // Handle partial content (206) for Range requests
    if (rangeHeader && contentRange && mediaResponse.status === 206) {
      responseHeaders['Content-Range'] = contentRange
      return new NextResponse(buffer, {
        status: 206,
        headers: responseHeaders,
      })
    }

    // Return full content (200)
    return new NextResponse(buffer, {
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error('[MEDIA-PROXY] Error:', error)
    return NextResponse.json(
      { 
        error: 'internal_error',
        reason: error.message || 'Failed to proxy media',
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        },
      }
    )
  }
}

/**
 * OPTIONS /api/media
 * Handle CORS preflight requests
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}

