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

${language === 'ar' ? 'Respond in Arabic when appropriate.' : 'Respond in English.'}`

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
    const expectedStateVersion = conversationState.stateVersion // Use actual state version for optimistic locking
    
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
    
    // Step 1.5: Extract fields from inbound message and update state
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
    
    // Step 2: Check if this is first message (CRITICAL: First message bypasses retriever)
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
      
      if (ruleEngineResult.reply && !ruleEngineResult.needsHuman) {
        console.log(`[ORCHESTRATOR] Rule engine generated reply (deterministic)`)
        
        // Validate with strictQualification
        const validation = await validateQualificationRules(
          input.conversationId,
          ruleEngineResult.reply
        )
        
        if (validation.isValid && validation.sanitizedReply) {
          // Reload state to check if lastQuestionKey was updated by flow state system
          const stateAfterRuleEngine = await loadConversationState(input.conversationId)
          const lastQuestionKeyChanged = stateAfterRuleEngine.lastQuestionKey !== conversationState.lastQuestionKey
          const hasQuestionKey = stateAfterRuleEngine.lastQuestionKey && 
            (stateAfterRuleEngine.lastQuestionKey.startsWith('BS_Q') || 
             stateAfterRuleEngine.lastQuestionKey.startsWith('ASK_') ||
             stateAfterRuleEngine.lastQuestionKey.startsWith('Q'))
          
          // If lastQuestionKey changed and indicates a question was asked, increment count
          if (lastQuestionKeyChanged && hasQuestionKey && stateAfterRuleEngine.lastQuestionKey) {
            const newQuestionsCount = conversationState.questionsAskedCount + 1
            await updateConversationState(
              input.conversationId,
              {
                questionsAskedCount: newQuestionsCount,
                knownFields: updatedKnownFields,
              },
              stateAfterRuleEngine.stateVersion
            )
          } else {
            // No question asked - just update known fields
            await updateConversationState(
              input.conversationId,
              {
                knownFields: updatedKnownFields,
              },
              stateAfterRuleEngine.stateVersion
            )
          }
          
          return {
            replyText: validation.sanitizedReply,
            extractedFields: extractFieldsFromReply(ruleEngineResult.reply, input.inboundText),
            confidence: 90, // High confidence for rule engine
            nextStepKey: stateAfterRuleEngine.lastQuestionKey,
            tasksToCreate: [],
            shouldEscalate: false,
          }
        }
      }
    } catch (ruleEngineError: any) {
      console.warn(`[ORCHESTRATOR] Rule engine failed, falling back to LLM:`, ruleEngineError.message)
    }
    
    // Step 4: Build system prompt from rules + training
    // NOTE: For first messages, we still build the prompt but don't block if training is missing
    const systemPrompt = await buildSystemPrompt(
      input.agentProfileId || lead.aiAgentProfileId || undefined,
      input.language
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
- Service: ${lead.serviceType?.name || lead.serviceTypeEnum || 'Not specified'}
- Contact: ${lead.contact.fullName || 'Unknown'}
- Nationality: ${lead.contact.nationality || 'Not specified'}

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
    
    return {
      replyText,
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

