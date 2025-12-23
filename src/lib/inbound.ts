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
            contact: true,
            lead: {
              select: {
                id: true,
                contactId: true,
                stage: true,
                pipelineStage: true,
                leadType: true,
                serviceTypeId: true,
                priority: true,
                aiScore: true,
                nextFollowUpAt: true,
                lastContactAt: true,
                expiryDate: true,
                autopilotEnabled: true,
                // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
              },
              include: {
                contact: true,
              },
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
    // Use phone number as display name if no name provided
    let displayName = fromName
    if (!displayName && contactLookupField === 'phone' && normalizedAddress) {
      displayName = normalizedAddress
    } else if (!displayName) {
      displayName = `Unknown ${channel} User`
    }
    
    const contactData: any = {
      fullName: displayName,
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
    // Don't update conversation here - will be updated after message creation
    // This prevents race conditions with duplicate detection
    console.log(`📋 Found existing conversation: ${conversation.id}`)
  }

  // Step 6: Create Message record (with idempotency check via providerMessageId)
  // Determine message type based on media
  let messageType = 'text'
  if (mediaUrl && mediaMimeType) {
    if (mediaMimeType.startsWith('image/')) {
      messageType = 'image'
    } else if (mediaMimeType.startsWith('video/')) {
      messageType = 'video'
    } else if (mediaMimeType.startsWith('audio/')) {
      messageType = 'audio'
    } else if (mediaMimeType.startsWith('application/') || mediaMimeType.includes('pdf') || mediaMimeType.includes('document')) {
      messageType = 'document'
    }
  }
  
  let message
  let isDuplicate = false
  try {
    message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        direction: 'inbound', // Use lowercase to match inbox expectations
        channel: channelLower,
        type: messageType,
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
      isDuplicate = true
      message = await prisma.message.findUnique({
        where: { providerMessageId: externalMessageId },
      })
      if (!message) {
        throw new Error('Duplicate message detected but could not fetch existing message')
      }
      console.log(`✅ Using existing message ${message.id}`)
      
      // Even for duplicates, update conversation timestamps if this message is newer
      // This handles cases where webhook retries with same message ID
      if (message.createdAt < timestamp) {
        console.log(`📝 Updating conversation timestamps for duplicate message (newer timestamp)`)
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            lastMessageAt: timestamp,
            lastInboundAt: timestamp,
            // Don't increment unreadCount for duplicates
          },
        })
      }
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
  
  // Only update conversation if this is NOT a duplicate (duplicates handled above)
  if (!isDuplicate) {
    // Conversation was already updated in Step 5, but ensure it's current
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: timestamp,
        lastInboundAt: timestamp,
        unreadCount: {
          increment: 1,
        },
      },
    })
    console.log(`✅ Updated conversation ${conversation.id} timestamps and unreadCount`)
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

  // Step 8: AI Data Extraction (Phase 1) - Extract structured data from message
  if (body && body.trim().length > 0) {
    try {
      const { extractLeadDataFromMessage } = await import('./ai/extractData')
      const extracted = await extractLeadDataFromMessage(
        body,
        contact,
        lead
      )

      // Only update if confidence is reasonable (>50) and data is new/better
      if (extracted.confidence > 50) {
        const updates: any = {}
        const contactUpdates: any = {}

        // Update contact if we have better info
        if (extracted.name && (!contact.fullName || contact.fullName.includes('Unknown') || contact.fullName.includes('WhatsApp'))) {
          contactUpdates.fullName = extracted.name
        }
        if (extracted.email && !contact.email) {
          contactUpdates.email = extracted.email
        }
        if (extracted.phone && !contact.phone) {
          contactUpdates.phone = extracted.phone
        }
        if (extracted.nationality && !contact.nationality) {
          contactUpdates.nationality = extracted.nationality
        }

        // Update lead if we have better info
        if (extracted.serviceType && !lead.leadType && !lead.serviceTypeId) {
          // Try to find matching ServiceType
          // SQLite doesn't support case-insensitive mode, use contains (case-sensitive)
          const serviceType = await prisma.serviceType.findFirst({
            where: {
              OR: [
                { name: { contains: extracted.serviceType } },
                { code: extracted.serviceTypeEnum || undefined },
              ],
            },
          })
          if (serviceType) {
            updates.serviceTypeId = serviceType.id
            updates.leadType = serviceType.name
          } else {
            updates.leadType = extracted.serviceType
          }
        }
        if (extracted.serviceTypeEnum && !lead.serviceTypeEnum) {
          updates.serviceTypeEnum = extracted.serviceTypeEnum
        }
        if (extracted.urgency && !lead.urgency) {
          updates.urgency = extracted.urgency.toUpperCase()
        }
        if (extracted.expiryDate) {
          try {
            const parsedDate = new Date(extracted.expiryDate)
            if (!isNaN(parsedDate.getTime()) && !lead.expiryDate) {
              updates.expiryDate = parsedDate
            }
          } catch {
            // Ignore invalid dates
          }
        }
        if (extracted.notes && (!lead.notes || lead.notes.length < extracted.notes.length)) {
          updates.notes = lead.notes 
            ? `${lead.notes}\n\n[AI Extracted]: ${extracted.notes}`
            : extracted.notes
        }

        // Apply updates
        if (Object.keys(contactUpdates).length > 0) {
          await prisma.contact.update({
            where: { id: contact.id },
            data: contactUpdates,
          })
          console.log(`✅ Updated contact ${contact.id} with AI-extracted data`)
        }

        if (Object.keys(updates).length > 0) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: updates,
          })
          console.log(`✅ Updated lead ${lead.id} with AI-extracted data`)
        }
      }
    } catch (extractError: any) {
      // Don't fail the whole process if extraction fails
      console.warn('AI data extraction failed (non-blocking):', extractError.message)
    }
  }

  // Step 9: Trigger automation (non-blocking)
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











