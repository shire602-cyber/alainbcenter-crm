/**
 * AI Data Extraction from Messages
 * 
 * Extracts structured data (name, email, service type, etc.) from customer messages
 * using AI to automatically populate lead and contact fields
 */

import { getAIConfig } from './client'

export interface ExtractedLeadData {
  name?: string | null
  email?: string | null
  phone?: string | null
  nationality?: string | null
  serviceType?: string | null
  serviceTypeEnum?: string | null
  urgency?: 'low' | 'medium' | 'high' | null
  expiryDate?: string | null // ISO date string
  notes?: string | null
  confidence: number // 0-100, how confident AI is in extraction
}

/**
 * Extract structured data from a customer message using AI
 * 
 * @param messageText - The message text to analyze
 * @param existingContact - Optional existing contact data to avoid overwriting
 * @param existingLead - Optional existing lead data to avoid overwriting
 * @returns Extracted data with confidence score
 */
export async function extractLeadDataFromMessage(
  messageText: string,
  existingContact?: { fullName?: string | null; email?: string | null; phone?: string | null; nationality?: string | null } | null,
  existingLead?: { serviceType?: string | null; leadType?: string | null; notes?: string | null } | null
): Promise<ExtractedLeadData> {
  const config = await getAIConfig()
  
  // If AI not configured, use basic regex extraction as fallback
  if (!config) {
    console.log('⚠️ [AI-EXTRACT] No AI config found, using basic extraction')
    return extractBasicData(messageText, existingContact, existingLead)
  }

  console.log(`🔍 [AI-EXTRACT] Using provider: ${config.provider}, model: ${config.model}`)

  try {
    // Build prompt for AI extraction
    const prompt = `You are analyzing a customer message for a UAE business center (visa services, business setup, renewals).

Extract the following information from this message:
- Full name (if mentioned)
- Email address (if mentioned)
- Phone number (if mentioned, but ignore the sender's number)
- Nationality (if mentioned)
- Service type they need (e.g., "Family Visa", "Business Setup", "Visa Renewal", "Employment Visa", etc.)
- Urgency level (low/medium/high based on keywords like "urgent", "asap", "soon", etc.)
- Expiry date (if mentioned, extract as YYYY-MM-DD format)
- Additional notes or requirements

Message: "${messageText}"

${existingContact ? `Existing contact info: Name: ${existingContact.fullName || 'unknown'}, Email: ${existingContact.email || 'none'}, Phone: ${existingContact.phone || 'none'}, Nationality: ${existingContact.nationality || 'none'}` : ''}
${existingLead ? `Existing lead info: Service: ${existingLead.serviceType || existingLead.leadType || 'none'}, Notes: ${existingLead.notes || 'none'}` : ''}

IMPORTANT:
- Only extract NEW information not already in existing data
- If existing data is present, only update if message provides better/more complete info
- Return JSON format only, no explanations
- Set confidence score (0-100) based on how clear the information is

Return JSON in this exact format:
{
  "name": "extracted name or null",
  "email": "extracted email or null",
  "phone": "extracted phone or null",
  "nationality": "extracted nationality or null",
  "serviceType": "extracted service type or null",
  "serviceTypeEnum": "MAINLAND_BUSINESS_SETUP | FREEZONE_BUSINESS_SETUP | EMPLOYMENT_VISA | FAMILY_VISA | etc. or null",
  "urgency": "low | medium | high | null",
  "expiryDate": "YYYY-MM-DD or null",
  "notes": "extracted additional notes or null",
  "confidence": 85
}`

    let apiUrl: string
    let headers: Record<string, string>
    let body: any

    // Provider priority: DeepSeek (Primary) → OpenAI → Anthropic → Groq
    if (config.provider === 'deepseek') {
      // DeepSeek (Primary) - uses OpenAI-compatible API
      apiUrl = 'https://api.deepseek.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model || 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a data extraction assistant. Extract structured information from customer messages and return ONLY valid JSON, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }
    } else if (config.provider === 'openai') {
      // OpenAI (Fallback #1)
      apiUrl = 'https://api.openai.com/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a data extraction assistant. Extract structured information from customer messages and return ONLY valid JSON, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent extraction
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }
    } else if (config.provider === 'anthropic') {
      // Anthropic (Fallback #2)
      apiUrl = 'https://api.anthropic.com/v1/messages'
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      }
      body = {
        model: config.model,
        max_tokens: 500,
        system: 'You are a data extraction assistant. Extract structured information from customer messages and return ONLY valid JSON, no explanations.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }
    } else if (config.provider === 'groq') {
      // Groq (Fallback #3)
      apiUrl = 'https://api.groq.com/openai/v1/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      }
      body = {
        model: config.model,
        messages: [
          {
            role: 'system',
            content: 'You are a data extraction assistant. Extract structured information from customer messages and return ONLY valid JSON, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }
    } else {
      // Unknown provider - fallback to basic extraction
      console.warn(`Unknown AI provider: ${config.provider}, using basic extraction`)
      return extractBasicData(messageText, existingContact, existingLead)
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      console.warn('AI extraction failed, using basic extraction:', await response.text())
      return extractBasicData(messageText, existingContact, existingLead)
    }

    const data = await response.json()
    let content = ''
    
    if (config.provider === 'anthropic') {
      // Anthropic uses different response format
      content = data.content?.[0]?.text?.trim() || '{}'
    } else {
      // DeepSeek, OpenAI, and Groq all use OpenAI-compatible response format
      content = data.choices[0]?.message?.content?.trim() || '{}'
    }

    // Parse JSON response
    let extracted: any = {}
    try {
      extracted = JSON.parse(content)
    } catch (parseError) {
      console.warn('Failed to parse AI extraction JSON, using basic extraction:', parseError)
      return extractBasicData(messageText, existingContact, existingLead)
    }

    // Validate and normalize extracted data
    return {
      name: extracted.name && typeof extracted.name === 'string' && extracted.name.trim() ? extracted.name.trim() : null,
      email: extracted.email && typeof extracted.email === 'string' && extracted.email.includes('@') ? extracted.email.trim().toLowerCase() : null,
      phone: extracted.phone && typeof extracted.phone === 'string' ? extracted.phone.trim() : null,
      nationality: extracted.nationality && typeof extracted.nationality === 'string' ? extracted.nationality.trim() : null,
      serviceType: extracted.serviceType && typeof extracted.serviceType === 'string' ? extracted.serviceType.trim() : null,
      // Normalize serviceTypeEnum - use raw input if serviceTypeEnum not provided
      serviceTypeEnum: (() => {
        const rawService = extracted.serviceTypeEnum || extracted.serviceType
        if (!rawService || typeof rawService !== 'string') return null
        
        // Normalize the service
        const { normalizeService } = require('../services/normalizeService')
        const normalized = normalizeService(rawService.trim())
        return normalized.service
      })(),
      urgency: extracted.urgency && ['low', 'medium', 'high'].includes(extracted.urgency.toLowerCase()) ? extracted.urgency.toLowerCase() as 'low' | 'medium' | 'high' : null,
      expiryDate: extracted.expiryDate && typeof extracted.expiryDate === 'string' ? extracted.expiryDate.trim() : null,
      notes: extracted.notes && typeof extracted.notes === 'string' ? extracted.notes.trim() : null,
      confidence: typeof extracted.confidence === 'number' ? Math.max(0, Math.min(100, extracted.confidence)) : 50,
    }
  } catch (error: any) {
    console.error('AI extraction error:', error)
    // Fallback to basic extraction
    return extractBasicData(messageText, existingContact, existingLead)
  }
}

/**
 * Basic regex-based extraction (fallback when AI is not available)
 */
function extractBasicData(
  messageText: string,
  existingContact?: { fullName?: string | null; email?: string | null; phone?: string | null; nationality?: string | null } | null,
  existingLead?: { serviceType?: string | null; leadType?: string | null; notes?: string | null } | null
): ExtractedLeadData {
  const text = messageText.toLowerCase()
  const extracted: ExtractedLeadData = {
    confidence: 30, // Low confidence for regex extraction
  }

  // Extract email
  const emailMatch = messageText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/)
  if (emailMatch && !existingContact?.email) {
    extracted.email = emailMatch[0].toLowerCase()
  }

  // Extract phone (basic pattern, but ignore if it's the sender's number)
  const phoneMatch = messageText.match(/(\+?971|0)?[0-9]{9,10}/)
  if (phoneMatch && !existingContact?.phone) {
    extracted.phone = phoneMatch[0]
  }

  // Extract service keywords
  const serviceKeywords: Record<string, string> = {
    'family visa': 'FAMILY_VISA',
    'employment visa': 'EMPLOYMENT_VISA',
    'business setup': 'MAINLAND_BUSINESS_SETUP',
    'freezone': 'FREEZONE_BUSINESS_SETUP',
    'renewal': 'VISA_RENEWAL',
    'visa renewal': 'VISA_RENEWAL',
    'investor visa': 'INVESTOR_PARTNER_VISA',
    'freelance': 'FREELANCE_VISA',
  }

  for (const [keyword, enumValue] of Object.entries(serviceKeywords)) {
    if (text.includes(keyword) && !existingLead?.serviceType && !existingLead?.leadType) {
      extracted.serviceType = keyword
      // Normalize the service enum
      const { normalizeService } = require('../services/normalizeService')
      const normalized = normalizeService(enumValue)
      extracted.serviceTypeEnum = normalized.service
      break
    }
  }

  // Extract urgency
  if (text.includes('urgent') || text.includes('asap') || text.includes('immediately')) {
    extracted.urgency = 'high'
  } else if (text.includes('soon') || text.includes('quickly')) {
    extracted.urgency = 'medium'
  }

  // Extract expiry date (basic patterns)
  const datePatterns = [
    /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/,
    /\b(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/,
  ]
  for (const pattern of datePatterns) {
    const match = messageText.match(pattern)
    if (match) {
      try {
        const parsed = new Date(match[1])
        if (!isNaN(parsed.getTime())) {
          extracted.expiryDate = parsed.toISOString().split('T')[0]
          break
        }
      } catch {
        // Ignore invalid dates
      }
    }
  }

  return extracted
}
