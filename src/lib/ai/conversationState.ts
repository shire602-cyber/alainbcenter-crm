/**
 * Conversation State Management
 * 
 * Tracks what has been asked and answered to prevent loops
 */

export interface ConversationState {
  askedQuestions: Set<string> // Track which questions have been asked
  lastOutboundMessage?: string // Last message we sent
  lastOutboundMessageTime?: Date
  answeredFields: Set<string> // Track which fields have been answered
}

/**
 * Check if a question was already asked (semantic similarity)
 */
export function wasQuestionAsked(
  questionText: string,
  conversationHistory: Array<{ direction: string; body: string }>
): boolean {
  const questionLower = questionText.toLowerCase().trim()
  
  // Get all outbound messages
  const outboundMessages = conversationHistory
    .filter(m => m.direction === 'OUTBOUND' || m.direction === 'outbound')
    .map(m => (m.body || '').toLowerCase().trim())
  
  // Check for exact match
  if (outboundMessages.some(msg => msg === questionLower)) {
    return true
  }
  
  // Check for semantic similarity (>80% similar)
  for (const msg of outboundMessages) {
    const similarity = calculateSimilarity(questionLower, msg)
    if (similarity > 0.8) {
      return true
    }
  }
  
  return false
}

/**
 * Check if we're in a loop (same message sent multiple times)
 */
export function isInLoop(
  newReply: string,
  conversationHistory: Array<{ direction: string; body: string }>
): boolean {
  const replyLower = newReply.toLowerCase().trim()
  
  // Get last 3 outbound messages
  const recentOutbound = conversationHistory
    .filter(m => m.direction === 'OUTBOUND' || m.direction === 'outbound')
    .slice(-3)
    .map(m => (m.body || '').toLowerCase().trim())
  
  // Check if new reply is >80% similar to any recent outbound
  for (const msg of recentOutbound) {
    const similarity = calculateSimilarity(replyLower, msg)
    if (similarity > 0.8) {
      return true
    }
  }
  
  return false
}

/**
 * Calculate simple similarity between two strings (0-1)
 * Uses word overlap and length similarity
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0
  
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 2))
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 2))
  
  if (words1.size === 0 || words2.size === 0) return 0
  
  // Calculate intersection
  let intersection = 0
  for (const word of words1) {
    if (words2.has(word)) {
      intersection++
    }
  }
  
  // Jaccard similarity
  const union = words1.size + words2.size - intersection
  const jaccard = union > 0 ? intersection / union : 0
  
  // Length similarity
  const lengthDiff = Math.abs(str1.length - str2.length)
  const maxLength = Math.max(str1.length, str2.length)
  const lengthSimilarity = maxLength > 0 ? 1 - (lengthDiff / maxLength) : 0
  
  // Combined similarity (weighted)
  return (jaccard * 0.7) + (lengthSimilarity * 0.3)
}

/**
 * Extract what information has already been provided from conversation history
 */
export function extractProvidedInfo(
  conversationHistory: Array<{ direction: string; body: string }>
): {
  name?: string
  service?: string
  nationality?: string
  sponsor_status?: string
  inside_uae?: boolean
  family_location?: string
  license_type?: string
  [key: string]: any
} {
  const provided: any = {}
  const allText = conversationHistory.map(m => m.body || '').join(' ').toLowerCase()
  const inboundMessages = conversationHistory
    .filter(m => m.direction === 'INBOUND' || m.direction === 'inbound')
    .map(m => (m.body || '').toLowerCase().trim())
  
  // Extract sponsor_status from simple answers
  for (const msg of inboundMessages) {
    if (msg === 'partner' || msg.includes('partner visa')) {
      provided.sponsor_status = 'partner'
      break
    } else if (msg === 'employment' || msg.includes('employment visa')) {
      provided.sponsor_status = 'employment'
      break
    } else if (msg === 'investor' || msg.includes('investor visa')) {
      provided.sponsor_status = 'investor'
      break
    }
  }
  
  // Extract service
  if (allText.includes('family visa')) {
    provided.service = 'Family Visa'
  } else if (allText.includes('freelance visa')) {
    provided.service = 'Freelance Visa'
  } else if (allText.includes('visit visa')) {
    provided.service = 'Visit Visa'
  } else if (allText.includes('business setup') || allText.includes('license')) {
    provided.service = 'Business Setup'
  }
  
  // Extract nationality
  const nationalityKeywords = [
    { pattern: /nigerian|nigeria/i, value: 'nigerian' },
    { pattern: /somali|somalia/i, value: 'somali' },
    { pattern: /indian|india/i, value: 'indian' },
    { pattern: /pakistani|pakistan/i, value: 'pakistani' },
    { pattern: /filipino|philippines/i, value: 'filipino' },
  ]
  for (const { pattern, value } of nationalityKeywords) {
    if (pattern.test(allText)) {
      provided.nationality = value
      break
    }
  }
  
  // Extract inside_uae
  for (const msg of inboundMessages) {
    if (msg === 'yes' || msg === 'yea' || msg === 'yep' || msg.includes('inside') || msg.includes('in uae')) {
      provided.inside_uae = true
      break
    } else if (msg === 'no' || msg.includes('outside')) {
      provided.inside_uae = false
      break
    }
  }
  
  // Extract family_location
  if (allText.includes('family') && (allText.includes('inside') || allText.includes('in uae'))) {
    provided.family_location = 'inside'
  } else if (allText.includes('family') && allText.includes('outside')) {
    provided.family_location = 'outside'
  }
  
  // Extract license_type
  if (allText.includes('mainland')) {
    provided.license_type = 'mainland'
  } else if (allText.includes('freezone') || allText.includes('free zone')) {
    provided.license_type = 'freezone'
  }
  
  return provided
}

