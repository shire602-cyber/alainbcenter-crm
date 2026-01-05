/**
 * Canonical WhatsApp Media Resolver
 * 
 * This is the ONLY place we decide:
 * - isMedia
 * - finalType
 * - providerMediaId
 * - mime/filename/size/sha/caption
 * 
 * All other code should use this function instead of duplicating logic.
 */

import { MEDIA_TYPES } from './extractMediaId'

export interface ResolvedWhatsAppMedia {
  isMedia: boolean
  finalType: string
  providerMediaId: string | null
  mediaMimeType: string | null
  filename: string | null
  size: number | null
  sha256: string | null
  caption: string | null
  debug?: {
    source: string
    [key: string]: any
  }
}

/**
 * Extract media ID from a media object (supports various field names)
 */
function extractMediaIdFromObject(mediaObject: any): string | null {
  if (!mediaObject) return null
  
  const mediaId = mediaObject.id || 
                 mediaObject.media_id || 
                 mediaObject.mediaId ||
                 null
  
  if (mediaId) {
    const mediaIdStr = String(mediaId).trim()
    // Validate format (non-empty, no spaces, reasonable length, not "undefined"/"null")
    if (mediaIdStr !== '' && 
        mediaIdStr.length > 0 && 
        mediaIdStr.length < 500 &&
        !mediaIdStr.includes(' ') &&
        mediaIdStr !== 'undefined' && 
        mediaIdStr !== 'null') {
      return mediaIdStr
    }
  }
  
  return null
}

/**
 * Check if a string looks like a WhatsApp media ID (numeric, 8+ digits)
 */
function looksLikeWhatsAppMediaId(value: string | null | undefined): boolean {
  if (!value) return false
  const trimmed = String(value).trim()
  return /^[0-9]{8,}$/.test(trimmed)
}

/**
 * Extract media ID from a parsed payload (rawPayload or payload)
 */
function extractMediaIdFromPayload(payload: any): string | null {
  if (!payload || typeof payload !== 'object') return null
  
  // Try all media types in order
  const mediaTypes = ['audio', 'image', 'document', 'video', 'sticker']
  for (const type of mediaTypes) {
    const mediaObject = payload[type]
    if (mediaObject) {
      const id = extractMediaIdFromObject(mediaObject)
      if (id) return id
    }
  }
  
  return null
}

/**
 * Extract message from external event payload (supports both envelope and message shapes)
 */
function extractMessageFromExternalPayload(externalEventPayload: any): any {
  if (!externalEventPayload) return null
  
  // Envelope shape: entry[].changes[].value.messages[0]
  if (externalEventPayload.entry && Array.isArray(externalEventPayload.entry)) {
    for (const entry of externalEventPayload.entry) {
      if (entry.changes && Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.value?.messages && Array.isArray(change.value.messages) && change.value.messages.length > 0) {
            return change.value.messages[0]
          }
        }
      }
    }
  }
  
  // Message shape: direct message object
  if (externalEventPayload.type || externalEventPayload.audio || externalEventPayload.image || 
      externalEventPayload.document || externalEventPayload.video || externalEventPayload.sticker) {
    return externalEventPayload
  }
  
  return null
}

/**
 * Infer media type from MIME type
 */
function inferTypeFromMime(mimeType: string | null | undefined): string | null {
  if (!mimeType) return null
  
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document'
  
  return null
}

/**
 * Infer media type from body placeholders
 */
function inferTypeFromBody(body: string | null | undefined): string | null {
  if (!body) return null
  
  const lowerBody = body.toLowerCase().trim()
  
  // Check for exact placeholders (case-insensitive)
  if (lowerBody === '[image]' || lowerBody === '[image received]') return 'image'
  if (lowerBody === '[video]' || lowerBody === '[video received]') return 'video'
  if (lowerBody === '[audio]' || lowerBody === '[audio received]') return 'audio'
  if (lowerBody === '[document]' || lowerBody === '[document received]') return 'document'
  if (lowerBody === '[sticker]' || lowerBody === '[sticker received]') return 'sticker'
  
  // Check for placeholders with variations
  if (lowerBody.startsWith('[image') || lowerBody.includes('[image]')) return 'image'
  if (lowerBody.startsWith('[video') || lowerBody.includes('[video]')) return 'video'
  if (lowerBody.startsWith('[audio') || lowerBody.includes('[audio]')) return 'audio'
  if (lowerBody.startsWith('[document') || lowerBody.includes('[document]')) return 'document'
  if (lowerBody.startsWith('[sticker') || lowerBody.includes('[sticker]')) return 'sticker'
  
  return null
}

