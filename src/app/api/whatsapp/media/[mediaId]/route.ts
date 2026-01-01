import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/whatsapp/media/[mediaId]
 * Fetch WhatsApp media file from Meta API using media ID
 * 
 * WhatsApp stores media temporarily. This endpoint:
 * 1. Gets the media URL from Meta using the media ID
 * 2. Downloads the media file
 * 3. Returns it to the client
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    await requireAuthApi()

    const resolvedParams = await params
    const mediaId = resolvedParams.mediaId
    const messageIdParam = req.nextUrl.searchParams.get('messageId')

    if (!mediaId) {
      return NextResponse.json(
        { error: 'Media ID is required' },
        { status: 400 }
      )
    }

    // Get WhatsApp credentials
    let accessToken: string | null = null
    try {
      const integration = await prisma.integration.findUnique({
        where: { name: 'whatsapp' },
      })

      if (integration?.config) {
        try {
          const config = typeof integration.config === 'string'
            ? JSON.parse(integration.config)
            : integration.config
          accessToken = config.accessToken || integration.accessToken || integration.apiKey || null
        } catch {}
      } else {
        accessToken = integration?.accessToken || integration?.apiKey || null
      }
    } catch {}

    if (!accessToken) {
      accessToken = process.env.WHATSAPP_ACCESS_TOKEN || null
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: 'WhatsApp access token not configured' },
        { status: 500 }
      )
    }

    // Step 1: Get media URL from Meta
    const mediaUrlResponse = await fetch(
      `https://graph.facebook.com/v21.0/${mediaId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    )

    if (!mediaUrlResponse.ok) {
      const error = await mediaUrlResponse.json().catch(() => ({}))
      return NextResponse.json(
        { error: error.error?.message || 'Failed to fetch media URL from Meta' },
        { status: mediaUrlResponse.status }
      )
    }

    const mediaData = await mediaUrlResponse.json()
    const mediaUrl = mediaData.url

    if (!mediaUrl) {
      return NextResponse.json(
        { error: 'Media URL not found in Meta response' },
        { status: 404 }
      )
    }

    // Step 2: Download media file from Meta with Range support
    const rangeHeader = req.headers.get('range')
    const fetchHeaders: HeadersInit = {
      Authorization: `Bearer ${accessToken}`,
    }
    
    // CRITICAL: Forward Range header for audio/video streaming (seeking support)
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader
    }

    // STEP B: Fetch with Range support
    const mediaFileResponse = await fetch(mediaUrl, {
      headers: fetchHeaders,
    })

    if (!mediaFileResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download media file from Meta' },
        { status: mediaFileResponse.status }
      )
    }

    // Step 3: Get content type and handle Range requests properly
    const contentType = mediaFileResponse.headers.get('content-type') || 'application/octet-stream'
    const contentLength = mediaFileResponse.headers.get('content-length')
    const contentRange = mediaFileResponse.headers.get('content-range')
    const upstreamStatus = mediaFileResponse.status

    // CRITICAL FIX: For Range requests, stream the response body directly without buffering
    // This allows seeking in audio/video without downloading the full file
    const responseHeaders: HeadersInit = {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="media-${mediaId}"`,
      'Accept-Ranges': 'bytes', // MANDATORY for audio/video streaming
      'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
    }

    // Add Content-Length if available
    if (contentLength) {
      responseHeaders['Content-Length'] = contentLength
    }

    // Handle partial content (206) for Range requests
    if (rangeHeader && contentRange && upstreamStatus === 206) {
      responseHeaders['Content-Range'] = contentRange
      // Stream the response body directly (don't buffer)
      return new NextResponse(mediaFileResponse.body, {
        status: 206,
        headers: responseHeaders,
      })
    }

    // For non-Range requests, read the full buffer
    const arrayBuffer = await mediaFileResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // PHASE 1 DEBUG: Log media response details
    console.log('[MEDIA-DEBUG] Serving media', {
      mediaId,
      contentType,
      bufferSize: buffer.length,
      hasRange: !!rangeHeader,
      status: rangeHeader && contentRange ? 206 : 200,
      headers: Object.keys(responseHeaders),
    })

    // Return media file
    return new NextResponse(buffer, {
      status: upstreamStatus,
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error('Error fetching WhatsApp media:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch media' },
      { status: 500 }
    )
  }
}

