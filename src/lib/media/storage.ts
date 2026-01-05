/**
 * Media Storage Abstraction
 * 
 * Provides a unified interface for caching media files locally (dev) or in cloud storage (prod)
 * 
 * Dev: Stores files in ./.media-cache/{messageId}
 * Prod: Interface ready for S3/R2 but not required for local operation
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { Readable } from 'stream'

/**
 * Sanitize filename for use in Content-Disposition headers
 * Removes newlines, control characters, and other problematic characters
 */
export function sanitizeFilename(filename: string | null | undefined): string {
  if (!filename) return 'media'
  
  // Remove newlines, carriage returns, tabs, and other control characters
  let sanitized = filename
    .replace(/[\r\n\t]/g, ' ') // Replace newlines/tabs with space
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/["\\]/g, '_') // Replace quotes and backslashes
    .trim()
  
  // Limit length to prevent header injection
  if (sanitized.length > 255) {
    const ext = sanitized.substring(sanitized.lastIndexOf('.'))
    sanitized = sanitized.substring(0, 255 - ext.length) + ext
  }
  
  return sanitized || 'media'
}

const CACHE_DIR = join(process.cwd(), '.media-cache')

interface CachedMediaMetadata {
  contentType: string
  filename?: string
  size: number
  cachedAt: Date
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir(): Promise<void> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true })
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error
    }
  }
}

/**
 * Get cache file path for a message ID
 */
function getCachePath(messageId: number): string {
  return join(CACHE_DIR, `${messageId}`)
}

/**
 * Get metadata file path for a message ID
 */
function getMetadataPath(messageId: number): string {
  return join(CACHE_DIR, `${messageId}.meta.json`)
}

/**
 * Store media in cache
 * @param messageId - Message ID
 * @param data - Buffer or Readable stream
 * @param contentType - MIME type
 * @param filename - Optional filename
 * @returns Path to cached file
 */
