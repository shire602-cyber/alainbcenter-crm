/**
 * CONVERSATION STATE MACHINE (FSM)
 * Manages deterministic conversation state
 */

import { prisma } from '../prisma'
import type { FSMState, FSMStage, ServiceKey } from './types'

const DEFAULT_STATE: FSMState = {
  serviceKey: null,
  stage: 'NEW',
  collected: {},
  required: [],
  nextQuestionKey: null,
  askedQuestionKeys: [],
  followUpStep: 0,
  lastInboundMessageId: null,
  lastOutboundReplyKey: null,
  stop: {
    enabled: false,
  },
}

/**
 * Load FSM state from conversation
 */
export async function loadFSMState(conversationId: number): Promise<FSMState> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { ruleEngineMemory: true },
  })

  console.log(`[FSM] Loading state for conversation ${conversationId}`, {
    hasConversation: !!conversation,
    hasRuleEngineMemory: !!conversation?.ruleEngineMemory,
    ruleEngineMemoryLength: conversation?.ruleEngineMemory?.length || 0,
  })

  if (!conversation?.ruleEngineMemory) {
    console.log(`[FSM] No ruleEngineMemory found, returning default state`)
    return { ...DEFAULT_STATE }
  }

  try {
    const parsed = JSON.parse(conversation.ruleEngineMemory)
    const state = {
      ...DEFAULT_STATE,
      ...parsed,
    }
    console.log(`[FSM] State loaded successfully`, {
      serviceKey: state.serviceKey,
      greetingSent: state.collected?.greetingSent,
      collectedKeys: state.collected ? Object.keys(state.collected) : [],
    })
    return state
  } catch (error) {
    console.error(`[FSM] Failed to parse state for conversation ${conversationId}:`, error)
    return { ...DEFAULT_STATE }
  }
}

/**
 * Save FSM state to conversation
 */
export async function saveFSMState(
  conversationId: number,
  state: FSMState
): Promise<void> {
  try {
    const stateJson = JSON.stringify(state)
    console.log(`[FSM] Saving state for conversation ${conversationId}`, {
      greetingSent: state.collected?.greetingSent,
      collectedKeys: state.collected ? Object.keys(state.collected) : [],
      stateJsonLength: stateJson.length,
    })
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ruleEngineMemory: stateJson,
      },
    })
    console.log(`[FSM] State saved successfully for conversation ${conversationId}`)
  } catch (error) {
    console.error(`[FSM] Failed to save state for conversation ${conversationId}:`, error)
    throw error
  }
}

/**
 * Update FSM state (merge with existing)
 */
export async function updateFSMState(
  conversationId: number,
  updates: Partial<FSMState>
): Promise<FSMState> {
  const current = await loadFSMState(conversationId)
  const updated = {
    ...current,
    ...updates,
    // Merge collected data
    collected: {
      ...current.collected,
      ...(updates.collected || {}),
    },
    // Merge asked question keys (dedupe)
    askedQuestionKeys: [
      ...new Set([
        ...current.askedQuestionKeys,
        ...(updates.askedQuestionKeys || []),
      ]),
    ],
  }
  await saveFSMState(conversationId, updated)
  return updated
}

/**
 * Reset FSM state (for testing or manual reset)
 */
export async function resetFSMState(conversationId: number): Promise<void> {
  await saveFSMState(conversationId, { ...DEFAULT_STATE })
}

/**
 * Check if question was already asked
 */
export function wasQuestionAsked(state: FSMState, questionKey: string): boolean {
  return state.askedQuestionKeys.includes(questionKey)
}

/**
 * Check if we should stop (stop.enabled)
 */
export function shouldStop(state: FSMState): boolean {
  return state.stop.enabled
}

