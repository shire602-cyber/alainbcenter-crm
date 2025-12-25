/**
 * Strict AI Generation with JSON Output
 * 
 * Implements the strict pipeline:
 * 1. Build strict prompt with rules
 * 2. Generate JSON output
 * 3. Parse and sanitize
 * 4. Lock service on conversation
 * 5. Return only customer-facing text
 */

import { buildStrictSystemPrompt, buildStrictUserPrompt, type StrictPromptContext } from './strictPrompt'
import { parseAIOutput, type AIStructuredOutput } from './outputSchema'
import { RoutingService } from '../llm/routing'
import type { LLMMessage } from '../llm/types'
import { prisma } from '../prisma'
import { searchTrainingDocuments } from './vectorStore'

/**
 * Extract provided information from conversation history
 */
function extractProvidedInfo(messages: Array<{ direction: string; body: string }>): {
  nationality?: string
  location?: 'inside' | 'outside'
  service?: string
  expiryDate?: string
  name?: string
  freezone?: boolean
  mainland?: boolean
  [key: string]: any
} {
  const provided: any = {}
  const allText = messages.map(m => m.body || '').join(' ').toLowerCase()
  
  // Extract nationality
  const nationalityKeywords = ['nigeria', 'somalia', 'indian', 'pakistani', 'filipino', 'egyptian', 'british', 'american', 'canadian', 'somali', 'nigerian', 'bangladesh', 'bangladeshi', 'nepal', 'nepali', 'sri lanka', 'sri lankan', 'vietnam', 'vietnamese']
  for (const keyword of nationalityKeywords) {
    if (allText.includes(keyword)) {
      provided.nationality = keyword
      break
    }
  }
  
  // Extract location (for visas only - inside/outside UAE)
  if (allText.includes('inside') || allText.includes('in uae') || allText.includes('im inside')) {
    // Only set location if this is a visa question, not business setup
    if (!allText.includes('license') && !allText.includes('business setup') && !allText.includes('trading license')) {
      provided.location = 'inside'
    }
  } else if (allText.includes('outside') || allText.includes('outside uae') || allText.includes('im outside')) {
    // Only set location if this is a visa question, not business setup
    if (!allText.includes('license') && !allText.includes('business setup') && !allText.includes('trading license')) {
      provided.location = 'outside'
    }
  }
  
  // Extract mainland/freezone (for business setup/license only)
  if (allText.includes('mainland')) {
    provided.mainland = true
    provided.freezone = false
  } else if (allText.includes('freezone') || allText.includes('free zone')) {
    provided.freezone = true
    provided.mainland = false
  }
  
  // Extract name - improved patterns to catch names in various formats
  const namePatterns = [
    /(?:my name is|i'm|i am|name is|call me|it's|its|name:|i said|just said)\s+([a-z\s]{2,50})/i,
    /^([a-z\s]{2,50})$/i, // If message is just a name (like "abdurahman shire")
    /(?:i'm|i am)\s+([a-z]+(?:\s+[a-z]+){0,2})/i, // "i'm john" or "i am john doe"
  ]
  
  // Also check individual messages for names (not just concatenated text)
  for (const msg of messages) {
    const msgText = (msg.body || '').toLowerCase().trim()
    // If message is just a name (2-50 chars, no punctuation except spaces, not common words)
    if (msgText.length >= 2 && msgText.length <= 50 && 
        /^[a-z\s]+$/.test(msgText) && // Only letters and spaces
        !['hi', 'hello', 'hey', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank you', 'freezone', 'mainland', 'inside', 'outside'].includes(msgText)) {
      // Check if it looks like a name (has at least one space or is a reasonable length)
      if (msgText.includes(' ') || msgText.length >= 3) {
        provided.name = msgText.trim()
        console.log(`📝 [EXTRACT] Extracted name from message: "${provided.name}"`)
        break
      }
    }
    
    // Try patterns on individual message
    for (const pattern of namePatterns) {
      const match = msgText.match(pattern)
      if (match && match[1]) {
        const potentialName = match[1].trim()
        // Exclude common words that aren't names
        if (potentialName.length >= 2 && potentialName.length <= 50 && 
            !['hi', 'hello', 'hey', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank you', 'freezone', 'mainland'].includes(potentialName.toLowerCase())) {
          provided.name = potentialName
          console.log(`📝 [EXTRACT] Extracted name via pattern: "${provided.name}"`)
          break
        }
      }
    }
    if (provided.name) break
  }
  
  // Extract service
  if (allText.includes('freelance visa') || allText.includes('freelance permit')) {
    provided.service = allText.includes('permit') ? 'freelance_permit_visa' : 'freelance_visa'
  } else if (allText.includes('visit visa')) {
    provided.service = 'visit_visa'
  } else if (allText.includes('family visa')) {
    provided.service = 'family_visa'
  } else if (allText.includes('investor visa')) {
    provided.service = 'investor_visa'
  } else if (allText.includes('golden visa')) {
    provided.service = 'golden_visa'
  } else if (allText.includes('business setup') || allText.includes('license') || allText.includes('trading license')) {
    provided.service = 'business_setup'
  }
  
  // Extract expiry date
  const datePatterns = [
    /(\d{1,2}(?:st|nd|rd|th)?\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+\d{4})?)/i,
    /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,
    /(\d{4}-\d{1,2}-\d{1,2})/,
  ]
  for (const pattern of datePatterns) {
    const match = allText.match(pattern)
    if (match && match[1]) {
      provided.expiryDate = match[1]
      break
    }
  }
  
  return provided
}

/**
 * Generate strict AI reply with JSON output
 */
export async function generateStrictAIReply(
  context: {
    lead: any
    contact: any
    conversation: any
    currentMessage: string
    conversationHistory: Array<{ direction: string; body: string; createdAt: Date }>
    agent?: any
    language?: 'en' | 'ar'
  }
): Promise<{
  reply: string // Customer-facing message only
  structured: AIStructuredOutput | null
  rawOutput: string
  parseError?: string
  needsHuman: boolean
  service: string
  confidence: number
}> {
  const { lead, contact, conversation, currentMessage, conversationHistory, agent, language = 'en' } = context
  
  // Get locked service from conversation (if exists)
  const lockedService = (conversation as any).lockedService || undefined
  
  // Extract provided information
  const providedInfo = extractProvidedInfo(conversationHistory)
  
  // If service is locked, use it
  if (lockedService) {
    providedInfo.service = lockedService
  }
  
  // Retrieve training documents - FORCE retrieval with very low threshold
  let trainingDocs: Array<{ title: string; content: string; type: string }> = []
  try {
    // Try with 0.25 threshold first
    let retrievalResult = await searchTrainingDocuments(currentMessage, {
      similarityThreshold: 0.25,
      topK: 5,
      trainingDocumentIds: agent?.trainingDocumentIds || undefined,
    })
    
    // If no results, try with even lower threshold (0.1) to force retrieval
    if (retrievalResult.documents.length === 0) {
      console.log(`⚠️ [STRICT-AI] No docs at 0.25 threshold, trying 0.1...`)
      retrievalResult = await searchTrainingDocuments(currentMessage, {
        similarityThreshold: 0.1,
        topK: 5,
        trainingDocumentIds: agent?.trainingDocumentIds || undefined,
      })
    }
    
    trainingDocs = retrievalResult.documents.map((doc: any) => ({
      title: doc.title || 'Training Document',
      content: doc.content.substring(0, 2000), // Increased to 2000 chars for more context
      type: doc.type || 'general',
    }))
    
    console.log(`📚 [STRICT-AI] Retrieved ${trainingDocs.length} training documents`)
  } catch (retrievalError) {
    console.warn('⚠️ [STRICT-AI] Failed to retrieve training documents:', retrievalError)
    // Continue without training docs, but log warning
  }
  
  // CRITICAL: Use contact's name from DB if available, otherwise use extracted name
  const contactNameFromDB = contact?.fullName?.trim()
  const extractedName = providedInfo.name
  const finalContactName = (contactNameFromDB && 
                            !contactNameFromDB.toLowerCase().includes('unknown') && 
                            !contactNameFromDB.toLowerCase().includes('whatsapp')) 
                            ? contactNameFromDB 
                            : (extractedName || 'there')
  
  // If we have a name (from DB or extracted), add it to providedInfo
  if (finalContactName && finalContactName !== 'there') {
    providedInfo.name = finalContactName
    console.log(`📝 [STRICT-AI] Using contact name: "${finalContactName}" (from DB: ${!!contactNameFromDB}, extracted: ${!!extractedName})`)
  }
  
  // Build strict prompt context
  const promptContext: StrictPromptContext = {
    contactName: finalContactName,
    contactNationality: providedInfo.nationality,
    conversationHistory: conversationHistory.map(m => ({
      direction: m.direction as 'INBOUND' | 'OUTBOUND',
      body: m.body || '',
      createdAt: m.createdAt,
    })),
    currentMessage,
    lockedService,
    providedInfo,
    trainingDocs,
    agentName: agent?.name,
    language,
  }
  
  // Build prompts
  const systemPrompt = buildStrictSystemPrompt(promptContext)
  const userPrompt = buildStrictUserPrompt(promptContext)
  
  // Prepare LLM messages
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userPrompt,
    },
  ]
  
  // Generate with lower temperature for Groq (reduce hallucinations)
  const options = {
    temperature: 0.3, // Lower temperature for more deterministic output
    maxTokens: 500,
    topP: 0.9,
  }
  
  // Use routing service with task type hint
  const routingService = new RoutingService()
  const routingContext = {
    taskType: 'greeting' as const, // Will be adjusted by routing service
    leadStage: lead?.pipelineStage || lead?.status,
    conversationLength: conversationHistory.length,
  }
  
  let rawOutput = ''
  let parseAttempts = 0
  const maxParseAttempts = 2
  
  while (parseAttempts < maxParseAttempts) {
    try {
      console.log(`🤖 [STRICT-AI] Generating strict AI reply (attempt ${parseAttempts + 1}/${maxParseAttempts})`)
      
      const routingResult = await routingService.route(messages, options, routingContext)
      const result = routingResult.result
      rawOutput = result.text
      
      console.log(`📝 [STRICT-AI] Raw output (${rawOutput.length} chars): ${rawOutput.substring(0, 200)}...`)
      
      // Parse JSON output
      const parsed = parseAIOutput(rawOutput, conversationHistory)
      
      if (parsed.structured) {
        console.log(`✅ [STRICT-AI] Successfully parsed JSON output`)
        console.log(`   Service: ${parsed.structured.service}`)
        console.log(`   Stage: ${parsed.structured.stage}`)
        console.log(`   Needs Human: ${parsed.structured.needsHuman}`)
        console.log(`   Confidence: ${parsed.structured.confidence}`)
        console.log(`   Reply length: ${parsed.structured.reply.length} chars`)
        
        // Lock service on conversation if service was identified
        if (parsed.structured.service && parsed.structured.service !== 'unknown') {
          try {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                lockedService: parsed.structured.service,
              },
            })
            console.log(`🔒 [STRICT-AI] Locked service "${parsed.structured.service}" on conversation ${conversation.id}`)
          } catch (lockError: any) {
            console.warn('Failed to lock service on conversation:', lockError)
          }
        }
        
        return {
          reply: parsed.structured.reply,
          structured: parsed.structured,
          rawOutput,
          needsHuman: parsed.structured.needsHuman,
          service: parsed.structured.service,
          confidence: parsed.structured.confidence,
        }
      } else {
        // Parse failed - try again with stricter instruction
        parseAttempts++
        if (parseAttempts < maxParseAttempts) {
          console.warn(`⚠️ [STRICT-AI] Parse failed: ${parsed.parseError}, retrying with stricter instruction...`)
          
          // Add stricter JSON instruction
          messages[1].content = userPrompt + '\n\nCRITICAL: You MUST return ONLY valid JSON. No explanations, no markdown, no other text. Just the JSON object.'
        } else {
          console.error(`❌ [STRICT-AI] Parse failed after ${maxParseAttempts} attempts: ${parsed.parseError}`)
          
          // Fallback: try to extract just the reply text
          const replyMatch = rawOutput.match(/"reply"\s*:\s*"([^"]+)"/i)
          if (replyMatch && replyMatch[1]) {
            return {
              reply: replyMatch[1],
              structured: null,
              rawOutput,
              parseError: parsed.parseError,
              needsHuman: false,
              service: 'unknown',
              confidence: 0.3,
            }
          }
          
          // Last resort: use raw output (sanitized)
          const sanitized = parseAIOutput(rawOutput, conversationHistory)
          return {
            reply: sanitized.rawText.substring(0, 300), // Truncate to reasonable length
            structured: null,
            rawOutput,
            parseError: parsed.parseError,
            needsHuman: true, // If we can't parse, escalate to human
            service: 'unknown',
            confidence: 0.1,
          }
        }
      }
    } catch (error: any) {
      console.error(`❌ [STRICT-AI] Generation error:`, error.message)
      throw error
    }
  }
  
  // Should never reach here, but TypeScript needs it
  throw new Error('Failed to generate strict AI reply after all attempts')
}

