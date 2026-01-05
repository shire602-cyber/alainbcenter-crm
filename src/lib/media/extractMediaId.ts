/**
 * Unified Media ID Extraction
 * 
 * Extracts providerMediaId (Meta Graph API media ID) from WhatsApp webhook messages
 * Uses WhatsApp's documented standard: message.{type}.id
 * 
 * This replaces the complex extraction logic scattered across the webhook handler
 */

export interface ExtractedMediaInfo {
  providerMediaId: string | null
  mediaMimeType: string | null
  filename: string | null
  mediaSize: number | null
  mediaSha256: string | null
  caption: string | null
}

/**
 * Extract media ID from a message object
 * 
 * @param message - WhatsApp webhook message object
 * @param detectedType - Detected message type from detectMediaType()
 * @returns Media ID string or null
 */
export function extractMediaId(
  message: any,
  detectedType: string
): string | null {
  if (!MEDIA_TYPES.has(detectedType)) {
    return null
  }
  
  const mediaObject = message[detectedType]
  if (!mediaObject) {
    return null
  }
  
  const mediaId = mediaObject.id || 
                 mediaObject.media_id || 
                 mediaObject.mediaId ||
                 null
  
  if (mediaId) {
    const mediaIdStr = String(mediaId).trim()
    // Validate format
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
 * Extract media information from WhatsApp webhook message
 * 
 * WhatsApp standard structure:
 * - message.image.id
 * - message.audio.id
 * - message.document.id
 * - message.video.id
 * - message.sticker.id
 * 
 * @param message - WhatsApp webhook message object
 * @param messageType - Message type (image, audio, document, video, sticker)
 * @returns Extracted media information
 */
export function extractMediaInfo(
  message: any,
  messageType: string
): ExtractedMediaInfo {
  const result: ExtractedMediaInfo = {
    providerMediaId: null,
    mediaMimeType: null,
    filename: null,
    mediaSize: null,
    mediaSha256: null,
    caption: null,
  }

  // CRITICAL FIX: Try the specified type first, then try ALL media objects
  let mediaObject = message[messageType]
  let actualType = messageType
  
  // If the specified type doesn't have a media object, try all media types
  if (!mediaObject) {
    console.warn(`[MEDIA-EXTRACTION] No ${messageType} object found, trying all media objects`, {
      messageId: message.id,
      messageType,
      messageKeys: Object.keys(message),
    })
    
    // Try all media objects in order (audio, image, document, video)
    if (message.audio) {
      mediaObject = message.audio
      actualType = 'audio'
    } else if (message.image) {
      mediaObject = message.image
      actualType = 'image'
    } else if (message.document) {
      mediaObject = message.document
      actualType = 'document'
    } else if (message.video) {
      mediaObject = message.video
      actualType = 'video'
    }
    
    if (mediaObject) {
      console.log(`✅ [MEDIA-EXTRACTION] Found ${actualType} object in message (requested type: ${messageType})`)
    }
  }
  
  if (!mediaObject) {
    console.warn(`[MEDIA-EXTRACTION] No media object found in message`, {
      messageId: message.id,
      messageType,
      messageKeys: Object.keys(message),
    })
    return result
  }

  // CRITICAL: Log the media object structure for debugging
  console.log(`🔍 [MEDIA-EXTRACTION] Extracting from ${actualType} object:`, {
    messageId: message.id,
    requestedType: messageType,
    actualType,
    mediaObjectKeys: Object.keys(mediaObject),
    hasId: !!mediaObject.id,
    idValue: mediaObject.id,
    idType: typeof mediaObject.id,
  })

  // WhatsApp standard: message.{type}.id is the media ID
  // Try multiple possible field names for robustness
  const mediaId = mediaObject.id || 
                 mediaObject.media_id || 
                 mediaObject.mediaId ||
                 mediaObject['id'] ||
                 null
  
  if (mediaId) {
    const mediaIdStr = String(mediaId).trim()
    // FIX: Validate format (non-empty, no spaces, reasonable length, not "undefined"/"null")
    if (mediaIdStr !== '' && 
        mediaIdStr.length > 0 && 
        mediaIdStr.length < 500 && // Reasonable max length for WhatsApp media IDs
        !mediaIdStr.includes(' ') && // No spaces
        mediaIdStr !== 'undefined' && 
        mediaIdStr !== 'null') {
      result.providerMediaId = mediaIdStr
      console.log(`✅ [MEDIA-EXTRACTION] Extracted providerMediaId: ${result.providerMediaId}`)
    } else {
      console.warn(`⚠️ [MEDIA-EXTRACTION] Invalid media ID format extracted: ${mediaIdStr}`, {
        length: mediaIdStr.length,
        hasSpaces: mediaIdStr.includes(' '),
        isUndefined: mediaIdStr === 'undefined',
        isNull: mediaIdStr === 'null',
      })
    }
  } else {
    console.warn(`⚠️ [MEDIA-EXTRACTION] No media ID found in ${actualType} object`, {
      messageId: message.id,
      messageType,
      actualType,
      mediaObjectKeys: Object.keys(mediaObject),
      mediaObject: JSON.stringify(mediaObject),
    })
  }

  // Extract MIME type (with fallbacks for different field names)
  result.mediaMimeType =
    mediaObject.mime_type ||
    mediaObject.mimeType ||
    getDefaultMimeType(actualType)

  // Extract filename (for documents and stickers)
  result.filename = mediaObject.filename || null

  // Extract file size
  if (mediaObject.file_size) {
    result.mediaSize = parseInt(String(mediaObject.file_size))
  } else if (mediaObject.fileSize) {
    result.mediaSize = parseInt(String(mediaObject.fileSize))
  }

  // Extract SHA256 hash
  result.mediaSha256 = mediaObject.sha256 || mediaObject.sha_256 || null

  // Extract caption (for images/videos)
  result.caption = mediaObject.caption || null

  // Log warning if media ID is missing (data quality issue)
  if (!result.providerMediaId) {
    console.warn(`[MEDIA-EXTRACTION] Missing media ID for ${actualType} message`, {
      messageId: message.id,
      messageType,
      actualType,
      mediaObjectKeys: Object.keys(mediaObject),
      mediaObject: JSON.stringify(mediaObject),
    })
  }

  return result
}

/**
 * Get default MIME type for a message type
 */
function getDefaultMimeType(messageType: string): string {
  switch (messageType) {
    case 'image':
      return 'image/jpeg'
    case 'audio':
      return 'audio/ogg'
    case 'document':
      return 'application/pdf'
    case 'video':
      return 'video/mp4'
    case 'sticker':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

/**
 * Media types supported by WhatsApp
 */
export const MEDIA_TYPES = new Set(['image', 'document', 'audio', 'video', 'sticker'])

/**
 * Detect message type from webhook message object
 * PREFERS message.type (trust provider classification), then falls back to checking media objects
 * 
 * This ensures correct classification when provider sends correct type field.
 * Falls back to object detection when type is missing or invalid.
 * 
 * @param message - WhatsApp webhook message object
 * @returns Detected message type: "text" | "location" | "image" | "document" | "audio" | "video" | "sticker" | "unknown"
 */
export function detectMediaType(message: any): 'text' | 'location' | 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'unknown' {
  // PRIORITY 1: Prefer message.type (trust provider classification)
  const providedType = message.type?.toLowerCase()
  if (providedType) {
    // Validate it's a known media type
    if (MEDIA_TYPES.has(providedType)) {
      return providedType as 'image' | 'document' | 'audio' | 'video' | 'sticker'
    }
    if (providedType === 'location') {
      return 'location'
    }
    if (providedType === 'text') {
      return 'text'
    }
  }
  
  // PRIORITY 2: Fall back to checking media objects (for cases where type is missing/incorrect)
  // WhatsApp sometimes sends media messages with type='text' but with media objects
  if (message.image) return 'image'
  if (message.audio) return 'audio'
  if (message.document) return 'document'
  if (message.video) return 'video'
  if (message.sticker) return 'sticker'
  
  // Check for location
  if (message.location) return 'location'
  
  // Check for interactive/button/reaction types (non-media)
  if (message.interactive || message.button || message.reaction) {
    return 'text' // Treat as text for our purposes
  }
  
  // Default to text if unknown
  return 'text'
}

