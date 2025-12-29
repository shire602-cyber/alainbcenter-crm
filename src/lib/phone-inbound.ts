/**
 * Phone number normalization for inbound WhatsApp messages
 * Meta sends phone numbers without + prefix, we need to normalize them
 * 
 * FIX: Handle digits-only international numbers (e.g., "260777711059" → "+260777711059")
 * Uses libphonenumber-js for robust validation after prefixing with +
 */

import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js'

/**
 * Normalize phone number from inbound WhatsApp webhook
 * Meta sends phone as digits-only (e.g., "260777711059" or "971501234567")
 * Converts to E.164: "+260777711059" or "+971501234567"
 * 
 * Requirements:
 * - If digits-only, prefix with +
 * - Validate with libphonenumber-js
 * - Throw error if invalid (caller should handle gracefully)
 */
export function normalizeInboundPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') {
    throw new Error('Phone number is required and must be a string')
  }

  // Trim whitespace
  const trimmed = phone.trim()

  if (!trimmed) {
    throw new Error('Phone number is empty after trimming')
  }

  // Remove all non-digit characters except +
  let cleaned = trimmed.replace(/[^\d+]/g, '')

  // If it already starts with +, validate as-is
  if (cleaned.startsWith('+')) {
    try {
      const phoneNumber = parsePhoneNumber(cleaned)
      if (phoneNumber.isValid()) {
        return phoneNumber.number // Returns E.164 format
      }
      throw new Error(`Invalid phone number format: ${phone}`)
    } catch (error: any) {
      throw new Error(`Failed to normalize phone number "${phone}": ${error.message}`)
    }
  }

  // If digits-only, prefix with + and validate
  // This handles international numbers like "260777711059" (Zambia) or "971501234567" (UAE)
  if (/^\d+$/.test(cleaned)) {
    const withPlus = '+' + cleaned
    
    try {
      // Try to parse without default country (let libphonenumber detect country code)
      const phoneNumber = parsePhoneNumber(withPlus)
      if (phoneNumber.isValid()) {
        return phoneNumber.number // Returns E.164 format
      }
      throw new Error(`Invalid phone number format: ${phone}`)
    } catch (error: any) {
      throw new Error(`Failed to normalize phone number "${phone}": ${error.message}`)
    }
  }

  // If it contains non-digit characters (but not +), try to parse as-is
  try {
    const phoneNumber = parsePhoneNumber(cleaned)
    if (phoneNumber.isValid()) {
      return phoneNumber.number
    }
  } catch {
    // Continue to final error
  }

  throw new Error(
    `Unable to normalize inbound phone number "${phone}". ` +
    `Expected format: digits-only international number (e.g., 260777711059) or E.164 (e.g., +260777711059)`
  )
}

/**
 * Find contact by phone number (flexible matching)
 * Tries multiple formats to find existing contact
 */
export async function findContactByPhone(prisma: any, phone: string): Promise<any | null> {
  let contact = await prisma.contact.findFirst({
    where: { phone },
    include: {
      leads: {
        where: {
          pipelineStage: { notIn: ['completed', 'lost'] },
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

  if (contact) return contact

  const phoneWithoutPlus = phone.replace(/^\+/, '')
  contact = await prisma.contact.findFirst({
    where: { phone: phoneWithoutPlus },
    include: {
      leads: {
        where: {
          pipelineStage: { notIn: ['completed', 'lost'] },
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

  if (contact) return contact

  const phoneWithPlus = phone.startsWith('+') ? phone : '+' + phone
  contact = await prisma.contact.findFirst({
    where: { phone: phoneWithPlus },
    include: {
      leads: {
        where: {
          pipelineStage: { notIn: ['completed', 'lost'] },
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

  if (contact) return contact

  if (phoneWithoutPlus.length >= 9) {
    const lastDigits = phoneWithoutPlus.slice(-9)
    contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone: { endsWith: lastDigits } },
          { phone: { contains: lastDigits } },
        ],
      },
      include: {
        leads: {
          where: {
            pipelineStage: { notIn: ['completed', 'lost'] },
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

  return contact
}











