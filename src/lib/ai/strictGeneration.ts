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
  
  // Extract location
  if (allText.includes('inside') || allText.includes('in uae') || allText.includes('im inside')) {
    provided.location = 'inside'
  } else if (allText.includes('outside') || allText.includes('outside uae') || allText.includes('im outside')) {
    provided.location = 'outside'
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
  } else if (allText.includes('business setup') || allText.includes('business setup')) {
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
  
  // Retrieve training documents
  let trainingDocs: Array<{ title: string; content: string; type: string }> = []
  try {
    const retrievalResult = await searchTrainingDocuments(currentMessage, {
      similarityThreshold: 0.5,
      topK: 5,
      trainingDocumentIds: agent?.trainingDocumentIds || undefined,
    })
    
    trainingDocs = retrievalResult.documents.map((doc: any) => ({
      title: doc.title || 'Training Document',
      content: doc.content.substring(0, 1500),
      type: doc.type || 'general',
    }))
  } catch (retrievalError) {
    console.warn('Failed to retrieve training documents:', retrievalError)
    // Continue without training docs
  }
  
  // Build strict prompt context
  const promptContext: StrictPromptContext = {
    contactName: contact?.fullName || 'there',
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

