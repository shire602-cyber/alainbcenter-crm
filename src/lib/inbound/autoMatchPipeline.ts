/**
 * AUTO-MATCH EVERYTHING PIPELINE
 * 
 * Unified inbound message handler that:
 * 1. Deduplicates inbound messages
 * 2. Finds/creates Contact (normalize phone)
 * 3. Finds/creates Conversation
 * 4. Finds/creates Lead (smart rules)
 * 5. Creates CommunicationLog
 * 6. Auto-extracts fields (deterministic)
 * 7. Auto-creates tasks/alerts
 * 8. Auto-replies (optional)
 */

import { prisma } from '../prisma'
import { normalizeInboundPhone, findContactByPhone } from '../phone-inbound'
import { extractService, extractNationality, extractExpiry, extractExpiryHint, extractCounts, extractIdentity } from './fieldExtractors'
import { createAutoTasks } from './autoTasks'
import { handleInboundAutoReply } from '../autoReply'

export interface AutoMatchInput {
  channel: 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'
  providerMessageId: string // Unique message ID from provider (for deduplication)
  fromPhone?: string | null
  fromEmail?: string | null
  fromName?: string | null
  text: string
  timestamp?: Date
  metadata?: Record<string, any>
}

export interface AutoMatchResult {
  contact: any
  conversation: any
  lead: any
  message: any
  extractedFields: {
    service?: string
    nationality?: string
    expiries?: Array<{ type: string; date: Date }>
    expiryHint?: string | null
    counts?: { partners?: number; visas?: number }
    identity?: { name?: string; email?: string }
  }
  tasksCreated: number
  autoReplied: boolean
}

/**
 * Main pipeline entrypoint
 */
export async function handleInboundMessageAutoMatch(
  input: AutoMatchInput
): Promise<AutoMatchResult> {
  const startTime = Date.now()
  console.log(`🔄 [AUTO-MATCH] Starting pipeline`, {
    channel: input.channel,
    providerMessageId: input.providerMessageId,
    hasText: !!input.text && input.text.trim().length > 0,
  })

  // Step 1: DEDUPE inbound message
  const isDuplicate = await checkInboundDedupe(input.channel, input.providerMessageId)
  if (isDuplicate) {
    console.log(`✅ [AUTO-MATCH] Duplicate message detected - skipping`)
    throw new Error('DUPLICATE_MESSAGE')
  }

  // Step 2: FIND/CREATE Contact
  const contact = await findOrCreateContact({
    channel: input.channel,
    fromPhone: input.fromPhone,
    fromEmail: input.fromEmail,
    fromName: input.fromName,
  })

  // Step 3: FIND/CREATE Lead (smart rules) - MUST be before conversation to get leadId
  const lead = await findOrCreateLead({
    contactId: contact.id,
    channel: input.channel,
    providerMessageId: input.providerMessageId,
  })

  // Step 4: FIND/CREATE Conversation (linked to lead)
  const conversation = await findOrCreateConversation({
    contactId: contact.id,
    channel: input.channel,
    leadId: lead.id, // CRITICAL: Link conversation to lead
  })

  // Step 5: CREATE CommunicationLog
  const message = await createCommunicationLog({
    conversationId: conversation.id,
    leadId: lead.id,
    contactId: contact.id, // CRITICAL: Include contactId
    channel: input.channel,
    direction: 'in',
    text: input.text,
    providerMessageId: input.providerMessageId,
    timestamp: input.timestamp || new Date(),
  })

  // Step 6: AUTO-EXTRACT FIELDS (deterministic)
  const extractedFields = await extractFields(input.text, contact, lead)

  // Update Contact/Lead with extracted fields
  if (extractedFields.nationality && !contact.nationality) {
    await prisma.contact.update({
      where: { id: contact.id },
      data: { nationality: extractedFields.nationality },
    })
  }

  // CRITICAL FIX: Always update service if extracted (even if already set)
  // This ensures service is updated on every message, not just first
  if (extractedFields.service) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { serviceTypeEnum: extractedFields.service },
    })
    console.log(`✅ [AUTO-MATCH] Updated lead ${lead.id} serviceTypeEnum to: ${extractedFields.service}`)
  }

  // Update dataJson (append, don't overwrite)
  const existingData = lead.dataJson ? JSON.parse(lead.dataJson) : {}
  const updatedData = {
    ...existingData,
    service: extractedFields.service || existingData.service, // Preserve existing if new is null
    nationality: extractedFields.nationality || existingData.nationality,
    expiries: extractedFields.expiries || existingData.expiries || [],
    counts: extractedFields.counts || existingData.counts || {},
    identity: extractedFields.identity || existingData.identity || {},
    extractedAt: new Date().toISOString(),
  }
  
  // Store expiry hint if present (expiry mentioned but no explicit date)
  if (extractedFields.expiryHint) {
    updatedData.expiry_hint_text = extractedFields.expiryHint
    console.log(`📝 [AUTO-MATCH] Stored expiry hint: "${extractedFields.expiryHint}"`)
  }
  
  // CRITICAL FIX: Always update lead with latest data and serviceTypeEnum
  const updateData: any = { 
    dataJson: JSON.stringify(updatedData),
  }
  
  // Update serviceTypeEnum if extracted (even if already set - allows refinement)
  if (extractedFields.service) {
    updateData.serviceTypeEnum = extractedFields.service
  }
  
  await prisma.lead.update({
    where: { id: lead.id },
    data: updateData,
  })
  
  console.log(`✅ [AUTO-MATCH] Updated lead ${lead.id} dataJson and serviceTypeEnum: ${extractedFields.service || 'none'}`)

  // Step 7: AUTO-CREATE TASKS/ALERTS
  const tasksCreated = await createAutoTasks({
    leadId: lead.id,
    conversationId: conversation.id,
    channel: input.channel,
    service: extractedFields.service,
    expiries: extractedFields.expiries,
    expiryHint: extractedFields.expiryHint,
    providerMessageId: input.providerMessageId,
  })

  // Step 8: AUTO-REPLY (optional)
  // Note: Auto-reply is handled by the webhook handler after this pipeline completes
  // This ensures proper idempotency and logging at the webhook level
  // The webhook handler will call handleInboundAutoReply separately
  let autoReplied = false
  // Auto-reply will be handled by the webhook handler (see webhook route.ts)
  
  // Note: The pipeline does NOT call handleInboundAutoReply here because:
  // 1. Webhook handler needs to control timeout (4s)
  // 2. Webhook handler needs to update markInboundProcessed
  // 3. Webhook handler needs to create tasks on timeout

  console.log(`✅ [AUTO-MATCH] Pipeline completed`, {
    contactId: contact.id,
    conversationId: conversation.id,
    leadId: lead.id,
    messageId: message.id,
    tasksCreated,
    autoReplied,
    elapsed: `${Date.now() - startTime}ms`,
  })

  return {
    contact,
    conversation,
    lead,
    message,
    extractedFields,
    tasksCreated,
    autoReplied,
  }
}

