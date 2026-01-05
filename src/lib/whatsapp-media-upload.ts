/**
 * WhatsApp Media Upload Helper
 * 
 * Uploads media files to Meta's servers and returns media IDs
 * This is required before sending media messages via WhatsApp Cloud API
 */

import { getWhatsAppCredentials } from './whatsapp'

const WHATSAPP_API_VERSION = 'v21.0'

interface MediaUploadResponse {
  id: string
}

interface WhatsAppError {
  error: {
    message: string
    type: string
    code: number
  }
}

/**
 * Upload a media file to Meta's servers
 * Returns a media ID that can be used to send media messages
 * 
 * @param fileBuffer - File buffer (from FormData or File)
 * @param mimeType - MIME type of the file
 * @returns Media ID from Meta
 */
export async function uploadMediaToMeta(
  fileBuffer: Buffer | ArrayBuffer,
  mimeType: string
): Promise<string> {
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials()

  // Step 1: Upload file to Meta
  const uploadUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/media`
  
  // Convert ArrayBuffer to Buffer if needed
  let buffer: Buffer
  if (fileBuffer instanceof Buffer) {
    buffer = fileBuffer
  } else if (fileBuffer instanceof ArrayBuffer) {
    buffer = Buffer.from(new Uint8Array(fileBuffer))
  } else {
    buffer = Buffer.from(fileBuffer as any)
  }
  
  // Create multipart form data manually for server-side
  // Meta requires multipart/form-data with specific fields
  const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2, 15)}`
  const CRLF = '\r\n'
  
  let formData = ''
  
  // Add messaging_product field
  formData += `--${boundary}${CRLF}`
  formData += `Content-Disposition: form-data; name="messaging_product"${CRLF}${CRLF}`
  formData += `whatsapp${CRLF}`
  
  // Add type field
  formData += `--${boundary}${CRLF}`
  formData += `Content-Disposition: form-data; name="type"${CRLF}${CRLF}`
  formData += `${getMediaTypeFromMime(mimeType)}${CRLF}`
  
  // Add file field
  formData += `--${boundary}${CRLF}`
  // FIX: Sanitize filename in Content-Disposition header
  const { sanitizeFilename } = await import('@/lib/media/storage')
  const sanitizedFilename = sanitizeFilename(`media.${getExtensionFromMime(mimeType)}`)
  formData += `Content-Disposition: form-data; name="file"; filename="${sanitizedFilename}"${CRLF}`
  formData += `Content-Type: ${mimeType}${CRLF}${CRLF}`
  
  // Combine text parts with binary buffer
  const textPart = Buffer.from(formData, 'utf-8')
  const endBoundary = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8')
  const fullBody = Buffer.concat([textPart, buffer, endBoundary])

  // FIX: Add retry logic with exponential backoff (similar to getWhatsAppDownloadUrl)
  const retries = 3
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // FIX: Add timeout handling (60 seconds for uploads - larger files)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 60000)
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: fullBody,
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)

      // FIX: Handle rate limiting (429) - retry with backoff
      if (response.status === 429) {
        if (attempt < retries) {
          const backoffDelay = 1000 * attempt // Exponential backoff: 1s, 2s, 3s
          console.warn(`[MEDIA-UPLOAD] Rate limited, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }
        throw new Error('Rate limited by Meta API after retries. Please try again later.')
      }

      const data = await response.json()

      // Retry on 5xx errors (server errors)
      if (response.status >= 500 && attempt < retries) {
        const backoffDelay = 1000 * attempt
        console.warn(`[MEDIA-UPLOAD] Server error ${response.status}, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
        continue
      }

      if (!response.ok) {
        const error = data as WhatsAppError
        throw new Error(
          error.error?.message || `Meta upload error: ${response.status} ${response.statusText}`
        )
      }

      const result = data as MediaUploadResponse
      if (!result.id) {
        throw new Error('Meta did not return a media ID')
      }

      return result.id
    } catch (error: any) {
      // Handle timeout/abort errors - retry if not last attempt
      if (error.name === 'AbortError') {
        if (attempt < retries) {
          const backoffDelay = 1000 * attempt
          console.warn(`[MEDIA-UPLOAD] Timeout, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }
        throw new Error('Media upload timeout - file may be too large or network too slow')
      }
      
      // Retry on network errors (TypeError, ECONNRESET, ETIMEDOUT)
      if (attempt < retries && (
        error.name === 'TypeError' || 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT'
      )) {
        const backoffDelay = 1000 * attempt
        console.warn(`[MEDIA-UPLOAD] Network error: ${error.message}, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
        continue
      }
      
      // Handle rate limiting (429) - already handled above, but catch here too
      if (error.message?.includes('429') || error.message?.includes('rate limit')) {
        throw new Error('Rate limited by Meta API. Please try again later.')
      }
      
      // Last attempt or non-retryable error
      if (error.message.includes('Meta') || error.message.includes('WhatsApp')) {
        throw error
      }
      throw new Error(`Failed to upload media to Meta: ${error.message}`)
    }
  }
  
  throw new Error('Max retries exceeded for media upload')
}

/**
 * Get WhatsApp media type from MIME type
 */
function getMediaTypeFromMime(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'audio/ogg': 'ogg',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'audio/mpeg': 'mp3',
    'application/pdf': 'pdf',
  }
  return mimeMap[mimeType] || 'bin'
}

/**
 * Send media message using uploaded media ID (instead of URL)
 * This is the preferred method for WhatsApp Cloud API
 */
export async function sendMediaMessageById(
  toE164: string,
  mediaType: 'image' | 'document' | 'video' | 'audio' | 'sticker',
  mediaId: string,
  options?: {
    caption?: string
    filename?: string
  }
): Promise<{ messageId: string; waId?: string }> {
  const { accessToken, phoneNumberId } = await getWhatsAppCredentials()
  const { normalizeToE164 } = await import('./phone')

  const normalizedPhone = normalizeToE164(toE164)
  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`

  // Build payload using media ID (not URL)
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: normalizedPhone,
    type: mediaType,
  }

  if (mediaType === 'image') {
    payload.image = {
      id: mediaId, // Use ID instead of link
      ...(options?.caption ? { caption: options.caption } : {}),
    }
  } else if (mediaType === 'video') {
    payload.video = {
      id: mediaId,
      ...(options?.caption ? { caption: options.caption } : {}),
    }
  } else if (mediaType === 'document') {
    payload.document = {
      id: mediaId,
      ...(options?.filename ? { filename: options.filename } : {}),
    }
  } else if (mediaType === 'audio') {
    payload.audio = {
      id: mediaId,
    }
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      const error = data as WhatsAppError
      throw new Error(
        error.error?.message || `WhatsApp API error: ${response.status} ${response.statusText}`
      )
    }

    const result = data as { messaging_product: string; contacts: Array<{ input: string; wa_id: string }>; messages: Array<{ id: string }> }
    const messageId = result.messages?.[0]?.id

    if (!messageId) {
      throw new Error('WhatsApp API did not return a message ID')
    }

    return {
      messageId,
      waId: result.contacts?.[0]?.wa_id,
    }
  } catch (error: any) {
    if (error.message.includes('WhatsApp')) {
      throw error
    }
    throw new Error(`Failed to send WhatsApp media: ${error.message}`)
  }
}

