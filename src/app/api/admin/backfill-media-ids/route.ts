import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import { detectMediaType, extractMediaInfo, MEDIA_TYPES } from '@/lib/media/extractMediaId'

/**
 * POST /api/admin/backfill-media-ids
 * Backfill providerMediaId for existing messages using rawPayload/payload/mediaUrl
 * ADMIN ONLY
 * 
 * Query params:
 * - dryRun: if true, don't update (default: false)
 * - limit: batch size (default: 100, max: 1000)
 * - cursor: message ID to start from (for pagination)
 */
export async function POST(req: NextRequest) {
  try {
    // Verify admin access
    const user = await getCurrentUserApi()
    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const dryRun = url.searchParams.get('dryRun') === 'true'
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000)
    const cursorParam = url.searchParams.get('cursor')
    const cursor = cursorParam ? parseInt(cursorParam) : undefined

    console.log('[BACKFILL] Starting media ID backfill...', { dryRun, limit, cursor })

    // Find messages with media type but null providerMediaId
    // Must have rawPayload OR payload OR mediaUrl to extract from
    const messagesToBackfill = await prisma.message.findMany({
      where: {
        AND: [
          {
            OR: [
              { type: { in: Array.from(MEDIA_TYPES) } },
              { mediaMimeType: { not: null } },
            ],
          },
          {
            providerMediaId: null,
          },
          {
            OR: [
              { rawPayload: { not: null } },
              { payload: { not: null } },
              { mediaUrl: { not: null } },
            ],
          },
          cursor ? { id: { gt: cursor } } : {},
        ],
      },
      select: {
        id: true,
        type: true,
        mediaMimeType: true,
        mediaUrl: true,
        rawPayload: true,
        payload: true,
      },
      take: limit,
      orderBy: { id: 'asc' },
    })

    console.log(`[BACKFILL] Found ${messagesToBackfill.length} messages to backfill`)

    if (messagesToBackfill.length === 0) {
      return NextResponse.json({
        updated: 0,
        cannotBackfill: 0,
        dryRun,
        nextCursor: null,
        message: 'No messages need backfilling',
      })
    }

    let updated = 0
    let cannotBackfill = 0
    const errors: Array<{ messageId: number; error: string }> = []

    for (const message of messagesToBackfill) {
      let providerMediaId: string | null = null
      let mediaMimeType: string | null = message.mediaMimeType || null
      let mediaFilename: string | null = null
      let mediaSize: number | null = null
      let mediaCaption: string | null = null
      let detectedMediaType: string | null = null // Store detected type for potential type correction

      // PRIORITY 1: Try to extract from rawPayload (full webhook payload)
      if (message.rawPayload) {
        try {
          const rawPayload = typeof message.rawPayload === 'string' 
            ? JSON.parse(message.rawPayload) 
            : message.rawPayload

          // Handle different rawPayload structures:
          // 1. Direct message object: { audio: { id: '...' }, image: { id: '...' }, ... }
          // 2. Wrapped in entry structure: { entry: [{ changes: [{ value: { messages: [{...}] } }] }] } }
          // 3. Wrapped message object: { message: { audio: { id: '...' }, ... } }
          
          let messageObj = rawPayload
          
          // Extract message from entry structure
          if (rawPayload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            messageObj = rawPayload.entry[0].changes[0].value.messages[0]
          } else if (rawPayload.message) {
            messageObj = rawPayload.message
          }

          // Detect media type from message object (uses same logic as inbound webhook)
          const detectedType = detectMediaType(messageObj)
          detectedMediaType = detectedType // Store for potential type correction
          
          // Use extractMediaInfo if it's a media type
          if (MEDIA_TYPES.has(detectedType)) {
            const mediaInfo = extractMediaInfo(messageObj, detectedType)
            providerMediaId = mediaInfo.providerMediaId
            mediaMimeType = mediaInfo.mediaMimeType || mediaMimeType
            mediaFilename = mediaInfo.filename
            mediaSize = mediaInfo.mediaSize
            mediaCaption = mediaInfo.caption
          }
        } catch (e: any) {
          console.warn(`[BACKFILL] Failed to parse rawPayload for message ${message.id}:`, e.message)
          errors.push({ messageId: message.id, error: `rawPayload parse error: ${e.message}` })
        }
      }

      // PRIORITY 2: Try to extract from payload (structured metadata)
      if (!providerMediaId && message.payload) {
        try {
          const payload = typeof message.payload === 'string'
            ? JSON.parse(message.payload)
            : message.payload

          // Check payload.media.id (structured format)
          if (payload.media?.id) {
            providerMediaId = payload.media.id
            mediaMimeType = payload.media.mimeType || payload.mimeType || mediaMimeType
            mediaFilename = payload.media.filename || payload.filename || null
            mediaCaption = payload.media.caption || payload.caption || null
          } 
          // Check legacy payload fields
          else if (payload.providerMediaId || payload.mediaId || payload.media_id || payload.id) {
            providerMediaId = payload.providerMediaId || payload.mediaId || payload.media_id || payload.id
            mediaMimeType = payload.mimeType || payload.mediaMimeType || mediaMimeType
            mediaFilename = payload.filename || payload.mediaFilename || null
            mediaSize = payload.mediaSize || payload.size || null
            mediaCaption = payload.caption || payload.mediaCaption || null
          }
        } catch (e: any) {
          console.warn(`[BACKFILL] Failed to parse payload for message ${message.id}:`, e.message)
          errors.push({ messageId: message.id, error: `payload parse error: ${e.message}` })
        }
      }

      // PRIORITY 3: Use mediaUrl as fallback (if it's a media ID, not a URL)
      if (!providerMediaId && message.mediaUrl) {
        const mediaUrl = message.mediaUrl.trim()
        // Check if it looks like a Meta media ID (alphanumeric, no slashes, no http)
        if (mediaUrl && 
            !mediaUrl.startsWith('http') && 
            !mediaUrl.startsWith('/') &&
            mediaUrl.length > 0 && 
            mediaUrl.length < 500 &&
            !mediaUrl.includes(' ')) {
          providerMediaId = mediaUrl
        }
      }

      if (providerMediaId) {
        try {
          const updateData: any = {
            providerMediaId,
            // Keep mediaUrl for backward compatibility (set to providerMediaId if null)
            mediaUrl: message.mediaUrl || providerMediaId,
          }
          
          if (mediaMimeType) {
            updateData.mediaMimeType = mediaMimeType
          }
          
          if (mediaFilename) {
            updateData.mediaFilename = mediaFilename
          }
          
          if (mediaSize && mediaSize > 0) {
            updateData.mediaSize = mediaSize
          }
          
          // Note: mediaCaption is not in schema - captions are stored in body or payload
          // CRITICAL: Fix message.type if currently incorrect/unknown (if safe)
          // Only update type if:
          // 1. We detected a valid media type (in MEDIA_TYPES)
          // 2. Current type is NOT already correct
          // 3. Current type is 'text' or not in MEDIA_TYPES (safe to change)
          if (detectedMediaType && MEDIA_TYPES.has(detectedMediaType)) {
            const currentType = message.type?.toLowerCase()
            const needsTypeFix = !currentType || 
                                 currentType === 'text' || 
                                 !MEDIA_TYPES.has(currentType) ||
                                 currentType !== detectedMediaType
            
            if (needsTypeFix) {
              updateData.type = detectedMediaType
              console.log(`[BACKFILL] ${dryRun ? '[DRY-RUN] ' : ''}Fixing message ${message.id} type: ${currentType || 'unknown'} -> ${detectedMediaType}`)
            }
          }

          if (!dryRun) {
            await prisma.message.update({
              where: { id: message.id },
              data: updateData,
            })
          }
          
          updated++
          console.log(`[BACKFILL] ${dryRun ? '[DRY-RUN] ' : ''}Updated message ${message.id} with providerMediaId=${providerMediaId}`)
        } catch (e: any) {
          console.error(`[BACKFILL] Failed to update message ${message.id}:`, e.message)
          errors.push({ messageId: message.id, error: `update error: ${e.message}` })
        }
      } else {
        cannotBackfill++
        console.log(`[BACKFILL] Cannot backfill message ${message.id}: no media ID found in rawPayload/payload/mediaUrl`)
      }
    }

    const nextCursor = messagesToBackfill.length > 0 
      ? messagesToBackfill[messagesToBackfill.length - 1].id 
      : null

    const result = {
      total: messagesToBackfill.length,
      updated,
      cannotBackfill,
      errors: errors.length > 0 ? errors : undefined,
      dryRun,
      nextCursor,
      message: dryRun
        ? `[DRY-RUN] Would update ${updated} messages. ${cannotBackfill} messages cannot be backfilled.`
        : cannotBackfill > 0
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