/**
 * Step 1: Check inbound deduplication
 */
async function checkInboundDedupe(
  channel: string,
  providerMessageId: string
): Promise<boolean> {
  try {
    await prisma.inboundMessageDedup.create({
      data: {
        provider: channel.toLowerCase(),
        providerMessageId,
        processingStatus: 'PROCESSING',
      },
    })
    return false // Not duplicate
  } catch (error: any) {
    if (error.code === 'P2002') {
      // Unique constraint violation = duplicate
      return true
    }
    throw error
  }
}

/**
 * Step 2: Find or create Contact
 */
async function findOrCreateContact(input: {
  channel: string
  fromPhone?: string | null
  fromEmail?: string | null
  fromName?: string | null
}): Promise<any> {
  let contact = null
  let normalizedPhone: string | null = null

  // Normalize phone if provided
  if (input.fromPhone) {
    try {
      normalizedPhone = normalizeInboundPhone(input.fromPhone)
      contact = await findContactByPhone(prisma, normalizedPhone)
    } catch (error) {
      // Invalid phone format, continue with email lookup
      console.warn(`⚠️ [AUTO-MATCH] Failed to normalize phone ${input.fromPhone}:`, error)
    }
  }

  // Try email if no phone match (but only if phone was not provided or normalization failed)
  // This prevents creating duplicate contacts when phone exists but wasn't normalized correctly
  if (!contact && input.fromEmail) {
    contact = await prisma.contact.findFirst({
      where: { email: input.fromEmail.toLowerCase().trim() },
    })
  }

  // Create if not found
  if (!contact) {
    const contactData: any = {
      fullName: input.fromName || 'Unknown',
      phone: normalizedPhone || (input.fromPhone ? input.fromPhone : ''),
      email: input.fromEmail?.toLowerCase().trim() || null,
      source: input.channel.toLowerCase(), // Contact has source field
    }

    // BUG FIX: Before creating, do one more check with the exact phone we're about to use
    // This prevents race conditions where two messages arrive simultaneously
    if (contactData.phone) {
      const existingContact = await prisma.contact.findFirst({
        where: { phone: contactData.phone },
      })
      if (existingContact) {
        console.log(`✅ [AUTO-MATCH] Found existing contact (race condition check): ${existingContact.id}`)
        return existingContact
      }
    }

    contact = await prisma.contact.create({ data: contactData })
    console.log(`✅ [AUTO-MATCH] Created new contact: ${contact.id}`)
  } else {
    // BUG FIX: Update contact phone if it's missing or different (normalize existing contacts)
    if (normalizedPhone && contact.phone !== normalizedPhone) {
      try {
        // Check if another contact already has this normalized phone
        const existingWithNormalized = await prisma.contact.findFirst({
          where: { phone: normalizedPhone },
        })
        if (!existingWithNormalized) {
          // Safe to update - no conflict
          await prisma.contact.update({
            where: { id: contact.id },
            data: { phone: normalizedPhone },
          })
          console.log(`✅ [AUTO-MATCH] Updated contact ${contact.id} phone to normalized format: ${normalizedPhone}`)
        } else {
          console.warn(`⚠️ [AUTO-MATCH] Contact ${contact.id} has phone ${contact.phone}, but normalized ${normalizedPhone} already exists for contact ${existingWithNormalized.id}`)
        }
      } catch (updateError) {
        console.warn(`⚠️ [AUTO-MATCH] Failed to update contact phone:`, updateError)
      }
    }
    console.log(`✅ [AUTO-MATCH] Found existing contact: ${contact.id}`)
  }

  return contact
}

