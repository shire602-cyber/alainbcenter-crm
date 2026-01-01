import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/admin/backfill-media-ids
 * Backfill mediaUrl and mediaMimeType for existing messages where mediaUrl is null
 * ADMIN ONLY
 */
export async function POST(req: NextRequest) {
  try {
    // Verify admin access
    const user = await getCurrentUserApi()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('[BACKFILL] Starting media ID backfill...')

    // Find messages with media type but null mediaUrl
    const messagesToBackfill = await prisma.message.findMany({
      where: {
        AND: [
          {
            OR: [
              { type: { in: ['audio', 'image', 'video', 'document'] } },
              { mediaMimeType: { not: null } },
            ],
          },
          { mediaUrl: null },
        ],
      },
      select: {
        id: true,
        type: true,
        mediaMimeType: true,
        rawPayload: true,
        payload: true,
      },
      take: 1000, // Limit to prevent timeout
    })

    console.log(`[BACKFILL] Found ${messagesToBackfill.length} messages to backfill`)

    if (messagesToBackfill.length === 0) {
      return NextResponse.json({
        updated: 0,
        message: 'No messages need backfilling',
      })
    }

    let updated = 0
    let cannotBackfill = 0

    for (const message of messagesToBackfill) {
      let mediaId: string | null = null
      let mimeType: string | null = message.mediaMimeType || null

      // Try to extract from rawPayload (full webhook payload)
      if (message.rawPayload) {
        try {
          const rawPayload = typeof message.rawPayload === 'string' 
            ? JSON.parse(message.rawPayload) 
            : message.rawPayload

          // WhatsApp webhook structure: message.audio.id, message.image.id, etc.
          if (message.type === 'audio' && rawPayload.audio?.id) {
            mediaId = rawPayload.audio.id
            mimeType = rawPayload.audio.mime_type || mimeType
          } else if (message.type === 'image' && rawPayload.image?.id) {
            mediaId = rawPayload.image.id
            mimeType = rawPayload.image.mime_type || mimeType
          } else if (message.type === 'video' && rawPayload.video?.id) {
            mediaId = rawPayload.video.id
            mimeType = rawPayload.video.mime_type || mimeType
          } else if (message.type === 'document' && rawPayload.document?.id) {
            mediaId = rawPayload.document.id
            mimeType = rawPayload.document.mime_type || mimeType
          }
        } catch (e) {
          // rawPayload parse error - skip
        }
      }

      // Try to extract from payload (provider-specific metadata)
      if (!mediaId && message.payload) {
        try {
          const payload = typeof message.payload === 'string'
            ? JSON.parse(message.payload)
            : message.payload

          if (payload.mediaId || payload.media_id || payload.id) {
            mediaId = payload.mediaId || payload.media_id || payload.id
          }
        } catch (e) {
          // payload parse error - skip
        }
      }

      if (mediaId) {
        try {
          await prisma.message.update({
            where: { id: message.id },
            data: {
              mediaUrl: mediaId,
              mediaMimeType: mimeType,
            },
          })
          updated++
          console.log(`[BACKFILL] Updated message ${message.id} with mediaId=${mediaId}`)
        } catch (e: any) {
          console.error(`[BACKFILL] Failed to update message ${message.id}:`, e.message)
        }
      } else {
        cannotBackfill++
        console.log(`[BACKFILL] Cannot backfill message ${message.id}: no media ID in rawPayload or payload`)
      }
    }

    const result = {
      total: messagesToBackfill.length,
      updated,
      cannotBackfill,
      message: cannotBackfill > 0
        ? `Updated ${updated} messages. ${cannotBackfill} messages cannot be backfilled because media ID was never stored in DB.`
        : `Updated ${updated} messages.`,
    }

    console.log(`[BACKFILL] Backfill complete:`, result)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[BACKFILL] Error:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}

