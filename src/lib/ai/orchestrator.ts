/**
 * AI ORCHESTRATOR - SINGLE SOURCE OF TRUTH FOR AI REPLIES
 * 
 * This is the ONLY module allowed to call the LLM.
 * All other AI modules must use this orchestrator.
 * 
 * Responsibilities:
 * 1. Load AI Rules + AI Training content from DB
 * 2. Build ONE system prompt (strict; no hallucinations; follow ruleEngine)
 * 3. Execute model call
 * 4. Validate output with strictQualification
 * 5. Return structured output
 */

import { prisma } from '../prisma'
import { generateCompletion } from '@/lib/llm'
import { validateQualificationRules } from './strictQualification'
import { executeRuleEngine } from './ruleEngine'
import type { LLMMessage } from '@/lib/llm/types'
import { createHash } from 'crypto'
import {
  loadConversationState,
  updateConversationState,
  wasQuestionAsked,
  getNextBusinessSetupQuestion,
  extractFieldsToState,
  shouldStopAsking,
  type ConversationState,
} from './stateMachine'

// BANNED QUESTION KEYS - These must NEVER be asked
const BANNED_QUESTION_KEYS = new Set([
  'new_or_renewal',
  'new_or_renew',
  'company_name',
  'companyName',
  'ASK_COMPANY',
  'ASK_NEW_OR_RENEW',
])

export interface OrchestratorInput {
  conversationId: number
  leadId?: number
  contactId: number
  inboundText: string
  inboundMessageId: number
  channel: string
  language?: 'en' | 'ar'
  agentProfileId?: number
}

export interface OrchestratorOutput {
  replyText: string
  extractedFields: {
    service?: string
    nationality?: string
    name?: string
    expiryDate?: string
    businessActivity?: string
    partnersCount?: number
    visasCount?: number
    [key: string]: any
  }
  confidence: number // 0-100
  nextStepKey?: string
  tasksToCreate: Array<{
    type: string
    title: string
    dueAt?: Date
  }>
  shouldEscalate: boolean
  handoverReason?: string
}

/**
 * Load AI Training Documents from database
 */
async function loadTrainingDocuments(agentProfileId?: number): Promise<string> {
  try {
    let documentIds: number[] = []
    
    // If agent profile specified, get its training document IDs
    if (agentProfileId) {
      const agent = await prisma.aIAgentProfile.findUnique({
        where: { id: agentProfileId },
        select: { trainingDocumentIds: true },
      })
      
      if (agent?.trainingDocumentIds) {
        try {
          documentIds = JSON.parse(agent.trainingDocumentIds)
        } catch {
          // If not JSON, treat as comma-separated
          documentIds = agent.trainingDocumentIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
        }
      }
    }
    
    // If no agent profile or no documents specified, load all active documents
    if (documentIds.length === 0) {
      const allDocs = await prisma.aITrainingDocument.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 50, // Limit to most recent 50
      })
      documentIds = allDocs.map(doc => doc.id)
    }
    
    // Load documents
    const documents = await prisma.aITrainingDocument.findMany({
      where: { id: { in: documentIds } },
      orderBy: { updatedAt: 'desc' },
    })
    
    // Combine into training text
    const trainingText = documents
      .map(doc => `[${doc.type.toUpperCase()}] ${doc.title}\n${doc.content}`)
      .join('\n\n---\n\n')
    
    return trainingText
  } catch (error: any) {
    console.warn(`[ORCHESTRATOR] Failed to load training documents:`, error.message)
    return ''
  }
}

/**
 * Build system prompt from AI Rules + Training Documents
 */
