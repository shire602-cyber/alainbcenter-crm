/**
 * Strict AI Output Schema
 * 
 * AI must return valid JSON with this structure.
 * Only the "reply" field is sent to customers.
 */

export interface AIStructuredOutput {
  reply: string // Customer-facing message (ONLY this is sent)
  service: 'visit_visa' | 'freelance_visa' | 'freelance_permit_visa' | 'investor_visa' | 'pro_work' | 'business_setup' | 'family_visa' | 'golden_visa' | 'unknown'
  stage: 'qualify' | 'quote' | 'handover'
  needsHuman: boolean
  missing: string[] // What information is still needed
  confidence: number // 0.0 to 1.0
}

/**
 * Sanitize AI reply before sending
 * Blocks reasoning, meta text, signatures, and invented facts
 */
export function sanitizeReply(reply: string, conversationHistory: any[]): {
  sanitized: string
  blocked: boolean
  reason?: string
} {
  const lowerReply = reply.toLowerCase()
  
  // FORBIDDEN PATTERNS - Block if found
  const forbiddenPatterns = [
    // Reasoning/planning
    /let's proceed/i,
    /i should/i,
    /i will/i,
    /let me/i,
    /i'll/i,
    /i'm going to/i,
    /i think/i,
    /i believe/i,
    /analysis/i,
    /reasoning/i,
    /planning/i,
    /let me analyze/i,
    /let me check/i,
    /let me review/i,
    
    // Signatures
    /best regards/i,
    /regards/i,
    /sincerely/i,
    /yours truly/i,
    /thank you,/i,
    /thanks,/i,
    
    // Quoted messages (internal reasoning)
    /"[^"]{20,}"/, // Long quoted text
    /you said "[^"]+"/i,
    /you mentioned "[^"]+"/i,
    
    // Promises/guarantees
    /guaranteed/i,
    /approval guaranteed/i,
    /no risk/i,
    /100%/i,
    /inside contact/i,
    /government connection/i,
    
    // Discounts (we don't offer)
    /discount/i,
    /special price/i,
    /reduced price/i,
  ]
  
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(reply)) {
      return {
        sanitized: '',
        blocked: true,
        reason: `Blocked: Contains forbidden pattern "${pattern}"`,
      }
    }
  }
  
  // Check for invented dates (dates not in conversation or DB)
  const datePattern = /(?:expir|expires?|expiry|valid until|valid till|until|till|on)\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i
  const dateMatch = reply.match(datePattern)
  if (dateMatch) {
    const mentionedDate = dateMatch[1]
    // Check if this date was mentioned in conversation
    const conversationText = conversationHistory.map(m => m.body || m.message || '').join(' ').toLowerCase()
    if (!conversationText.includes(mentionedDate.toLowerCase().replace(/\s+/g, ' '))) {
      return {
        sanitized: '',
        blocked: true,
        reason: `Blocked: Invented date "${mentionedDate}" not found in conversation`,
      }
    }
  }
  
  // Remove any agent names that aren't configured (except if it's in the actual agent name)
  // This is handled in the prompt, but double-check here
  
  // Clean up any remaining issues
  let sanitized = reply.trim()
  
  // Remove trailing signatures if they slipped through
  sanitized = sanitized.replace(/\s*(best regards|regards|sincerely|thank you|thanks)[,.]?\s*[a-z\s]*$/i, '')
  
  return {
    sanitized,
    blocked: false,
  }
}

/**
 * Parse AI output and extract structured data
 * Handles both JSON and plain text (fallback)
 */
export function parseAIOutput(
  rawOutput: string,
  conversationHistory: any[]
): {
  structured: AIStructuredOutput | null
  rawText: string
  parseError?: string
} {
  // Try to extract JSON from output (might be wrapped in markdown or have extra text)
  let jsonText = rawOutput.trim()
  
  // Remove markdown code blocks if present
  jsonText = jsonText.replace(/```json\s*/g, '').replace(/```\s*/g, '')
  
  // Try to find JSON object
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    jsonText = jsonMatch[0]
  }
  
  try {
    const parsed = JSON.parse(jsonText) as Partial<AIStructuredOutput>
    
    // Validate required fields
    if (!parsed.reply || typeof parsed.reply !== 'string') {
      return {
        structured: null,
        rawText: rawOutput,
        parseError: 'Missing or invalid "reply" field',
      }
    }
    
    // Sanitize the reply
    const sanitized = sanitizeReply(parsed.reply, conversationHistory)
    if (sanitized.blocked) {
      return {
        structured: null,
        rawText: rawOutput,
        parseError: sanitized.reason || 'Reply blocked by sanitizer',
      }
    }
    
    // Build structured output with defaults
    const structured: AIStructuredOutput = {
      reply: sanitized.sanitized,
      service: parsed.service || 'unknown',
      stage: parsed.stage || 'qualify',
      needsHuman: parsed.needsHuman || false,
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
    }
    
    return {
      structured,
      rawText: rawOutput,
    }
  } catch (parseError: any) {
    return {
      structured: null,
      rawText: rawOutput,
      parseError: `JSON parse error: ${parseError.message}`,
    }
  }
}