/**
 * Detect final type from message object (prefers explicit type, then infers from media objects)
 */
function detectTypeFromMessage(message: any): string {
  // PRIORITY 1: Prefer explicit message.type if in MEDIA_TYPES
  const providedType = message?.type?.toLowerCase()?.trim()
  if (providedType && MEDIA_TYPES.has(providedType)) {
    return providedType
  }
  
  // PRIORITY 2: Infer from presence of media objects
  if (message?.audio) return 'audio'
  if (message?.image) return 'image'
  if (message?.document) return 'document'
  if (message?.video) return 'video'
  if (message?.sticker) return 'sticker'
  
  // Return provided type if it exists (even if not in MEDIA_TYPES), otherwise default to 'text'
  return providedType || 'text'
}

/**
 * Extract media metadata from a media object
 */
function extractMediaMetadata(mediaObject: any, type: string): {
  mimeType: string | null
  filename: string | null
  size: number | null
  sha256: string | null
  caption: string | null
} {
  const defaultMimeTypes: Record<string, string> = {
    audio: 'audio/ogg',
    image: 'image/jpeg',
    document: 'application/pdf',
    video: 'video/mp4',
    sticker: 'image/webp',
  }
  
  return {
    mimeType: mediaObject?.mime_type || mediaObject?.mimeType || defaultMimeTypes[type] || null,
    filename: mediaObject?.filename || null,
    size: mediaObject?.file_size ? parseInt(String(mediaObject.file_size)) : 
          mediaObject?.fileSize ? parseInt(String(mediaObject.fileSize)) : null,
    sha256: mediaObject?.sha256 || mediaObject?.sha_256 || null,
    caption: mediaObject?.caption || null,
  }
}

/**
 * Canonical WhatsApp Media Resolver
 * 
 * @param whatsappMessage - WhatsApp webhook message object (optional)
 * @param dbMessage - Database message object with fields: type, body, providerMediaId, mediaUrl, mediaMimeType, rawPayload, payload, providerMessageId (optional)
 * @param externalEventPayload - External event payload (envelope or message shape) (optional)
 * @param metadata - Additional metadata (optional)
 * @returns Resolved media information
 */
