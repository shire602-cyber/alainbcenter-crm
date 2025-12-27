/**
 * DETERMINISTIC FIELD EXTRACTORS
 * 
 * Extract structured data from message text using keyword matching and regex.
 * No LLM required - fully deterministic.
 */

/**
 * Extract service type from text
 * STEP 4: Now uses service synonym matching for better detection
 */
export function extractService(text: string): string | undefined {
  // Try synonym matching first (more comprehensive)
  const { matchServiceWithSynonyms } = require('./serviceSynonyms')
  const synonymMatch = matchServiceWithSynonyms(text)
  
  if (synonymMatch) {
    return synonymMatch
  }

  // Fallback to legacy keyword matching (for backward compatibility)
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
 * Extract explicit dates from text (for expiryDate or other date fields)
 * STEP 4: Enhanced to extract any explicit date, not just expiry dates
 * HARD RULE: Only extract EXPLICIT dates. Never infer relative dates like "next month", "in 2 weeks", etc.
 * 
 * Accepted formats:
 * - DD/MM/YYYY or DD-MM-YYYY (e.g., 10/02/2026)
 * - YYYY-MM-DD (e.g., 2026-02-10)
 * - DD/MM/YY or DD-MM-YY (convert 00-49 to 20YY, 50-99 to 19YY)
 * - "10 Feb 2026", "10 February 2026"
 * - "Feb 10 2026" (optional)
 * - "19th January 2026", "19 January 2026"
 * 
 * Rejected formats:
 * - "next month", "in 30 days", "in 2 weeks"
 * - "this month", "soon", "end of month"
 * - "tomorrow", "today" (unless explicit date also included)
 * - "Feb 2026" (month-year only) -> NOT allowed
 * - "2026" alone -> NOT allowed
 */
export function extractExplicitDate(text: string): Date | null {
  const lower = text.toLowerCase()
  
  // Explicit date patterns ONLY (no relative dates)
  const explicitDatePatterns = [
    // DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    // YYYY-MM-DD (ISO format)
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    // DD MMM YYYY (e.g., "10 Feb 2026" or "19th January 2026")
    /(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})/i,
    // MMM DD, YYYY (e.g., "Feb 10, 2026")
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})/i,
  ]

  // Rejected relative date patterns (must NOT match these)
  const relativeDatePatterns = [
    /\b(next|this|in)\s+(month|week|year|days?|weeks?|months?|years?)\b/i,
    /\b(soon|tomorrow|today|end of (month|year))\b/i,
    /\b(after|before)\s+\w+\b/i,
  ]

  // Check for relative date mentions (reject if found)
  const hasRelativeDate = relativeDatePatterns.some(pattern => pattern.test(text))
  if (hasRelativeDate) {
    return null
  }

  // Try to find explicit date
  for (const pattern of explicitDatePatterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        let date: Date
        let year: number
        let month: number
        let day: number

        if (match[0].includes('/') || match[0].includes('-')) {
          // Check if it's YYYY-MM-DD format (ISO)
          if (match[1].length === 4) {
            year = parseInt(match[1])
            month = parseInt(match[2]) - 1
            day = parseInt(match[3])
          } else {
            // DD/MM/YYYY or DD-MM-YYYY
            day = parseInt(match[1])
            month = parseInt(match[2]) - 1
            const yearStr = match[3]
            
            // Handle 2-digit years
            if (yearStr.length === 2) {
              const yearNum = parseInt(yearStr)
              year = yearNum <= 49 ? 2000 + yearNum : 1900 + yearNum
            } else {
              year = parseInt(yearStr)
            }
          }
          
          date = new Date(year, month, day)
        } else {
          // Text date format
          const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
          const matchLower = match[0].toLowerCase()
          
          if (/\d{1,2}(?:st|nd|rd|th)?\s+[a-z]+\s+\d{2,4}/.test(matchLower)) {
            // DD MMM YYYY format
            day = parseInt(match[1])
            const monthName = match[2].toLowerCase().substring(0, 3)
            const monthIndex = monthNames.findIndex(m => m === monthName)
            if (monthIndex === -1) continue
            month = monthIndex
            const yearStr = match[3]
            year = yearStr.length === 2 
              ? (parseInt(yearStr) <= 49 ? 2000 + parseInt(yearStr) : 1900 + parseInt(yearStr))
              : parseInt(yearStr)
            date = new Date(year, month, day)
          } else if (/[a-z]+\s+\d{1,2},?\s+\d{2,4}/.test(matchLower)) {
            // MMM DD, YYYY format
            const monthName = match[1].toLowerCase().substring(0, 3)
            const monthIndex = monthNames.findIndex(m => m === monthName)
            if (monthIndex === -1) continue
            month = monthIndex
            day = parseInt(match[2])
            const yearStr = match[3]
            year = yearStr.length === 2
              ? (parseInt(yearStr) <= 49 ? 2000 + parseInt(yearStr) : 1900 + parseInt(yearStr))
              : parseInt(yearStr)
            date = new Date(year, month, day)
          } else {
            continue
          }
        }

        // Validate date
        if (!isNaN(date.getTime()) && date > new Date()) {
          // Additional validation: ensure it's a reasonable future date (not more than 20 years)
          const maxFutureDate = new Date()
          maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 20)
          
          if (date <= maxFutureDate) {
            return date
          }
        }
      } catch (error) {
        // Invalid date, skip
        continue
      }
    }
  }

  return null
}

