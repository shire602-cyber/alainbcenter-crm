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
 * STEP 1 FIX: Now uses upsertContact for proper normalization
 */
export async function findOrCreateLeadFromPhone(
  prisma: PrismaClient,
  rawPhone: string,
  webhookPayload?: any
): Promise<{ contact: Contact; lead: any }> {
  // STEP 1 FIX: Use upsertContact for proper normalization and deduplication
  const { upsertContact } = await import('./contact/upsert')
  
  const contactResult = await upsertContact(prisma, {
    phone: rawPhone,
    source: 'whatsapp',
    webhookPayload: webhookPayload,
  })

  // Fetch contact with leads
  const contact = await prisma.contact.findUnique({
    where: { id: contactResult.id },
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
        },
      },
    },
  })

  if (!contact) {
    throw new Error(`Failed to fetch contact after upsert: ${contactResult.id}`)
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
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastContactAt: new Date(),
        lastContactChannel: 'whatsapp',
      },
    })
    // Re-fetch to get full lead object with all fields
    const updatedLead = await prisma.lead.findUnique({
      where: { id: lead.id },
    })
    if (!updatedLead) {
      throw new Error(`Failed to fetch lead after update: ${lead.id}`)
    }
    lead = updatedLead
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
  // CRITICAL FIX: Always use the same conversation for inbound/outbound
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
        leadId, // CRITICAL: Always link to lead
        channel: channel.toLowerCase(),
        externalId: externalId || null,
        status: 'open',
        lastMessageAt: new Date(),
        unreadCount: 0,
      },
    })
    console.log(`✅ [CONV] Created conversation ${conversation.id} for contact ${contactId}, lead ${leadId}`)
  } else {
    // CRITICAL FIX: Update leadId if it's null or different (link to current lead)
    if (!conversation.leadId || conversation.leadId !== leadId) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          leadId: leadId, // Link to current lead
          ...(externalId && !conversation.externalId ? { externalId } : {}),
        },
      })
      console.log(`✅ [CONV] Updated conversation ${conversation.id} to link to lead ${leadId}`)
    } else if (externalId && !conversation.externalId) {
      // Update externalId if we have one and it's missing
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { externalId },
      })
    }
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


















