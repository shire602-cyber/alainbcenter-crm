/**
 * GET /api/leads/[id]/messages
 * 
 * Fetch messages for a lead, optionally filtered by channel
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { hasMedia } from '@/lib/media/mediaTypeDetection'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuthApi()
    const resolvedParams = await params
    const leadId = parseInt(resolvedParams.id)

    if (isNaN(leadId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid lead ID' },
        { status: 400 }
      )
    }

    // Get optional channel filter from query params
    const searchParams = req.nextUrl.searchParams
    const channel = searchParams.get('channel')?.toLowerCase()

    // Verify lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    })

    if (!lead) {
      return NextResponse.json(
        { ok: false, error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Build where clause
    const where: any = {
      leadId,
    }

    if (channel) {
      // If channel specified, filter by channel
      where.channel = channel
    }

    // Fetch messages - PHASE 5A: Include BOTH inbound and outbound, with attachments
    const messages = await prisma.message.findMany({
      where,
      include: {
        conversation: {
          include: {
            contact: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        statusEvents: {
          orderBy: {
            receivedAt: 'desc',
          },
          take: 1, // Get latest status
        },
        attachments: {
          select: {
            id: true,
            type: true,
            url: true,
            mimeType: true,
            filename: true,
            sizeBytes: true,
            thumbnailUrl: true,
            durationSec: true,
            createdAt: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc', // Oldest first - chronological order
      },
    })

    // Format response - PHASE 5A: Include all media fields
    const formattedMessages = messages.map((msg) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/a9581599-2981-434f-a784-3293e02077df',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/leads/[id]/messages/route.ts:102',message:'Formatting message',data:{messageId:msg.id,type:msg.type,mediaUrl:msg.mediaUrl,mediaMimeType:msg.mediaMimeType,hasAttachments:!!(msg.attachments&&msg.attachments.length>0),attachmentsCount:msg.attachments?.length||0,body:msg.body?.substring(0,50)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'K'})}).catch(()=>{});
      // #endregion
      // PHASE 3: Generate mediaProxyUrl if media is available
      // mediaUrl stores WhatsApp media ID (providerMediaId), not a URL
      // FIX: Use centralized media detection logic
      const hasMediaResult = hasMedia(msg.type, msg.mediaMimeType)
      const hasProviderMediaId = !!msg.mediaUrl && msg.mediaUrl.trim() !== '' // For WhatsApp, mediaUrl is the media ID
      // CRITICAL FIX: Always set mediaProxyUrl if hasMedia, even if mediaUrl is null
      // The proxy will try to recover from rawPayload/ExternalEventLog
      // This allows old messages to potentially recover media IDs
      const mediaRenderable = hasMediaResult // Remove hasProviderMediaId requirement - let proxy try recovery
      const mediaProxyUrl = hasMediaResult ? `/api/media/messages/${msg.id}` : null

      return {
      id: msg.id,
      direction: msg.direction, // INBOUND | OUTBOUND
      channel: msg.channel,
      type: msg.type || 'text', // text | image | document | audio | video
      body: msg.body,
      mediaUrl: msg.mediaUrl, // Stores providerMediaId for WhatsApp
      mediaMimeType: msg.mediaMimeType,
      mediaFilename: (msg as any).mediaFilename || null, // FIX: Include mediaFilename for document downloads
      mediaSize: (msg as any).mediaSize || null, // FIX: Include mediaSize for file size display
      mediaProxyUrl: mediaProxyUrl, // PHASE 3: Proxy URL for secure media access
      mediaRenderable: mediaRenderable, // PHASE 3: Whether media can be rendered via proxy
      providerMessageId: msg.providerMessageId, // WhatsApp message ID if any
      status: msg.status,
      sentAt: msg.sentAt,
      deliveredAt: msg.deliveredAt,
      readAt: msg.readAt,
      createdAt: msg.createdAt,
      createdBy: msg.createdByUser
        ? {
            id: msg.createdByUser.id,
            name: msg.createdByUser.name,
            email: msg.createdByUser.email,
          }
        : null,
      latestStatus: msg.statusEvents[0]
        ? {
            status: msg.statusEvents[0].status,
            providerStatus: msg.statusEvents[0].providerStatus,
            receivedAt: msg.statusEvents[0].receivedAt,
          }
        : null,
      // PHASE 5B: Include attachments
      attachments: msg.attachments.map((att) => ({
        id: att.id,
        type: att.type,
        url: att.url,
        mimeType: att.mimeType,
        filename: att.filename,
        sizeBytes: att.sizeBytes,
        thumbnailUrl: att.thumbnailUrl,
        durationSec: att.durationSec,
        createdAt: att.createdAt,
      })),
      }
    })

    return NextResponse.json({
      ok: true,
      messages: formattedMessages,
      total: formattedMessages.length,
    })
  } catch (error: any) {
    console.error('Error fetching messages:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


















