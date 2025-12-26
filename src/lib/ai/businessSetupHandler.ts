/**
 * Business Setup Qualification Handler
 * 
 * MAX 5 QUESTIONS - Never repeats, never asks "inside UAE", never outputs internal reasoning
 */

import { prisma } from '../prisma'
import { loadFlowState, updateFlowState, recordQuestionAsked, recordCollectedData } from '../conversation/flowState'
import crypto from 'crypto'

export interface BusinessSetupState {
  service_intent: 'business_setup'
  asked_question_count: number
  asked_questions: Record<string, boolean>
  collected: {
    full_name?: string
    business_activity?: string
    raw_activity_text?: string // Exact user wording
    activity_tag?: string // Best match from taxonomy
    jurisdiction?: 'mainland' | 'freezone'
    partners_count?: number | string
    visa_count?: number | string
    phone?: string
    email?: string
  }
  metadata?: {
    regulated_flag?: boolean
    confidence_level?: 'high' | 'low' | 'medium'
  }
  last_inbound_message_id?: string
  last_outbound_idempotency_key?: string
  cheapest_offer_shown?: boolean
}

const FORBIDDEN_PHRASES = [
  'guaranteed',
  'approval guaranteed',
  'inside contact',
  'no risk',
  'discount',
  'fake documents',
  'i should',
  "let's proceed",
  'i will ask',
  'my next question',
]

/**
 * Activity Taxonomy (for tagging/routing only - NOT shown to users)
 */
const ACTIVITY_TAXONOMY = {
  // Professional & Services
  'Marketing & Advertising': ['marketing', 'advertising', 'advertisement', 'promotion', 'branding'],
  'Digital Marketing': ['digital marketing', 'online marketing', 'social media marketing', 'seo', 'sem'],
  'Social Media Management': ['social media', 'smm', 'social media management', 'content management'],
  'Influencer / Content Creator': ['influencer', 'content creator', 'youtuber', 'blogger', 'vlogger'],
  'Consultancy (General)': ['consultancy', 'consulting', 'consultant', 'advisory'],
  'IT Services': ['it services', 'information technology', 'software', 'web development', 'app development', 'programming', 'coding'],
  'Software / Web / App Development': ['software development', 'web development', 'app development', 'mobile app', 'website development'],
  'Media Production': ['media production', 'video production', 'film production', 'photography'],
  'Design / Creative': ['design', 'graphic design', 'creative', 'art', 'illustration'],
  'Accounting / Bookkeeping': ['accounting', 'bookkeeping', 'accountant', 'audit', 'tax'],
  'HR / Recruitment': ['hr', 'human resources', 'recruitment', 'recruiting', 'headhunting'],
  
  // Trading & Commercial
  'General Trading': ['general trading', 'trading', 'trade', 'commercial'],
  'E-Commerce': ['e-commerce', 'ecommerce', 'online store', 'online shop', 'online retail'],
  'Import & Export': ['import', 'export', 'import export', 'trading import', 'trading export'],
  'Foodstuff Trading': ['foodstuff', 'food trading', 'food products', 'grocery trading'],
  'Electronics Trading': ['electronics', 'electronic trading', 'gadgets', 'tech products'],
  'Building Materials Trading': ['building materials', 'construction materials', 'cement', 'steel trading'],
  
  // Lifestyle & Consumer
  'Salon / Beauty': ['salon', 'beauty', 'beauty salon', 'hair salon', 'spa', 'cosmetics'],
  'Fitness / Gym': ['fitness', 'gym', 'gymnasium', 'fitness center', 'personal training'],
  'Restaurant / Café': ['restaurant', 'cafe', 'café', 'dining', 'food service'],
  'Cloud Kitchen': ['cloud kitchen', 'ghost kitchen', 'virtual kitchen', 'dark kitchen'],
  'Catering': ['catering', 'caterer', 'event catering', 'food catering'],
  
  // Industrial / Operational
  'Cleaning Services': ['cleaning', 'cleaning services', 'janitorial', 'housekeeping'],
  'Facilities Management': ['facilities management', 'facility management', 'fm'],
  'Logistics': ['logistics', 'logistic', 'freight', 'shipping'],
  'Warehousing': ['warehouse', 'warehousing', 'storage', 'storage facility'],
  'Construction': ['construction', 'building', 'contractor', 'construction company'],
  'Interior Design': ['interior design', 'interior designer', 'interior decoration'],
  
  // Regulated / Special Approval (also in REGULATED_KEYWORDS)
  'Real Estate / Brokerage': ['real estate', 'property', 'broker', 'brokerage', 'realty'],
  'Travel & Tourism': ['travel', 'tourism', 'tour operator', 'travel agency', 'tours'],
  'Medical / Clinic / Pharmacy': ['medical', 'clinic', 'pharmacy', 'doctor', 'hospital', 'healthcare'],
  'Education / Training Institute': ['education', 'school', 'training institute', 'academy', 'university', 'college'],
  'Legal Services': ['legal', 'law', 'lawyer', 'attorney', 'legal services', 'law firm'],
  'Insurance': ['insurance', 'insurer', 'insurance broker', 'insurance agency'],
  'Crypto / Blockchain': ['crypto', 'blockchain', 'bitcoin', 'cryptocurrency', 'crypto trading'],
  'Financial / Investment Advisory': ['finance', 'financial', 'investment', 'fund', 'investment advisory', 'financial advisory'],
  'Security Services': ['security', 'security services', 'guard', 'security company'],
  'Manpower Supply': ['manpower', 'manpower supply', 'recruitment agency', 'staffing'],
}

