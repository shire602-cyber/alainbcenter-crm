import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/debug/media/probe?messageId=123
 * Debug endpoint to probe media URL and verify proxy works
 * ADMIN ONLY
 */
export async function GET(req: NextRequest) {
  try {
    // Verify admin access
    const user = await getCurrentUserApi()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const messageIdParam = req.nextUrl.searchParams.get('messageId')
    if (!messageIdParam) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 })
    }

    const messageId = parseInt(messageIdParam)
    if (isNaN(messageId)) {
      return NextResponse.json({ error: 'Invalid messageId' }, { status: 400 })
    }

    // Fetch message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        mediaUrl: true,
        mediaMimeType: true,
        type: true,
        rawPayload: true,
      },
    })

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    if (!message.mediaUrl) {
      return NextResponse.json({
        messageId: message.id,
        conversationId: message.conversationId,
        mediaUrl: null,
        mimeType: message.mediaMimeType,
        error: 'mediaUrl is null - cannot probe',
      })
    }

    // Compute proxy URL (use main media proxy endpoint)
    const proxyUrl = `/api/media/messages/${messageId}`

    // Probe HEAD request
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000'
    const fullProxyUrl = `${baseUrl}${proxyUrl}`

    let headResult: any = null
    let getResult: any = null

    try {
      // HEAD request (forward auth cookie)
      const cookieHeader = req.headers.get('cookie') || ''
      const headRes = await fetch(fullProxyUrl, {
        method: 'HEAD',
        headers: {
          'Cookie': cookieHeader,
        },
      })

      headResult = {
        status: headRes.status,
        headers: {
          'content-type': headRes.headers.get('content-type'),
          'accept-ranges': headRes.headers.get('accept-ranges'),
          'content-range': headRes.headers.get('content-range'),
          'content-length': headRes.headers.get('content-length'),
        },
      }

      // GET request (first 64KB only, forward auth cookie)
      const getRes = await fetch(fullProxyUrl, {
        method: 'GET',
        headers: {
          'Cookie': cookieHeader,
          'Range': 'bytes=0-65535', // First 64KB
        },
      })

      const arrayBuffer = await getRes.arrayBuffer()
      const byteLength = arrayBuffer.byteLength

      getResult = {
        status: getRes.status,
        headers: {
          'content-type': getRes.headers.get('content-type'),
          'accept-ranges': getRes.headers.get('accept-ranges'),
          'content-range': getRes.headers.get('content-range'),
          'content-length': getRes.headers.get('content-length'),
        },
        byteLength,
      }
    } catch (error: any) {
      return NextResponse.json({
        messageId: message.id,
        conversationId: message.conversationId,
        mediaUrl: message.mediaUrl,
        mimeType: message.mediaMimeType,
        proxyUrl,
        error: error.message,
      })
    }

    return NextResponse.json({
      messageId: message.id,
      conversationId: message.conversationId,
      mediaUrl: message.mediaUrl,
      mimeType: message.mediaMimeType,
      proxyUrl,
      head: headResult,
      get: getResult,
    })
  } catch (error: any) {
    console.error('[DEBUG] Error probing media:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

