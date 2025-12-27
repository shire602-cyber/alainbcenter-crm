/**
 * LLM Provider Abstraction Layer
 * 
 * Defines interfaces for LLM providers to ensure the rest of the app
 * doesn't need to know which LLM is being used.
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMCompletionOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  // STEP 6: JSON mode support
  responseFormat?: { type: 'json_object' } | { type: 'text' }
}

export interface LLMCompletionResult {
  text: string
  confidence?: number // 0-100, optional confidence score
  tokensUsed?: {
    prompt: number
    completion: number
    total: number
  }
  model?: string
  finishReason?: string
}

export interface LLMProvider {
  /**
   * Provider identifier
   */
  readonly name: string

  /**
   * Model identifier
   */
  readonly model: string

  /**
   * Cost per 1K tokens (input)
   */
  readonly costPer1KInput: number

  /**
   * Cost per 1K tokens (output)
   */
  readonly costPer1KOutput: number

  /**
   * Generate completion
   */
  complete(
    messages: LLMMessage[],
    options?: LLMCompletionOptions
  ): Promise<LLMCompletionResult>

  /**
   * Check if provider is available/configured
   */
  isAvailable(): Promise<boolean>
}

export interface LLMRoutingDecision {
  provider: LLMProvider
  reason: string
  complexity: 'low' | 'medium' | 'high'
  estimatedCost?: number
}

export interface LLMUsageLog {
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  reason: string
  complexity: 'low' | 'medium' | 'high'
  success: boolean
  error?: string
  timestamp: Date
}

