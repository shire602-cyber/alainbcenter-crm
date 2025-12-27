/**
 * SERVICE SYNONYM MATCHING
 * 
 * Maps customer-friendly service names to standardized serviceTypeEnum values.
 * Handles variations, misspellings, and alternative names for the same service.
 */

export interface ServiceSynonym {
  /** Standardized serviceTypeEnum value */
  enum: string
  /** Primary keywords that match this service */
  keywords: string[]
  /** Alternative names/synonyms */
  synonyms: string[]
  /** Common misspellings */
  misspellings?: string[]
  /** Language variations (Arabic, etc.) */
  translations?: string[]
}

/**
 * Service synonym dictionary
 * Maps customer input to standardized serviceTypeEnum
 */
export const SERVICE_SYNONYMS: ServiceSynonym[] = [
  {
    enum: 'FAMILY_VISA',
    keywords: ['family visa', 'family', 'wife', 'husband', 'child', 'children', 'dependent', 'dependents', 'spouse'],
    synonyms: ['family residence visa', 'family permit', 'family sponsorship', 'dependent visa', 'spouse visa'],
    misspellings: ['famili visa', 'family viza', 'famly visa'],
    translations: ['تأشيرة عائلية', 'عائلة', 'زوجة', 'زوج', 'أطفال'],
  },
  {
    enum: 'GOLDEN_VISA',
    keywords: ['golden visa', 'golden', '10 year visa', '10-year visa', 'long term visa'],
    synonyms: ['gold visa', 'golden residence', 'long-term residence', 'permanent visa'],
    misspellings: ['golden viza', 'golden vis', 'golden viza'],
    translations: ['تأشيرة ذهبية', 'إقامة ذهبية'],
  },
  {
    enum: 'FREELANCE_VISA',
    keywords: ['freelance visa', 'freelance', 'freelancer', 'freelancing'],
    synonyms: ['freelance permit', 'freelancer permit', 'freelance residence', 'self-employed visa'],
    misspellings: ['freelance viza', 'freelance vis', 'freelance viza', 'freelance'],
    translations: ['تأشيرة عمل حر', 'عمل حر'],
  },
  {
    enum: 'EMPLOYMENT_VISA',
    keywords: ['employment visa', 'work visa', 'work permit', 'employment', 'job visa'],
    synonyms: ['employee visa', 'worker visa', 'work residence', 'employment permit', 'labor visa'],
    misspellings: ['employment viza', 'work viza', 'employement visa'],
    translations: ['تأشيرة عمل', 'تصريح عمل'],
  },
  {
    enum: 'VISIT_VISA',
    keywords: ['visit visa', 'tourist visa', 'tourist', 'visitor visa', 'visit'],
    synonyms: ['visitor permit', 'tourist permit', 'short stay visa', 'entry visa'],
    misspellings: ['visit viza', 'tourist viza', 'visitor viza'],
    translations: ['تأشيرة زيارة', 'تأشيرة سياحية'],
  },
  {
    enum: 'MAINLAND_BUSINESS_SETUP',
    keywords: ['business setup', 'business license', 'company setup', 'mainland', 'trade license'],
    synonyms: [
      'mainland business',
      'mainland company',
      'mainland license',
      'business registration',
      'company registration',
      'trade license setup',
      'commercial license',
    ],
    misspellings: ['business set up', 'bussiness setup', 'bussiness license'],
    translations: ['ترخيص تجاري', 'شركة بر', 'رخصة تجارية'],
  },
  {
    enum: 'FREEZONE_BUSINESS_SETUP',
    keywords: ['freezone', 'free zone', 'freezone business', 'freezone company', 'freezone license'],
    synonyms: [
      'free zone business',
      'free zone company',
      'free zone license',
      'freezone setup',
      'free zone setup',
      'offshore company',
    ],
    misspellings: ['free zone', 'freezone', 'free zone business'],
    translations: ['منطقة حرة', 'شركة منطقة حرة'],
  },
  {
    enum: 'PRO_SERVICES',
    keywords: ['pro', 'typing', 'immigration', 'government services'],
    synonyms: ['public relations officer', 'pro services', 'typing center', 'immigration services'],
    misspellings: ['pro service', 'pros', 'typing services'],
    translations: ['خدمات برو', 'خدمات حكومية'],
  },
  {
    enum: 'VISA_RENEWAL',
    keywords: ['renewal', 'renew', 'renew visa', 'visa renewal', 'extend visa'],
    synonyms: ['visa extension', 'renew residence', 'extend residence', 'renew permit'],
    misspellings: ['renewel', 'renewal', 'renual'],
    translations: ['تجديد', 'تجديد تأشيرة'],
  },
  {
    enum: 'EMIRATES_ID',
    keywords: ['emirates id', 'eid', 'emirates id card', 'id card'],
    synonyms: ['uae id', 'emirates identity', 'national id', 'id renewal'],
    misspellings: ['emirates id', 'emirates id', 'emirates id'],
    translations: ['هوية إماراتية', 'هوية'],
  },
]