async function buildSystemPrompt(
  agentProfileId?: number,
  language: 'en' | 'ar' = 'en'
): Promise<string> {
  // Load training documents
  const trainingContent = await loadTrainingDocuments(agentProfileId)
  
  // Get agent profile if specified
  let agentPrompt = ''
  if (agentProfileId) {
    const agent = await prisma.aIAgentProfile.findUnique({
      where: { id: agentProfileId },
      select: { systemPrompt: true, tone: true, maxMessageLength: true },
    })
    
    if (agent?.systemPrompt) {
      agentPrompt = agent.systemPrompt
    }
  }
  
  // Build base system prompt
  const basePrompt = agentPrompt || `You are a helpful assistant for Al Ain Business Center in UAE.
Your role is to qualify leads, answer questions, and guide customers through our services.
You must follow the rules and training documents exactly.`

  // Add training content
  const trainingSection = trainingContent
    ? `\n\n## TRAINING DOCUMENTS (FOLLOW THESE EXACTLY):\n${trainingContent}`
    : ''
  
  // Add rule engine constraints
  const rulesSection = `\n\n## CRITICAL RULES (MUST FOLLOW):
1. NEVER promise approvals, guarantees, or 100% success rates
2. NEVER ask "are you in UAE" or location questions for business setup
3. NEVER ask more than 1 question per message
4. NEVER ask more than 5 questions total for business setup
5. NEVER repeat a question already asked
6. Keep messages short (max 300 characters for WhatsApp)
7. Use friendly, professional tone
8. If user says "cheapest", offer: "Professional Mainland License + Investor Visa for AED 12,999"
9. If user says "marketing license", accept it and log as business activity (don't interrogate)
10. If confused or validation fails, use fallback: "Thanks! To help quickly, please share: (1) Name (2) Service needed (3) Nationality (4) Expiry date if renewal (5) Email for quotation."

${language === 'ar' ? 'CRITICAL: You MUST respond in Arabic (Modern Standard Arabic). All replies must be in Arabic.' : 'CRITICAL: You MUST respond in English. All replies must be in English.'}
If the user's message is in a different language, detect it and respond in that language. If language is unknown, default to ${language === 'ar' ? 'Arabic' : 'English'}.`

  return basePrompt + trainingSection + rulesSection
}

/**
 * Extract fields from reply text (deterministic)
 */
function extractFieldsFromReply(replyText: string, inboundText: string): OrchestratorOutput['extractedFields'] {
  const { extractService, extractNationality, extractIdentity } = require('../inbound/fieldExtractors')
  
  const combinedText = `${inboundText} ${replyText}`.toLowerCase()
  
  return {
    service: extractService(combinedText),
    nationality: extractNationality(combinedText),
    name: extractIdentity(combinedText).name,
  }
}

/**
 * Main orchestrator function - ONLY entry point for AI replies
 */