/**
 * Step 3: Find or create Conversation
 * CRITICAL FIX: Prevent duplicates and always link to lead
 */
async function findOrCreateConversation(input: {
  contactId: number
  channel: string
  leadId: number
}): Promise<any> {
  const channelUpper = input.channel.toUpperCase()
  
  // Try to find existing conversation first
  let conversation = await prisma.conversation.findFirst({
    where: {
      contactId: input.contactId,
      channel: channelUpper,
    },
  })

  if (conversation) {
    // CRITICAL: Update leadId if it's null or different (link to current lead)
    if (!conversation.leadId || conversation.leadId !== input.leadId) {
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          leadId: input.leadId,
          lastInboundAt: new Date(),
          lastMessageAt: new Date(),
        },
      })
      console.log(`✅ [AUTO-MATCH] Updated conversation ${conversation.id} to link to lead ${input.leadId}`)
    } else {
      // Just update timestamps
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastInboundAt: new Date(),
          lastMessageAt: new Date(),
        },
      })
      console.log(`✅ [AUTO-MATCH] Found existing conversation: ${conversation.id}`)
    }
  } else {
    // Create new conversation - use create with error handling for race conditions
    try {
      conversation = await prisma.conversation.create({
        data: {
          contactId: input.contactId,
          leadId: input.leadId, // CRITICAL: Always link to lead
          channel: channelUpper,
          status: 'open',
          lastInboundAt: new Date(),
          lastMessageAt: new Date(),
        },
      })
      console.log(`✅ [AUTO-MATCH] Created new conversation: ${conversation.id} linked to lead ${input.leadId}`)
    } catch (error: any) {
      // Race condition: conversation was created between findFirst and create
      if (error.code === 'P2002') {
        // Unique constraint violation - conversation was created by another process
        conversation = await prisma.conversation.findFirst({
          where: {
            contactId: input.contactId,
            channel: channelUpper,
          },
        })
        if (conversation) {
          // Update leadId if needed
          if (!conversation.leadId || conversation.leadId !== input.leadId) {
            conversation = await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                leadId: input.leadId,
                lastInboundAt: new Date(),
                lastMessageAt: new Date(),
              },
            })
            console.log(`✅ [AUTO-MATCH] Race condition handled: updated conversation ${conversation.id} to link to lead ${input.leadId}`)
          }
        } else {
          throw new Error('Failed to create or find conversation after race condition')
        }
      } else {
        throw error
      }
    }
  }

  return conversation
}

/**
 * Step 4: Find or create Lead (smart rules)
 */
