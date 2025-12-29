/**
 * SERVICE DETECTION FROM MESSAGES
 * 
 * C) REMOVED DEPENDENCY ON services.seed.json
 * Uses in-code keyword map for service detection (from serviceSynonyms.ts).
 * If detection fails, returns null (never shows service list).
 */

import { matchServiceWithSynonyms } from './serviceSynonyms'

interface ServiceSeed {
  slug: string
  displayName: string
  category: string
  serviceTypeEnum: string
  synonyms: string[]
  defaultQuestions: string[]
  maxQuestions: number
  specialOffer?: {
    triggerSynonyms: string[]
    message: string
  }
}

interface ServicesSeed {
  version: string
  services: ServiceSeed[]
  businessActivityRules: {
    note: string
    keywordsThatUsuallyIndicateActivity: string[]
  }
}

// C) REMOVED: services.seed.json dependency
// All service detection now uses in-code keyword map from serviceSynonyms.ts
// This ensures no file system dependencies and no service list fallbacks

/**
 * Detect service from message text using services seed
 * Returns serviceTypeEnum immediately
 */
export async function detectServiceFromText(text: string): Promise<{
  serviceTypeEnum: string | null
  serviceSlug: string | null
  confidence: number
}> {
  if (!text || text.trim().length === 0) {
    return { serviceTypeEnum: null, serviceSlug: null, confidence: 0 }
  }

  // C) USE IN-CODE KEYWORD MAP (no file dependency)
  // All service detection uses serviceSynonyms.ts (in-code, no file system)
  const synonymMatch = matchServiceWithSynonyms(text)
  if (synonymMatch) {
    return {
      serviceTypeEnum: synonymMatch,
      serviceSlug: synonymMatch.toLowerCase().replace(/_/g, '-'), // Generate slug from enum
      confidence: 0.9,
    }
  }

  // No match found - return null (never show service list)
  return { serviceTypeEnum: null, serviceSlug: null, confidence: 0 }
}

/**
 * Extract business activity from text (for business_setup services)
 * If user says "marketing license" or similar, store as businessActivityRaw
 */
export async function extractBusinessActivityRaw(text: string): Promise<string | null> {
  if (!text || text.trim().length === 0) {
    return null
  }
  
  // C) USE IN-CODE KEYWORD MAP (no file dependency)
  // Inline business activity keywords (no file system dependency)
  const activityKeywords = [
    'marketing', 'trading', 'consultancy', 'it', 'ecommerce', 'restaurant',
    'salon', 'cleaning', 'real estate', 'logistics', 'general trading', 'professional', 'commercial'
  ]
  
  const lower = text.toLowerCase()

  for (const keyword of activityKeywords) {
    if (lower.includes(keyword)) {
      // Extract the full phrase (e.g., "marketing license" -> "marketing license")
      const patterns = [
        new RegExp(`(${keyword}\\s+license)`, 'i'),
        new RegExp(`(${keyword}\\s+permit)`, 'i'),
        new RegExp(`(${keyword}\\s+setup)`, 'i'),
        new RegExp(`(${keyword})`, 'i'), // Fallback to just keyword
      ]

      for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match && match[1]) {
          return match[1].trim()
        }
      }
    }
  }

  // Check for common patterns like "I want [activity] license"
  const activityPatterns = [
    /(?:want|need|looking for|interested in)\s+([a-z\s]+)\s+license/i,
    /([a-z\s]+)\s+license/i,
    /(?:marketing|trading|consultancy|it|ecommerce|restaurant|salon|cleaning|real estate|logistics)\s+license/i,
  ]

  for (const pattern of activityPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const activity = match[1].trim()
      // Filter out common false positives
      if (
        !['business', 'company', 'trade', 'general', 'professional'].includes(activity.toLowerCase()) &&
        activity.length >= 3 &&
        activity.length <= 50
      ) {
        return activity
      }
    }
  }

  return null
}

/**
 * Check if message triggers special offer (e.g., "cheapest")
 * C) REMOVED: services.seed.json dependency - using in-code rules
 */
export async function checkSpecialOffer(text: string, serviceSlug: string): Promise<string | null> {
  // In-code special offer triggers (no file dependency)
  const lower = text.toLowerCase()
  const specialOfferTriggers = ['cheapest', 'cheap', 'lowest price', 'best price', 'affordable']
  
  const hasTrigger = specialOfferTriggers.some((trigger) => lower.includes(trigger))
  
  if (hasTrigger) {
    // Return generic special offer message (no service-specific messages from file)
    return 'We offer competitive pricing. Let me connect you with our consultant for the best quote.'
  }

  return null
}

/**
 * Get max questions for a service
 * C) REMOVED: services.seed.json dependency - using default value
 */
export async function getMaxQuestionsForService(serviceSlug: string): Promise<number> {
  // Default to 5 questions for all services (no file dependency)
  return 5
}