export async function generateAIReply(
  input: OrchestratorInput
): Promise<OrchestratorOutput> {
  // DIAGNOSTIC LOG: orchestrator entry
  console.log(`[ORCHESTRATOR] ENTRY`, JSON.stringify({
    conversationId: input.conversationId,
    leadId: input.leadId,
    contactId: input.contactId,
    channel: input.channel,
    inboundMessageId: input.inboundMessageId,
    inboundTextLength: input.inboundText.length,
  }))
  
  try {
    // Step 0: Load conversation state (with optimistic locking)
    const conversationState = await loadConversationState(input.conversationId)
    let expectedStateVersion = conversationState.stateVersion // Use actual state version for optimistic locking
    
    // DIAGNOSTIC LOG: state loaded
    console.log(`[ORCHESTRATOR] STATE-LOADED`, JSON.stringify({
      conversationId: input.conversationId,
      stateVersion: expectedStateVersion,
      qualificationStage: conversationState.qualificationStage,
      questionsAskedCount: conversationState.questionsAskedCount,
      lastQuestionKey: conversationState.lastQuestionKey,
      serviceKey: conversationState.serviceKey,
      knownFields: Object.keys(conversationState.knownFields),
    }))
    
    // Step 1: Load conversation and lead context
    const conversation = await prisma.conversation.findUnique({
      where: { id: input.conversationId },
      include: {
        lead: {
          include: {
            contact: true,
            serviceType: true,
            aiAgentProfile: true, // CRITICAL FIX 4: Load agent profile for language settings
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10, // Last 10 messages for context
        },
      },
    })
    
    if (!conversation) {
      throw new Error(`Conversation ${input.conversationId} not found`)
    }
    
    const lead = conversation.lead
    if (!lead) {
      throw new Error(`Lead not found for conversation ${input.conversationId}`)
    }
    
    // CRITICAL FIX A: Extract fields from inbound message BEFORE gating
    // This ensures we don't ask for information that was just provided
    const stateExtractedFields = extractFieldsToState(input.inboundText, conversationState)
    const updatedKnownFields = {
      ...conversationState.knownFields,
      ...stateExtractedFields,
    }
    
    // Detect service if not already known
    if (!updatedKnownFields.service) {
      const { extractService } = require('../inbound/fieldExtractors')
      const detectedService = extractService(input.inboundText)
      if (detectedService) {
        updatedKnownFields.service = detectedService
      }
    }
    
    // Detect "cheapest" keyword
    const lowerText = input.inboundText.toLowerCase()
    if (lowerText.includes('cheapest') || lowerText.includes('cheap')) {
      updatedKnownFields.priceSensitive = true
      updatedKnownFields.recommendedOffer = 'Professional Mainland License + Investor Visa for AED 12,999'
    }
    
    // Detect "marketing license"
    if (lowerText.includes('marketing license') || lowerText.includes('marketing')) {
      updatedKnownFields.businessActivity = 'Marketing License'
      updatedKnownFields.customServiceLabel = 'Marketing License'
    }
    
    // Write extracted fields to DB immediately (before gating)
    if (Object.keys(stateExtractedFields).length > 0 || updatedKnownFields.service !== conversationState.knownFields.service) {
      await updateConversationState(
        input.conversationId,
        {
          knownFields: updatedKnownFields,
        },
        expectedStateVersion
      )
      // Reload state to get updated version
      const reloadedState = await loadConversationState(input.conversationId)
      conversationState.knownFields = reloadedState.knownFields
      expectedStateVersion = reloadedState.stateVersion || expectedStateVersion
    }
    
    // Structured log: extracted fields
    console.log(`[ORCH] extracted fields`, JSON.stringify({
      conversationId: input.conversationId,
      extractedKeys: Object.keys(stateExtractedFields),
      extractedValues: Object.fromEntries(
        Object.entries(stateExtractedFields).map(([k, v]) => [k, typeof v === 'string' ? v.substring(0, 50) : v])
      ),
      updatedKnownFieldsKeys: Object.keys(updatedKnownFields),
    }))
    
    // Step 1.5: Check question budget (max 6 questions)
    if (conversationState.questionsAskedCount >= 6) {
      console.log(`[ORCHESTRATOR] Question budget reached (${conversationState.questionsAskedCount} questions) - triggering handoff`)
      
      // Check if handoff was already triggered
      const handoffTriggered = conversationState.knownFields.handoffTriggeredAt
      if (!handoffTriggered) {
        // Send handoff message (greeting will be added globally)
        const handoffMessage = `Perfect ✅ I have enough to proceed.
Please share your email for the quotation and the best time for our consultant to call you (today or tomorrow).`
        
        // Mark handoff as triggered
        await updateConversationState(
          input.conversationId,
          {
            knownFields: {
              ...conversationState.knownFields,
              handoffTriggeredAt: new Date().toISOString(),
            },
          },
          expectedStateVersion
        )
        
        return {
          replyText: handoffMessage,
          extractedFields: {},
          confidence: 100,
          nextStepKey: 'HANDOFF',
          tasksToCreate: [{
            type: 'FOLLOW_UP',
            title: 'Follow up with customer for email and call time',
            dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          }],
          shouldEscalate: false,
        }
      } else {
        // Handoff already triggered - don't send again
        return {
          replyText: '',
          extractedFields: {},
          confidence: 0,
          tasksToCreate: [],
          shouldEscalate: true,
          handoverReason: 'Question budget exceeded, waiting for customer response',
        }
      }
    }
    
    // Step 1.6: Check for qualification complete (name + service + nationality)
    // CRITICAL FIX B: Use state flag only, no substring matching
    const hasCoreQualification = 
      updatedKnownFields.name && 
      updatedKnownFields.service && 
      updatedKnownFields.nationality
    
    if (hasCoreQualification && !updatedKnownFields.qualificationConfirmedAt) {
      // CRITICAL FIX B: Use qualificationConfirmedAt flag only (no substring check)
      // If flag exists, confirmation already sent
      if (!updatedKnownFields.qualificationConfirmedAt) {
        const name = updatedKnownFields.name || lead.contact.fullName || 'there'
        const service = updatedKnownFields.service || lead.serviceType?.name || 'service'
        const nationality = updatedKnownFields.nationality || lead.contact.nationality || 'nationality'
        
        // Confirmation message (greeting will be added globally)
        const confirmationMessage = `Perfect, ${name}! ✅ I've noted:
• Service: ${service}
• Nationality: ${nationality}

Please share your email so I can send you the quotation,
and let me know the best time for our consultant to call you.`
        
        // Mark confirmation as sent using state flag
        const confirmedFields = {
          ...updatedKnownFields,
          qualificationConfirmedAt: new Date().toISOString(),
        }
        await updateConversationState(
          input.conversationId,
          {
            knownFields: confirmedFields,
          },
          expectedStateVersion
        )
        
        return {
          replyText: confirmationMessage,
          extractedFields: {
            name: updatedKnownFields.name,
            service: updatedKnownFields.service,
            nationality: updatedKnownFields.nationality,
          },
          confidence: 100,
          nextStepKey: 'QUALIFICATION_COMPLETE',
          tasksToCreate: [],
          shouldEscalate: false,
        }
      }
    }
    
    // Step 1.7: STAGE 1 QUALIFICATION GATE
    // CRITICAL FIX A: Use updatedKnownFields (after extraction) for gate check
    // Priority order: 1) service, 2) name, 3) nationality
    const hasCoreQualificationCheck = 
      updatedKnownFields.name && 
      updatedKnownFields.service && 
      updatedKnownFields.nationality
    
    // Structured log: gate decision
    const missingFields: string[] = []
    if (!updatedKnownFields.service) missingFields.push('service')
    if (!updatedKnownFields.name) missingFields.push('name')
    if (!updatedKnownFields.nationality) missingFields.push('nationality')
    
    console.log(`[ORCH] gate decision`, JSON.stringify({
      conversationId: input.conversationId,
      missing: missingFields,
      asked: conversationState.lastQuestionKey,
      questionsAskedCount: conversationState.questionsAskedCount,
      hasCoreQualification: hasCoreQualificationCheck,
    }))
    
    // If Stage 1 not complete, enforce strict gate with NEW priority order
    if (!hasCoreQualificationCheck) {
      // Determine which core field to ask for (NEW priority order: service first)
      let nextCoreQuestion: { questionKey: string; question: string } | null = null
      
      // 1) SERVICE FIRST (unless user already stated service in first message)
      if (!updatedKnownFields.service) {
        // First question: "How can I help you today?" (no service list, no examples)
        nextCoreQuestion = {
          questionKey: 'ASK_SERVICE',
          question: 'How can I help you today?',
        }
      } 
      // 2) NAME SECOND (only after service is known)
      else if (!updatedKnownFields.name) {
        nextCoreQuestion = {
          questionKey: 'ASK_NAME',
          question: 'May I know your full name, please?',
        }
      } 
      // 3) NATIONALITY THIRD (only after service and name are known)
      else if (!updatedKnownFields.nationality) {
        nextCoreQuestion = {
          questionKey: 'ASK_NATIONALITY',
          question: 'What is your nationality?',
        }
      }
      
      // If we have a core question to ask, check no-repeat guard
      if (nextCoreQuestion) {
        // Check if this question was asked recently
        const wasAsked = wasQuestionAsked(conversationState, nextCoreQuestion.questionKey)
        
        if (!wasAsked && !BANNED_QUESTION_KEYS.has(nextCoreQuestion.questionKey)) {
          // Record question asked
          const { recordQuestionAsked } = await import('../conversation/flowState')
          await recordQuestionAsked(input.conversationId, nextCoreQuestion.questionKey, `WAIT_${nextCoreQuestion.questionKey}`)
          
          // Increment question count
          const newQuestionsCount = conversationState.questionsAskedCount + 1
          await updateConversationState(
            input.conversationId,
            {
              questionsAskedCount: newQuestionsCount,
              lastQuestionKey: nextCoreQuestion.questionKey,
              knownFields: updatedKnownFields, // Use updated fields
            },
            expectedStateVersion
          )
          
          return {
            replyText: nextCoreQuestion.question,
            extractedFields: {},
            confidence: 100,
            nextStepKey: nextCoreQuestion.questionKey,
            tasksToCreate: [],
            shouldEscalate: false,
          }
        }
      }
    }
    
    // Step 2: Check if this is first message (CRITICAL: First message bypasses retriever)
    // Note: Field extraction already done above (Step 1.4)
    const outboundCount = conversation.messages.filter(m => m.direction === 'OUTBOUND').length
    const isFirstMessage = outboundCount === 0
    
    // CRITICAL FIX: First message ALWAYS gets a reply - bypass retriever/training checks
    // This ensures first inbound message never gets blocked by training document checks
    if (isFirstMessage) {
      console.log(`[ORCHESTRATOR] First message detected - bypassing retriever/training checks`)
    }
    
    // Step 3: Try rule engine first (deterministic, no LLM)
    try {
      // Load conversation memory
      const { loadConversationMemory } = await import('./ruleEngine')
      const memory = await loadConversationMemory(input.conversationId)
      
      const ruleEngineResult = await executeRuleEngine({
        conversationId: input.conversationId,
        leadId: lead.id,
        contactId: lead.contact.id,
        currentMessage: input.inboundText,
        conversationHistory: conversation.messages.map(m => ({
          direction: m.direction,
          body: m.body || '',
          createdAt: m.createdAt,
        })),
        isFirstMessage,
        memory,
      })
      
      // CRITICAL FIX C: Handle structured rule engine output
      if (ruleEngineResult.kind === 'QUESTION') {
        console.log(`[ORCHESTRATOR] Rule engine generated QUESTION: ${ruleEngineResult.questionKey}`)
        
        // Step 3.1: HARD BAN - Check if questionKey is banned (NOT substring matching)
        if (BANNED_QUESTION_KEYS.has(ruleEngineResult.questionKey)) {
          console.error(`[ORCHESTRATOR] BANNED QUESTION KEY: ${ruleEngineResult.questionKey} - blocking`)
          // Fall through to LLM or next allowed question
        } else {
          // Step 3.2: Check no-repeat guard (prevent asking same questionKey in last 3 outbound)
          const wasAsked = wasQuestionAsked(conversationState, ruleEngineResult.questionKey)
          if (wasAsked) {
            console.log(`[ORCHESTRATOR] Question ${ruleEngineResult.questionKey} was asked recently - skipping`)
            // Fall through to LLM
          } else {
            // Record question asked
            const { recordQuestionAsked } = await import('../conversation/flowState')
            await recordQuestionAsked(input.conversationId, ruleEngineResult.questionKey, `WAIT_${ruleEngineResult.questionKey}`)
            
            // Increment question count
            const newQuestionsCount = conversationState.questionsAskedCount + 1
            await updateConversationState(
              input.conversationId,
              {
                questionsAskedCount: newQuestionsCount,
                lastQuestionKey: ruleEngineResult.questionKey,
                knownFields: updatedKnownFields,
              },
              expectedStateVersion
            )
            
            // Validate with strictQualification
            const validation = await validateQualificationRules(
              input.conversationId,
              ruleEngineResult.text
            )
            
            if (validation.isValid && validation.sanitizedReply) {
              return {
                replyText: validation.sanitizedReply,
                extractedFields: extractFieldsFromReply(ruleEngineResult.text, input.inboundText),
                confidence: 90, // High confidence for rule engine
                nextStepKey: ruleEngineResult.questionKey,
                tasksToCreate: [],
                shouldEscalate: false,
              }
            }
          }
        }
      } else if (ruleEngineResult.kind === 'REPLY' && !ruleEngineResult.needsHuman) {
        console.log(`[ORCHESTRATOR] Rule engine generated REPLY (deterministic)`)
        
        // CRITICAL FIX C: For REPLY kind, banned question keys don't apply (only for QUESTION kind)
        // Validate with strictQualification
        const validation = await validateQualificationRules(
          input.conversationId,
          ruleEngineResult.text
        )
        
        if (validation.isValid && validation.sanitizedReply) {
          // Update known fields
          await updateConversationState(
            input.conversationId,
            {
              knownFields: updatedKnownFields,
            },
            expectedStateVersion
          )
          
          return {
            replyText: validation.sanitizedReply,
            extractedFields: extractFieldsFromReply(ruleEngineResult.text, input.inboundText),
            confidence: 90, // High confidence for rule engine
            nextStepKey: undefined,
            tasksToCreate: [],
            shouldEscalate: false,
          }
        }
      } else if (ruleEngineResult.kind === 'REPLY' && ruleEngineResult.needsHuman) {
        console.log(`[ORCHESTRATOR] Rule engine escalated to human: ${ruleEngineResult.handoverReason}`)
        // Fall through to LLM or return escalation
      } else if (ruleEngineResult.kind === 'NO_MATCH') {
        console.log(`[ORCHESTRATOR] Rule engine no match - falling back to LLM`)
        // Fall through to LLM
      }
    } catch (ruleEngineError: any) {
      console.warn(`[ORCHESTRATOR] Rule engine failed, falling back to LLM:`, ruleEngineError.message)
    }
    
    // CRITICAL FIX 4: Determine reply language from conversation or agent profile
    let replyLanguage: 'en' | 'ar' = input.language || 'en'
    if (!replyLanguage && conversation.language) {
      // Use detected conversation language
      replyLanguage = (conversation.language === 'ar' ? 'ar' : 'en')
    } else if (!replyLanguage && lead.aiAgentProfile?.defaultLanguage) {
      // Fall back to agent profile default language
      replyLanguage = (lead.aiAgentProfile.defaultLanguage === 'ar' ? 'ar' : 'en')
    } else if (!replyLanguage && lead.aiAgentProfile?.autoDetectLanguage) {
      // If auto-detect enabled but no language detected, try to detect from inbound text
      try {
        const { detectLanguage } = await import('./detectLanguage')
        const detected = await detectLanguage(input.inboundText)
        replyLanguage = (detected === 'ar' ? 'ar' : 'en')
        console.log(`🌐 [ORCHESTRATOR] Auto-detected language: ${detected} -> ${replyLanguage}`)
      } catch (error: any) {
        console.warn(`⚠️ [ORCHESTRATOR] Language detection failed:`, error.message)
      }
    }
    
    // Step 4: Build system prompt from rules + training
    // NOTE: For first messages, we still build the prompt but don't block if training is missing
    const systemPrompt = await buildSystemPrompt(
      input.agentProfileId || lead.aiAgentProfileId || undefined,
      replyLanguage // CRITICAL FIX 4: Use determined language
    )
    
    // Step 4: Build conversation context
    const recentMessages = conversation.messages
      .slice()
      .reverse()
      .map(m => `${m.direction === 'INBOUND' ? 'User' : 'Assistant'}: ${m.body || ''}`)
      .join('\n')
    
    const userPrompt = `Conversation context:
${recentMessages}

Current user message: ${input.inboundText}

Lead information:
- Service: ${lead.serviceType?.name || lead.serviceTypeEnum || updatedKnownFields.service || 'Not specified'}
- Contact: ${updatedKnownFields.name || lead.contact.fullName || 'Unknown'}
- Nationality: ${updatedKnownFields.nationality || lead.contact.nationality || 'Not specified'}

Generate a short, helpful reply that:
1. Answers the user's question or asks ONE clarifying question
2. Follows all rules from training documents
3. Does NOT promise approvals or guarantees
4. Does NOT ask location questions for business setup
5. Keeps it under 300 characters

Reply:`
    
    // Step 5: Call LLM
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ]
    
    const llmResult = await generateCompletion(messages, {
      temperature: 0.7,
      maxTokens: 300,
    })
    
    let replyText = llmResult.text.trim()
    
    // Step 6: Validate with strictQualification
    const validation = await validateQualificationRules(
      input.conversationId,
      replyText
    )
    
    if (!validation.isValid) {
      console.warn(`[ORCHESTRATOR] LLM output failed validation: ${validation.error}`)
      
      if (validation.sanitizedReply) {
        replyText = validation.sanitizedReply
      } else {
        // Use fallback
        replyText = `Thanks! To help quickly, please share: (1) Name (2) Service needed (3) Nationality (4) Expiry date if renewal (5) Email for quotation.`
      }
    }
    
    // Step 7: Extract fields
    const extractedFields = extractFieldsFromReply(replyText, input.inboundText)
    
    // Step 8: Check for duplicate outbound (deduplication guard)
    const normalizedReply = replyText.trim().toLowerCase().replace(/\s+/g, ' ')
    const replyHash = createHash('sha256')
      .update(`${input.conversationId}:${normalizedReply}`)
      .digest('hex')
    
    // Check if same reply was sent in last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
    const recentDuplicate = await prisma.message.findFirst({
      where: {
        conversationId: input.conversationId,
        direction: 'OUTBOUND',
        createdAt: { gte: tenMinutesAgo },
        body: {
          equals: replyText,
          mode: 'insensitive',
        },
      },
    })
    
    if (recentDuplicate) {
      console.warn(`[ORCHESTRATOR] Duplicate outbound detected - skipping send`)
      return {
        replyText: '', // Empty reply = don't send
        extractedFields,
        confidence: 0,
        nextStepKey: undefined,
        tasksToCreate: [],
        shouldEscalate: false,
        handoverReason: 'Duplicate outbound message detected',
      }
    }
    
    // Step 9: Update conversation state (update known fields, but don't increment question count for LLM replies)
    // LLM replies are less deterministic, so we only update known fields
    await updateConversationState(
      input.conversationId,
      {
        knownFields: updatedKnownFields,
      },
      expectedStateVersion
    )
    
    // Step 10: Determine confidence and tasks
    const confidence = validation.isValid ? 75 : 50 // Lower confidence if validation failed
    const tasksToCreate: OrchestratorOutput['tasksToCreate'] = []
    
    // Create task if validation failed
    if (!validation.isValid && validation.error) {
      tasksToCreate.push({
        type: 'QUALIFICATION',
        title: `AI reply validation failed: ${validation.error}`,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      })
    }
    
    // CRITICAL FIX 2: Sanitize reply text to prevent JSON from being sent
    const { sanitizeReplyText } = await import('./sanitizeReplyText')
    const sanitized = sanitizeReplyText(replyText)
    if (sanitized.wasJson) {
      console.warn(`[ORCHESTRATOR] Sanitized JSON reply: ${replyText.substring(0, 100)} -> ${sanitized.text.substring(0, 100)}`)
    }
    
    return {
      replyText: sanitized.text,
      extractedFields,
      confidence,
      nextStepKey: undefined,
      tasksToCreate,
      shouldEscalate: false,
      handoverReason: validation.isValid ? undefined : validation.error,
    }
  } catch (error: any) {
    console.error(`[ORCHESTRATOR] Error generating reply:`, error)
    
    // Fallback deterministic message
    return {
      replyText: `Thanks! To help quickly, please share: (1) Name (2) Service needed (3) Nationality (4) Expiry date if renewal (5) Email for quotation.`,
      extractedFields: {},
      confidence: 0,
      tasksToCreate: [{
        type: 'QUALIFICATION',
        title: `AI orchestrator error: ${error.message}`,
        dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }],
      shouldEscalate: true,
      handoverReason: error.message,
    }
  }
}

