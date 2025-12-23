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

    // Step 2: Download media file from Meta
    const mediaFileResponse = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!mediaFileResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to download media file from Meta' },
        { status: mediaFileResponse.status }
      )
    }

    // Step 3: Get content type and file buffer
    const contentType = mediaFileResponse.headers.get('content-type') || 'application/octet-stream'
    const arrayBuffer = await mediaFileResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Step 4: Optionally store in database for permanent storage
    if (messageIdParam) {
      try {
        const messageId = parseInt(messageIdParam)
        const message = await prisma.message.findUnique({
          where: { id: messageId },
        })

        // Update message with permanent media URL if needed
        // For now, we'll just return the file
        // In future, could store in cloud storage (S3, etc.)
      } catch {}
    }

    // Return media file
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="media-${mediaId}"`,
        'Cache-Control': 'public, max-age=31536000, immutable', // Cache for 1 year
      },
    })
  } catch (error: any) {
    console.error('Error fetching WhatsApp media:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch media' },
      { status: 500 }
    )
  }
}

