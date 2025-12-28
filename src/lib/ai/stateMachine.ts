/**
 * STRICT CONVERSATION STATE MACHINE
 * 
 * Enforces max 5 questions for business setup and prevents repeated questions.
 * This is the SINGLE SOURCE OF TRUTH for conversation state management.
 */

import { prisma } from '../prisma'

export type QualificationStage = 
  | 'GREETING'
  | 'COLLECTING_NAME'
  | 'COLLECTING_SERVICE'
  | 'COLLECTING_DETAILS'
  | 'READY_FOR_QUOTE'

export interface KnownFields {
  name?: string
  service?: string
  nationality?: string
  expiryDate?: string
  businessActivity?: string
  partnersCount?: number
  visasCount?: number
  mainlandOrFreezone?: string
  [key: string]: any
}

export interface ConversationState {
  qualificationStage: QualificationStage
  questionsAskedCount: number
  knownFields: KnownFields
  lastQuestionKey?: string
  serviceKey?: string // 'business_setup', 'freelance_visa', etc.
  stateVersion?: number // For optimistic locking
}

/**
 * Load conversation state from DB
 */
export async function loadConversationState(conversationId: number): Promise<ConversationState> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      qualificationStage: true,
      questionsAskedCount: true,
      knownFields: true,
      lastQuestionKey: true,
      flowKey: true, // serviceKey
      stateVersion: true,
    },
  })
  
  if (!conversation) {
    // DIAGNOSTIC LOG: state not found
    console.log(`[STATE-MACHINE] LOAD-NOT-FOUND`, JSON.stringify({
      conversationId,
      action: 'returned_default_state',
    }))
    return {
      qualificationStage: 'GREETING',
      questionsAskedCount: 0,
      knownFields: {},
      stateVersion: 0,
    }
  }
  
  let knownFields: KnownFields = {}
  try {
    if (conversation.knownFields) {
      knownFields = JSON.parse(conversation.knownFields)
    }
  } catch {
    knownFields = {}
  }
  
  const state: ConversationState = {
    qualificationStage: (conversation.qualificationStage as QualificationStage) || 'GREETING',
    questionsAskedCount: conversation.questionsAskedCount || 0,
    knownFields,
    lastQuestionKey: conversation.lastQuestionKey || undefined,
    serviceKey: conversation.flowKey || undefined,
    stateVersion: conversation.stateVersion || 0,
  }
  
  // DIAGNOSTIC LOG: state loaded
  console.log(`[STATE-MACHINE] LOADED`, JSON.stringify({
    conversationId,
    stateVersion: conversation.stateVersion || 0,
    qualificationStage: state.qualificationStage,
    questionsAskedCount: state.questionsAskedCount,
    lastQuestionKey: state.lastQuestionKey,
    serviceKey: state.serviceKey,
    knownFieldsKeys: Object.keys(state.knownFields),
  }))
  
  return state
}

/**
 * Update conversation state in DB (with optimistic locking)
 */
export async function updateConversationState(
  conversationId: number,
  updates: Partial<ConversationState>,
  expectedStateVersion?: number
): Promise<void> {
  const current = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { stateVersion: true, lastQuestionKey: true, questionsAskedCount: true },
  })
  
  if (!current) {
    throw new Error(`Conversation ${conversationId} not found`)
  }
  
  // DIAGNOSTIC LOG: state update attempt
  console.log(`[STATE-MACHINE] UPDATE-ATTEMPT`, JSON.stringify({
    conversationId,
    stateVersionBefore: current.stateVersion,
    expectedStateVersion,
    lastQuestionKeyBefore: current.lastQuestionKey,
    questionsAskedCountBefore: current.questionsAskedCount,
    updates: {
      qualificationStage: updates.qualificationStage,
      questionsAskedCount: updates.questionsAskedCount,
      lastQuestionKey: updates.lastQuestionKey,
      serviceKey: updates.serviceKey,
      knownFieldsKeys: updates.knownFields ? Object.keys(updates.knownFields) : undefined,
    },
  }))
  
  // Optimistic locking check
  if (expectedStateVersion !== undefined && current.stateVersion !== expectedStateVersion) {
    console.error(`[STATE-MACHINE] VERSION-MISMATCH`, JSON.stringify({
      conversationId,
      expectedStateVersion,
      actualStateVersion: current.stateVersion,
    }))
    throw new Error(`State version mismatch: expected ${expectedStateVersion}, got ${current.stateVersion}`)
  }
  
  // Build update data
  const updateData: any = {
    stateVersion: { increment: 1 },
  }
  
  if (updates.qualificationStage) {
    updateData.qualificationStage = updates.qualificationStage
  }
  
  if (updates.questionsAskedCount !== undefined) {
    updateData.questionsAskedCount = updates.questionsAskedCount
  }
  
  if (updates.knownFields) {
    updateData.knownFields = JSON.stringify(updates.knownFields)
  }
  
  if (updates.lastQuestionKey !== undefined) {
    updateData.lastQuestionKey = updates.lastQuestionKey
  }
  
  if (updates.serviceKey) {
    updateData.flowKey = updates.serviceKey
  }
  
  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: updateData,
    select: { stateVersion: true, lastQuestionKey: true, questionsAskedCount: true },
  })
  
  // DIAGNOSTIC LOG: state updated
  console.log(`[STATE-MACHINE] UPDATED`, JSON.stringify({
    conversationId,
    stateVersionAfter: updated.stateVersion,
    lastQuestionKeyAfter: updated.lastQuestionKey,
    questionsAskedCountAfter: updated.questionsAskedCount,
  }))
}

