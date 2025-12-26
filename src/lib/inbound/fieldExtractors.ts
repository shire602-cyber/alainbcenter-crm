/**
 * DETERMINISTIC FIELD EXTRACTORS
 * 
 * Extract structured data from message text using keyword matching and regex.
 * No LLM required - fully deterministic.
 */

/**
 * Extract service type from text
 */
export function extractService(text: string): string | undefined {
  const lower = text.toLowerCase()

  // Family visa keywords
  if (
    lower.includes('family visa') ||
    lower.includes('wife') ||
    lower.includes('husband') ||
    lower.includes('child') ||
    lower.includes('children') ||
    lower.includes('dependents') ||
    lower.includes('dependent')
  ) {
    return 'FAMILY_VISA'
  }

  // Golden visa
  if (lower.includes('golden visa') || lower.includes('golden')) {
    return 'GOLDEN_VISA'
  }

  // Visit visa
  if (lower.includes('visit visa') || lower.includes('tourist') || lower.includes('tourist visa')) {
    return 'VISIT_VISA'
  }

  // Freelance visa
  if (lower.includes('freelance visa') || lower.includes('freelance')) {
    return 'FREELANCE_VISA'
  }

  // Business setup
  if (
    lower.includes('business setup') ||
    lower.includes('business license') ||
    lower.includes('company') ||
    lower.includes('mainland') ||
    lower.includes('freezone') ||
    lower.includes('free zone') ||
    lower.includes('license')
  ) {
    return 'MAINLAND_BUSINESS_SETUP' // Default to mainland, can be refined later
  }

  // PRO services
  if (lower.includes('pro') || lower.includes('typing') || lower.includes('immigration')) {
    return 'PRO_SERVICES'
  }

  return undefined
}

/**
 * Extract nationality from text
 */
export function extractNationality(text: string): string | undefined {
  const lower = text.toLowerCase()

  // Common patterns
  const patterns = [
    /i am (\w+)/i,
    /i'm (\w+)/i,
    /i'm from (\w+)/i,
    /from (\w+)/i,
    /nationality[:\s]+(\w+)/i,
    /(\w+)\s+(?:national|citizen)/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const nationality = match[1].trim()
      // Filter out common false positives
      if (
        !['the', 'a', 'an', 'and', 'or', 'for', 'with', 'need', 'want', 'looking'].includes(
          nationality.toLowerCase()
        )
      ) {
        return nationality.charAt(0).toUpperCase() + nationality.slice(1).toLowerCase()
      }
    }
  }

  // Country demonyms (common ones)
  const countries: Record<string, string> = {
    indian: 'Indian',
    pakistani: 'Pakistani',
    bangladeshi: 'Bangladeshi',
    filipino: 'Filipino',
    egyptian: 'Egyptian',
    syrian: 'Syrian',
    lebanese: 'Lebanese',
    jordanian: 'Jordanian',
    british: 'British',
    american: 'American',
    canadian: 'Canadian',
    australian: 'Australian',
    chinese: 'Chinese',
    japanese: 'Japanese',
    korean: 'Korean',
    russian: 'Russian',
    turkish: 'Turkish',
    iranian: 'Iranian',
    iraqi: 'Iraqi',
    sudanese: 'Sudanese',
    ethiopian: 'Ethiopian',
    kenyan: 'Kenyan',
    nigerian: 'Nigerian',
    south: 'South African', // Special case
  }

  for (const [key, value] of Object.entries(countries)) {
    if (lower.includes(key)) {
      return value
    }
  }

  return undefined
}

/**
 * Extract expiry dates from text
 */
export function extractExpiry(text: string): Array<{ type: string; date: Date }> {
  const expiries: Array<{ type: string; date: Date }> = []
  const lower = text.toLowerCase()

  // Date patterns
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g, // DD/MM/YYYY or DD-MM-YYYY
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})/gi, // DD MMM YYYY
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})/gi, // MMM DD, YYYY
  ]

  // Expiry type keywords
  const expiryTypes: Record<string, string> = {
    visa: 'VISA_EXPIRY',
    eid: 'EMIRATES_ID_EXPIRY',
    'emirates id': 'EMIRATES_ID_EXPIRY',
    passport: 'PASSPORT_EXPIRY',
    'trade license': 'TRADE_LICENSE_EXPIRY',
    'establishment card': 'ESTABLISHMENT_CARD_EXPIRY',
    insurance: 'INSURANCE_EXPIRY',
  }

  // Find expiry mentions
  for (const [keyword, type] of Object.entries(expiryTypes)) {
    if (lower.includes(keyword) && (lower.includes('expir') || lower.includes('valid until'))) {
      // Try to find date near the keyword
      const keywordIndex = lower.indexOf(keyword)
      const context = text.substring(Math.max(0, keywordIndex - 50), keywordIndex + 100)

      for (const pattern of datePatterns) {
        const matches = context.matchAll(pattern)
        for (const match of matches) {
          try {
            let date: Date
            if (match[0].includes('/') || match[0].includes('-')) {
              // DD/MM/YYYY or DD-MM-YYYY
              const day = parseInt(match[1])
              const month = parseInt(match[2]) - 1
              const year = parseInt(match[3].length === 2 ? `20${match[3]}` : match[3])
              date = new Date(year, month, day)
            } else {
              // Try parsing as-is
              date = new Date(match[0])
            }

            if (!isNaN(date.getTime()) && date > new Date()) {
              expiries.push({ type, date })
              break // Only take first date per expiry type
            }
          } catch (error) {
            // Invalid date, skip
          }
        }
      }
    }
  }

  return expiries
}

/**
 * Extract counts (partners, visas) for business setup
 */
export function extractCounts(text: string): { partners?: number; visas?: number } {
  const lower = text.toLowerCase()
  const counts: { partners?: number; visas?: number } = {}

  // Partners count
  const partnerPatterns = [
    /(\d+)\s+partner/i,
    /(\d+)\s+shareholder/i,
    /partner[:\s]+(\d+)/i,
    /shareholder[:\s]+(\d+)/i,
  ]

  for (const pattern of partnerPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const count = parseInt(match[1])
      if (!isNaN(count) && count > 0 && count <= 10) {
        counts.partners = count
        break
      }
    }
  }

  // Visa count
  const visaPatterns = [
    /(\d+)\s+visa/i,
    /visa[:\s]+(\d+)/i,
    /(\d+)\s+residence/i,
  ]

  for (const pattern of visaPatterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const count = parseInt(match[1])
      if (!isNaN(count) && count >= 0 && count <= 10) {
        counts.visas = count
        break
      }
    }
  }

  return counts
}

/**
 * Extract identity (name, email) from text
 */
export function extractIdentity(text: string): { name?: string; email?: string } {
  const identity: { name?: string; email?: string } = {}

  // Email pattern
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/
  const emailMatch = text.match(emailPattern)
  if (emailMatch) {
    identity.email = emailMatch[0]
  }

  // Name pattern (2-3 words, capitalized, not common words)
  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/
  const nameMatch = text.match(namePattern)
  if (nameMatch) {
    const candidate = nameMatch[1]
    // Filter out common false positives
    const commonWords = [
      'Hi',
      'Hello',
      'Thank',
      'Please',
      'Need',
      'Want',
      'Looking',
      'Business',
      'Setup',
      'Visa',
      'Family',
      'Mainland',
      'Freezone',
    ]
    if (!commonWords.some((word) => candidate.includes(word))) {
      identity.name = candidate
    }
  }

  return identity
}

