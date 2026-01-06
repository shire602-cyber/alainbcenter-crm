/**
 * WHATSAPP MEDIA HELPER
 * 
 * Helper functions for fetching WhatsApp media from Meta Graph API
 * Handles authentication, URL fetching, and streaming with retry logic
 */

export interface WhatsAppMediaInfo {
  url: string
  mimeType: string
  fileSize?: number
  fileName?: string
}

export interface UpstreamErrorDetails {
  step: 'resolve_media_url' | 'download_bytes'
  status: number | null
  errorText: string | null
  errorJson: any | null
}

export class MediaExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaExpiredError'
  }
}

export class MediaRateLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaRateLimitError'
  }
}

/**
 * Get WhatsApp media download URL from Meta Graph API with retry logic
 * @param mediaId - WhatsApp media ID (stored in Message.providerMediaId)
 * @param accessToken - WhatsApp access token
 * @param retries - Number of retry attempts (default: 3)
 * @returns Media download URL and metadata
 */
export async function getWhatsAppDownloadUrl(
  mediaId: string,
  accessToken: string,
  retries: number = 3
): Promise<WhatsAppMediaInfo> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // FIX: Add timeout handling (30 seconds)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${mediaId}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        }
      )
      
      clearTimeout(timeoutId)

      // Handle expired media (410) - don't retry
      if (response.status === 410) {
        throw new MediaExpiredError(`Media ID ${mediaId} has expired`)
      }

      // Handle rate limiting (429) - retry with backoff
      if (response.status === 429) {
        if (attempt < retries) {
          const backoffDelay = 1000 * attempt // Exponential backoff: 1s, 2s, 3s
          console.warn(`[MEDIA] Rate limited, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }
        throw new MediaRateLimitError(`Rate limited after ${retries} attempts`)
      }

      if (!response.ok) {
        // Capture error details for debugging
        let errorJson: any = null
        let errorText: string | null = null
        
        try {
          const text = await response.text()
          errorText = text.length > 4000 ? text.substring(0, 4000) : text
          try {
            errorJson = JSON.parse(text)
          } catch {
            // Not JSON, keep as text
          }
        } catch {
          errorText = response.statusText
        }
        
        const errorMessage = errorJson?.error?.message || errorText || `Failed to fetch media URL: ${response.statusText}`
        
        // Retry on 5xx errors (server errors)
        if (response.status >= 500 && attempt < retries) {
          const backoffDelay = 1000 * attempt
          console.warn(`[MEDIA] Server error ${response.status}, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }
        
        // Preserve status code and error details in error for logging
        const errorWithStatus: any = new Error(errorMessage)
        errorWithStatus.status = response.status
        errorWithStatus.statusCode = response.status
        errorWithStatus.upstreamError = {
          step: 'resolve_media_url' as const,
          status: response.status,
          errorText,
          errorJson,
        }
        throw errorWithStatus
      }

      const data = await response.json()
      
      if (!data.url) {
        throw new Error('Media URL not found in Meta response')
      }

      return {
        url: data.url,
        mimeType: data.mime_type || 'application/octet-stream',
        fileSize: data.file_size ? parseInt(data.file_size) : undefined,
        fileName: data.filename || undefined,
      }
    } catch (error: any) {
      // Don't retry on MediaExpiredError or MediaRateLimitError (already handled above)
      if (error instanceof MediaExpiredError || error instanceof MediaRateLimitError) {
        throw error
      }
      
      // Retry on network errors (TypeError, ECONNRESET, ETIMEDOUT, AbortError for timeout)
      if (attempt < retries && (
        error.name === 'TypeError' || 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' ||
        error.name === 'AbortError'
      )) {
        const backoffDelay = 1000 * attempt
        console.warn(`[MEDIA] Network error: ${error.message}, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
        continue
      }
      
      // Last attempt or non-retryable error
      throw error
    }
  }
  
  throw new Error('Max retries exceeded')
}

/**
 * Fetch WhatsApp media stream with Range support and retry logic
 * @param mediaUrl - Download URL from getWhatsAppDownloadUrl
 * @param accessToken - WhatsApp access token
 * @param rangeHeader - Optional Range header for partial content requests
 * @param retries - Number of retry attempts (default: 3)
 * @returns Response with streamable body
 * 
 * CRITICAL: Meta download URLs often require Authorization header AND may redirect.
 * Some environments drop auth headers on redirect, so we handle redirects manually.
 */
export async function fetchWhatsAppMediaStream(
  mediaUrl: string,
  accessToken: string,
  rangeHeader?: string | null,
  retries: number = 3
): Promise<Response> {
  const headers: HeadersInit = {
    Authorization: `Bearer ${accessToken}`, // CRITICAL: Meta requires token on download URL too
  }

  // Forward Range header for audio/video streaming (seeking support)
  if (rangeHeader) {
    headers['Range'] = rangeHeader
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // FIX: Add timeout handling (30 seconds)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      
      // CRITICAL: Use redirect: 'manual' to handle redirects manually
      // Some environments (e.g., Vercel Edge Functions, some proxies) drop Authorization headers on redirect
      let response = await fetch(mediaUrl, {
        headers,
        redirect: 'manual', // Handle redirects manually
        signal: controller.signal,
      })
      
      clearTimeout(timeoutId)

      // Handle redirects manually (301, 302, 303, 307, 308)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (location) {
          // Meta CDN redirects typically don't require Authorization header
          // Follow redirect without auth (CDN URLs are typically pre-signed)
          console.log(`[MEDIA] Following redirect from ${mediaUrl.substring(0, 50)}... to ${location.substring(0, 50)}...`)
          response = await fetch(location, {
            headers: rangeHeader ? { 'Range': rangeHeader } : {}, // Only include Range if provided
            redirect: 'follow', // Follow any further redirects automatically
            signal: controller.signal,
          })
        } else {
          // Redirect without Location header - treat as error
          const errorWithStatus: any = new Error(`Redirect without Location header: ${response.status}`)
          errorWithStatus.status = response.status
          errorWithStatus.statusCode = response.status
          throw errorWithStatus
        }
      }

      // Handle expired media (410) - don't retry
      if (response.status === 410) {
        throw new MediaExpiredError(`Media URL has expired: ${mediaUrl}`)
      }

      // Handle rate limiting (429) - retry with backoff
      if (response.status === 429) {
        if (attempt < retries) {
          const backoffDelay = 1000 * attempt
          console.warn(`[MEDIA] Rate limited on download, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
          await new Promise(resolve => setTimeout(resolve, backoffDelay))
          continue
        }
        throw new MediaRateLimitError(`Rate limited after ${retries} attempts`)
      }

      // Retry on 5xx errors (server errors)
      if (response.status >= 500 && attempt < retries) {
        const backoffDelay = 1000 * attempt
        console.warn(`[MEDIA] Server error ${response.status} on download, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
        continue
      }

      if (!response.ok) {
        // Capture error details for debugging
        let errorText: string | null = null
        let errorJson: any = null
        
        try {
          const text = await response.text()
          errorText = text.length > 4000 ? text.substring(0, 4000) : text
          try {
            errorJson = JSON.parse(text)
          } catch {
            // Not JSON, keep as text
          }
        } catch {
          errorText = response.statusText
        }
        
        // Preserve status code and error details in error for logging
        const errorWithStatus: any = new Error(`Failed to download media: ${response.status} ${errorText || response.statusText}`)
        errorWithStatus.status = response.status
        errorWithStatus.statusCode = response.status
        errorWithStatus.upstreamError = {
          step: 'download_bytes' as const,
          status: response.status,
          errorText,
          errorJson,
        }
        throw errorWithStatus
      }

      return response
    } catch (error: any) {
      // Don't retry on MediaExpiredError or MediaRateLimitError
      if (error instanceof MediaExpiredError || error instanceof MediaRateLimitError) {
        throw error
      }
      
      // Retry on network errors (including timeout/AbortError)
      if (attempt < retries && (
        error.name === 'TypeError' || 
        error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' ||
        error.name === 'AbortError'
      )) {
        const backoffDelay = 1000 * attempt
        console.warn(`[MEDIA] Network error on download: ${error.message}, retrying in ${backoffDelay}ms (attempt ${attempt}/${retries})`)
        await new Promise(resolve => setTimeout(resolve, backoffDelay))
        continue
      }
      
      // Last attempt or non-retryable error
      throw error
    }
  }
  
  throw new Error('Max retries exceeded')
}

/**
 * Get WhatsApp access token from unified credentials
 * Uses shared credential helper from whatsapp.ts (single source of truth)
 * @returns Access token or null
 */
export async function getWhatsAppAccessToken(): Promise<string | null> {
  // Use unified credentials function (single source of truth)
  const { getWhatsAppCredentials } = await import('@/lib/whatsapp')
  try {
    const credentials = await getWhatsAppCredentials()
    return credentials.accessToken
  } catch (e) {
    // Return null if credentials not configured (instead of throwing)
    return null
  }
}

/**
 * Get WhatsApp access token source metadata (for diagnostics)
 * Uses unified credentials function from whatsapp.ts
 * @returns Token source info: { found: boolean, source: 'DB' | 'ENV' | null }
 */
export async function getWhatsAppAccessTokenSource(): Promise<{ found: boolean; source: 'DB' | 'ENV' | null }> {
  const { getWhatsAppCredentials } = await import('@/lib/whatsapp')
  try {
    const credentials = await getWhatsAppCredentials()
    return {
      found: true,
      source: (credentials as any).tokenSource === 'db' ? 'DB' : (credentials as any).tokenSource === 'env' ? 'ENV' : null,
    }
  } catch (e) {
    return {
      found: false,
      source: null,
    }
  }
}


