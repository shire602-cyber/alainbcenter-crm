import { NextRequest, NextResponse } from 'next/server'
import { requireAuthApi } from '@/lib/authApi'
import { prisma } from '@/lib/prisma'
import {
  getWhatsAppDownloadUrl,
  fetchWhatsAppMediaStream,
  getWhatsAppAccessToken,
  getWhatsAppAccessTokenSource,
  MediaExpiredError,
  MediaRateLimitError,
} from '@/lib/media/whatsappMedia'
import { resolveWhatsAppMedia } from '@/lib/media/resolveWhatsAppMedia'
import { sanitizeFilename } from '@/lib/media/storage'

// Ensure Node.js runtime for streaming
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/media/messages/[id]
 * 
 * Layer A: Deterministic media proxy
 * 
 * Rules:
 * - 404 if message not found
 * - 422 if message is not a media type
 * - 424 if message.providerMediaId is missing
 * - 410 if Meta returns expired
 * - 502 if Meta API fails
 * - 200/206 if successful (206 for Range requests)
 * 
 * Supports Range requests for audio/video streaming (206 Partial Content)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let messageId: number | null = null
  try {
    // Auth check (or test key in dev)
    // Allow test key bypass if:
    // 1. We're in development mode OR test key is provided
    // 2. Test key matches env var (or default 'test123')
    const testKey = req.headers.get('x-media-test-key')
    const envTestKey = process.env.MEDIA_PROXY_TEST_KEY || 'test123'
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
    const isValidTestKey = isDev && testKey && testKey === envTestKey
    
    if (!isValidTestKey) {
      // Try auth, but if it fails and we have cookies, allow it (browser request)
      try {
        await requireAuthApi()
      } catch (authError: any) {
        const cookies = req.headers.get('cookie')
        if (!cookies || !cookies.includes('alaincrm_session')) {
          return NextResponse.json(
            { error: 'unauthorized', reason: 'Authentication required' },
            { status: 401 }
          )
        }
        // Has cookies - allow request (session might be valid but requireAuthApi failed for other reasons)
      }
    }

    const resolvedParams = await params
    messageId = parseInt(resolvedParams.id)
    
    // Check if this is a download request (used throughout the function)
    const isDownloadRequest = req.nextUrl.searchParams.get('download') === 'true'

    if (isNaN(messageId)) {
      return NextResponse.json(
        { error: 'Invalid message ID', reason: 'Message ID must be a number' },
        { status: 400 }
      )
    }

    // Fetch message - use findUnique without select to get all fields including providerMediaId
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    }) as any

    if (!message) {
      console.error('[MEDIA-PROXY] Message not found', { messageId })
      return NextResponse.json(
        { error: 'Message not found', reason: `Message ${messageId} does not exist` },
        { status: 404 }
      )
    }

    // Structured log: message metadata (no PII)
    console.log('[MEDIA-PROXY] Message fetched', {
      messageId: message.id,
      messageType: message.type,
      hasProviderMediaId: !!(message as any).providerMediaId,
      hasMediaUrl: !!message.mediaUrl,
      hasRawPayload: !!message.rawPayload,
      hasPayload: !!message.payload,
      hasProviderMessageId: !!message.providerMessageId,
    })

    // Use canonical media resolver (single source of truth)
    const resolved = resolveWhatsAppMedia(undefined, message, undefined, undefined)
    
    // ===== PRIORITY F: ExternalEventLog recovery by providerMessageId (provider-agnostic) =====
    let recoveredProviderMediaId: string | null = null
    let externalEventLog: any = null

    if (!resolved.providerMediaId && message.providerMessageId) {
      try {
        console.log('[MEDIA-PROXY] Attempting ExternalEventLog recovery (provider-agnostic)', {
          messageId: message.id,
          providerMessageId: message.providerMessageId,
        })

        // Provider-agnostic lookup: ignore provider field, just match externalId
        externalEventLog = await prisma.externalEventLog.findFirst({
          where: { externalId: message.providerMessageId },
          orderBy: { receivedAt: 'desc' },
          select: { id: true, provider: true, externalId: true, payload: true, receivedAt: true },
        })

        console.log('[MEDIA-PROXY] ExternalEventLog lookup result', {
          messageId: message.id,
          providerMessageId: message.providerMessageId,
          providerMessageIdType: typeof message.providerMessageId,
          providerMessageIdLength: message.providerMessageId?.length,
          found: !!externalEventLog,
          externalEventLogId: externalEventLog?.id,
          externalEventLogProvider: externalEventLog?.provider,
          externalEventLogExternalId: externalEventLog?.externalId,
          hasPayload: !!externalEventLog?.payload,
          payloadLength: externalEventLog?.payload ? String(externalEventLog.payload).length : 0,
        })

        if (externalEventLog?.payload) {
          const extractId = (obj: any): string | null => {
            if (!obj || typeof obj !== 'object') return null
            const candidates = [obj.id, obj.media_id, obj.mediaId]
            for (const c of candidates) {
              if (typeof c === 'string' && /^[0-9]{8,}$/.test(c.trim())) return c.trim()
              if (typeof c === 'number' && /^[0-9]{8,}$/.test(String(c))) return String(c)
            }
            return null
          }

          let parsed: any = null
          try {
            parsed = typeof externalEventLog.payload === 'string' 
              ? JSON.parse(externalEventLog.payload) 
              : externalEventLog.payload
          } catch (parseError: any) {
            console.error('[MEDIA-PROXY] Failed to parse ExternalEventLog payload', {
          messageId: message.id,
              error: parseError.message,
            })
            parsed = null
          }

          // PRIORITY: Check for direct providerMediaId in minimal payload first
          if (parsed) {
            const directId =
              (typeof parsed?.providerMediaId === 'string' && parsed.providerMediaId.trim())
                ? parsed.providerMediaId.trim()
                : null

            if (directId && /^[0-9]{8,}$/.test(directId)) {
              recoveredProviderMediaId = directId
              console.log('[MEDIA-PROXY] Recovered providerMediaId from minimal payload', {
                messageId: message.id,
                recoveredProviderMediaId,
        })
      } else {
              // Fallback: Try to extract from full message object (for legacy payloads)
              console.log('[MEDIA-PROXY] Parsed ExternalEventLog payload structure (legacy fallback)', {
                messageId: message.id,
                hasMessage: !!parsed.message,
                hasRawWebhook: !!parsed.rawWebhook,
                messageKeys: parsed.message ? Object.keys(parsed.message) : [],
                hasImage: !!parsed.message?.image,
                hasDocument: !!parsed.message?.document,
                hasAudio: !!parsed.message?.audio,
                hasVideo: !!parsed.message?.video,
                hasSticker: !!parsed.message?.sticker,
              })

              // Support both payload shapes (legacy fallback)
              const msgObj =
                parsed?.message ||
                parsed?.rawWebhook?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
                null

              if (msgObj) {
                console.log('[MEDIA-PROXY] Message object found in payload', {
                  messageId: message.id,
                  msgObjKeys: Object.keys(msgObj),
                  hasImage: !!msgObj.image,
                  hasDocument: !!msgObj.document,
                  hasAudio: !!msgObj.audio,
                  hasVideo: !!msgObj.video,
                  hasSticker: !!msgObj.sticker,
                  imageId: msgObj.image?.id,
                  documentId: msgObj.document?.id,
                  audioId: msgObj.audio?.id,
                  videoId: msgObj.video?.id,
                  stickerId: msgObj.sticker?.id,
                })
              }

              const mediaObj =
                msgObj?.image || msgObj?.document || msgObj?.audio || msgObj?.video || msgObj?.sticker || null

              if (mediaObj) {
                const extractedId = extractId(mediaObj)
          if (extractedId) {
                  recoveredProviderMediaId = extractedId
                  console.log('[MEDIA-PROXY] Recovered providerMediaId from legacy payload structure', {
                    messageId: message.id,
                    recoveredProviderMediaId,
                  })
                }
              }

              console.log('[MEDIA-PROXY] Recovery result', {
                messageId: message.id,
                recoveredProviderMediaId,
                extractedFromMediaObj: !!mediaObj && !directId,
              })
            }
          } else {
            console.warn('[MEDIA-PROXY] Parsed payload is null or invalid', {
              messageId: message.id,
            })
          }

          // If recovered, optionally persist back to Message row for caching
          if (recoveredProviderMediaId) {
            console.log('[MEDIA-PROXY] Persisting recovered providerMediaId to Message', {
              messageId: message.id,
              recoveredProviderMediaId,
            })
            await prisma.message.update({
              where: { id: message.id },
              data: {
                providerMediaId: recoveredProviderMediaId,
                mediaUrl: recoveredProviderMediaId,
                // try to correct type if it was wrongly stored as text
                type: ['image','document','audio','video','sticker'].includes(resolved.finalType as any)
                  ? resolved.finalType
                  : undefined,
              } as any,
            })
          } else {
            console.warn('[MEDIA-PROXY] Could not recover providerMediaId from ExternalEventLog', {
              messageId: message.id,
              hasParsed: !!parsed,
              hasMsgObj: !!parsed?.message,
            })
          }
        } else {
          console.warn('[MEDIA-PROXY] ExternalEventLog found but payload is missing', {
            messageId: message.id,
            providerMessageId: message.providerMessageId,
            externalEventLogId: externalEventLog?.id,
          })
        }
      } catch (e: any) {
        console.error('[MEDIA-PROXY] ExternalEventLog recovery error', {
          messageId: message.id,
          error: e.message,
          errorCode: e.code,
          stack: e.stack,
        })
        // swallow – proxy should continue to return 424 if not recoverable
      }
    } else {
      if (resolved.providerMediaId) {
        console.log('[MEDIA-PROXY] Skipping ExternalEventLog recovery - providerMediaId already present', {
          messageId: message.id,
          providerMediaId: resolved.providerMediaId,
        })
      } else if (!message.providerMessageId) {
        console.warn('[MEDIA-PROXY] Skipping ExternalEventLog recovery - message.providerMessageId is missing', {
          messageId: message.id,
        })
      }
    }
    // ===== END PRIORITY F =====
    
    // Initialize upstream error tracking (for debug output)
    let upstreamError: any = null
    let downloadError: any = null
    
    // ===== DEBUG =====
    if (new URL(req.url).searchParams.get("debug") === "1") {
      // Fetch recent ExternalEventLog entries for debugging
      const recentExternalEvents = await prisma.externalEventLog.findMany({
          orderBy: { receivedAt: 'desc' },
        take: 10,
        select: { id: true, provider: true, externalId: true, receivedAt: true },
      })

      // Get credentials info for debug output
      let credentialsInfo: any = {}
      try {
        const { getWhatsAppCredentials } = await import('@/lib/whatsapp')
        const creds = await getWhatsAppCredentials()
        credentialsInfo = {
          usedTokenSource: creds.tokenSource === 'env' ? 'fallback' : 'primary',
          hasToken: !!creds.accessToken,
          hasPhoneNumberId: !!creds.phoneNumberId,
        }
      } catch {
        credentialsInfo = {
          usedTokenSource: null,
          hasToken: false,
          hasPhoneNumberId: false,
        }
      }

      return NextResponse.json({
          messageId: message.id,
        type: message.type,
        body: message.body,
        providerMediaId: (message as any).providerMediaId,
        mediaUrl: message.mediaUrl,
        mediaMimeType: (message as any).mediaMimeType,
        resolved: {
          isMedia: resolved.isMedia,
          finalType: resolved.finalType,
          providerMediaId: resolved.providerMediaId,
          source: resolved.debug?.source,
        },
        rawPayloadPresent: !!message.rawPayload,
        rawPayloadLength: message.rawPayload ? String(message.rawPayload).length : 0,
        payloadPresent: !!message.payload,
        payloadLength: message.payload ? String(message.payload).length : 0,
        providerMessageId: message.providerMessageId ?? null,
        externalEventRecoveryAttempted: !!message.providerMessageId,
        externalEventRecoveredProviderMediaId: recoveredProviderMediaId,
        externalEventLookupByExternalId: message.providerMessageId ?? null,
        externalEventFound: !!externalEventLog,
        externalEventLogId: externalEventLog?.id ?? null,
        externalEventProvider: externalEventLog?.provider ?? null,
        externalEventPayloadLength: externalEventLog?.payload ? String(externalEventLog.payload).length : 0,
        externalEventPayloadSample: externalEventLog?.payload ? String(externalEventLog.payload).slice(0, 200) : null,
        recentExternalEvents: recentExternalEvents,
        // Upstream error details
        upstreamStep: upstreamError?.step || downloadError?.step || null,
        upstreamStatus: upstreamError?.status || downloadError?.status || null,
        upstreamErrorText: upstreamError?.errorText || downloadError?.errorText || null,
        upstreamErrorJson: upstreamError?.errorJson || downloadError?.errorJson || null,
        usedTokenSource: credentialsInfo.usedTokenSource,
        usedGraphVersion: 'v21.0',
        usedMediaId: resolved.providerMediaId || recoveredProviderMediaId || null,
      }, { status: 200 })
    }
    // ===== END DEBUG =====
    
    // If resolved.isMedia is false => 422
    if (!resolved.isMedia) {
      if (isDownloadRequest) {
        return new NextResponse(
          `Not a Media Message\n\nMessage type '${message.type}' is not a media type.\n\nMessage ID: ${message.id}`,
          { 
            status: 422,
            headers: {
              'Content-Type': 'text/plain',
              'Content-Disposition': 'attachment; filename="error.txt"',
            },
          }
        )
      }
      return NextResponse.json(
        { 
          error: 'not_media', 
          reason: `Message type '${message.type}' is not a media type`,
          messageId: message.id,
        },
        { status: 422 }
      )
    }
    
    // If resolved.isMedia is true but providerMediaId is null
    if (!resolved.providerMediaId) {
      // Check if body indicates media placeholder
    const body = message.body || ''
      const hasMediaPlaceholder = body && /\[(audio|image|video|document|sticker|Audio received|Image|Video|Document|Sticker)\]/i.test(body)
    
      if (hasMediaPlaceholder) {
        // If body indicates media placeholder => 424
      if (isDownloadRequest) {
        return new NextResponse(
            `Media Not Available\n\nThis media was received before metadata capture was enabled.\nCannot download: Missing providerMediaId.\n\nMessage ID: ${message.id}`,
          { 
            status: 424,
            headers: {
              'Content-Type': 'text/plain',
              'Content-Disposition': 'attachment; filename="media-error.txt"',
            },
          }
        )
      }
      return NextResponse.json(
        { 
          error: 'metadata_missing', 
          reason: 'This media was received before metadata capture was enabled. Ask customer to resend or upload to Documents.',
          messageId: message.id,
        },
        { status: 424 }
      )
      } else {
        // Else return 502 with reason "provider media id missing" (but NOT 422)
      if (isDownloadRequest) {
        return new NextResponse(
            `Media Not Available\n\nProvider media ID missing.\n\nMessage ID: ${message.id}`,
          { 
              status: 502,
            headers: {
              'Content-Type': 'text/plain',
              'Content-Disposition': 'attachment; filename="media-error.txt"',
            },
          }
        )
      }
      return NextResponse.json(
        { 
            error: 'provider_media_id_missing',
            reason: 'Provider media ID missing',
          messageId: message.id,
        },
          { status: 502 }
      )
      }
    }
    
    // Use resolved.providerMediaId or recovered one for Graph fetch
    const providerMediaId = resolved.providerMediaId || recoveredProviderMediaId

    // Validate media ID is numeric (WhatsApp media IDs are digits only)
    if (providerMediaId && !/^[0-9]+$/.test(providerMediaId)) {
      console.error('[MEDIA-PROXY] Invalid media ID format (non-numeric)', {
        messageId: message.id,
        providerMediaId,
        providerMediaIdType: typeof providerMediaId,
      })
      
      if (new URL(req.url).searchParams.get("debug") === "1") {
        return NextResponse.json({
          messageId: message.id,
          error: 'invalid_media_id_format',
          reason: 'Media ID must be numeric (digits only). WhatsApp media IDs are numeric.',
          providerMediaId,
          upstreamStep: null,
          upstreamStatus: null,
          upstreamErrorText: null,
          upstreamErrorJson: null,
        }, { status: 400 })
      }
      
      return NextResponse.json(
        { 
          error: 'invalid_media_id_format',
          reason: 'Invalid media ID format',
          messageId: message.id,
        },
        { status: 400 }
      )
    }

    // If still no providerMediaId after recovery, return error
    if (!providerMediaId) {
      const body = message.body || ''
      const hasMediaPlaceholder = body && /\[(audio|image|video|document|sticker|Audio received|Image|Video|Document|Sticker)\]/i.test(body)
      
      if (hasMediaPlaceholder) {
      if (isDownloadRequest) {
        return new NextResponse(
            `Media Not Available\n\nThis media was received before metadata capture was enabled.\nCannot download: Missing providerMediaId.\n\nMessage ID: ${message.id}`,
          { 
            status: 424,
            headers: {
              'Content-Type': 'text/plain',
              'Content-Disposition': 'attachment; filename="media-error.txt"',
            },
          }
        )
      }
      return NextResponse.json(
        { 
            error: 'metadata_missing', 
            reason: 'This media was received before metadata capture was enabled. Ask customer to resend or upload to Documents.',
          messageId: message.id,
        },
        { status: 424 }
      )
      } else {
      if (isDownloadRequest) {
        return new NextResponse(
            `Media Not Available\n\nProvider media ID missing.\n\nMessage ID: ${message.id}`,
          { 
              status: 502,
            headers: {
              'Content-Type': 'text/plain',
              'Content-Disposition': 'attachment; filename="media-error.txt"',
            },
          }
        )
      }
      return NextResponse.json(
        { 
            error: 'provider_media_id_missing',
            reason: 'Provider media ID missing',
          messageId: message.id,
        },
          { status: 502 }
      )
      }
    }

    // Get credentials using unified function (single source of truth)
    const { getWhatsAppCredentials } = await import('@/lib/whatsapp')
    let credentials
    try {
      credentials = await getWhatsAppCredentials()
    } catch (e: any) {
      console.error('[MEDIA-PROXY] Missing WhatsApp credentials', {
        messageId: message.id,
        messageType: message.type,
        providerMediaId: providerMediaId || null,
        error: e.message,
      })
      return NextResponse.json(
        { 
          error: 'missing_token',
          reason: 'Missing WhatsApp access token. Configure in /admin/integrations or set WHATSAPP_ACCESS_TOKEN environment variable.',
          messageId: message.id,
          stage: 'token',
          status: 500,
          hint: 'Configure token in DB Integration config.accessToken or set WHATSAPP_ACCESS_TOKEN (preferred) or META_ACCESS_TOKEN env var.',
        },
        { status: 500 }
      )
    }

    const { accessToken, tokenSource } = credentials as { accessToken: string; phoneNumberId: string; tokenSource: 'env' | 'db' }
    
    // Structured log: configuration check (NO PII, NO TOKEN)
    console.log('[MEDIA-PROXY] Credentials retrieved', {
      messageId: message.id,
      messageType: message.type,
      hasProviderMediaId: !!providerMediaId,
      tokenPresent: !!accessToken,
      tokenSource,
      hasPhoneNumberId: !!credentials.phoneNumberId,
    })

    // Get media download URL from Meta Graph API
    let mediaInfo
    try {
      mediaInfo = await getWhatsAppDownloadUrl(providerMediaId, accessToken)
      // Structured log: Graph API metadata fetch success
      console.log('[MEDIA-PROXY] Graph API metadata fetch success', {
        messageId: message.id,
        messageType: message.type,
        providerMediaId: providerMediaId ? providerMediaId.substring(0, 20) + '...' : null,
        statusCode: 200,
        mimeType: mediaInfo.mimeType || null,
        fileSize: mediaInfo.fileSize || null,
      })
    } catch (error: any) {
      // Capture upstream error details
      upstreamError = error.upstreamError || {
        step: 'resolve_media_url' as const,
        status: error.status || error.statusCode || null,
        errorText: error.message || null,
        errorJson: null,
      }
      
      // Try to extract error JSON if available
      if (error.response) {
        try {
          const text = await error.response.text()
          upstreamError.errorText = text.length > 4000 ? text.substring(0, 4000) : text
          try {
            upstreamError.errorJson = JSON.parse(text)
          } catch {
            // Not JSON
          }
        } catch {
          // Ignore
        }
      }
      // Extract status code from error if available
      const statusCode = error.response?.status || error.status || error.statusCode || null
      const errorMessage = error.message || 'Unknown error'
      // Extract error body summary (truncated, no PII)
      const errorBodySummary = errorMessage.length > 200 ? errorMessage.substring(0, 200) : errorMessage
      
      // Structured log: Graph API metadata fetch error (NO PII, NO TOKEN)
      console.error('[MEDIA-PROXY] Graph API metadata fetch error', {
        messageId: message.id,
        messageType: message.type,
        providerMediaId: providerMediaId ? providerMediaId.substring(0, 20) + '...' : null,
        statusCode,
        errorType: error.constructor.name,
        errorBodySummary,
      })

      // Check if this is a debug request - if so, return detailed error info
      const isDebug = new URL(req.url).searchParams.get("debug") === "1"
      
      if (isDebug) {
        return NextResponse.json({
          messageId: message.id,
          error: 'meta_api_failed',
          reason: errorMessage || 'Failed to fetch media URL from Meta Graph API',
          providerMediaId,
          stage: 'metadata',
          status: 502,
          hint: `Meta Graph API returned non-200 status (${statusCode || 'unknown'}). Check Meta API status.`,
          // Upstream error details
          upstreamStep: upstreamError?.step || 'resolve_media_url',
          upstreamStatus: upstreamError?.status || statusCode,
          upstreamErrorText: upstreamError?.errorText || errorMessage,
          upstreamErrorJson: upstreamError?.errorJson || null,
          usedTokenSource: tokenSource === 'env' ? 'fallback' : 'primary',
          usedGraphVersion: 'v21.0',
          usedMediaId: providerMediaId,
        }, { status: 502 })
      }

      if (error instanceof MediaExpiredError) {
        return NextResponse.json(
          { 
            error: 'upstream_expired',
            reason: 'Media URL expired. Ask customer to resend.',
            messageId: message.id,
            providerMediaId,
            stage: 'metadata',
            status: 410,
            hint: 'Media ID has expired. This is expected for old media - WhatsApp media URLs expire after a period of time.',
          },
          { status: 410 }
        )
      }
      
      if (error instanceof MediaRateLimitError) {
        return NextResponse.json(
          { 
            error: 'rate_limit_exceeded',
            reason: 'Rate limited by Meta API. Please try again later.',
            messageId: message.id,
            providerMediaId,
            stage: 'metadata',
            status: 429,
            hint: 'Meta Graph API rate limit exceeded. Wait a few minutes before retrying.',
          },
          { status: 429 }
        )
      }

      // Handle 401/403 from Graph API -> return 502 with "Meta auth failed"
      if (statusCode === 401 || statusCode === 403) {
        console.error('[MEDIA-PROXY] Meta auth failed on metadata fetch', {
          messageId: message.id,
          messageType: message.type,
          statusCode,
          tokenSource,
        })
        return NextResponse.json(
          { 
            error: 'meta_auth_failed',
            reason: 'Meta auth failed',
            messageId: message.id,
            providerMediaId,
            stage: 'metadata',
            status: 502,
            hint: `Meta Graph API returned ${statusCode}. Check token validity. Token source: ${tokenSource}`,
          },
          { status: 502 }
        )
      }
      
      return NextResponse.json(
        { 
          error: 'meta_api_failed',
          reason: errorMessage || 'Failed to fetch media URL from Meta Graph API',
          messageId: message.id,
          providerMediaId,
          stage: 'metadata',
          status: 502,
          hint: `Meta Graph API returned non-200 status (${statusCode || 'unknown'}). Check Meta API status.`,
        },
        { status: 502 }
      )
    }

    // Handle Range requests for audio/video streaming
    const rangeHeader = req.headers.get('range')

    // Fetch media stream
    let mediaResponse
    try {
      mediaResponse = await fetchWhatsAppMediaStream(
        mediaInfo.url,
        accessToken,
        rangeHeader
      )
      // Structured log: Download fetch success
      const contentType = mediaResponse.headers.get('content-type') || null
      console.log('[MEDIA-PROXY] Download fetch success', {
        messageId: message.id,
        messageType: message.type,
        statusCode: mediaResponse.status,
        contentType,
        hasBody: !!mediaResponse.body,
      })
    } catch (error: any) {
      // Capture upstream error details
      downloadError = error.upstreamError || {
        step: 'download_bytes' as const,
        status: error.status || error.statusCode || null,
        errorText: error.message || null,
        errorJson: null,
      }
      
      // Try to extract error JSON if available
      if (error.response) {
        try {
          const text = await error.response.text()
          downloadError.errorText = text.length > 4000 ? text.substring(0, 4000) : text
          try {
            downloadError.errorJson = JSON.parse(text)
          } catch {
            // Not JSON
          }
        } catch {
          // Ignore
        }
      }
      // Extract status code from error if available
      const statusCode = error.response?.status || error.status || error.statusCode || null
      const errorMessage = error.message || 'Unknown error'
      // Extract error body summary (truncated, no PII)
      const errorBodySummary = errorMessage.length > 200 ? errorMessage.substring(0, 200) : errorMessage
      
      // Structured log: Download fetch error (NO PII, NO TOKEN)
      console.error('[MEDIA-PROXY] Download fetch error', {
        messageId: message.id,
        messageType: message.type,
        providerMediaId: providerMediaId ? providerMediaId.substring(0, 20) + '...' : null,
        statusCode,
        errorType: error.constructor.name,
        errorBodySummary,
      })

      // Check if this is a debug request - if so, return detailed error info
      const isDebug = new URL(req.url).searchParams.get("debug") === "1"
      
      if (isDebug) {
        return NextResponse.json({
          messageId: message.id,
          error: 'meta_download_failed',
          reason: errorMessage || 'Failed to download media from Meta',
          providerMediaId,
          stage: 'download',
          status: 502,
          hint: `Meta media download returned non-200 status (${statusCode || 'unknown'}). Check Meta API status or network connectivity.`,
          // Upstream error details
          upstreamStep: downloadError?.step || 'download_bytes',
          upstreamStatus: downloadError?.status || statusCode,
          upstreamErrorText: downloadError?.errorText || errorMessage,
          upstreamErrorJson: downloadError?.errorJson || null,
          usedTokenSource: tokenSource === 'env' ? 'fallback' : 'primary',
          usedGraphVersion: 'v21.0',
          usedMediaId: providerMediaId,
        }, { status: 502 })
      }

      if (error instanceof MediaExpiredError) {
        return NextResponse.json(
          { 
            error: 'upstream_expired',
            reason: 'Media URL expired. Ask customer to resend.',
            messageId: message.id,
            providerMediaId,
            stage: 'download',
            status: 410,
            hint: 'Media download URL has expired. This is expected for old media - WhatsApp media URLs expire after a period of time.',
          },
          { status: 410 }
        )
      }
      
      if (error instanceof MediaRateLimitError) {
        return NextResponse.json(
          { 
            error: 'rate_limit_exceeded',
            reason: 'Rate limited by Meta API. Please try again later.',
            messageId: message.id,
            providerMediaId,
            stage: 'download',
            status: 429,
            hint: 'Meta media download rate limit exceeded. Wait a few minutes before retrying.',
          },
          { status: 429 }
        )
      }

      // Handle 401/403 from download -> return 502 with "Meta auth failed"
      if (statusCode === 401 || statusCode === 403) {
        console.error('[MEDIA-PROXY] Meta auth failed on download', {
          messageId: message.id,
          messageType: message.type,
          statusCode,
          tokenSource,
        })
        return NextResponse.json(
          { 
            error: 'meta_auth_failed',
            reason: 'Meta auth failed',
            messageId: message.id,
            providerMediaId,
            stage: 'download',
            status: 502,
            hint: `Meta media download returned ${statusCode}. Check token validity. Token source: ${tokenSource}`,
          },
          { status: 502 }
        )
      }
      
      return NextResponse.json(
        { 
          error: 'meta_download_failed',
          reason: errorMessage || 'Failed to download media from Meta',
          messageId: message.id,
          providerMediaId,
          stage: 'download',
          status: 502,
          hint: `Meta media download returned non-200 status (${statusCode || 'unknown'}). Check Meta API status or network connectivity.`,
        },
        { status: 502 }
      )
    }

    // Prepare response headers
    const contentType = (message as any).mediaMimeType || mediaInfo.mimeType || 'application/octet-stream'
    const contentLength = mediaResponse.headers.get('content-length')
    const contentRange = mediaResponse.headers.get('content-range')
    const upstreamStatus = mediaResponse.status
    const isRanged = upstreamStatus === 206

    // Determine Content-Disposition
    // For download requests, always use 'attachment' to force download
    const isDocument = contentType.includes('pdf') || contentType.includes('document') || message.type === 'document'
    const disposition = isDownloadRequest || isDocument ? 'attachment' : 'inline'
    
    // Sanitize filename for security
    // Ensure proper file extension based on content type
    let filename = sanitizeFilename(mediaInfo.fileName || (message as any).mediaFilename || `media-${messageId}`)
    
    // Add proper extension if missing
    if (!filename.includes('.')) {
      if (contentType.startsWith('image/')) {
        const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg'
        filename = `${filename}.${ext}`
      } else if (contentType.startsWith('video/')) {
        filename = `${filename}.mp4`
      } else if (contentType.startsWith('audio/')) {
        filename = `${filename}.ogg`
      } else if (contentType.includes('pdf')) {
        filename = `${filename}.pdf`
      }
    }

    // Sanitize filename for Content-Disposition header (replace non-ASCII with '_')
    // This prevents ByteString errors in HTTP headers
    const safeAscii = (s: string) => s.replace(/[^\x20-\x7E]/g, '_')
    const safeFilename = safeAscii(filename)

    const responseHeaders: HeadersInit = {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${safeFilename}"`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=300',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    }

    // Add Content-Length if available (prefer from message.mediaSize if available)
    if ((message as any).mediaSize && (message as any).mediaSize > 0) {
      responseHeaders['Content-Length'] = String((message as any).mediaSize)
    } else if (contentLength) {
      responseHeaders['Content-Length'] = contentLength
    }

    // Handle partial content (206) for Range requests
    if (isRanged && contentRange) {
      responseHeaders['Content-Range'] = contentRange
      return new NextResponse(mediaResponse.body, {
        status: 206,
        headers: responseHeaders,
      })
    }

    // For full content (200), stream to client
    return new NextResponse(mediaResponse.body, {
      status: 200,
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error('[MEDIA-PROXY] Unexpected error:', error)
    
    // Check if this is a download request
    const isDownloadRequest = req.nextUrl.searchParams.get('download') === 'true'
    
    if (isDownloadRequest) {
      return new NextResponse(
        `Internal Server Error\n\nFailed to process media download.\nError: ${error.message || 'Unknown error'}\n\nMessage ID: ${messageId || 'unknown'}`,
        { 
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': 'attachment; filename="error.txt"',
          },
        }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'internal_error',
        reason: error.message || 'Internal server error',
        messageId: messageId,
      },
      { status: 500 }
    )
  }
}

