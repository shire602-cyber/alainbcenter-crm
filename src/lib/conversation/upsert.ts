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
  
  // Determine uniqueness key
  // If externalThreadId is provided, use it; otherwise use (contactId, channel)
  if (input.externalThreadId) {
    // Try to find by externalThreadId first
    const existing = await prisma.conversation.findFirst({
      where: {
        contactId: input.contactId,
        channel: channelLower,
        externalThreadId: input.externalThreadId,
      },
    })
    
    if (existing) {
      // Update existing
      const updated = await prisma.conversation.update({
        where: { id: existing.id },
        data: {
          leadId: input.leadId ?? existing.leadId,
          lastMessageAt: timestamp,
          lastInboundAt: timestamp,
          status: input.status || existing.status || 'open',
          channel: channelLower, // Ensure normalized
        },
      })
      
      // DIAGNOSTIC LOG: updated existing conversation
      console.log(`[UPSERT-CONV] UPDATED`, JSON.stringify({
        conversationId: updated.id,
        contactId: input.contactId,
        channel: channelLower,
        externalThreadId: input.externalThreadId,
        leadId: updated.leadId,
        action: 'updated_existing',
      }))
      
      return { id: updated.id }
    }
  }
  
  // Fall back to (contactId, channel) uniqueness (existing constraint)
  const conversation = await prisma.conversation.upsert({
    where: {
      contactId_channel: {
        contactId: input.contactId,
        channel: channelLower,
      },
    },
    update: {
      leadId: input.leadId ?? undefined,
      externalThreadId: input.externalThreadId ?? undefined,
      externalId: input.externalId ?? undefined,
      lastMessageAt: timestamp,
      lastInboundAt: timestamp,
      status: input.status || 'open',
      channel: channelLower, // Ensure normalized
    },
    create: {
      contactId: input.contactId,
      leadId: input.leadId ?? null,
      channel: channelLower,
      externalThreadId: input.externalThreadId ?? null,
      externalId: input.externalId ?? null,
      status: input.status || 'open',
      lastMessageAt: timestamp,
      lastInboundAt: timestamp,
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

