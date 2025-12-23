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
  const buffer = fileBuffer instanceof Buffer ? fileBuffer : Buffer.from(fileBuffer)
  
  // Create form data for multipart upload
  // On server-side (Node.js), we need to use form-data library or manual multipart
  // For Vercel serverless, we'll use a different approach
  const FormData = (await import('form-data')).default
  const formData = new FormData()
  formData.append('file', buffer, {
    filename: `media.${getExtensionFromMime(mimeType)}`,
    contentType: mimeType,
  })
  formData.append('messaging_product', 'whatsapp')
  formData.append('type', getMediaTypeFromMime(mimeType))

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...formData.getHeaders(), // Get proper multipart headers
      },
      body: formData as any,
    })

    const data = await response.json()

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
    if (error.message.includes('Meta') || error.message.includes('WhatsApp')) {
      throw error
    }
    throw new Error(`Failed to upload media to Meta: ${error.message}`)
  }
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
  mediaType: 'image' | 'document' | 'video' | 'audio',
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