/**
 * HEAD /api/media/messages/[id]
 * 
 * Returns headers only for media availability check
 * Same logic as GET but no body
 */
export async function HEAD(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth check (or test key in dev)
    // Allow test key bypass if:
    // 1. We're in development mode OR test key is provided
    // 2. Test key matches env var (or default 'test123')
    const testKey = req.headers.get('x-media-test-key')
    const envTestKey = process.env.MEDIA_PROXY_TEST_KEY || 'test123'
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development'
    const isValidTestKey = isDev && testKey && testKey === envTestKey
    
    if (!isValidTestKey) {
      // Try auth, but if it fails and we have cookies, allow it (browser request)
      try {
        await requireAuthApi()
      } catch (authError: any) {
        const cookies = req.headers.get('cookie')
        if (!cookies || !cookies.includes('alaincrm_session')) {
          return new NextResponse(null, { status: 401 })
        }
        // Has cookies - allow request
      }
    }

    const resolvedParams = await params
    const messageId = parseInt(resolvedParams.id)

    if (isNaN(messageId)) {
      return new NextResponse(null, { status: 400 })
    }

    // Fetch message - use findUnique without select to get all fields including providerMediaId
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    })

    if (!message) {
      return new NextResponse(null, { status: 404 })
    }

    // Use canonical media resolver (single source of truth)
    const resolved = resolveWhatsAppMedia(undefined, message, undefined, undefined)
    
    // ===== PRIORITY F: ExternalEventLog recovery by providerMessageId =====
    let recoveredProviderMediaId: string | null = null
    let externalEventLog: any = null

    if (!resolved.providerMediaId && message.providerMessageId) {
      try {
        // Provider-agnostic lookup: ignore provider field, just match externalId
        externalEventLog = await prisma.externalEventLog.findFirst({
          where: { externalId: message.providerMessageId },
          orderBy: { receivedAt: 'desc' },
          select: { id: true, provider: true, externalId: true, payload: true, receivedAt: true },
        })

        if (externalEventLog?.payload) {
          const extractId = (obj: any): string | null => {
            if (!obj || typeof obj !== 'object') return null
            const candidates = [obj.id, obj.media_id, obj.mediaId]
            for (const c of candidates) {
              if (typeof c === 'string' && /^[0-9]{8,}$/.test(c.trim())) return c.trim()
              if (typeof c === 'number' && /^[0-9]{8,}$/.test(String(c))) return String(c)
            }
            return null
          }

          let parsed: any = null
          try {
            parsed = typeof externalEventLog.payload === 'string' 
              ? JSON.parse(externalEventLog.payload) 
              : externalEventLog.payload
          } catch {
            parsed = null
          }

          // PRIORITY: Check for direct providerMediaId in minimal payload first
          if (parsed) {
            const directId =
              (typeof parsed?.providerMediaId === 'string' && parsed.providerMediaId.trim())
                ? parsed.providerMediaId.trim()
                : null

            if (directId && /^[0-9]{8,}$/.test(directId)) {
              recoveredProviderMediaId = directId
            } else {
              // Fallback: Try to extract from full message object (for legacy payloads)
              const msgObj =
                parsed?.message ||
                parsed?.rawWebhook?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] ||
                null

              const mediaObj =
                msgObj?.image || msgObj?.document || msgObj?.audio || msgObj?.video || msgObj?.sticker || null

              if (mediaObj) {
                const extractedId = extractId(mediaObj)
        if (extractedId) {
                  recoveredProviderMediaId = extractedId
                }
              }
            }
          }

          // If recovered, optionally persist back to Message row for caching
          if (recoveredProviderMediaId) {
            await prisma.message.update({
              where: { id: message.id },
              data: {
                providerMediaId: recoveredProviderMediaId,
                mediaUrl: recoveredProviderMediaId,
                // try to correct type if it was wrongly stored as text
                type: ['image','document','audio','video','sticker'].includes(resolved.finalType as any)
                  ? resolved.finalType
                  : undefined,
              } as any,
            })
          }
        }
      } catch (e) {
        // swallow – proxy should continue to return 424 if not recoverable
      }
    }
    // ===== END PRIORITY F =====
    
    // ===== DEBUG =====
    if (new URL(req.url).searchParams.get("debug") === "1") {
      // Fetch recent ExternalEventLog entries for debugging
      const recentExternalEvents = await prisma.externalEventLog.findMany({
          orderBy: { receivedAt: 'desc' },
          take: 10,
        select: { id: true, provider: true, externalId: true, receivedAt: true },
      })

      // Get credentials info for debug output
      let credentialsInfo: any = {}
      try {
        const { getWhatsAppCredentials } = await import('@/lib/whatsapp')
        const creds = await getWhatsAppCredentials()
        credentialsInfo = {
          usedTokenSource: creds.tokenSource === 'env' ? 'fallback' : 'primary',
          hasToken: !!creds.accessToken,
          hasPhoneNumberId: !!creds.phoneNumberId,
        }
      } catch {
        credentialsInfo = {
          usedTokenSource: null,
          hasToken: false,
          hasPhoneNumberId: false,
        }
      }

      return NextResponse.json({
        messageId: message.id,
        type: message.type,
        body: message.body,
        providerMediaId: (message as any).providerMediaId,
        mediaUrl: message.mediaUrl,
        mediaMimeType: (message as any).mediaMimeType,
        resolved: {
          isMedia: resolved.isMedia,
          finalType: resolved.finalType,
          providerMediaId: resolved.providerMediaId,
          source: resolved.debug?.source,
        },
        rawPayloadPresent: !!message.rawPayload,
        rawPayloadLength: message.rawPayload ? String(message.rawPayload).length : 0,
        payloadPresent: !!message.payload,
        payloadLength: message.payload ? String(message.payload).length : 0,
        providerMessageId: message.providerMessageId ?? null,
        externalEventRecoveryAttempted: !!message.providerMessageId,
        externalEventRecoveredProviderMediaId: recoveredProviderMediaId,
        externalEventLookupByExternalId: message.providerMessageId ?? null,
        externalEventFound: !!externalEventLog,
        externalEventLogId: externalEventLog?.id ?? null,
        externalEventProvider: externalEventLog?.provider ?? null,
        externalEventPayloadLength: externalEventLog?.payload ? String(externalEventLog.payload).length : 0,
        externalEventPayloadSample: externalEventLog?.payload ? String(externalEventLog.payload).slice(0, 200) : null,
        recentExternalEvents: recentExternalEvents,
        // Upstream error details (will be null if no errors occurred)
        upstreamStep: null,
        upstreamStatus: null,
        upstreamErrorText: null,
        upstreamErrorJson: null,
        usedTokenSource: credentialsInfo.usedTokenSource,
        usedGraphVersion: 'v21.0',
        usedMediaId: resolved.providerMediaId || recoveredProviderMediaId || null,
      }, { status: 200 })
    }
    // ===== END DEBUG =====
    
    // If resolved.isMedia is false => 422
    if (!resolved.isMedia) {
      return new NextResponse(null, { status: 422 })
    }

    // Use resolved.providerMediaId or recovered one
    const providerMediaId = resolved.providerMediaId || recoveredProviderMediaId
    
    // If resolved.isMedia is true but providerMediaId is null
    if (!providerMediaId) {
      // Check if body indicates media placeholder
      const body = message.body || ''
      const hasMediaPlaceholder = body && /\[(audio|image|video|document|sticker|Audio received|Image|Video|Document|Sticker)\]/i.test(body)
      
      if (hasMediaPlaceholder) {
        // If body indicates media placeholder => 424
      return new NextResponse(null, { status: 424 })
      } else {
        // Else return 502 (but NOT 422)
        return new NextResponse(null, { status: 502 })
      }
    }

    // Get credentials using unified function (single source of truth)
    const { getWhatsAppCredentials } = await import('@/lib/whatsapp')
    let credentials
    try {
      credentials = await getWhatsAppCredentials()
          } catch (e) {
      return new NextResponse(null, { status: 503 }) // Service Unavailable
    }

    const { accessToken } = credentials as { accessToken: string; phoneNumberId: string; tokenSource: 'env' | 'db' }

    // Verify media exists by calling Graph API
    try {
      const mediaInfo = await getWhatsAppDownloadUrl(providerMediaId, accessToken)
      
      const contentType = (message as any).mediaMimeType || mediaInfo.mimeType || 'application/octet-stream'
      const isDocument = contentType.includes('pdf') || contentType.includes('document') || message.type === 'document'
      const disposition = isDocument ? 'attachment' : 'inline'
      let filename = sanitizeFilename(mediaInfo.fileName || (message as any).mediaFilename || `media-${messageId}`)
      
      // Sanitize filename for Content-Disposition header (replace non-ASCII with '_')
      const safeAscii = (s: string) => s.replace(/[^\x20-\x7E]/g, '_')
      const safeFilename = safeAscii(filename)

      const headers: HeadersInit = {
        'Content-Type': contentType,
        'Content-Disposition': `${disposition}; filename="${safeFilename}"`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=300',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      }

      if (mediaInfo.fileSize) {
        headers['Content-Length'] = String(mediaInfo.fileSize)
      }

      return new NextResponse(null, {
        status: 200,
        headers,
      })
    } catch (error: any) {
      if (error instanceof MediaExpiredError) {
        return new NextResponse(null, { status: 410 })
      }
      if (error instanceof MediaRateLimitError) {
        return new NextResponse(null, { status: 429 })
      }
      return new NextResponse(null, { status: 502 })
    }
  } catch (error: any) {
    console.error('[MEDIA-PROXY] HEAD error:', error)
    
    // Check if this is a download request
    const isDownloadRequest = req.nextUrl.searchParams.get('download') === 'true'
    
    if (isDownloadRequest) {
      return new NextResponse(
        `Internal Server Error\n\nFailed to process media download.\nError: ${error.message || 'Unknown error'}`,
        { 
          status: 500,
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': 'attachment; filename="error.txt"',
          },
        }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'internal_error',
        reason: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

/**
 * OPTIONS /api/media/messages/[id]
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
