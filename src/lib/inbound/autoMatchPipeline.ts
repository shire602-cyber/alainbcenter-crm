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
import { upsertContact } from '../contact/upsert'

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
    businessActivityRaw?: string | null
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

  // Step 2: FIND/CREATE Contact (using new upsert logic with normalization)
  // Extract waId from webhook payload if available
  const webhookPayload = input.metadata?.webhookEntry || input.metadata?.webhookValue || input.metadata?.rawPayload || input.metadata
  const contact = await upsertContact(prisma, {
    phone: input.fromPhone || input.fromEmail || 'unknown',
    fullName: input.fromName || undefined,
    email: input.fromEmail || null,
    source: input.channel.toLowerCase(),
    webhookPayload: webhookPayload, // For extracting waId
  })

  // Step 3: FIND/CREATE Lead (smart rules) - MUST be before conversation to get leadId
  const lead = await findOrCreateLead({
    contactId: contact.id,
    channel: input.channel,
    providerMessageId: input.providerMessageId,
    timestamp: input.timestamp, // Use actual message timestamp
  })

  // Step 4: FIND/CREATE Conversation (linked to lead)
  const conversation = await findOrCreateConversation({
    contactId: contact.id,
    channel: input.channel,
    leadId: lead.id, // CRITICAL: Link conversation to lead
    timestamp: input.timestamp, // Use actual message timestamp
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

  // Update Contact with extracted nationality if needed
  if (extractedFields.nationality) {
    // Fetch full contact to check nationality
    const fullContact = await prisma.contact.findUnique({
      where: { id: contact.id },
      select: { nationality: true },
    })
    
    if (!fullContact?.nationality) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { nationality: extractedFields.nationality },
      })
      console.log(`✅ [AUTO-MATCH] Updated contact nationality: ${extractedFields.nationality}`)
    }
  }

  // BUG FIX #1: Merge serviceTypeEnum update into single database operation
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
  
  // PROBLEM B FIX: Always update lead with latest data IMMEDIATELY
  // This ensures lead fields are auto-filled as soon as user mentions service/activity
  const updateData: any = { 
    dataJson: JSON.stringify(updatedData),
  }
  
  // PROBLEM B: Store raw service text (requestedServiceRaw)
  // Extract raw service mention from message text
  if (input.text && input.text.trim().length > 0) {
    // Try to find service keywords in the message
    const serviceKeywords = ['freelance', 'family visa', 'golden visa', 'business setup', 'pro', 'accounting', 'renewal', 'visit visa', 'employment visa', 'investor visa']
    const lowerText = input.text.toLowerCase()
    for (const keyword of serviceKeywords) {
      if (lowerText.includes(keyword)) {
        // Extract the phrase containing the keyword (up to 50 chars)
        const keywordIndex = lowerText.indexOf(keyword)
        const start = Math.max(0, keywordIndex - 20)
        const end = Math.min(lowerText.length, keywordIndex + keyword.length + 30)
        const rawService = input.text.substring(start, end).trim()
        updateData.requestedServiceRaw = rawService
        console.log(`✅ [AUTO-MATCH] Setting requestedServiceRaw: ${rawService}`)
        break
      }
    }
  }
  
  // PROBLEM B: Match service to ServiceType and set serviceTypeId
  if (extractedFields.service) {
    updateData.serviceTypeEnum = extractedFields.service
    
    // Try to find matching ServiceType by name (case-insensitive) or code
    try {
      // PROBLEM B FIX: Use safer case-insensitive matching (works for both SQLite and PostgreSQL)
      const serviceLower = extractedFields.service.toLowerCase()
      const serviceSpaces = extractedFields.service.replace(/_/g, ' ').toLowerCase()
      
      // Get all active service types and match in memory (safer for cross-DB compatibility)
      const allServiceTypes = await prisma.serviceType.findMany({
        where: { isActive: true },
      })
      
      const serviceType = allServiceTypes.find(st => {
        const nameLower = (st.name || '').toLowerCase()
        const codeLower = (st.code || '').toLowerCase()
        return (
          nameLower.includes(serviceLower) ||
          nameLower.includes(serviceSpaces) ||
          codeLower === serviceLower ||
          nameLower === serviceLower ||
          nameLower === serviceSpaces
        )
      })
      
      if (serviceType) {
        updateData.serviceTypeId = serviceType.id
        console.log(`✅ [AUTO-MATCH] Matched serviceTypeId: ${serviceType.id} (${serviceType.name})`)
      } else {
        console.log(`⚠️ [AUTO-MATCH] No ServiceType match found for: ${extractedFields.service}`)
      }
    } catch (error: any) {
      console.warn(`⚠️ [AUTO-MATCH] Failed to match ServiceType:`, error.message)
    }
    
    console.log(`✅ [AUTO-MATCH] Setting serviceTypeEnum IMMEDIATELY: ${extractedFields.service}`)
  }
  
  // Store businessActivityRaw immediately if detected (for business_setup)
  if (extractedFields.businessActivityRaw) {
    updateData.businessActivityRaw = extractedFields.businessActivityRaw
    console.log(`✅ [AUTO-MATCH] Setting businessActivityRaw IMMEDIATELY: ${extractedFields.businessActivityRaw}`)
  }
  
  // Update expiryDate if explicit date extracted
  if (extractedFields.expiries && extractedFields.expiries.length > 0) {
    // Use first expiry date
    updateData.expiryDate = extractedFields.expiries[0].date
    console.log(`✅ [AUTO-MATCH] Setting expiryDate IMMEDIATELY: ${extractedFields.expiries[0].date.toISOString()}`)
  }
  
  await prisma.lead.update({
    where: { id: lead.id },
    data: updateData,
  })
  
  console.log(`✅ [AUTO-MATCH] Updated lead ${lead.id} IMMEDIATELY: serviceTypeEnum=${extractedFields.service || 'none'}, serviceTypeId=${updateData.serviceTypeId || 'none'}, requestedServiceRaw=${updateData.requestedServiceRaw || 'none'}, businessActivityRaw=${extractedFields.businessActivityRaw || 'none'}`)

  // Step 6.5: Recompute deal forecast (non-blocking)
  try {
    const { recomputeAndSaveForecast } = await import('../forecast/dealForecast')
    // Run in background - don't block pipeline
    recomputeAndSaveForecast(lead.id).catch((err) => {
      console.warn(`⚠️ [FORECAST] Failed to recompute forecast for lead ${lead.id}:`, err.message)
    })
  } catch (err) {
    // Forecast module not critical - continue
    console.warn(`⚠️ [FORECAST] Forecast module not available`)
  }

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
 * NOTE: Now using upsertContact from ../contact/upsert for proper normalization and deduplication
 */

