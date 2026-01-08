/**
 * CENTRALIZED CONVERSATION UPSERT
 * 
 * This is the SINGLE SOURCE OF TRUTH for conversation creation/updates.
 * All code (inbound, outbound, messaging) must use this function.
 * 
 * Enforces: ONE conversation per (contactId, channel, externalThreadId)
 */

import { prisma } from '../prisma'
import { normalizeChannel } from '../utils/channelNormalize'

export interface UpsertConversationInput {
  contactId: number
  channel: string
  leadId?: number | null
  externalThreadId?: string | null // WhatsApp thread ID, email thread ID, etc.
  externalId?: string | null // Legacy field
  status?: string
  timestamp?: Date
  language?: string | null // CRITICAL FIX 4: Detected language (en, ar, hi, ur, etc.)
}

/**
 * Upsert conversation - ensures ONE conversation per (contactId, channel, externalThreadId)
 * 
 * Logic:
 * 1. If externalThreadId provided, use it for uniqueness
 * 2. Otherwise, fall back to (contactId, channel) uniqueness
 * 3. Always normalize channel to lowercase
 */
export interface UpsertConversationResult {
  id: number
}

export async function upsertConversation(
  input: UpsertConversationInput
): Promise<UpsertConversationResult> {
  const channelLower = normalizeChannel(input.channel)
  const timestamp = input.timestamp || new Date()
  
  // DIAGNOSTIC LOG: upsertConversation entry
  console.log(`[UPSERT-CONV] ENTRY`, JSON.stringify({
    contactId: input.contactId,
    channel: input.channel,
    channelLower,
    externalThreadId: input.externalThreadId,
    leadId: input.leadId,
    timestamp: timestamp.toISOString(),
  }))
  
  // C) CONVERSATION UNIQUENESS: Handle externalThreadId properly
  // If externalThreadId is provided, find by (contactId, channel, externalThreadId)
  // If not provided, derive a canonical value or use fallback
  let effectiveThreadId = input.externalThreadId
  
  // If externalThreadId is missing, derive from contact/channel (stable fallback)
  if (!effectiveThreadId) {
    // Use stable fallback: contactId:channel (ensures one conversation per contact/channel when thread ID unknown)
    effectiveThreadId = `${input.contactId}:${channelLower}`
  }
  
  // Try to find existing conversation by (contactId, channel, externalThreadId)
  // CRITICAL FIX: Include soft-deleted conversations so we can restore them
  // CRITICAL FIX: Use explicit select to avoid missing columns (lastProcessedInboundMessageId, etc.)
  let existing
  try {
    existing = await prisma.conversation.findFirst({
      where: {
        contactId: input.contactId,
        channel: channelLower,
        externalThreadId: effectiveThreadId,
      },
    })
  } catch (error: any) {
    // Gracefully handle missing lastProcessedInboundMessageId column
    if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
      console.warn('[DB] lastProcessedInboundMessageId column not found in upsertConversation findFirst, querying with select (this is OK if migration not yet applied)')
      existing = await prisma.conversation.findFirst({
        where: {
          contactId: input.contactId,
          channel: channelLower,
          externalThreadId: effectiveThreadId,
        },
        select: {
          id: true,
          contactId: true,
          leadId: true,
          channel: true,
          status: true,
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          unreadCount: true,
          priorityScore: true,
          createdAt: true,
          updatedAt: true,
          externalThreadId: true,
          externalId: true,
          language: true,
          deletedAt: true,
        },
      }) as any
    } else {
      throw error
    }
  }
  
  if (existing) {
    // CRITICAL FIX: Restore soft-deleted conversations when new messages arrive
    const updateData: any = {
      leadId: input.leadId ?? existing.leadId,
      lastMessageAt: timestamp,
      lastInboundAt: timestamp,
      status: input.status || existing.status || 'open',
      channel: channelLower, // Ensure normalized
      externalThreadId: effectiveThreadId, // Ensure thread ID is set
      language: input.language ?? existing.language, // CRITICAL FIX 4: Update language if provided
    }
    
    // Restore soft-deleted conversation (clear deletedAt)
    if ((existing as any).deletedAt) {
      updateData.deletedAt = null
      updateData.status = 'open'
      console.log(`♻️ [UPSERT-CONV] Restoring soft-deleted conversation ${existing.id} (new message received)`)
    }
    
    // Update existing conversation
    const updated = await prisma.conversation.update({
      where: { id: existing.id },
      data: updateData,
    })
    
    // DIAGNOSTIC LOG: updated existing conversation
    console.log(`[UPSERT-CONV] UPDATED`, JSON.stringify({
      conversationId: updated.id,
      contactId: input.contactId,
      channel: channelLower,
      externalThreadId: effectiveThreadId,
      leadId: updated.leadId,
      action: 'updated_existing',
    }))
    
    return { id: updated.id }
  }
  
  // Create new conversation - use (contactId, channel) as base uniqueness
  // But store effectiveThreadId for future lookups
  // CRITICAL FIX: Check if conversation exists and is soft-deleted before upsert
  let existingByUnique
  try {
    existingByUnique = await prisma.conversation.findUnique({
      where: {
        contactId_channel: {
          contactId: input.contactId,
          channel: channelLower,
        },
      },
    })
  } catch (error: any) {
    // Gracefully handle missing lastProcessedInboundMessageId column
    if (error.code === 'P2022' || error.message?.includes('lastProcessedInboundMessageId') || error.message?.includes('does not exist') || error.message?.includes('Unknown column')) {
      console.warn('[DB] lastProcessedInboundMessageId column not found in upsertConversation findUnique, querying with select (this is OK if migration not yet applied)')
      existingByUnique = await prisma.conversation.findUnique({
        where: {
          contactId_channel: {
            contactId: input.contactId,
            channel: channelLower,
          },
        },
        select: {
          id: true,
          contactId: true,
          leadId: true,
          channel: true,
          status: true,
          lastMessageAt: true,
          lastInboundAt: true,
          lastOutboundAt: true,
          unreadCount: true,
          priorityScore: true,
          createdAt: true,
          updatedAt: true,
          externalThreadId: true,
          externalId: true,
          language: true,
          deletedAt: true,
        },
      }) as any
    } else {
      throw error
    }
  }
  
  // If conversation exists but is soft-deleted, restore it
  if (existingByUnique && (existingByUnique as any).deletedAt) {
    const restored = await prisma.conversation.update({
      where: { id: existingByUnique.id },
      data: {
        deletedAt: null, // CRITICAL: Restore soft-deleted conversation
        status: 'open',
        leadId: input.leadId ?? existingByUnique.leadId,
        externalThreadId: effectiveThreadId,
        externalId: input.externalId ?? existingByUnique.externalId,
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        channel: channelLower,
        language: input.language ?? existingByUnique.language,
      },
    })
    console.log(`♻️ [UPSERT-CONV] Restored soft-deleted conversation ${restored.id} via unique constraint (new message received)`)
    return { id: restored.id }
  }
  
  // CRITICAL FIX: Wrap upsert in try-catch to handle missing lastProcessedInboundMessageId column
  // Since upsert doesn't support select, we need to fall back to manual findUnique + create/update
  // IMPORTANT: Always use fallback pattern to avoid Prisma Client schema validation errors
  let conversation
  try {
    conversation = await prisma.conversation.upsert({
      where: {
        contactId_channel: {
          contactId: input.contactId,
          channel: channelLower,
        },
      },
      update: {
        leadId: input.leadId ?? undefined,
        externalThreadId: effectiveThreadId, // Use effective thread ID (may be fallback)
        externalId: input.externalId ?? undefined,
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        status: input.status || 'open',
        channel: channelLower, // Ensure normalized
        language: input.language ?? undefined, // CRITICAL FIX 4: Update language if provided
        deletedAt: null, // CRITICAL FIX: Restore if soft-deleted (upsert update path)
      },
      create: {
        contactId: input.contactId,
        leadId: input.leadId ?? null,
        channel: channelLower,
        externalThreadId: effectiveThreadId, // Use effective thread ID (may be fallback)
        externalId: input.externalId ?? null,
        status: input.status || 'open',
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        language: input.language ?? null, // CRITICAL FIX 4: Store detected language
      },
    })
  } catch (error: any) {
    // Gracefully handle missing lastProcessedInboundMessageId column
    // Also handle typo in error message: "lastProcessedInboundMessageld" (lowercase 'd')
    const errorMessage = String(error?.message || '')
    const errorCode = error?.code || ''
    
    // Check if this is a column missing error (P2022 or any error mentioning the column)
    const isColumnMissingError = 
      errorCode === 'P2022' || 
      errorMessage.includes('lastProcessedInboundMessageId') || 
      errorMessage.includes('lastProcessedInboundMessageld') || 
      errorMessage.includes('does not exist') || 
      errorMessage.includes('Unknown column') ||
      (errorMessage.includes('column') && errorMessage.includes('Conversation'))
    
    if (isColumnMissingError) {
      console.warn('[DB] lastProcessedInboundMessageId column not found in upsertConversation upsert, falling back to manual findUnique + create/update (this is OK if migration not yet applied)', {
        errorCode,
        errorMessage: errorMessage.substring(0, 200),
      })
      
      // Fallback: Manual findUnique + create/update pattern
      const existingConv = await prisma.conversation.findUnique({
        where: {
          contactId_channel: {
            contactId: input.contactId,
            channel: channelLower,
          },
        },
        select: {
          id: true,
        },
      })
      
      if (existingConv) {
        // Update existing conversation
        await prisma.conversation.update({
          where: { id: existingConv.id },
          data: {
            leadId: input.leadId ?? undefined,
            externalThreadId: effectiveThreadId,
            externalId: input.externalId ?? undefined,
            lastMessageAt: timestamp,
            lastInboundAt: timestamp,
            status: input.status || 'open',
            channel: channelLower,
            language: input.language ?? undefined,
            deletedAt: null,
          },
        })
        conversation = { 
          id: existingConv.id, 
          contactId: input.contactId, 
          channel: channelLower, 
          externalThreadId: effectiveThreadId, 
          leadId: input.leadId 
        }
      } else {
        // Create new conversation
        const created = await prisma.conversation.create({
          data: {
            contactId: input.contactId,
            leadId: input.leadId ?? null,
            channel: channelLower,
            externalThreadId: effectiveThreadId,
            externalId: input.externalId ?? null,
            status: input.status || 'open',
            lastMessageAt: timestamp,
            lastInboundAt: timestamp,
            language: input.language ?? null,
          },
        })
        conversation = { 
          id: created.id, 
          contactId: input.contactId, 
          channel: channelLower, 
          externalThreadId: effectiveThreadId, 
          leadId: input.leadId 
        }
      }
    } else {
      // Log unexpected error for debugging
      console.error('[DB] Unexpected error in upsertConversation upsert:', {
        errorCode,
        errorMessage: errorMessage.substring(0, 500),
        errorStack: error?.stack?.substring(0, 500),
      })
      throw error
    }
  }
  
  // DIAGNOSTIC LOG: created/upserted conversation
  console.log(`[UPSERT-CONV] RESULT`, JSON.stringify({
    conversationId: conversation.id,
    contactId: input.contactId,
    channel: channelLower,
    externalThreadId: conversation.externalThreadId,
    leadId: conversation.leadId,
    action: 'upserted',
  }))
  
  return { id: conversation.id }
}