/**
 * Check if question was already asked
 */
export function wasQuestionAsked(
  state: ConversationState,
  questionKey: string
): boolean {
  return state.lastQuestionKey === questionKey
}

/**
 * Get next question for business setup (max 5 questions)
 * 
 * Questions in order:
 * 1. Name
 * 2. Business activity
 * 3. Mainland or Freezone
 * 4. How many partners?
 * 5. How many visas?
 */
export function getNextBusinessSetupQuestion(
  state: ConversationState
): { questionKey: string; question: string } | null {
  const { knownFields, questionsAskedCount } = state
  
  // Max 5 questions
  if (questionsAskedCount >= 5) {
    return null // Stop asking, ready for quote
  }
  
  // Question 1: Name
  if (!knownFields.name) {
    return {
      questionKey: 'ask_name',
      question: 'What is your name?',
    }
  }
  
  // Question 2: Business activity
  if (!knownFields.businessActivity) {
    return {
      questionKey: 'ask_business_activity',
      question: 'What type of business activity will you be doing?',
    }
  }
  
  // Question 3: Mainland or Freezone
  if (!knownFields.mainlandOrFreezone) {
    return {
      questionKey: 'ask_mainland_freezone',
      question: 'Do you prefer Mainland or Freezone?',
    }
  }
  
  // Question 4: Partners count
  if (knownFields.partnersCount === undefined) {
    return {
      questionKey: 'ask_partners',
      question: 'How many partners will be involved?',
    }
  }
  
  // Question 5: Visas count
  if (knownFields.visasCount === undefined) {
    return {
      questionKey: 'ask_visas',
      question: 'How many visas do you need?',
    }
  }
  
  // All questions asked
  return null
}

/**
 * Extract fields from message and update state
 */
export function extractFieldsToState(
  messageText: string,
  currentState: ConversationState
): Partial<KnownFields> {
  const lower = messageText.toLowerCase()
  const updates: Partial<KnownFields> = {}
  
  // Extract name (simple pattern)
  if (!currentState.knownFields.name) {
    const nameMatch = messageText.match(/(?:my name is|i am|i'm|call me|this is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i)
    if (nameMatch) {
      updates.name = nameMatch[1].trim()
    }
  }
  
  // Extract business activity
  if (!currentState.knownFields.businessActivity) {
    if (lower.includes('marketing license') || lower.includes('marketing')) {
      updates.businessActivity = 'Marketing License'
    } else if (lower.includes('accounting') || lower.includes('accountant')) {
      updates.businessActivity = 'Accounting'
    } else if (lower.includes('trading') || lower.includes('trade')) {
      updates.businessActivity = 'Trading'
    } else if (lower.includes('consulting') || lower.includes('consultant')) {
      updates.businessActivity = 'Consulting'
    }
  }
  
  // Extract mainland/freezone
  if (!currentState.knownFields.mainlandOrFreezone) {
    if (lower.includes('mainland')) {
      updates.mainlandOrFreezone = 'mainland'
    } else if (lower.includes('freezone') || lower.includes('free zone')) {
      updates.mainlandOrFreezone = 'freezone'
    }
  }
  
  // Extract partners count
  if (currentState.knownFields.partnersCount === undefined) {
    const partnersMatch = lower.match(/(\d+)\s*(?:partner|shareholder|owner)/i)
    if (partnersMatch) {
      updates.partnersCount = parseInt(partnersMatch[1])
    }
  }
  
  // Extract visas count
  if (currentState.knownFields.visasCount === undefined) {
    const visasMatch = lower.match(/(\d+)\s*(?:visa|employee|staff)/i)
    if (visasMatch) {
      updates.visasCount = parseInt(visasMatch[1])
    }
  }
  
  return updates
}

/**
 * Determine if we should stop asking questions
 */
export function shouldStopAsking(state: ConversationState): boolean {
  // Business setup: max 5 questions
  if (state.serviceKey === 'business_setup' || state.serviceKey === 'MAINLAND_BUSINESS_SETUP') {
    return state.questionsAskedCount >= 5
  }
  
  // Other services: max 5 questions as well
  return state.questionsAskedCount >= 5
}

