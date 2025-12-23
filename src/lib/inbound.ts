/**
 * Common Inbound Message Handler
 * 
 * Unified handler for processing inbound messages from any channel
 * (WhatsApp, Email, Instagram, Facebook, Webchat)
 * 
 * This ensures consistent Lead/Conversation/Message creation and automation triggering
 * across all channels.
 */

import { prisma } from './prisma'
import { normalizeInboundPhone, findContactByPhone } from './phone-inbound'
import { runInboundAutomationsForMessage } from './automation/inbound'

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
 * This function:
 * 1. Normalizes the sender address per channel
 * 2. Finds or creates Contact
 * 3. Finds or creates Lead
 * 4. Finds or creates Conversation
 * 5. Creates Message record (with idempotency check)
 * 6. Triggers automation rules
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
  const {
    channel,
    externalId,
    externalMessageId,
    fromAddress,
    fromName,
    body,
    rawPayload,
    receivedAt,
    mediaUrl,
    mediaMimeType,
  } = input

  const timestamp = receivedAt || new Date()
  const channelLower = channel.toLowerCase()

  // Step 1: Normalize fromAddress per channel
  let normalizedAddress: string | null = null
  let contactLookupField: 'phone' | 'email' | null = null

  if (channel === 'WHATSAPP') {
    if (fromAddress) {
      normalizedAddress = normalizeInboundPhone(fromAddress)
      contactLookupField = 'phone'
    }
  } else if (channel === 'EMAIL') {
    if (fromAddress) {
      normalizedAddress = fromAddress.toLowerCase().trim()
      contactLookupField = 'email'
    }
  } else if (channel === 'INSTAGRAM' || channel === 'FACEBOOK') {
    // For social platforms, we'll store the handle/ID in a field
    // For now, try to find by phone/email if provided, otherwise use fromAddress as identifier
    normalizedAddress = fromAddress || null
    // We'll search by phone/email first, then by external ID in conversation
    contactLookupField = null // Will search by multiple fields
  } else if (channel === 'WEBCHAT') {
    // Webchat might provide email or session ID
    if (fromAddress?.includes('@')) {
      normalizedAddress = fromAddress.toLowerCase().trim()
      contactLookupField = 'email'
    } else {
      normalizedAddress = fromAddress || null
      contactLookupField = null
    }
  }

  // Step 2: Idempotency check - if externalMessageId provided, check for existing message
  if (externalMessageId) {
    const existingMessage = await prisma.message.findUnique({
      where: { providerMessageId: externalMessageId },
      include: {
        conversation: {
          include: {
            lead: {
              include: { contact: true },
            },
          },
        },
      },
    })

    if (existingMessage) {
      console.log(`⚠️ Duplicate message ${externalMessageId} detected - returning existing`)
      if (!existingMessage.conversation.lead) {
        throw new Error('Message conversation has no associated lead')
      }
      return {
        lead: existingMessage.conversation.lead,
        conversation: existingMessage.conversation,
        message: existingMessage,
        contact: existingMessage.conversation.lead.contact,
      }
    }
  }

  // Step 3: Find or create Contact
  let contact = null

  if (contactLookupField === 'phone' && normalizedAddress) {
    contact = await findContactByPhone(prisma, normalizedAddress)
  } else if (contactLookupField === 'email' && normalizedAddress) {
    contact = await prisma.contact.findFirst({
      where: { email: normalizedAddress },
    })
  } else if (channel === 'INSTAGRAM' || channel === 'FACEBOOK') {
    // For social platforms, try to find by external ID in conversation
    if (externalId) {
      const existingConv = await prisma.conversation.findFirst({
        where: {
          channel: channelLower,
          externalId: externalId,
        },
        include: {
          contact: true,
        },
      })
      if (existingConv?.contact) {
        contact = existingConv.contact
      }
    }

    // Also try phone/email if fromAddress looks like one
    if (!contact && fromAddress) {
      if (fromAddress.includes('@')) {
        contact = await prisma.contact.findFirst({
          where: { email: fromAddress.toLowerCase() },
        })
      } else if (/^\+?[0-9]/.test(fromAddress)) {
        const normalizedPhone = normalizeInboundPhone(fromAddress)
        contact = await findContactByPhone(prisma, normalizedPhone)
      }
    }
  }

  // Create contact if not found
  if (!contact) {
    const contactData: any = {
      fullName: fromName || `Unknown ${channel} User`,
      source: channelLower,
    }

    if (contactLookupField === 'phone' && normalizedAddress) {
      contactData.phone = normalizedAddress
    } else if (contactLookupField === 'email' && normalizedAddress) {
      contactData.email = normalizedAddress
    } else if (channel === 'INSTAGRAM' || channel === 'FACEBOOK') {
      // Store social handle in phone field temporarily (or add socialHandle field later)
      contactData.phone = fromAddress || `social_${Date.now()}`
      contactData.notes = `${channel} handle: ${fromAddress || 'unknown'}`
    } else if (channel === 'WEBCHAT') {
      if (normalizedAddress?.includes('@')) {
        contactData.email = normalizedAddress
      } else {
        contactData.phone = fromAddress || `webchat_${Date.now()}`
      }
    }

    contact = await prisma.contact.create({
      data: contactData,
    })
    console.log(`✅ Created new contact: ${contact.id} for ${channel} user`)
  }

  // Step 4: Find or create Lead
  let lead = await prisma.lead.findFirst({
    where: {
      contactId: contact.id,
      OR: [
        { stage: { notIn: ['COMPLETED_WON', 'LOST'] } },
        { pipelineStage: { notIn: ['completed', 'lost'] } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  })

  if (!lead) {
    // Create minimal lead
    lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        stage: 'NEW',
        pipelineStage: 'new',
        status: 'new',
        notes: `Inbound ${channel} message`,
        lastContactAt: timestamp,
        lastContactChannel: channelLower,
        // source field not in Lead schema - removed
      },
    })
    console.log(`✅ Created new lead: ${lead.id} for contact ${contact.id}`)
  } else {
    // Update existing lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastContactAt: timestamp,
        lastContactChannel: channelLower,
      },
    })
  }

  // Step 5: Find or create Conversation
  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      channel: channelLower,
      ...(externalId ? { externalId } : {}),
    },
  })

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        leadId: lead.id,
        channel: channelLower,
        externalId: externalId || null,
        status: 'open',
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        unreadCount: 1,
      },
    })
    console.log(`✅ Created new conversation: ${conversation.id} for contact ${contact.id}`)
  } else {
    // Update conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        unreadCount: {
          increment: 1,
        },
        ...(externalId && !conversation.externalId ? { externalId } : {}),
      },
    })
    console.log(`✅ Updated conversation: ${conversation.id} - unreadCount incremented`)
  }

  // Step 6: Create Message record (with idempotency check via providerMessageId)
  let message
  try {
    message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        direction: 'inbound', // Use lowercase to match inbox expectations
        channel: channelLower,
        type: 'text',
        body: body || null,
        mediaUrl: mediaUrl || null,
        mediaMimeType: mediaMimeType || null,
        providerMessageId: externalMessageId || null,
        status: 'RECEIVED',
        payload: rawPayload ? JSON.stringify(rawPayload) : null,
        rawPayload: rawPayload ? JSON.stringify(rawPayload) : null,
        createdAt: timestamp,
      },
    })
    console.log(`✅ Created inbound message ${message.id} for conversation ${conversation.id}`)
  } catch (error: any) {
    // Handle duplicate message (idempotency)
    if (error.code === 'P2002' && externalMessageId && error.meta?.target?.includes('providerMessageId')) {
      console.log(`⚠️ Duplicate message detected (providerMessageId: ${externalMessageId}), fetching existing`)
      message = await prisma.message.findUnique({
        where: { providerMessageId: externalMessageId },
      })
      if (!message) {
        throw new Error('Duplicate message detected but could not fetch existing message')
      }
      console.log(`✅ Using existing message ${message.id}`)
    } else {
      console.error(`❌ Failed to create message:`, {
        error: error.message,
        code: error.code,
        externalMessageId,
        conversationId: conversation.id,
      })
      throw error
    }
  }

  // Create initial status event
  try {
    await prisma.messageStatusEvent.create({
      data: {
        messageId: message.id,
        conversationId: conversation.id,
        status: 'RECEIVED',
        providerStatus: 'received',
        rawPayload: rawPayload ? JSON.stringify(rawPayload) : null,
        receivedAt: timestamp,
      },
    })
  } catch (e) {
    console.warn('Failed to create MessageStatusEvent:', e)
  }

  // Step 7: Create CommunicationLog (legacy, for backward compatibility)
  try {
    await prisma.communicationLog.create({
      data: {
        leadId: lead.id,
        conversationId: conversation.id,
        channel: channelLower,
        direction: 'inbound',
        from: fromAddress || null,
        body: body,
        messageSnippet: body?.substring(0, 200) || 'Inbound message',
        externalId: externalMessageId || null,
        meta: rawPayload ? JSON.stringify(rawPayload) : null,
        isRead: false,
      },
    })
  } catch (e) {
    // CommunicationLog might have unique constraints - that's OK
    console.warn('Failed to create CommunicationLog:', e)
  }

  // Step 8: Trigger automation (non-blocking)
  // Run in background to keep response fast
  // Note: Automation is already triggered in handleInboundMessage, but we ensure it's called
  // The automation handler will check for INBOUND_MESSAGE rules and execute them
  runInboundAutomationsForMessage(lead.id, {
    id: message.id,
    direction: message.direction,
    channel: message.channel,
    body: message.body,
    createdAt: message.createdAt,
  }).catch((err) => {
    console.error('Background automation error:', err)
  })

  console.log(
    `✅ Processed inbound ${channel} message ${externalMessageId || message.id} from ${fromAddress || 'unknown'}`
  )

  // Reload lead with contact for return
  const leadWithContact = await prisma.lead.findUnique({
    where: { id: lead.id },
    include: { contact: true },
  })

  return {
    lead: leadWithContact || lead,
    conversation,
    message,
    contact,
  }
}