/**
 * Extract expiry dates from text
 * HARD RULE: Only extract EXPLICIT dates. Never infer relative dates like "next month", "in 2 weeks", etc.
 * 
 * Accepted formats:
 * - DD/MM/YYYY or DD-MM-YYYY (e.g., 10/02/2026)
 * - YYYY-MM-DD (e.g., 2026-02-10)
 * - DD/MM/YY or DD-MM-YY (convert 00-49 to 20YY, 50-99 to 19YY)
 * - "10 Feb 2026", "10 February 2026"
 * - "Feb 10 2026" (optional)
 * 
 * Rejected formats:
 * - "next month", "in 30 days", "in 2 weeks"
 * - "this month", "soon", "end of month"
 * - "tomorrow", "today" (unless explicit date also included)
 * - "Feb 2026" (month-year only) -> NOT allowed
 * - "2026" alone -> NOT allowed
 */
export function extractExpiry(text: string): Array<{ type: string; date: Date }> {
  const expiries: Array<{ type: string; date: Date }> = []
  const lower = text.toLowerCase()

  // Explicit date patterns ONLY (no relative dates)
  const explicitDatePatterns = [
    // DD/MM/YYYY or DD-MM-YYYY or YYYY-MM-DD
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/g,
    // YYYY-MM-DD (ISO format)
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/g,
    // DD MMM YYYY (e.g., "10 Feb 2026")
    /(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})/gi,
    // MMM DD, YYYY (e.g., "Feb 10, 2026")
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{2,4})/gi,
  ]

  // Rejected relative date patterns (must NOT match these)
  const relativeDatePatterns = [
    /\b(next|this|in)\s+(month|week|year|days?|weeks?|months?|years?)\b/i,
    /\b(soon|tomorrow|today|end of (month|year))\b/i,
    /\b(after|before)\s+\w+\b/i, // "after Ramadan", "before Eid"
  ]

  // Check for relative date mentions (reject if found)
  const hasRelativeDate = relativeDatePatterns.some(pattern => pattern.test(text))
  if (hasRelativeDate) {
    console.log(`⚠️ [EXPIRY-EXTRACT] Rejected relative date mention: "${text.substring(0, 100)}"`)
    return [] // Return empty - will be handled as hint
  }

  // Expiry type keywords
  const expiryTypes: Record<string, string> = {
    visa: 'VISA_EXPIRY',
    eid: 'EMIRATES_ID_EXPIRY',
    'emirates id': 'EMIRATES_ID_EXPIRY',
    passport: 'PASSPORT_EXPIRY',
    'trade license': 'TRADE_LICENSE_EXPIRY',
    license: 'TRADE_LICENSE_EXPIRY', // Only if business context
    'establishment card': 'ESTABLISHMENT_CARD_EXPIRY',
    establishment: 'ESTABLISHMENT_CARD_EXPIRY',
    insurance: 'INSURANCE_EXPIRY',
  }

  // Expiry keywords that trigger extraction
  const expiryKeywords = ['expir', 'expires', 'expiring', 'expiry', 'valid until', 'valid till']

  // Find expiry mentions with explicit dates
  for (const [keyword, type] of Object.entries(expiryTypes)) {
    const hasKeyword = lower.includes(keyword)
    const hasExpiryKeyword = expiryKeywords.some(ek => lower.includes(ek))
    
    if (hasKeyword && hasExpiryKeyword) {
      // Try to find explicit date near the keyword
      const keywordIndex = lower.indexOf(keyword)
      const context = text.substring(Math.max(0, keywordIndex - 50), keywordIndex + 100)

      let foundExplicitDate = false

      for (const pattern of explicitDatePatterns) {
        const matches = Array.from(context.matchAll(pattern))
        for (const match of matches) {
          try {
            let date: Date
            let year: number
            let month: number
            let day: number

            if (match[0].includes('/') || match[0].includes('-')) {
              // Check if it's YYYY-MM-DD format (ISO)
              if (match[1].length === 4) {
                // YYYY-MM-DD
                year = parseInt(match[1])
                month = parseInt(match[2]) - 1
                day = parseInt(match[3])
              } else {
                // DD/MM/YYYY or DD-MM-YYYY
                day = parseInt(match[1])
                month = parseInt(match[2]) - 1
                const yearStr = match[3]
                
                // Handle 2-digit years: 00-49 -> 20YY, 50-99 -> 19YY
                if (yearStr.length === 2) {
                  const yearNum = parseInt(yearStr)
                  year = yearNum <= 49 ? 2000 + yearNum : 1900 + yearNum
                  console.log(`📅 [EXPIRY-EXTRACT] Normalized 2-digit year: ${yearStr} -> ${year}`)
                } else {
                  year = parseInt(yearStr)
                }
              }
              
              date = new Date(year, month, day)
            } else {
              // Text date format (DD MMM YYYY or MMM DD, YYYY)
              const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
              const matchLower = match[0].toLowerCase()
              
              if (/\d{1,2}\s+[a-z]+\s+\d{2,4}/.test(matchLower)) {
                // DD MMM YYYY format
                day = parseInt(match[1])
                const monthName = match[2].toLowerCase().substring(0, 3)
                const monthIndex = monthNames.findIndex(m => m === monthName)
                if (monthIndex === -1) continue
                month = monthIndex
                const yearStr = match[3]
                year = yearStr.length === 2 
                  ? (parseInt(yearStr) <= 49 ? 2000 + parseInt(yearStr) : 1900 + parseInt(yearStr))
                  : parseInt(yearStr)
                date = new Date(year, month, day)
              } else if (/[a-z]+\s+\d{1,2},?\s+\d{2,4}/.test(matchLower)) {
                // MMM DD, YYYY format
                const monthName = match[1].toLowerCase().substring(0, 3)
                const monthIndex = monthNames.findIndex(m => m === monthName)
                if (monthIndex === -1) continue
                month = monthIndex
                day = parseInt(match[2])
                const yearStr = match[3]
                year = yearStr.length === 2
                  ? (parseInt(yearStr) <= 49 ? 2000 + parseInt(yearStr) : 1900 + parseInt(yearStr))
                  : parseInt(yearStr)
                date = new Date(year, month, day)
              } else {
                continue // Skip if format doesn't match
              }
            }

            // Validate date
            if (!isNaN(date.getTime()) && date > new Date()) {
              // Additional validation: ensure it's a reasonable future date (not more than 20 years)
              const maxFutureDate = new Date()
              maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 20)
              
              if (date <= maxFutureDate) {
                expiries.push({ type, date })
                foundExplicitDate = true
                console.log(`✅ [EXPIRY-EXTRACT] Extracted explicit expiry: ${type} = ${date.toISOString().split('T')[0]}`)
                break // Only take first date per expiry type
              }
            }
          } catch (error) {
            // Invalid date, skip
            console.warn(`⚠️ [EXPIRY-EXTRACT] Failed to parse date: ${match[0]}`, error)
          }
        }
      }
    }
  }

  return expiries
}

