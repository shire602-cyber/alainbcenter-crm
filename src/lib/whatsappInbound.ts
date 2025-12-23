/**
 * WhatsApp Inbound Message Processing Helper
 * 
 * Handles normalization, lead lookup, and conversation creation
 * for inbound WhatsApp messages from webhooks.
 */

import { PrismaClient, Contact, Lead, Conversation } from '@prisma/client'
import { normalizeInboundPhone, findContactByPhone } from './phone-inbound'

export interface InboundMessageContext {
  phoneNumber: string // Raw from WhatsApp
  normalizedPhone: string // E.164 format
  messageId: string
  timestamp: Date
  contact: Contact
  lead: Lead
  conversation: Conversation
}

/**
 * Normalize phone number and find/create contact and lead
 */
export async function findOrCreateLeadFromPhone(
  prisma: PrismaClient,
  rawPhone: string
): Promise<{ contact: Contact; lead: Lead }> {
  // Normalize phone number
  let normalizedPhone: string
  try {
    normalizedPhone = normalizeInboundPhone(rawPhone)
  } catch (error: any) {
    throw new Error(`Failed to normalize phone ${rawPhone}: ${error.message}`)
  }

  // Find or create contact
  let contact = await findContactByPhone(prisma, normalizedPhone)

  if (!contact) {
    // Create new contact
    contact = await prisma.contact.create({
      data: {
        fullName: `WhatsApp User ${normalizedPhone.slice(-4)}`,
        phone: normalizedPhone,
        source: 'whatsapp',
      },
      include: {
        leads: {
          where: {
            OR: [
              { stage: { notIn: ['COMPLETED_WON', 'LOST'] } },
              { pipelineStage: { notIn: ['completed', 'lost'] } },
            ],
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
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
            createdAt: true,
            updatedAt: true,
            // Exclude infoSharedAt, quotationSentAt, lastInfoSharedType for now
          },
        },
      },
    })
  }

  // Find or create lead
  let lead = contact.leads?.[0] || null

  if (!lead) {
    // Create new lead
    lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        status: 'new',
        pipelineStage: 'new',
        stage: 'NEW',
        notes: 'Inbound WhatsApp message',
        lastContactAt: new Date(),
        lastContactChannel: 'whatsapp',
        nextFollowUpAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // +1 day
      },
    })
  } else {
    // Update existing lead's last contact
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastContactAt: new Date(),
        lastContactChannel: 'whatsapp',
      },
    })
  }

  return { contact, lead }
}

/**
 * Find or create conversation for a lead and channel
 */
export async function findOrCreateConversation(
  prisma: PrismaClient,
  leadId: number,
  contactId: number,
  channel: string,
  externalId?: string
): Promise<Conversation> {
  // Try to find existing conversation
  let conversation = await prisma.conversation.findUnique({
    where: {
      contactId_channel: {
        contactId,
        channel: channel.toLowerCase(),
      },
    },
  })

  if (!conversation) {
    // Create new conversation
    conversation = await prisma.conversation.create({
      data: {
        contactId,
        leadId,
        channel: channel.toLowerCase(),
        externalId: externalId || null,
        status: 'open',
        lastMessageAt: new Date(),
        unreadCount: 0,
      },
    })
  } else if (externalId && !conversation.externalId) {
    // Update externalId if we have one and it's missing
    conversation = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { externalId },
    })
  }

  return conversation
}

/**
 * Build WhatsApp conversation external ID
 * Format: phoneNumberId_phoneNumber or just phoneNumber if no phoneNumberId
 */
export function buildWhatsAppExternalId(
  phoneNumberId?: string,
  phoneNumber?: string
): string | undefined {
  if (!phoneNumber) return undefined
  
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '')
  if (phoneNumberId) {
    return `${phoneNumberId}_${cleanPhone}`
  }
  return cleanPhone
}

/**
 * Prepare inbound message context
 */
export async function prepareInboundContext(
  prisma: PrismaClient,
  rawPhone: string,
  phoneNumberId?: string,
  timestamp?: Date
): Promise<InboundMessageContext> {
  const { contact, lead } = await findOrCreateLeadFromPhone(prisma, rawPhone)
  
  const externalId = buildWhatsAppExternalId(phoneNumberId, contact.phone)
  
  const conversation = await findOrCreateConversation(
    prisma,
    lead.id,
    contact.id,
    'whatsapp',
    externalId
  )

  return {
    phoneNumber: rawPhone,
    normalizedPhone: contact.phone,
    messageId: '', // Will be set by caller
    timestamp: timestamp || new Date(),
    contact,
    lead,
    conversation,
  }
}


