/**
 * Regulated Activity Keywords (for mandatory detection)
 */
const REGULATED_KEYWORDS = [
  'real estate', 'broker', 'property', 'realty',
  'travel', 'tourism', 'tour operator', 'travel agency',
  'medical', 'clinic', 'pharmacy', 'doctor', 'hospital', 'healthcare',
  'education', 'school', 'training institute', 'academy', 'university', 'college',
  'legal', 'law', 'lawyer', 'attorney', 'law firm',
  'insurance', 'insurer', 'insurance broker',
  'crypto', 'blockchain', 'bitcoin', 'cryptocurrency',
  'finance', 'financial', 'investment', 'fund', 'investment advisory', 'financial advisory',
  'security', 'security services', 'guard',
  'manpower', 'manpower supply', 'recruitment agency', 'staffing',
]

const CHEAPEST_KEYWORDS = ['cheapest', 'lowest', 'minimum', 'best price', 'budget', 'offer']

/**
 * High confidence activity keywords (clear, specific activities)
 */
const HIGH_CONFIDENCE_KEYWORDS = [
  'marketing', 'advertising', 'it', 'software', 'consultancy', 'consulting',
  'trading', 'e-commerce', 'ecommerce', 'accounting', 'bookkeeping',
  'cleaning', 'logistics', 'construction', 'restaurant', 'cafe',
]

/**
 * Low confidence indicators (vague, uncertain)
 */
const LOW_CONFIDENCE_KEYWORDS = [
  'any business', 'not sure', 'anything', 'whatever', 'you decide',
  'what do you recommend', 'what is best', 'i don\'t know',
]

/**
 * Find best activity tag from taxonomy
 */
function findActivityTag(input: string): { tag: string; confidence: 'high' | 'low' | 'medium' } {
  const lower = input.toLowerCase().trim()
  
  // Check for low confidence indicators first
  if (LOW_CONFIDENCE_KEYWORDS.some(keyword => lower.includes(keyword))) {
    return { tag: 'General Business', confidence: 'low' }
  }
  
  // Check taxonomy for best match
  for (const [tag, keywords] of Object.entries(ACTIVITY_TAXONOMY)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        const isHighConfidence = HIGH_CONFIDENCE_KEYWORDS.some(k => lower.includes(k))
        return {
          tag,
          confidence: isHighConfidence ? 'high' : 'medium',
        }
      }
    }
  }
  
  // If contains "license" but no match, return as-is with medium confidence
  if (lower.includes('license')) {
    return { tag: input.trim(), confidence: 'medium' }
  }
  
  // Default to low confidence if unclear
  return { tag: 'General Business', confidence: 'low' }
}

/**
 * Normalize business activity from user input (backward compatible)
 */
function normalizeBusinessActivity(input: string): string {
  const { tag } = findActivityTag(input)
  return tag
}

/**
 * Check if activity needs special approvals (enhanced with taxonomy)
 */
function isRegulatedActivity(activity: string): boolean {
  const lower = activity.toLowerCase()
  return REGULATED_KEYWORDS.some(keyword => lower.includes(keyword))
}

/**
 * Extract data from message
 */
