/**
 * SERVICE DETECTION FROM MESSAGES
 * 
 * Uses services.seed.json to detect services and extract business activities.
 * Immediately sets Lead.serviceTypeEnum when service is detected.
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

let servicesSeedCache: ServicesSeed | null = null

/**
 * Load services seed JSON (cached)
 */
async function loadServicesSeed(): Promise<ServicesSeed> {
  if (servicesSeedCache) {
    return servicesSeedCache
  }

  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const seedPath = path.join(process.cwd(), 'config', 'services.seed.json')
    const content = await fs.readFile(seedPath, 'utf-8')
    servicesSeedCache = JSON.parse(content) as ServicesSeed
    return servicesSeedCache!
  } catch (error: any) {
    console.warn('⚠️ [SERVICE-DETECT] Failed to load services.seed.json, using fallback:', error.message)
    // Fallback to basic structure
    return {
      version: 'fallback',
      services: [],
      businessActivityRules: {
        note: 'Fallback mode',
        keywordsThatUsuallyIndicateActivity: [],
      },
    }
  }
}

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

  // First try synonym matching (fast, deterministic)
  const synonymMatch = matchServiceWithSynonyms(text)
  if (synonymMatch) {
    // Find service slug from seed
    const seed = await loadServicesSeed()
    const service = seed.services.find((s) => s.serviceTypeEnum === synonymMatch)
    return {
      serviceTypeEnum: synonymMatch,
      serviceSlug: service?.slug || null,
      confidence: 0.9,
    }
  }

  // Try services seed synonyms
  const seed = await loadServicesSeed()
  const lower = text.toLowerCase()

  for (const service of seed.services) {
    // Check if any synonym matches
    for (const synonym of service.synonyms) {
      if (lower.includes(synonym.toLowerCase())) {
        return {
          serviceTypeEnum: service.serviceTypeEnum,
          serviceSlug: service.slug,
          confidence: 0.85,
        }
      }
    }
  }

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
  
  const lower = text.toLowerCase()
  let seed: ServicesSeed
  
  try {
    seed = await loadServicesSeed()
  } catch (error: any) {
    // Fallback to inline rules if seed file not found
    console.warn('⚠️ [SERVICE-DETECT] Failed to load services seed, using fallback:', error.message)
    seed = {
      version: 'fallback',
      services: [],
      businessActivityRules: {
        note: 'Fallback mode',
        keywordsThatUsuallyIndicateActivity: [
          'marketing', 'trading', 'consultancy', 'it', 'ecommerce', 'restaurant',
          'salon', 'cleaning', 'real estate', 'logistics', 'general trading', 'professional', 'commercial'
        ],
      },
    }
  }

  // Check for explicit activity mentions
  const activityKeywords = seed.businessActivityRules.keywordsThatUsuallyIndicateActivity

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
 */
export async function checkSpecialOffer(text: string, serviceSlug: string): Promise<string | null> {
  const seed = await loadServicesSeed()
  const service = seed.services.find((s) => s.slug === serviceSlug)

  if (!service?.specialOffer) {
    return null
  }

  const lower = text.toLowerCase()
  const hasTrigger = service.specialOffer.triggerSynonyms.some((trigger) => lower.includes(trigger))

  if (hasTrigger) {
    return service.specialOffer.message
  }

  return null
}

/**
 * Get max questions for a service
 */
export async function getMaxQuestionsForService(serviceSlug: string): Promise<number> {
  const seed = await loadServicesSeed()
  const service = seed.services.find((s) => s.slug === serviceSlug)
  return service?.maxQuestions || 5 // Default to 5
}

