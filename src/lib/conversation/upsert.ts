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
  const existing = await prisma.conversation.findFirst({
    where: {
      contactId: input.contactId,
      channel: channelLower,
      externalThreadId: effectiveThreadId,
    },
  })
  
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
  const conversation = await prisma.conversation.upsert({
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