/**
 * Check if text mentions expiry but without explicit date
 * Returns the full sentence containing the expiry mention
 */
export function extractExpiryHint(text: string): string | null {
  const lower = text.toLowerCase()
  
  // Expiry keywords
  const expiryKeywords = ['expir', 'expires', 'expiring', 'expiry', 'valid until', 'valid till']
  const expiryTypes = ['visa', 'eid', 'emirates id', 'passport', 'trade license', 'license', 'establishment', 'insurance']
  
  // Check if expiry is mentioned
  const hasExpiryKeyword = expiryKeywords.some(ek => lower.includes(ek))
  const hasExpiryType = expiryTypes.some(et => lower.includes(et))
  
  if (!hasExpiryKeyword || !hasExpiryType) {
    return null
  }
  
  // Check if explicit date exists (if it does, this is not a hint)
  const explicitDatePatterns = [
    /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/, // DD/MM/YYYY
    /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/, // YYYY-MM-DD
    /\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4}/i, // DD MMM YYYY
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}/i, // MMM DD, YYYY
  ]
  
  const hasExplicitDate = explicitDatePatterns.some(pattern => pattern.test(text))
  
  if (hasExplicitDate) {
    return null // Has explicit date, not a hint
  }
  
  // Extract the sentence containing the expiry mention
  const sentences = text.split(/[.!?]\s+/)
  for (const sentence of sentences) {
    const sentenceLower = sentence.toLowerCase()
    if (expiryKeywords.some(ek => sentenceLower.includes(ek)) && 
        expiryTypes.some(et => sentenceLower.includes(et))) {
      return sentence.trim()
    }
  }
  
  // Fallback: return relevant portion of text
  const expiryIndex = lower.search(new RegExp(expiryKeywords.join('|')))
  if (expiryIndex !== -1) {
    const start = Math.max(0, expiryIndex - 30)
    const end = Math.min(text.length, expiryIndex + 100)
    return text.substring(start, end).trim()
  }
  
  return null
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

