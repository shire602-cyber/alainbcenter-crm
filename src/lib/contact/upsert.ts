/**
 * Contact Upsert Logic
 * Single source of truth for finding/creating contacts
 * Priority: waId > phoneNormalized > phone
 */

import type { PrismaClient } from '@prisma/client'
import { normalizePhone } from '../phone/normalize'
import { extractWaId } from '../phone/normalize'

interface UpsertContactInput {
  phone: string
  waId?: string | null
  fullName?: string
  email?: string | null
  nationality?: string | null
  source?: string | null
  webhookPayload?: any // For extracting waId
}

/**
 * Upsert contact with proper normalization and deduplication
 * Priority: waId > phoneNormalized > phone
 */
export async function upsertContact(
  prisma: PrismaClient,
  input: UpsertContactInput
): Promise<{ id: number; phone: string; phoneNormalized: string | null; waId: string | null }> {
  // Extract waId from webhook if not provided
  const waId = input.waId || extractWaId(input.webhookPayload) || null

  // Normalize phone to E.164
  let phoneNormalized: string | null = null
  try {
    phoneNormalized = normalizePhone(input.phone)
  } catch (error: any) {
    console.warn(`⚠️ [CONTACT] Failed to normalize phone ${input.phone}:`, error.message)
    // Continue without normalization - will use raw phone
  }

  // Priority 1: Find by waId (most reliable)
  if (waId) {
    const existingByWaId = await prisma.contact.findUnique({
      where: { waId },
    })

    if (existingByWaId) {
      // Update phoneNormalized if missing
      if (phoneNormalized && !existingByWaId.phoneNormalized) {
        await prisma.contact.update({
          where: { id: existingByWaId.id },
          data: { phoneNormalized },
        })
      }
      return {
        id: existingByWaId.id,
        phone: existingByWaId.phone,
        phoneNormalized: existingByWaId.phoneNormalized || phoneNormalized,
        waId: existingByWaId.waId,
      }
    }
  }

  // Priority 2: Find by phoneNormalized
  if (phoneNormalized) {
    const existingByNormalized = await prisma.contact.findUnique({
      where: { phoneNormalized },
    })

    if (existingByNormalized) {
      // Update waId if provided and missing
      if (waId && !existingByNormalized.waId) {
        await prisma.contact.update({
          where: { id: existingByNormalized.id },
          data: { waId },
        })
      }
      return {
        id: existingByNormalized.id,
        phone: existingByNormalized.phone,
        phoneNormalized: existingByNormalized.phoneNormalized || phoneNormalized,
        waId: existingByNormalized.waId || waId,
      }
    }
  }

  // Priority 3: Find by raw phone (fallback for existing data)
  const existingByPhone = await prisma.contact.findFirst({
    where: { phone: input.phone },
  })

  if (existingByPhone) {
    // Update phoneNormalized and waId if missing
    const updateData: any = {}
    if (phoneNormalized && !existingByPhone.phoneNormalized) {
      updateData.phoneNormalized = phoneNormalized
    }
    if (waId && !existingByPhone.waId) {
      updateData.waId = waId
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.contact.update({
        where: { id: existingByPhone.id },
        data: updateData,
      })
    }

    return {
      id: existingByPhone.id,
      phone: existingByPhone.phone,
      phoneNormalized: existingByPhone.phoneNormalized || phoneNormalized,
      waId: existingByPhone.waId || waId,
    }
  }

  // Create new contact
  // For email-only contacts, use email as phone placeholder
  const contactPhone = input.phone && input.phone !== 'unknown' ? input.phone : (input.email || 'unknown')
  const contactName = input.fullName || (input.email ? `Contact ${input.email}` : `Contact ${phoneNormalized || contactPhone}`)
  
  const newContact = await prisma.contact.create({
    data: {
      phone: contactPhone,
      phoneNormalized: phoneNormalized,
      waId: waId,
      fullName: contactName,
      email: input.email || null,
      nationality: input.nationality || null,
      source: input.source || (input.email ? 'email' : 'whatsapp'),
    },
  })

  return {
    id: newContact.id,
    phone: newContact.phone,
    phoneNormalized: newContact.phoneNormalized,
    waId: newContact.waId,
  }
}