/**
 * Match service from text using synonym dictionary
 * Returns the standardized serviceTypeEnum or undefined
 * 
 * @param text - Message text to analyze
 * @returns Standardized serviceTypeEnum or undefined
 */
export function matchServiceWithSynonyms(text: string): string | undefined {
  if (!text || text.trim().length === 0) {
    return undefined
  }

  const lower = text.toLowerCase().trim()

  // Score each service based on keyword/synonym matches
  const scores: Array<{ enum: string; score: number; matchedTerm: string }> = []

  for (const service of SERVICE_SYNONYMS) {
    let score = 0
    let matchedTerm = ''

    // Check keywords (highest priority)
    for (const keyword of service.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        score += 10
        matchedTerm = keyword
        break // Only count first match per category
      }
    }

    // Check synonyms (medium priority)
    for (const synonym of service.synonyms) {
      if (lower.includes(synonym.toLowerCase())) {
        score += 7
        if (!matchedTerm) matchedTerm = synonym
        break
      }
    }

    // Check misspellings (lower priority)
    if (service.misspellings) {
      for (const misspelling of service.misspellings) {
        if (lower.includes(misspelling.toLowerCase())) {
          score += 5
          if (!matchedTerm) matchedTerm = misspelling
          break
        }
      }
    }

    // Check translations (medium priority)
    if (service.translations) {
      for (const translation of service.translations) {
        if (lower.includes(translation)) {
          score += 7
          if (!matchedTerm) matchedTerm = translation
          break
        }
      }
    }

    if (score > 0) {
      scores.push({ enum: service.enum, score, matchedTerm })
    }
  }

  // Return highest scoring service
  if (scores.length === 0) {
    return undefined
  }

  // Sort by score (descending)
  scores.sort((a, b) => b.score - a.score)

  // If there's a clear winner (score difference > 3), return it
  if (scores.length === 1 || scores[0].score - scores[1]?.score > 3) {
    console.log(`✅ [SERVICE-SYNONYM] Matched "${scores[0].matchedTerm}" -> ${scores[0].enum} (score: ${scores[0].score})`)
    return scores[0].enum
  }

  // If scores are close, prefer exact keyword matches
  const exactKeywordMatch = scores.find((s) => s.score >= 10)
  if (exactKeywordMatch) {
    console.log(`✅ [SERVICE-SYNONYM] Matched "${exactKeywordMatch.matchedTerm}" -> ${exactKeywordMatch.enum} (exact keyword)`)
    return exactKeywordMatch.enum
  }

  // Return highest score
  console.log(`✅ [SERVICE-SYNONYM] Matched "${scores[0].matchedTerm}" -> ${scores[0].enum} (score: ${scores[0].score})`)
  return scores[0].enum
}

/**
 * Get all synonyms for a given serviceTypeEnum
 * Useful for displaying alternative names in UI
 */
export function getServiceSynonyms(serviceEnum: string): string[] {
  const service = SERVICE_SYNONYMS.find((s) => s.enum === serviceEnum)
  if (!service) {
    return []
  }

  return [...service.keywords, ...service.synonyms, ...(service.misspellings || []), ...(service.translations || [])]
}

/**
 * Get service display name from enum
 */
export function getServiceDisplayName(serviceEnum: string): string {
  const service = SERVICE_SYNONYMS.find((s) => s.enum === serviceEnum)
  if (!service) {
    return serviceEnum.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())
  }

  // Return the first keyword as display name
  return service.keywords[0].replace(/\b\w/g, (l) => l.toUpperCase())
}

