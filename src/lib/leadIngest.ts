// Shared lead ingestion logic
// Used by both /api/leads and /api/leads/ingest

import { prisma } from './prisma'
import { qualifyLead } from './aiQualification'

export type IngestLeadData = {
  fullName: string
  phone: string
  email?: string
  service?: string // e.g. "Family Visa", "Business Setup" - maps to leadType (legacy)
  leadType?: string // Alternative field name (legacy)
  serviceTypeId?: number // New: ServiceType ID
  serviceTypeEnum?: string // Direct enum field
  source: 'website' | 'facebook_ad' | 'instagram_ad' | 'whatsapp' | 'manual' | 'RENEWAL'
  notes?: string
  message?: string // Alternative field name for notes
  expiryDate?: string // ISO date string
  nextFollowUpAt?: string // ISO date string
  nationality?: string
  isRenewal?: boolean
  originalExpiryItemId?: number
  estimatedValue?: string // Decimal as string
}

/**
 * Shared function to ingest a lead from any source
 * Handles: contact lookup/creation, lead creation, AI qualification, communication logging
 */
export async function ingestLead(data: IngestLeadData) {
  // Handle serviceTypeId or fallback to legacy leadType/service
  let serviceTypeId: number | null = null
  let leadType: string | null = null

  if (data.serviceTypeId) {
    // New way: use ServiceType
    // Validate that the ServiceType exists before proceeding
    const serviceType = await prisma.serviceType.findUnique({
      where: { id: data.serviceTypeId },
    })
    
    if (!serviceType) {
      throw new Error(`ServiceType with ID ${data.serviceTypeId} not found`)
    }
    
    // ServiceType exists - use it
    serviceTypeId = data.serviceTypeId
    leadType = serviceType.name // Sync leadType with ServiceType name
  } else {
    // Legacy way: use string leadType/service
    leadType = data.service || data.leadType || null
  }

  // Map source for Contact.source
  // Keep normalized values consistent: use the same normalized source throughout
  const contactSource = data.source // Use normalized source as-is for consistency

  // STEP 1 FIX: Use upsertContact for proper normalization and deduplication
  const { upsertContact } = await import('./contact/upsert')
  
  const contactResult = await upsertContact(prisma, {
    phone: data.phone,
    fullName: data.fullName,
    email: data.email || null,
    nationality: data.nationality || null,
    source: contactSource,
  })

  // Fetch full contact record
  const contact = await prisma.contact.findUnique({
    where: { id: contactResult.id },
  })

  if (!contact) {
    throw new Error(`Failed to fetch contact after upsert: ${contactResult.id}`)
  }

  // Qualify the lead with AI
  const qualification = await qualifyLead({
    fullName: data.fullName,
    phone: data.phone,
    email: data.email || null,
    leadType: leadType || null,
    source: data.source || null,
    notes: data.notes || data.message || null,
  })

  // Parse and validate dates (handle empty strings)
  // Validate date format to prevent Invalid Date objects from reaching database
  // Matches validation logic in PATCH /api/leads/[id] endpoint
  let expiryDate: Date | null = null
  if (data.expiryDate && data.expiryDate !== '') {
    const parsedDate = new Date(data.expiryDate)
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date format for expiryDate')
    }
    expiryDate = parsedDate
  }

  let nextFollowUpAt: Date | null = null
  if (data.nextFollowUpAt && data.nextFollowUpAt !== '') {
    const parsedDate = new Date(data.nextFollowUpAt)
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date format for nextFollowUpAt')
    }
    nextFollowUpAt = parsedDate
  }

  // Create the lead
  const lead = await prisma.lead.create({
    data: {
      contactId: contact.id,
      serviceTypeId: serviceTypeId,
      serviceTypeEnum: data.serviceTypeEnum || null,
      leadType: leadType, // Keep for backward compatibility
      notes: data.notes || data.message || null,
      expiryDate: expiryDate,
      nextFollowUpAt: nextFollowUpAt,
      aiScore: qualification.aiScore,
      aiNotes: qualification.aiNotes,
      isRenewal: data.isRenewal || false,
      originalExpiryItemId: data.originalExpiryItemId || null,
      estimatedValue: data.estimatedValue || null,
    },
    include: { contact: true },
  })

  // Map source to communication channel
  // Valid channels: 'whatsapp', 'email', 'phone', 'internal'
  // Map 'website' to 'phone' to match API validation
  const channel = data.source === 'whatsapp' ? 'whatsapp' :
                  (data.source.includes('facebook') || data.source.includes('instagram')) ? 'email' :
                  'phone' // Default to 'phone' for website, manual, and other sources

  // Create inbound communication log entry
  const messageText = data.notes || data.message || `Lead received from ${data.source}`
  await prisma.communicationLog.create({
    data: {
      leadId: lead.id,
      channel: channel,
      direction: 'inbound',
      messageSnippet: messageText.substring(0, 200),
    },
  })

  return {
    lead,
    contact,
    qualification,
  }
}
