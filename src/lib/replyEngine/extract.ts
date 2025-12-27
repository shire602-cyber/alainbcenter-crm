/**
 * DETERMINISTIC EXTRACTOR (NO LLM)
 * Extracts structured data from inbound messages using rules only
 */

import type { ExtractedFields, ServiceKey } from './types'
import { extractService, extractNationality, extractExpiry } from '../inbound/fieldExtractors'

/**
 * Extract all fields from inbound message text
 */
export function extractFields(text: string): ExtractedFields {
  const lowerText = text.toLowerCase()
  const extracted: ExtractedFields = {}

  // Extract service key
  const service = extractService(text)
  if (service) {
    extracted.serviceKey = service as ServiceKey
  }

  // Extract nationality
  const nationality = extractNationality(text)
  if (nationality) {
    extracted.nationality = nationality
  }

  // Extract explicit dates only (no relative dates)
  const expiry = extractExpiry(text)
  if (expiry && Array.isArray(expiry) && expiry.length > 0) {
    // Take the first expiry date
    extracted.explicitDate = expiry[0].date
  }

  // Extract full name (simple patterns)
  const nameMatch = extractFullName(text)
  if (nameMatch) {
    extracted.fullName = nameMatch
  }

  // Extract business setup fields
  if (extracted.serviceKey === 'business_setup' || lowerText.includes('business') || lowerText.includes('license')) {
    const businessFields = extractBusinessSetupFields(text)
    Object.assign(extracted, businessFields)
  }

  return extracted
}

/**
 * Extract full name from text
 */
function extractFullName(text: string): string | undefined {
  // Pattern: "my name is X", "I am X", "this is X", "call me X"
  const patterns = [
    /(?:my name is|i am|this is|call me|i'm|im)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      // Basic validation: at least 2 words, max 5 words
      const words = name.split(/\s+/)
      if (words.length >= 2 && words.length <= 5) {
        return name
      }
    }
  }

  return undefined
}

/**
 * Extract business setup specific fields
 */
function extractBusinessSetupFields(text: string): Partial<ExtractedFields> {
  const lowerText = text.toLowerCase()
  const fields: Partial<ExtractedFields> = {}

  // Extract activity phrase
  const activityPatterns = [
    /(?:activity|business|trade|license).*?is\s+(.+?)(?:\.|$)/i,
    /(?:i want|need|looking for).*?(?:activity|business|trade|license).*?for\s+(.+?)(?:\.|$)/i,
  ]

  for (const pattern of activityPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const activity = match[1].trim()
      if (activity.length > 3 && activity.length < 100) {
        fields.businessActivity = activity
        return fields // Return early when found
      }
    }
  }

  // Extract jurisdiction (mainland/freezone)
  if (lowerText.includes('mainland') || lowerText.includes('main land')) {
    fields.jurisdiction = 'mainland'
  } else if (lowerText.includes('freezone') || lowerText.includes('free zone') || lowerText.includes('free-zone')) {
    fields.jurisdiction = 'freezone'
  }

  // Extract partners count
  const partnersMatch = text.match(/(?:partner|partners|shareholder|shareholders).*?(\d+)/i)
  if (partnersMatch) {
    const count = parseInt(partnersMatch[1], 10)
    if (count >= 1 && count <= 10) {
      fields.partnersCount = count
    }
  }

  // Extract visas count
  const visasMatch = text.match(/(?:visa|visas).*?(\d+)/i)
  if (visasMatch) {
    const count = parseInt(visasMatch[1], 10)
    if (count >= 1 && count <= 20) {
      fields.visasCount = count
    }
  }

  return fields
}

/**
 * Merge extracted fields into state.collected (never overwrite existing)
 */
export function mergeExtractedFields(
  currentCollected: Record<string, any>,
  extracted: ExtractedFields
): Record<string, any> {
  const merged = { ...currentCollected }

  // Only set if not already present
  if (extracted.serviceKey && !merged.serviceKey) {
    merged.serviceKey = extracted.serviceKey
  }
  if (extracted.nationality && !merged.nationality) {
    merged.nationality = extracted.nationality
  }
  if (extracted.explicitDate && !merged.explicitDate) {
    merged.explicitDate = extracted.explicitDate.toISOString()
  }
  if (extracted.fullName && !merged.fullName) {
    merged.fullName = extracted.fullName
  }
  if (extracted.businessActivity && !merged.businessActivity) {
    merged.businessActivity = extracted.businessActivity
  }
  if (extracted.jurisdiction && !merged.jurisdiction) {
    merged.jurisdiction = extracted.jurisdiction
  }
  if (extracted.partnersCount !== undefined && merged.partnersCount === undefined) {
    merged.partnersCount = extracted.partnersCount
  }
  if (extracted.visasCount !== undefined && merged.visasCount === undefined) {
    merged.visasCount = extracted.visasCount
  }

  return merged
}

