/**
 * Centralized Media Type Detection
 * 
 * Provides consistent logic for detecting media message types across the application
 * Replaces scattered type detection logic in multiple files
 */

/**
 * Check if a message type string indicates a media message
 * @param messageType - Message type (case-insensitive)
 * @returns true if message type is a media type
 */
export function isMediaType(messageType: string | null | undefined): boolean {
  if (!messageType) return false
  const normalized = messageType.toLowerCase().trim()
  return ['audio', 'image', 'document', 'video'].includes(normalized)
}

/**
 * Check if a MIME type indicates a media message
 * @param mimeType - MIME type string
 * @returns true if MIME type indicates media
 */
export function isMediaMimeType(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false
  return (
    mimeType.startsWith('audio/') ||
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.includes('pdf') ||
    mimeType.includes('document')
  )
}

/**
 * Check if a message has media (by type or MIME type)
 * @param messageType - Message type string
 * @param mimeType - MIME type string
 * @returns true if message has media
 */
export function hasMedia(messageType: string | null | undefined, mimeType: string | null | undefined): boolean {
  return isMediaType(messageType) || isMediaMimeType(mimeType)
}

/**
 * Detect media type from message type and MIME type
 * @param messageType - Message type string
 * @param mimeType - MIME type string
 * @returns Detected media type or 'text'
 */
export function detectMediaType(
  messageType: string | null | undefined,
  mimeType: string | null | undefined
): 'audio' | 'image' | 'document' | 'video' | 'text' {
  // First check MIME type (most reliable)
  if (mimeType) {
    if (mimeType.startsWith('audio/')) return 'audio'
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType.startsWith('video/')) return 'video'
    if (mimeType.includes('pdf') || mimeType.includes('document')) return 'document'
  }
  
  // Fallback to message type
  if (messageType) {
    const normalized = messageType.toLowerCase().trim()
    if (normalized === 'audio') return 'audio'
    if (normalized === 'image') return 'image'
    if (normalized === 'video') return 'video'
    if (normalized === 'document') return 'document'
  }
  
  return 'text'
}

/**
 * Normalize message type to lowercase
 * @param messageType - Message type string
 * @returns Normalized lowercase type or 'text'
 */
export function normalizeMessageType(messageType: string | null | undefined): string {
  if (!messageType) return 'text'
  return messageType.toLowerCase().trim() || 'text'
}








