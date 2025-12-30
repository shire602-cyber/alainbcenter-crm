/**
 * CHANNEL NORMALIZATION
 * Ensures all channels are stored in lowercase for consistency
 * This prevents duplicate conversations due to case mismatches
 */

/**
 * Normalize channel to lowercase
 * Standard: all channels stored as lowercase in DB
 */
export function normalizeChannel(channel: string): string {
  if (!channel) return 'whatsapp' // Default fallback
  return channel.toLowerCase().trim()
}

/**
 * Validate channel is normalized (for debugging)
 */
export function isChannelNormalized(channel: string): boolean {
  return channel === normalizeChannel(channel)
}