function extractBusinessData(message: string, existingState: BusinessSetupState): Partial<BusinessSetupState['collected']> {
  const lower = message.toLowerCase()
  const updates: Partial<BusinessSetupState['collected']> = {}
  
  // Extract name (2+ words, not hi/hello)
  if (!existingState.collected.full_name) {
    const words = message.trim().split(/\s+/)
    if (words.length >= 2 && !['hi', 'hello', 'hey'].includes(words[0].toLowerCase())) {
      updates.full_name = words.slice(0, 3).join(' ') // Take first 2-3 words
    }
  }
  
  // Extract business activity (with taxonomy tagging)
  if (!existingState.collected.business_activity) {
    // Check if message contains any activity-related keywords
    const hasActivityKeywords = 
      lower.includes('marketing') || lower.includes('advertising') ||
      lower.includes('license') || lower.includes('business') ||
      lower.includes('trading') || lower.includes('consultancy') ||
      lower.includes('it') || lower.includes('software') ||
      lower.includes('accounting') || lower.includes('e-commerce') ||
      lower.includes('ecommerce') || lower.includes('cleaning') ||
      lower.includes('restaurant') || lower.includes('cafe') ||
      lower.includes('logistics') || lower.includes('construction') ||
      Object.keys(ACTIVITY_TAXONOMY).some(tag => 
        ACTIVITY_TAXONOMY[tag as keyof typeof ACTIVITY_TAXONOMY].some(k => lower.includes(k))
      )
    
    if (hasActivityKeywords) {
      // Store raw user input
      updates.raw_activity_text = message.trim()
      
      // Find best tag from taxonomy
      const { tag, confidence } = findActivityTag(message)
      updates.business_activity = tag
      updates.activity_tag = tag
      
      // Set confidence level in metadata
      if (!existingState.metadata) {
        existingState.metadata = {}
      }
      existingState.metadata.confidence_level = confidence
    }
  }
  
  // Extract jurisdiction
  if (!existingState.collected.jurisdiction) {
    if (lower.includes('mainland')) {
      updates.jurisdiction = 'mainland'
    } else if (lower.includes('freezone') || lower.includes('free zone')) {
      updates.jurisdiction = 'freezone'
    }
  }
  
  // Extract partners count
  if (!existingState.collected.partners_count) {
    const partnerMatch = message.match(/\b([123]\+?|one|two|three|single|solo)\b/i)
    if (partnerMatch) {
      const match = partnerMatch[1].toLowerCase()
      if (match === 'one' || match === 'single' || match === 'solo' || match === '1') {
        updates.partners_count = 1
      } else if (match === 'two' || match === '2') {
        updates.partners_count = 2
      } else if (match === 'three' || match === '3' || match === '3+') {
        updates.partners_count = '3+'
      }
    }
  }
  
  // Extract visa count
  if (!existingState.collected.visa_count) {
    const visaMatch = message.match(/\b([0123]\+?|none|zero|one|two|three|no visa)\b/i)
    if (visaMatch) {
      const match = visaMatch[1].toLowerCase()
      if (match === 'none' || match === 'zero' || match === 'no visa' || match === '0') {
        updates.visa_count = 0
      } else if (match === 'one' || match === '1') {
        updates.visa_count = 1
      } else if (match === 'two' || match === '2') {
        updates.visa_count = 2
      } else if (match === 'three' || match === '3' || match === '3+') {
        updates.visa_count = '3+'
      }
    }
  }
  
  // Extract phone (UAE format)
  if (!existingState.collected.phone) {
    const phoneMatch = message.match(/(\+?971|0)?[5-9]\d{8}/)
    if (phoneMatch) {
      updates.phone = phoneMatch[0]
    }
  }
  
  // Extract email
  if (!existingState.collected.email) {
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
    if (emailMatch) {
      updates.email = emailMatch[0]
    }
  }
  
  return updates
}

/**
 * Check if message contains cheapest intent
 */
function hasCheapestIntent(message: string): boolean {
  const lower = message.toLowerCase()
  return CHEAPEST_KEYWORDS.some(keyword => lower.includes(keyword))
}

/**
 * Filter forbidden phrases from reply
 */
function filterForbiddenPhrases(text: string): string {
  let filtered = text
  FORBIDDEN_PHRASES.forEach(phrase => {
    const regex = new RegExp(phrase, 'gi')
    filtered = filtered.replace(regex, '')
  })
  // Clean up extra spaces
  filtered = filtered.replace(/\s+/g, ' ').trim()
  return filtered
}

/**
 * Generate idempotency key for outbound message
 */
function generateIdempotencyKey(
  conversationId: number,
  replyText: string,
  lastInboundMessageId: string
): string {
  const normalized = replyText.toLowerCase().trim()
  const input = `${conversationId}:${normalized}:${lastInboundMessageId}`
  return crypto.createHash('sha256').update(input).digest('hex')
}

/**
 * Main Business Setup Handler
 */
