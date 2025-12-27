/**
 * OUTBOUND MESSAGE IDEMPOTENCY
 * 
 * Prevents duplicate outbound messages from being sent to the same contact/lead.
 * Uses message content hash and time window to detect duplicates.
 */

import { prisma } from '../prisma'
import crypto from 'crypto'

export interface OutboundIdempotencyCheck {
  /** Whether this message is a duplicate */
  isDuplicate: boolean
  /** The existing message ID if duplicate */
  existingMessageId?: number
  /** Reason for duplicate detection */
  reason?: string
}

/**
 * Generate a content hash for a message
 * Normalizes whitespace and case for comparison
 */
function generateMessageHash(messageText: string): string {
  // Normalize: lowercase, trim, remove extra whitespace
  const normalized = messageText
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space

  // Generate SHA-256 hash
  return crypto.createHash('sha256').update(normalized).digest('hex')
}

/**
 * Check if an outbound message is a duplicate
 * 
 * Criteria:
 * - Same contact/lead
 * - Same message content (normalized hash)
 * - Sent within last 5 minutes
 * 
 * @param contactId - Contact ID
 * @param leadId - Lead ID (optional)
 * @param messageText - Message text to check
 * @param channel - Channel (whatsapp, email, etc.)
 * @param timeWindowMinutes - Time window in minutes (default: 5)
 * @returns Idempotency check result
 */
export async function checkOutboundIdempotency(
  contactId: number,
  leadId: number | null,
  messageText: string,
  channel: string = 'whatsapp',
  timeWindowMinutes: number = 5
): Promise<OutboundIdempotencyCheck> {
  if (!messageText || messageText.trim().length === 0) {
    return { isDuplicate: false }
  }

  const messageHash = generateMessageHash(messageText)
  const timeWindow = new Date(Date.now() - timeWindowMinutes * 60 * 1000)

  // Check for recent outbound messages with same content
  const recentMessages = await prisma.message.findMany({
    where: {
      contactId,
      leadId: leadId || undefined,
      direction: { in: ['OUTBOUND', 'OUT'] },
      channel: channel.toUpperCase(),
      createdAt: {
        gte: timeWindow,
      },
      // Check if message body matches (normalized)
      OR: [
        // Exact match (case-insensitive, whitespace-normalized)
        {
          body: {
            equals: messageText.trim(),
            mode: 'insensitive',
          },
        },
        // Similar length and content (fuzzy match for typos)
        {
          body: {
            contains: messageText.trim().substring(0, 50), // First 50 chars
            mode: 'insensitive',
          },
        },
      ],
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 1,
    select: {
      id: true,
      body: true,
      createdAt: true,
      status: true,
    },
  })

  if (recentMessages.length === 0) {
    return { isDuplicate: false }
  }

  const existingMessage = recentMessages[0]
  const existingHash = generateMessageHash(existingMessage.body || '')

  // Compare hashes
  if (messageHash === existingHash) {
    const timeDiff = Date.now() - existingMessage.createdAt.getTime()
    const minutesAgo = Math.floor(timeDiff / (60 * 1000))

    console.log(`⚠️ [OUTBOUND-IDEMPOTENCY] Duplicate message detected`, {
      contactId,
      leadId,
      existingMessageId: existingMessage.id,
      timeWindowMinutes,
      minutesAgo,
      status: existingMessage.status,
    })

    return {
      isDuplicate: true,
      existingMessageId: existingMessage.id,
      reason: `Identical message sent ${minutesAgo} minute(s) ago (message ID: ${existingMessage.id})`,
    }
  }

  // Check for very similar messages (fuzzy match)
  const similarity = calculateSimilarity(messageText, existingMessage.body || '')
  if (similarity > 0.9) {
    // 90%+ similarity = likely duplicate
    const timeDiff = Date.now() - existingMessage.createdAt.getTime()
    const minutesAgo = Math.floor(timeDiff / (60 * 1000))

    console.log(`⚠️ [OUTBOUND-IDEMPOTENCY] Very similar message detected`, {
      contactId,
      leadId,
      existingMessageId: existingMessage.id,
      similarity: (similarity * 100).toFixed(1) + '%',
      minutesAgo,
    })

    return {
      isDuplicate: true,
      existingMessageId: existingMessage.id,
      reason: `Very similar message (${(similarity * 100).toFixed(1)}% match) sent ${minutesAgo} minute(s) ago`,
    }
  }

  return { isDuplicate: false }
}

/**
 * Calculate similarity between two strings (0-1)
 * Uses Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim()
  const s2 = str2.toLowerCase().trim()

  if (s1 === s2) return 1.0
  if (s1.length === 0 || s2.length === 0) return 0.0

  const maxLength = Math.max(s1.length, s2.length)
  const distance = levenshteinDistance(s1, s2)

  return 1 - distance / maxLength
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}

/**
 * Create an idempotency key for outbound messages
 * Format: outbound:{contactId}:{leadId}:{messageHash}:{timestamp}
 */
export function generateOutboundIdempotencyKey(
  contactId: number,
  leadId: number | null,
  messageText: string
): string {
  const messageHash = generateMessageHash(messageText)
  const timestamp = Math.floor(Date.now() / (5 * 60 * 1000)) // 5-minute window
  return `outbound:${contactId}:${leadId || 'null'}:${messageHash}:${timestamp}`
}

