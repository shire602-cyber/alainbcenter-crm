/**
 * Common Inbound Message Handler
 * 
 * DEPRECATED: This function is now a wrapper around the new AUTO-MATCH pipeline.
 * The new pipeline provides:
 * - Deterministic field extraction (no LLM required)
 * - Auto-task creation
 * - Smart lead reuse (30-day window)
 * - Better error handling
 * 
 * For new code, use `handleInboundMessageAutoMatch` directly from `@/lib/inbound/autoMatchPipeline`
 */

import { handleInboundMessageAutoMatch } from './inbound/autoMatchPipeline'
import { normalizeInboundPhone } from './phone-inbound'

export type InboundChannel = 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'

export interface InboundMessageInput {
  channel: InboundChannel
  externalId?: string | null // Provider conversation/thread ID
  externalMessageId?: string | null // Provider message ID (for idempotency)
  fromAddress?: string | null // Email address, phone, or social handle
  fromName?: string | null
  body: string
  rawPayload?: unknown
  receivedAt?: Date
  mediaUrl?: string | null
  mediaMimeType?: string | null
}

/**
 * Handle an inbound message from any channel
 * 
 * This function is now a wrapper around the new AUTO-MATCH pipeline.
 * It maintains backward compatibility with existing callers.
 * 
 * Returns the created/updated Lead, Conversation, Message, and Contact
 */
export async function handleInboundMessage(
  input: InboundMessageInput
): Promise<{
  lead: any
  conversation: any
  message: any
  contact: any
}> {
  console.log(`📥 [INBOUND] handleInboundMessage called (legacy wrapper)`, {
    channel: input.channel,
    fromAddress: input.fromAddress,
    hasBody: !!input.body && input.body.trim().length > 0,
    bodyLength: input.body?.length || 0,
    externalMessageId: input.externalMessageId,
  })

  // Convert old interface to new pipeline interface
  // Generate providerMessageId if not provided (for backward compatibility)
  const providerMessageId = input.externalMessageId || `legacy_${input.channel.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

  // Parse fromAddress to determine if it's phone or email
  let fromPhone: string | null = null
  let fromEmail: string | null = null

  if (input.fromAddress) {
    if (input.fromAddress.includes('@')) {
      // It's an email
      fromEmail = input.fromAddress.toLowerCase().trim()
    } else if (/^\+?[0-9]/.test(input.fromAddress)) {
      // It looks like a phone number
      try {
        fromPhone = normalizeInboundPhone(input.fromAddress)
      } catch {
        // Invalid phone, treat as email or handle based on channel
        if (input.channel === 'WHATSAPP') {
          // WhatsApp should always have a phone
          fromPhone = input.fromAddress
        } else {
          // For other channels, might be a handle/ID
          fromPhone = input.fromAddress
        }
      }
    } else {
      // Social handle or other identifier
      // For WhatsApp, assume it's a phone
      if (input.channel === 'WHATSAPP') {
        fromPhone = input.fromAddress
      } else {
        // For other channels, could be email or handle
        fromEmail = input.fromAddress.toLowerCase().trim()
      }
    }
  }

  try {
    // Call new pipeline
    const result = await handleInboundMessageAutoMatch({
      channel: input.channel,
      providerMessageId: providerMessageId,
      fromPhone: fromPhone,
      fromEmail: fromEmail,
      fromName: input.fromName || null,
      text: input.body,
      timestamp: input.receivedAt || new Date(),
      metadata: {
        externalId: input.externalId,
        rawPayload: input.rawPayload,
        mediaUrl: input.mediaUrl,
        mediaMimeType: input.mediaMimeType,
      },
    })

    // Map new result to old interface (backward compatibility)
    return {
      lead: result.lead,
      conversation: result.conversation,
      message: result.message,
      contact: result.contact,
    }
  } catch (error: any) {
    // Handle duplicate message error gracefully
    if (error.message === 'DUPLICATE_MESSAGE') {
      console.log(`⚠️ [INBOUND] Duplicate message detected (legacy wrapper)`)
      // Try to find existing message and return it
      const { prisma } = await import('./prisma')
      const existingMessage = await prisma.message.findFirst({
        where: {
          providerMessageId: providerMessageId,
        },
        include: {
          conversation: {
            include: {
              contact: true,
              lead: true,
            },
          },
        },
      })

      if (existingMessage && existingMessage.conversation.lead) {
        return {
          lead: existingMessage.conversation.lead,
          conversation: existingMessage.conversation,
          message: existingMessage,
          contact: existingMessage.conversation.contact,
        }
      }

      // If we can't find existing, throw
      throw new Error('Duplicate message and cannot find existing record')
    }

    // Re-throw other errors
    throw error
  }
}