export async function handleBusinessSetupQualification(
  conversationId: number,
  inboundMessageId: string,
  inboundText: string,
  contactName?: string
): Promise<{
  reply: string | null
  shouldSend: boolean
  handoverToHuman: boolean
  idempotencyKey?: string
}> {
  try {
    // Load existing state
    const flowState = await loadFlowState(conversationId)
    let state: BusinessSetupState = {
      service_intent: 'business_setup',
      asked_question_count: 0,
      asked_questions: {},
      collected: {},
      cheapest_offer_shown: false,
    }
    
    // Parse existing collectedData
    if (flowState.collectedData) {
      state.collected = {
        ...state.collected,
        ...flowState.collectedData,
      }
    }
    
    // Parse asked questions from flowState
    if (flowState.lastQuestionKey) {
      state.asked_questions[flowState.lastQuestionKey] = true
      state.asked_question_count = Object.keys(state.asked_questions).length
    }
    
    // Check cheapest intent FIRST (before extracting data)
    const cheapestIntent = hasCheapestIntent(inboundText)
    if (cheapestIntent && !state.cheapest_offer_shown) {
      state.cheapest_offer_shown = true
      
      // Update state
      await updateFlowState(conversationId, {
        flowKey: 'business_setup',
        collectedData: { ...state.collected, cheapest_offer_shown: true },
      })
      
      // Return special offer + continue to next missing question
      const offerReply = `For the cheapest option, we have a special offer: Professional Mainland License + Investor Visa for just AED 12,999.`
      
      // Continue to next missing question (don't count offer as a question)
      const nextQuestion = getNextMissingQuestion(state)
      if (nextQuestion) {
        return {
          reply: `${offerReply}\n\n${nextQuestion.text}`,
          shouldSend: true,
          handoverToHuman: false,
        }
      } else {
        // All questions answered, confirm quote
        return {
          reply: `${offerReply}\n\nPerfect! I'll prepare your personalized quote and a team member will call you to finalize details.`,
          shouldSend: true,
          handoverToHuman: false,
        }
      }
    }
    
    // Extract data from message
    const extracted = extractBusinessData(inboundText, state)
    state.collected = { ...state.collected, ...extracted }
    
    // Save extracted data
    if (Object.keys(extracted).length > 0) {
      await recordCollectedData(conversationId, extracted)
    }
    
    // Check if activity is regulated (enhanced detection)
    let regulatedNote = ''
    const activityText = state.collected.business_activity || state.collected.raw_activity_text || inboundText
    const isRegulated = isRegulatedActivity(activityText)
    
    if (isRegulated) {
      // Set regulated flag in metadata
      if (!state.metadata) {
        state.metadata = {}
      }
      state.metadata.regulated_flag = true
      regulatedNote = '\n\nNote: This activity may require special approvals. Our specialist will confirm the exact requirements in your quote.'
      
      // Save regulated flag to conversation state
      await updateFlowState(conversationId, {
        flowKey: 'business_setup',
        collectedData: {
          ...state.collected,
          ...(state.metadata ? { metadata: state.metadata } : {}),
        },
      })
    }
    
    // Handle activity acceptance (marketing license, etc.)
    if (extracted.business_activity && !state.asked_questions['BS_Q2_ACTIVITY']) {
      // Activity was just provided - acknowledge and move on
      // Use raw_activity_text if available, otherwise use normalized tag
      const displayActivity = extracted.raw_activity_text || extracted.business_activity || extracted.activity_tag || 'business'
      const activityReply = `Perfect — ${displayActivity} noted.${regulatedNote}`
      
      // Mark activity question as asked (so we don't ask again)
      state.asked_questions['BS_Q2_ACTIVITY'] = true
      state.asked_question_count++
      await recordQuestionAsked(conversationId, 'BS_Q2_ACTIVITY', 'WAIT_BS_Q2_ACTIVITY')
      
      // Update state with all extracted data including metadata
      await updateFlowState(conversationId, {
        flowKey: 'business_setup',
        collectedData: {
          ...state.collected,
          ...extracted,
          ...(state.metadata ? { metadata: state.metadata } : {}),
        },
      })
      
      // Continue to next missing question
      const nextQuestion = getNextMissingQuestion(state)
      if (nextQuestion && state.asked_question_count < 5) {
        return {
          reply: `${activityReply}\n\n${nextQuestion.text}`,
          shouldSend: true,
          handoverToHuman: false,
        }
      } else {
        // All questions answered
        return {
          reply: `${activityReply}\n\nPerfect! I'll prepare your personalized quote and a team member will call you to finalize details.`,
          shouldSend: true,
          handoverToHuman: false,
        }
      }
    }
    
    // Get next missing question
    const nextQuestion = getNextMissingQuestion(state)
    
    // MAX 5 questions check
    if (state.asked_question_count >= 5 && !nextQuestion) {
      // All questions asked and answered
      return {
        reply: `Perfect! I'll prepare your personalized quote and a team member will call you to finalize details.${regulatedNote}`,
        shouldSend: true,
        handoverToHuman: false,
      }
    }
    
    if (!nextQuestion) {
      // All required info collected
      return {
        reply: `Perfect! I'll prepare your personalized quote and a team member will call you to finalize details.${regulatedNote}`,
        shouldSend: true,
        handoverToHuman: false,
      }
    }
    
    // Check if we've already asked this question
    if (state.asked_questions[nextQuestion.key]) {
      // Already asked - skip to next
      const nextAfter = getNextMissingQuestion(state, nextQuestion.key)
      if (nextAfter && state.asked_question_count < 5) {
        const reply = filterForbiddenPhrases(nextAfter.text)
        state.asked_questions[nextAfter.key] = true
        state.asked_question_count++
        await recordQuestionAsked(conversationId, nextAfter.key, `WAIT_${nextAfter.key}`)
        
        return {
          reply: reply + regulatedNote,
          shouldSend: true,
          handoverToHuman: false,
        }
      } else {
        // All questions answered
        return {
          reply: `Perfect! I'll prepare your personalized quote and a team member will call you to finalize details.${regulatedNote}`,
          shouldSend: true,
          handoverToHuman: false,
        }
      }
    }
    
    // Ask next question
    const reply = filterForbiddenPhrases(nextQuestion.text)
    state.asked_questions[nextQuestion.key] = true
    state.asked_question_count++
    await recordQuestionAsked(conversationId, nextQuestion.key, `WAIT_${nextQuestion.key}`)
    
    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(conversationId, reply, inboundMessageId)
    
    // Update state with all metadata
    await updateFlowState(conversationId, {
      flowKey: 'business_setup',
      collectedData: {
        ...state.collected,
        ...(state.metadata ? { metadata: state.metadata } : {}),
      },
    })
    
    return {
      reply: reply + regulatedNote,
      shouldSend: true,
      handoverToHuman: false,
      idempotencyKey,
    }
  } catch (error: any) {
    console.error(`❌ [BUSINESS-SETUP] Handler error: ${error.message}`)
    return {
      reply: null,
      shouldSend: false,
      handoverToHuman: true,
    }
  }
}

