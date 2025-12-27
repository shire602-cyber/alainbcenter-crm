/**
 * STRICT VALIDATION FOR AI REPLIES
 * Ensures no hallucinations, forbidden language, or invalid output
 */

/**
 * Type for AI reply output
 */
export interface AIReplyOutput {
  replyText: string
  intent: 'QUALIFY' | 'FOLLOW_UP' | 'SUPPORT' | 'HANDOVER' | 'CLARIFY'
  extracted?: {
    service?: string
    nationality?: string
    name?: string
    expiryDate?: string
  }
  nextQuestionKey?: 'ask_name' | 'ask_service' | 'ask_nationality' | 'ask_activity' | 'ask_visas' | 'ask_partners' | 'ask_jurisdiction'
  shouldEscalate?: boolean
  handoverReason?: string | null
}

/**
 * Forbidden phrases that must never appear in replies
 */
const FORBIDDEN_PHRASES = [
  'guaranteed',
  'approval guaranteed',
  'guarantee',
  '100%',
  'inside contact',
  'government connection',
  'no risk',
  'definitely',
  'certainly approved',
  'we guarantee',
  'assured approval',
]

/**
 * Validate AI reply output (manual validation without zod)
 */
export function validateAIReply(output: unknown): {
  isValid: boolean
  error?: string
  sanitized?: AIReplyOutput
} {
  try {
    if (!output || typeof output !== 'object') {
      return { isValid: false, error: 'Output must be an object' }
    }
    
    const obj = output as any
    
    // Validate required fields
    if (!obj.replyText || typeof obj.replyText !== 'string' || obj.replyText.length === 0 || obj.replyText.length > 1000) {
      return { isValid: false, error: 'replyText must be a string between 1-1000 characters' }
    }
    
    const validIntents = ['QUALIFY', 'FOLLOW_UP', 'SUPPORT', 'HANDOVER', 'CLARIFY']
    if (!obj.intent || !validIntents.includes(obj.intent)) {
      return { isValid: false, error: `intent must be one of: ${validIntents.join(', ')}` }
    }
    
    const parsed: AIReplyOutput = {
      replyText: obj.replyText,
      intent: obj.intent,
      extracted: obj.extracted,
      nextQuestionKey: obj.nextQuestionKey,
      shouldEscalate: obj.shouldEscalate || false,
      handoverReason: obj.handoverReason || null,
    }
    
    // Check for forbidden phrases
    const lowerText = parsed.replyText.toLowerCase()
    for (const phrase of FORBIDDEN_PHRASES) {
      if (lowerText.includes(phrase)) {
        return {
          isValid: false,
          error: `Contains forbidden phrase: ${phrase}`,
          sanitized: undefined,
        }
      }
    }
    
    // Check question count (max 1)
    const questionCount = (parsed.replyText.match(/\?/g) || []).length
    if (questionCount > 1) {
      return {
        isValid: false,
        error: `Contains ${questionCount} questions (max 1 allowed)`,
        sanitized: undefined,
      }
    }
    
    // Check for meta AI wording
    const metaPatterns = [
      /as an ai/i,
      /as an artificial intelligence/i,
      /i will now/i,
      /system prompt/i,
    ]
    for (const pattern of metaPatterns) {
      if (pattern.test(parsed.replyText)) {
        return {
          isValid: false,
          error: 'Contains meta AI wording',
          sanitized: undefined,
        }
      }
    }
    
    return { isValid: true, sanitized: parsed }
  } catch (error: any) {
    return {
      isValid: false,
      error: `Validation error: ${error.message}`,
      sanitized: undefined,
    }
  }
}

/**
 * Sanitize reply text (remove forbidden phrases)
 */
export function sanitizeReplyText(text: string): string {
  let sanitized = text
  const lowerText = text.toLowerCase()
  
  for (const phrase of FORBIDDEN_PHRASES) {
    if (lowerText.includes(phrase)) {
      // Replace with safe alternative
      const regex = new RegExp(phrase, 'gi')
      sanitized = sanitized.replace(regex, '[removed]')
    }
  }
  
  return sanitized
}

/**
 * Check if pricing should be quoted (only if in rule engine)
 */
export function canQuotePricing(serviceKey: string | null, ruleEngineHasPricing: boolean): boolean {
  // Never quote pricing unless explicitly in rule engine
  if (!ruleEngineHasPricing) {
    return false
  }
  
  // Additional safety: don't quote for sensitive services
  const sensitiveServices = ['golden_visa', 'investor_visa']
  if (serviceKey && sensitiveServices.includes(serviceKey)) {
    return false
  }
  
  return true
}