/**
 * Step 3: Find or create Conversation
 * STEP 3: CRITICAL FIX - Use upsert to enforce uniqueness and prevent duplicates
 * Enforces one conversation per (contactId, channel) via unique constraint
 */
async function findOrCreateConversation(input: {
  contactId: number
  channel: string
  leadId: number
  timestamp?: Date
}): Promise<any> {
  const channelLower = input.channel.toLowerCase() // STEP 3: Use lowercase for consistency
  // BUG FIX: Use actual message timestamp instead of webhook processing time
  const messageTimestamp = input.timestamp || new Date()
  
  // STEP 3: Use upsert to enforce uniqueness - prevents duplicates at DB level
  // The @@unique([contactId, channel]) constraint ensures only one conversation per contact+channel
  const conversation = await prisma.conversation.upsert({
    where: {
      contactId_channel: {
        contactId: input.contactId,
        channel: channelLower,
      },
    },
    update: {
      // Always update leadId to current lead (ensures conversation is linked)
      leadId: input.leadId,
      lastInboundAt: messageTimestamp, // Use actual message timestamp
      lastMessageAt: messageTimestamp, // Use actual message timestamp
      // Update status to open if it was closed
      status: 'open',
    },
    create: {
      contactId: input.contactId,
      leadId: input.leadId, // CRITICAL: Always link to lead
      channel: channelLower,
      status: 'open',
      lastInboundAt: messageTimestamp, // Use actual message timestamp
      lastMessageAt: messageTimestamp, // Use actual message timestamp
    },
  })
  
  console.log(`✅ [AUTO-MATCH] Ensured conversation ${conversation.id} for contact ${input.contactId}, channel ${channelLower}, lead ${input.leadId}`)
  return conversation
}

/**
 * Step 4: Find or create Lead (smart rules)
 */
async function findOrCreateLead(input: {
  contactId: number
  channel: string
  providerMessageId: string
  timestamp?: Date
}): Promise<any> {
  // BUG FIX: Use actual message timestamp instead of webhook processing time
  const messageTimestamp = input.timestamp || new Date()
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
    // Update lastInboundAt with actual message timestamp
    await prisma.lead.update({
      where: { id: openLead.id },
      data: { lastInboundAt: messageTimestamp },
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
      lastInboundAt: messageTimestamp, // Use actual message timestamp
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
 * STEP 4: Enhanced with services seed and business activity extraction
 */
async function extractFields(
  text: string,
  contact: any,
  lead: any
): Promise<AutoMatchResult['extractedFields'] & { businessActivityRaw?: string | null }> {
  // Use enhanced service detection with services seed
  const { detectServiceFromText, extractBusinessActivityRaw } = await import('./serviceDetection')
  const serviceDetection = await detectServiceFromText(text)
  
  // Use detected service or fallback to legacy extractService
  const service = serviceDetection.serviceTypeEnum || extractService(text)
  
  // STEP 4: Extract business activity (for business_setup services)
  // Store immediately without questioning
  let businessActivityRaw: string | null = null
  if (service === 'MAINLAND_BUSINESS_SETUP' || service === 'FREEZONE_BUSINESS_SETUP' || service?.includes('BUSINESS_SETUP')) {
    businessActivityRaw = await extractBusinessActivityRaw(text)
    if (businessActivityRaw) {
      console.log(`✅ [SERVICE-DETECT] Extracted businessActivityRaw IMMEDIATELY: ${businessActivityRaw}`)
    }
  }
  
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
    businessActivityRaw,
  }
}

