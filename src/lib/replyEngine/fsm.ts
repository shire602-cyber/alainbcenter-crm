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

  if (!conversation?.ruleEngineMemory) {
    return { ...DEFAULT_STATE }
  }

  try {
    const parsed = JSON.parse(conversation.ruleEngineMemory)
    return {
      ...DEFAULT_STATE,
      ...parsed,
    }
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
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        aiStateJson: JSON.stringify(state),
      },
    })
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

