/**
 * SAFE MERGE UTILITY FOR COLLECTED DATA
 * 
 * Prevents data wiping by:
 * - Never overwriting existing non-empty values with null/undefined
 * - Deep merging nested objects
 * - Only applying updates when they contain real values
 */

import type { Prisma } from '@prisma/client'

/**
 * Deep merge two objects, never overwriting existing non-empty values with null/undefined
 */
export function mergeJsonSafe(existing: any, incoming: any): any {
  if (!incoming || typeof incoming !== 'object') {
    return existing || incoming
  }

  if (!existing || typeof existing !== 'object') {
    return incoming
  }

  const result = { ...existing }

  for (const key in incoming) {
    if (!incoming.hasOwnProperty(key)) continue

    const incomingValue = incoming[key]
    const existingValue = result[key]

    // Skip null/undefined incoming values
    if (incomingValue === null || incomingValue === undefined) {
      continue
    }

    // If existing value is empty/null/undefined, use incoming
    if (existingValue === null || existingValue === undefined || existingValue === '') {
      result[key] = incomingValue
      continue
    }

    // If both are objects, deep merge
    if (
      typeof existingValue === 'object' &&
      typeof incomingValue === 'object' &&
      !Array.isArray(existingValue) &&
      !Array.isArray(incomingValue) &&
      !(existingValue instanceof Date) &&
      !(incomingValue instanceof Date)
    ) {
      result[key] = mergeJsonSafe(existingValue, incomingValue)
      continue
    }

    // If both are arrays, merge arrays (prefer incoming if non-empty)
    if (Array.isArray(existingValue) && Array.isArray(incomingValue)) {
      result[key] = incomingValue.length > 0 ? incomingValue : existingValue
      continue
    }

    // For primitives, prefer incoming if it's non-empty
    if (incomingValue !== '' && incomingValue !== null && incomingValue !== undefined) {
      result[key] = incomingValue
    }
  }

  return result
}

/**
 * Build Prisma LeadUpdateInput from extracted fields
 * Only sets defined, non-empty values
 */
export function buildLeadUpdateFromExtracted(extracted: {
  service?: string | null
  nationality?: string | null
  expiries?: Array<{ type: string; date: Date }> | null
  identity?: { name?: string; email?: string } | null
  counts?: { partners?: number; visas?: number } | null
  businessActivityRaw?: string | null
  serviceRaw?: string | null
}): Prisma.LeadUpdateInput {
  const update: Prisma.LeadUpdateInput = {}

  // Service
  if (extracted.service) {
    update.serviceTypeEnum = extracted.service
  }
  if (extracted.serviceRaw) {
    update.requestedServiceRaw = extracted.serviceRaw
  }

  // Business activity
  if (extracted.businessActivityRaw) {
    update.businessActivityRaw = extracted.businessActivityRaw
  }

  // Expiry date (use first explicit expiry)
  if (extracted.expiries && extracted.expiries.length > 0) {
    update.expiryDate = extracted.expiries[0].date
  }

  // Data JSON merge (preserve existing data)
  // Note: This will be merged with existing dataJson in the caller
  const dataJson: any = {}
  if (extracted.service) dataJson.service = extracted.service
  if (extracted.nationality) dataJson.nationality = extracted.nationality
  if (extracted.expiries && extracted.expiries.length > 0) {
    dataJson.expiries = extracted.expiries
  }
  if (extracted.identity) dataJson.identity = extracted.identity
  if (extracted.counts) dataJson.counts = extracted.counts
  if (extracted.businessActivityRaw) dataJson.businessActivityRaw = extracted.businessActivityRaw

  if (Object.keys(dataJson).length > 0) {
    // Store as JSON string for merging later
    update.dataJson = JSON.stringify(dataJson)
  }

  return update
}

/**
 * Build Prisma ConversationUpdateInput from extracted fields
 * Merges with existing knownFields
 */
export function buildConversationUpdateFromExtracted(
  existingKnownFields: any,
  extracted: {
    service?: string | null
    nationality?: string | null
    expiries?: Array<{ type: string; date: Date }> | null
    identity?: { name?: string; email?: string } | null
    counts?: { partners?: number; visas?: number } | null
    businessActivityRaw?: string | null
  }
): Prisma.ConversationUpdateInput {
  const existing = existingKnownFields 
    ? (typeof existingKnownFields === 'string' ? JSON.parse(existingKnownFields) : existingKnownFields)
    : {}

  const merged = mergeJsonSafe(existing, {
    ...extracted,
    extractedAt: new Date().toISOString(),
  })

  return {
    knownFields: JSON.stringify(merged),
  }
}