export async function putMedia(
  messageId: number,
  data: Buffer | Readable,
  contentType: string,
  filename?: string
): Promise<string | null> {
  try {
    await ensureCacheDir()
  } catch (error: any) {
    // If we can't create cache directory (permissions, disk full), skip caching
    console.warn('[MEDIA-STORAGE] Failed to ensure cache directory:', {
      messageId,
      error: error.message,
      code: error.code,
      path: CACHE_DIR,
      reason: error.code === 'EACCES' || error.code === 'EPERM' 
        ? 'Permission denied' 
        : error.code === 'ENOSPC' || error.code === 'EDQUOT'
        ? 'Disk full'
        : 'Unknown error',
    })
    return null
  }
  
  const cachePath = getCachePath(messageId)
  const metadataPath = getMetadataPath(messageId)
  
  try {
    // Convert stream to buffer if needed
    let buffer: Buffer
    if (Buffer.isBuffer(data)) {
      buffer = data
    } else {
      const chunks: Buffer[] = []
      for await (const chunk of data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
      buffer = Buffer.concat(chunks)
    }
    
    // Check available disk space (rough estimate - 10MB minimum required)
    // Note: statfs is not available in Node.js fs module, skip this check
    // In production, consider using a cloud storage solution that handles this
    
    // Write file with error handling
    let fileWritten = false
    try {
      await fs.writeFile(cachePath, buffer)
      fileWritten = true
    } catch (writeError: any) {
      // Handle disk full, permission errors gracefully
      if (writeError.code === 'ENOSPC' || writeError.code === 'EDQUOT') {
        console.warn('[MEDIA-STORAGE] Disk full, skipping cache:', writeError.message)
        return null
      }
      if (writeError.code === 'EACCES' || writeError.code === 'EPERM') {
        console.warn('[MEDIA-STORAGE] Permission denied, skipping cache:', writeError.message)
        return null
      }
      throw writeError // Re-throw unexpected errors
    }
    
    // Write metadata
    const metadata: CachedMediaMetadata = {
      contentType,
      filename,
      size: buffer.length,
      cachedAt: new Date(),
    }
    
    try {
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
    } catch (metaError: any) {
      // FIX: If metadata write fails, clean up the cache file (if it was written)
      if (fileWritten) {
        await fs.unlink(cachePath).catch(() => {})
      }
      if (metaError.code === 'ENOSPC' || metaError.code === 'EDQUOT') {
        console.warn('[MEDIA-STORAGE] Disk full writing metadata, cleaned up cache file')
        return null
      }
      throw metaError
    }
    
    return cachePath
  } catch (error: any) {
    // Catch-all for any other errors
    console.error('[MEDIA-STORAGE] Failed to cache media:', error.message)
    return null // Return null instead of throwing - allows media to still be served
  }
}

/**
 * Get cached media
 * @param messageId - Message ID
 * @returns Buffer and metadata, or null if not cached
 */
export async function getMedia(
  messageId: number
): Promise<{ buffer: Buffer; metadata: CachedMediaMetadata } | null> {
  try {
    const cachePath = getCachePath(messageId)
    const metadataPath = getMetadataPath(messageId)
    
    // Check if both files exist
    await fs.access(cachePath)
    await fs.access(metadataPath)
    
    // Read metadata
    let metadata: CachedMediaMetadata
    try {
      const metadataJson = await fs.readFile(metadataPath, 'utf-8')
      metadata = JSON.parse(metadataJson)
    } catch (metaError: any) {
      // FIX: Handle metadata read/parse errors gracefully
      if (metaError.code === 'ENOENT') {
        return null
      }
      console.warn('[MEDIA-STORAGE] Failed to read metadata, treating as cache miss', {
        messageId,
        error: metaError.message,
        code: metaError.code,
      })
      return null
    }
    
    // Read file
    let buffer: Buffer
    try {
      buffer = await fs.readFile(cachePath)
    } catch (readError: any) {
      // FIX: Handle file read errors gracefully
      if (readError.code === 'ENOENT') {
        return null
      }
      console.warn('[MEDIA-STORAGE] Failed to read cache file, treating as cache miss', {
        messageId,
        error: readError.message,
        code: readError.code,
      })
      return null
    }
    
    return { buffer, metadata }
  } catch (error: any) {
    // FIX: Return null for all errors (not just ENOENT) to allow graceful fallback
    if (error.code === 'ENOENT') {
      return null
    }
    // Log unexpected errors but don't throw - allow fallback to upstream
    console.warn('[MEDIA-STORAGE] Cache read error, treating as cache miss', {
      messageId,
      error: error.message,
      code: error.code,
    })
    return null
  }
}

/**
 * Check if media is cached
 * @param messageId - Message ID
 * @returns true if cached, false otherwise
 */
export async function hasMedia(messageId: number): Promise<boolean> {
  try {
    const cachePath = getCachePath(messageId)
    await fs.access(cachePath)
    return true
  } catch {
    return false
  }
}

/**
 * Get cached media metadata only (without reading the file)
 * @param messageId - Message ID
 * @returns Metadata or null if not cached
 */
export async function getMediaMetadata(
  messageId: number
): Promise<CachedMediaMetadata | null> {
  try {
    const metadataPath = getMetadataPath(messageId)
    const metadataJson = await fs.readFile(metadataPath, 'utf-8')
    return JSON.parse(metadataJson)
  } catch {
    return null
  }
}

/**
 * Delete cached media
 * @param messageId - Message ID
 */
export async function deleteMedia(messageId: number): Promise<void> {
  try {
    const cachePath = getCachePath(messageId)
    const metadataPath = getMetadataPath(messageId)
    
    await Promise.all([
      fs.unlink(cachePath).catch(() => {}),
      fs.unlink(metadataPath).catch(() => {}),
    ])
  } catch {
    // Ignore errors
  }
}