async function findOrCreateLead(input: {
  contactId: number
  channel: string
  providerMessageId: string
}): Promise<any> {
  // Check if this providerMessageId already linked to a lead (idempotency)
  const existingMessage = await prisma.message.findFirst({
    where: {
      providerMessageId: input.providerMessageId,
    },
    include: { lead: true },
  })

  if (existingMessage?.lead) {
    console.log(`✅ [AUTO-MATCH] Message already linked to lead: ${existingMessage.lead.id}`)
    return existingMessage.lead
  }

  // Find open lead (not Won/Lost/Cold) created within last 30 days
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const openLead = await prisma.lead.findFirst({
    where: {
      contactId: input.contactId,
      stage: {
        notIn: ['COMPLETED_WON', 'LOST', 'ON_HOLD'],
      },
      createdAt: {
        gte: thirtyDaysAgo,
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (openLead) {
    console.log(`✅ [AUTO-MATCH] Found open lead: ${openLead.id}`)
    // CRITICAL FIX: Link conversations to this lead if not already linked
    await prisma.conversation.updateMany({
      where: {
        contactId: input.contactId,
        OR: [
          { leadId: null },
          { leadId: { not: openLead.id } },
        ],
      },
      data: {
        leadId: openLead.id,
      },
    })
    // Update lastInboundAt
    await prisma.lead.update({
      where: { id: openLead.id },
      data: { lastInboundAt: new Date() },
    })
    return openLead
  }

  // Create new lead
  const newLead = await prisma.lead.create({
    data: {
      contactId: input.contactId,
      stage: 'NEW',
      status: 'new',
      pipelineStage: 'new',
      lastContactChannel: input.channel.toLowerCase(),
      lastInboundAt: new Date(),
    },
  })
  
  // CRITICAL FIX: Link all existing conversations for this contact to the new lead
  await prisma.conversation.updateMany({
    where: {
      contactId: input.contactId,
      leadId: null, // Only update conversations not linked to a lead
    },
    data: {
      leadId: newLead.id,
    },
  })
  
  // Update contact source if not set
  await prisma.contact.update({
    where: { id: input.contactId },
    data: {
      source: input.channel.toLowerCase(),
    },
  })

  console.log(`✅ [AUTO-MATCH] Created new lead: ${newLead.id} and linked existing conversations`)
  return newLead
}

/**
 * Step 5: Create CommunicationLog (Message record + CommunicationLog)
 */
async function createCommunicationLog(input: {
  conversationId: number
  leadId: number
  contactId: number
  channel: string
  direction: 'in' | 'out'
  text: string
  providerMessageId: string
  timestamp: Date
}): Promise<any> {
  // CRITICAL FIX: Include contactId to ensure proper linking
  const message = await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      leadId: input.leadId,
      contactId: input.contactId, // CRITICAL: Link to contact
      direction: input.direction.toUpperCase(),
      channel: input.channel.toUpperCase(),
      type: 'text',
      body: input.text,
      providerMessageId: input.providerMessageId,
      status: 'RECEIVED',
      createdAt: input.timestamp,
    },
  })

  // Always create CommunicationLog entry (Phase 1 requirement)
  try {
    await prisma.communicationLog.create({
      data: {
        leadId: input.leadId,
        conversationId: input.conversationId,
        channel: input.channel.toLowerCase(),
        direction: input.direction.toLowerCase(),
        messageSnippet: input.text.substring(0, 200),
        body: input.text,
        externalId: input.providerMessageId,
        whatsappMessageId: input.channel.toUpperCase() === 'WHATSAPP' ? input.providerMessageId : null,
        createdAt: input.timestamp,
      },
    })
    console.log(`✅ [AUTO-MATCH] Created CommunicationLog for message: ${message.id}`)
  } catch (logError: any) {
    // Non-blocking - log error but continue
    console.warn(`⚠️ [AUTO-MATCH] Failed to create CommunicationLog:`, logError.message)
  }

  console.log(`✅ [AUTO-MATCH] Created message: ${message.id}`)
  return message
}

/**
 * Step 6: Extract fields (deterministic)
 */
async function extractFields(
  text: string,
  contact: any,
  lead: any
): Promise<AutoMatchResult['extractedFields']> {
  const service = extractService(text)
  const nationality = extractNationality(text)
  const expiries = extractExpiry(text)
  const expiryHint = extractExpiryHint(text)
  const counts = extractCounts(text)
  const identity = extractIdentity(text)

  return {
    service,
    nationality,
    expiries,
    expiryHint,
    counts,
    identity,
  }
}