export function resolveWhatsAppMedia(
  whatsappMessage?: any,
  dbMessage?: {
    type?: string | null
    body?: string | null
    providerMediaId?: string | null
    mediaUrl?: string | null
    mediaMimeType?: string | null
    rawPayload?: string | any
    payload?: string | any
    providerMessageId?: string | null
  },
  externalEventPayload?: any,
  metadata?: any
): ResolvedWhatsAppMedia {
  const result: ResolvedWhatsAppMedia = {
    isMedia: false,
    finalType: 'text',
    providerMediaId: null,
    mediaMimeType: null,
    filename: null,
    size: null,
    sha256: null,
    caption: null,
  }
  
  // ============================================================================
  // STEP 1: Determine finalType (priority order)
  // ============================================================================
  
  let finalType: string = 'text'
  let typeSource = 'default'
  
  // Priority 1: Prefer explicit dbMessage.type if in MEDIA_TYPES
  if (dbMessage?.type) {
    const dbType = dbMessage.type.toLowerCase().trim()
    if (MEDIA_TYPES.has(dbType)) {
      finalType = dbType
      typeSource = 'dbMessage.type'
    }
  }
  
  // Priority 2: Infer from whatsappMessage.type or media objects
  if (finalType === 'text' && whatsappMessage) {
    const detectedType = detectTypeFromMessage(whatsappMessage)
    if (MEDIA_TYPES.has(detectedType)) {
      finalType = detectedType
      typeSource = 'whatsappMessage'
    }
  }
  
  // Priority 3: Infer from dbMessage.mediaMimeType
  if (finalType === 'text' && dbMessage?.mediaMimeType) {
    const mimeType = inferTypeFromMime(dbMessage.mediaMimeType)
    if (mimeType) {
      finalType = mimeType
      typeSource = 'mediaMimeType'
    }
  }
  
  // Priority 4: Infer from dbMessage.body placeholders
  if (finalType === 'text' && dbMessage?.body) {
    const bodyType = inferTypeFromBody(dbMessage.body)
    if (bodyType) {
      finalType = bodyType
      typeSource = 'body.placeholder'
    }
  }
  
  // Priority 5: Try to extract from rawPayload/payload
  if (finalType === 'text') {
    let parsedPayload: any = null
    
    // Try rawPayload
    if (dbMessage?.rawPayload) {
      try {
        parsedPayload = typeof dbMessage.rawPayload === 'string' 
          ? JSON.parse(dbMessage.rawPayload) 
          : dbMessage.rawPayload
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    // Try payload if rawPayload didn't work
    if (!parsedPayload && dbMessage?.payload) {
      try {
        parsedPayload = typeof dbMessage.payload === 'string' 
          ? JSON.parse(dbMessage.payload) 
          : dbMessage.payload
      } catch (e) {
        // Ignore parse errors
      }
    }
    
    if (parsedPayload) {
      const detectedType = detectTypeFromMessage(parsedPayload)
      if (MEDIA_TYPES.has(detectedType)) {
        finalType = detectedType
        typeSource = 'payload'
      }
    }
  }
  
  // Priority 6: Try externalEventPayload
  if (finalType === 'text' && externalEventPayload) {
    const extractedMessage = extractMessageFromExternalPayload(externalEventPayload)
    if (extractedMessage) {
      const detectedType = detectTypeFromMessage(extractedMessage)
      if (MEDIA_TYPES.has(detectedType)) {
        finalType = detectedType
        typeSource = 'externalEventPayload'
      }
    }
  }
  
  result.finalType = finalType
  const isMedia = MEDIA_TYPES.has(finalType)
  result.isMedia = isMedia
  
  // ============================================================================
  // STEP 2: Extract providerMediaId (priority order A-F)
  // ============================================================================
  
  if (!isMedia) {
    // Not a media message, return early
    return result
  }
  
  let providerMediaId: string | null = null
  let mediaIdSource = 'none'
  let mediaObject: any = null
  let actualMediaType: string = finalType
  
  // PRIORITY A: dbMessage.providerMediaId
  if (dbMessage?.providerMediaId && looksLikeWhatsAppMediaId(dbMessage.providerMediaId)) {
    providerMediaId = String(dbMessage.providerMediaId).trim()
    mediaIdSource = 'dbMessage.providerMediaId'
  }
  
  // PRIORITY B: numeric dbMessage.mediaUrl
  if (!providerMediaId && dbMessage?.mediaUrl) {
    if (looksLikeWhatsAppMediaId(dbMessage.mediaUrl)) {
      providerMediaId = String(dbMessage.mediaUrl).trim()
      mediaIdSource = 'dbMessage.mediaUrl'
    }
  }
  
  // PRIORITY C: dbMessage.rawPayload parsed
  if (!providerMediaId && dbMessage?.rawPayload) {
    try {
      const rawPayload = typeof dbMessage.rawPayload === 'string' 
        ? JSON.parse(dbMessage.rawPayload) 
        : dbMessage.rawPayload
      
      const extractedId = extractMediaIdFromPayload(rawPayload)
      if (extractedId) {
        providerMediaId = extractedId
        mediaIdSource = 'dbMessage.rawPayload'
        // Also try to find the actual media object for metadata
        const mediaTypes = ['audio', 'image', 'document', 'video', 'sticker']
        for (const type of mediaTypes) {
          if (rawPayload[type]) {
            mediaObject = rawPayload[type]
            actualMediaType = type
            break
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // PRIORITY D: dbMessage.payload parsed
  if (!providerMediaId && dbMessage?.payload) {
    try {
      const payload = typeof dbMessage.payload === 'string' 
        ? JSON.parse(dbMessage.payload) 
        : dbMessage.payload
      
      const extractedId = extractMediaIdFromPayload(payload)
      if (extractedId) {
        providerMediaId = extractedId
        mediaIdSource = 'dbMessage.payload'
        // Also try to find the actual media object for metadata
        if (!mediaObject) {
          const mediaTypes = ['audio', 'image', 'document', 'video', 'sticker']
          for (const type of mediaTypes) {
            if (payload[type]) {
              mediaObject = payload[type]
              actualMediaType = type
              break
            }
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  // PRIORITY E: whatsappMessage.{finalType}.id or scan all media objects
  if (!providerMediaId && whatsappMessage) {
    // Try the finalType first
    if (whatsappMessage[finalType]) {
      const extractedId = extractMediaIdFromObject(whatsappMessage[finalType])
      if (extractedId) {
        providerMediaId = extractedId
        mediaIdSource = `whatsappMessage.${finalType}`
        mediaObject = whatsappMessage[finalType]
        actualMediaType = finalType
      }
    }
    
    // If that didn't work, scan all media objects
    if (!providerMediaId) {
      const mediaTypes = ['audio', 'image', 'document', 'video', 'sticker']
      for (const type of mediaTypes) {
        if (whatsappMessage[type]) {
          const extractedId = extractMediaIdFromObject(whatsappMessage[type])
          if (extractedId) {
            providerMediaId = extractedId
            mediaIdSource = `whatsappMessage.${type}`
            mediaObject = whatsappMessage[type]
            actualMediaType = type
            // Update finalType if we found a different type
            if (finalType !== type && MEDIA_TYPES.has(type)) {
              result.finalType = type
              finalType = type
            }
            break
          }
        }
      }
    }
  }
  
  // PRIORITY F: externalEventPayload (supports both envelope and message shapes)
  if (!providerMediaId && externalEventPayload) {
    const extractedMessage = extractMessageFromExternalPayload(externalEventPayload)
    if (extractedMessage) {
      // Try the finalType first
      if (extractedMessage[finalType]) {
        const extractedId = extractMediaIdFromObject(extractedMessage[finalType])
        if (extractedId) {
          providerMediaId = extractedId
          mediaIdSource = `externalEventPayload.${finalType}`
          mediaObject = extractedMessage[finalType]
          actualMediaType = finalType
        }
      }
      
      // If that didn't work, scan all media objects
      if (!providerMediaId) {
        const mediaTypes = ['audio', 'image', 'document', 'video', 'sticker']
        for (const type of mediaTypes) {
          if (extractedMessage[type]) {
            const extractedId = extractMediaIdFromObject(extractedMessage[type])
            if (extractedId) {
              providerMediaId = extractedId
              mediaIdSource = `externalEventPayload.${type}`
              mediaObject = extractedMessage[type]
              actualMediaType = type
              // Update finalType if we found a different type
              if (finalType !== type && MEDIA_TYPES.has(type)) {
                result.finalType = type
                finalType = type
              }
              break
            }
          }
        }
      }
    }
  }
  
  result.providerMediaId = providerMediaId
  
  // ============================================================================
  // STEP 3: Extract metadata (mime/filename/size/sha/caption)
  // ============================================================================
  
  // Priority 1: Use dbMessage fields if available
  result.mediaMimeType = dbMessage?.mediaMimeType || null
  result.filename = null // dbMessage doesn't have filename field in schema, skip for now
  result.size = null // dbMessage doesn't have size field directly, skip for now
  result.sha256 = null // dbMessage doesn't have sha256 field directly, skip for now
  result.caption = null // dbMessage doesn't have caption field, skip for now
  
  // Priority 2: Extract from media object (whatsappMessage or payload)
  if (mediaObject) {
    const metadata = extractMediaMetadata(mediaObject, actualMediaType)
    if (!result.mediaMimeType) result.mediaMimeType = metadata.mimeType
    if (!result.filename) result.filename = metadata.filename
    if (!result.size) result.size = metadata.size
    if (!result.sha256) result.sha256 = metadata.sha256
    if (!result.caption) result.caption = metadata.caption
  }
  
  // Priority 3: Infer MIME type from finalType if still missing
  if (!result.mediaMimeType) {
    const defaultMimeTypes: Record<string, string> = {
      audio: 'audio/ogg',
      image: 'image/jpeg',
      document: 'application/pdf',
      video: 'video/mp4',
      sticker: 'image/webp',
    }
    result.mediaMimeType = defaultMimeTypes[finalType] || null
  }
  
  // ============================================================================
  // STEP 4: Add debug information
  // ============================================================================
  
  result.debug = {
    source: mediaIdSource,
    typeSource,
    finalType,
    hasProviderMediaId: !!providerMediaId,
    hasMediaObject: !!mediaObject,
  }
  
  return result
}

