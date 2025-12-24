/**
 * LLM Abstraction Layer - Public API
 * 
 * This is the main entry point for the rest of the application.
 * The app doesn't need to know which LLM is being used.
 */

import { getRoutingService } from './routing'
import type { LLMMessage, LLMCompletionOptions, LLMCompletionResult } from './types'

/**
 * Generate completion using intelligent routing
 * 
 * This is the main function the rest of the app should use.
 * It automatically routes to Llama 3 (cheap) or OpenAI (premium) based on complexity.
 */
export async function generateCompletion(
  messages: LLMMessage[],
  options: LLMCompletionOptions = {},
  context?: {
    leadStage?: string
    conversationLength?: number
    hasMultipleQuestions?: boolean
    requiresReasoning?: boolean
  }
): Promise<LLMCompletionResult> {
  const routingService = getRoutingService()
  const { result } = await routingService.route(messages, options, context)
  return result
}

/**
 * Generate completion with routing decision info
 * 
 * Useful for debugging or when you need to know which LLM was used
 */
export async function generateCompletionWithDecision(
  messages: LLMMessage[],
  options: LLMCompletionOptions = {},
  context?: {
    leadStage?: string
    conversationLength?: number
    hasMultipleQuestions?: boolean
    requiresReasoning?: boolean
  }
): Promise<{
  result: LLMCompletionResult
  decision: {
    provider: string
    reason: string
    complexity: 'low' | 'medium' | 'high'
    escalated: boolean
  }
}> {
  const routingService = getRoutingService()
  const { result, decision, escalated } = await routingService.route(messages, options, context)
  
  return {
    result,
    decision: {
      provider: decision.provider.name,
      reason: decision.reason,
      complexity: decision.complexity,
      escalated,
    },
  }
}

// Re-export types for convenience
export type { LLMMessage, LLMCompletionOptions, LLMCompletionResult } from './types'