/**
 * Get next missing question
 */
function getNextMissingQuestion(
  state: BusinessSetupState,
  skipKey?: string
): { key: string; text: string } | null {
  const name = state.collected.full_name || ''
  const greeting = name ? `Hi ${name.split(' ')[0]}, ` : ''
  
  // Q1: Name (only if not known)
  if (!state.collected.full_name && !state.asked_questions['BS_Q1_NAME'] && skipKey !== 'BS_Q1_NAME') {
    return {
      key: 'BS_Q1_NAME',
      text: `${greeting}May I have your full name?`,
    }
  }
  
  // Q2: Business activity
  if (!state.collected.business_activity && !state.asked_questions['BS_Q2_ACTIVITY'] && skipKey !== 'BS_Q2_ACTIVITY') {
    return {
      key: 'BS_Q2_ACTIVITY',
      text: `What business activity do you want on the license? (e.g., General Trading / IT Services / Consultancy / Marketing / E-commerce)`,
    }
  }
  
  // Q3: Mainland vs Freezone
  if (!state.collected.jurisdiction && !state.asked_questions['BS_Q3_JURISDICTION'] && skipKey !== 'BS_Q3_JURISDICTION') {
    return {
      key: 'BS_Q3_JURISDICTION',
      text: `Do you prefer Mainland or Freezone?`,
    }
  }
  
  // Q4: Partners count
  if (!state.collected.partners_count && !state.asked_questions['BS_Q4_PARTNERS'] && skipKey !== 'BS_Q4_PARTNERS') {
    return {
      key: 'BS_Q4_PARTNERS',
      text: `How many partners/shareholders will be on the license? (1 / 2 / 3+)`,
    }
  }
  
  // Q5: Visa count + contact (ONE message)
  if ((!state.collected.visa_count || !state.collected.phone || !state.collected.email) && 
      !state.asked_questions['BS_Q5_VISA_CONTACT'] && skipKey !== 'BS_Q5_VISA_CONTACT') {
    const missing = []
    if (!state.collected.visa_count) missing.push('visa count')
    if (!state.collected.phone && !state.collected.email) missing.push('contact details')
    
    return {
      key: 'BS_Q5_VISA_CONTACT',
      text: `How many residence visas do you need? (0 / 1 / 2 / 3+) Also, what's the best WhatsApp number and email to send your personalized quote?`,
    }
  }
  
  return null
}

