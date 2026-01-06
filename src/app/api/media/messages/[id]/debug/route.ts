import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { getWhatsAppAccessToken } from '@/lib/media/whatsappMedia'
import { hasMedia, getMediaMetadata } from '@/lib/media/storage'
// Debug endpoint - simplified (no resolver needed)

/**
 * GET /api/media/messages/[id]/debug
 * 
 * Debug endpoint to inspect media message resolution and cache status
 * Returns detailed information about message, resolution, and Graph API lookup
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()

    const resolvedParams = await params
    const messageId = parseInt(resolvedParams.id)

    if (isNaN(messageId)) {
      return NextResponse.json(
        { error: 'Invalid message ID' },
        { status: 400 }
      )
    }

    // Fetch message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        type: true,
        providerMediaId: true,
        mediaUrl: true,
        mediaMimeType: true,
        mediaFilename: true,
        mediaSize: true,
        channel: true,
        payload: true,
        rawPayload: true,
        providerMessageId: true,
      },
    })

    if (!message) {
      return NextResponse.json(
        { error: 'Message not found', messageId },
        { status: 404 }
      )
    }

    // Simple resolution: use providerMediaId directly
    const providerMediaId = (message as any).providerMediaId
    const resolvedSource = providerMediaId ? 'providerMediaId' : 'missing'

    // Check cache status (if storage is available)
    let cached = false
    let cachedMetadata = null
    try {
      cached = await hasMedia(messageId)
      cachedMetadata = cached ? await getMediaMetadata(messageId) : null
    } catch (e) {
      // Storage not available or error
    }

    // Check environment variables (boolean only, never leak tokens)
    const token = await getWhatsAppAccessToken()
    const hasMetaToken = !!token

    // Try Graph API lookup if we have providerMediaId and token
    let graphLookup: any = null
    if (providerMediaId && hasMetaToken && token) {
      try {
        const { getWhatsAppDownloadUrl } = await import('@/lib/media/whatsappMedia')
        try {
          const mediaInfo = await getWhatsAppDownloadUrl(providerMediaId, token)
          graphLookup = {
            status: 'success',
            hasUrl: !!mediaInfo.url,
            mimeType: mediaInfo.mimeType,
            fileSize: mediaInfo.fileSize,
            fileName: mediaInfo.fileName,
          }
        } catch (error: any) {
          graphLookup = {
            status: 'error',
            error: error.message,
            errorType: error.constructor.name,
          }
        }
      } catch (error: any) {
        graphLookup = {
          status: 'error',
          error: 'Failed to import getWhatsAppDownloadUrl',
        }
      }
    }

    // Try to extract from rawPayload
    let extractedFromRaw = null
    let rawPayloadStructure = null
    if (message.rawPayload) {
      try {
        const raw = typeof message.rawPayload === 'string' ? JSON.parse(message.rawPayload) : message.rawPayload
        extractedFromRaw = raw.audio?.id || 
                          raw.image?.id || 
                          raw.document?.id || 
                          raw.video?.id ||
                          raw.message?.audio?.id ||
                          raw.message?.image?.id ||
                          null
        rawPayloadStructure = {
          hasAudio: !!raw.audio,
          hasImage: !!raw.image,
          hasDocument: !!raw.document,
          hasVideo: !!raw.video,
          hasMessage: !!raw.message,
          audioKeys: raw.audio ? Object.keys(raw.audio) : [],
          imageKeys: raw.image ? Object.keys(raw.image) : [],
        }
      } catch (e: any) {
        rawPayloadStructure = { parseError: e.message }
      }
    }
    
    // Check ExternalEventLog for recovery
    let externalEventLogInfo: any = null
    if (message.providerMessageId) {
      try {
        const eventLogs = await prisma.externalEventLog.findMany({
          where: {
            provider: 'whatsapp',
            payload: {
              contains: message.providerMessageId,
            },
          },
          orderBy: { receivedAt: 'desc' },
          take: 3,
        })
        externalEventLogInfo = {
          found: eventLogs.length,
          entries: eventLogs.map(log => ({
            id: log.id,
            externalId: log.externalId,
            receivedAt: log.receivedAt,
            payloadPreview: typeof log.payload === 'string' ? log.payload.substring(0, 200) : 'not a string',
          })),
        }
      } catch (e: any) {
        externalEventLogInfo = { error: e.message }
      }
    }

    return NextResponse.json({
      message: {
        id: message.id,
        type: message.type,
        mediaMimeType: (message as any).mediaMimeType,
        providerMessageId: message.providerMessageId,
        providerMediaId: (message as any).providerMediaId, // This is the field from DB
        mediaUrl: message.mediaUrl,
        mediaFilename: (message as any).mediaFilename,
        mediaSize: (message as any).mediaSize,
        channel: message.channel,
      },
      resolution: {
        resolvedSource,
        resolvedProviderMediaId: providerMediaId || null, // This is the ID found by resolver
        extractedFromRawPayload: extractedFromRaw,
        rawPayloadStructure,
        externalEventLog: externalEventLogInfo,
      },
      cache: {
        exists: cached,
        metadata: cachedMetadata,
      },
      environment: {
        hasMetaToken,
        tokenLength: token?.length || 0,
      },
      graphLookup,
    })
  } catch (error: any) {
    console.error('[MEDIA-PROXY-DEBUG] Error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        reason: error.message,
      },
      { status: 500 }
    )
  }
}
