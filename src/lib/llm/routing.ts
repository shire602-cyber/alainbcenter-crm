/**
 * LLM Routing Service
 * 
 * Routes requests to appropriate LLM based on complexity analysis
 * Implements smart fallback: DeepSeek (Primary) → OpenAI → Claude → Groq → Error
 * Uses DeepSeek as primary for all tasks, OpenAI as fallback
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult, LLMRoutingDecision } from './types'
import { DeepSeekProvider } from './providers/deepseek'
import { OpenAIProvider } from './providers/openai'
import { Llama3Provider } from './providers/llama3'
import { AnthropicProvider } from './providers/anthropic'
import { analyzeComplexity, requiresPremiumLLM, type ComplexityLevel } from './complexity'
import { logUsage } from './usageLogger'

export class RoutingService {
  private deepseek: DeepSeekProvider
  private openai: OpenAIProvider
  private llama3: Llama3Provider
  private anthropic: AnthropicProvider

  constructor() {
    this.deepseek = new DeepSeekProvider()
    this.openai = new OpenAIProvider()
    this.llama3 = new Llama3Provider()
    this.anthropic = new AnthropicProvider()
  }

  /**
   * Get available providers in priority order
   * Priority: DeepSeek (Primary) → OpenAI (Fallback) → Anthropic → Groq
   */
  private async getAvailableProviders(): Promise<LLMProvider[]> {
    const providers: LLMProvider[] = []
    
    // Check DeepSeek first (Primary)
    if (await this.deepseek.isAvailable()) {
      providers.push(this.deepseek)
    }
    
    // Check OpenAI (Primary Fallback)
    if (await this.openai.isAvailable()) {
      providers.push(this.openai)
    }
    
    // Check Anthropic (Secondary Fallback)
    if (await this.anthropic.isAvailable()) {
      providers.push(this.anthropic)
    }
    
    // Check Groq (Tertiary Fallback)
    if (await this.llama3.isAvailable()) {
      providers.push(this.llama3)
    }
    
    return providers
  }

  /**
   * Detect task type from messages
   */
  private detectTaskType(messages: LLMMessage[]): 'greeting' | 'followup' | 'reminder' | 'complex' | 'other' {
    const fullText = messages.map(m => m.content).join(' ').toLowerCase()
    
    if (fullText.includes('welcome') || fullText.includes('greet') || fullText.includes('hello') || fullText.includes('first message')) {
      return 'greeting'
    }
    if (fullText.includes('follow') || fullText.includes('check in') || fullText.includes('update')) {
      return 'followup'
    }
    if (fullText.includes('remind') || fullText.includes('expir') || fullText.includes('due')) {
      return 'reminder'
    }
    if (fullText.includes('analyze') || fullText.includes('complex') || fullText.includes('legal') || fullText.includes('compliance')) {
      return 'complex'
    }
    return 'other'
  }

  /**
   * Route request to appropriate LLM with smart fallback
   */
  async route(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {},
    context?: {
      leadStage?: string
      conversationLength?: number
      hasMultipleQuestions?: boolean
      requiresReasoning?: boolean
      taskType?: 'greeting' | 'followup' | 'reminder' | 'complex' | 'other' // NEW: task type hint
    }
  ): Promise<{
    result: LLMCompletionResult
    decision: LLMRoutingDecision
    escalated: boolean
  }> {
    // Get available providers
    const availableProviders = await this.getAvailableProviders()
    
    if (availableProviders.length === 0) {
      throw new Error('No LLM providers available. Configure at least one: DeepSeek, OpenAI, Anthropic, or Groq.')
    }

    // Analyze complexity
    const analysis = analyzeComplexity(messages, context)
    const needsPremium = requiresPremiumLLM(analysis)
    
    // Determine task type from context or message content
    const taskType = context?.taskType || this.detectTaskType(messages)
    const isSimpleTask = taskType === 'greeting' || taskType === 'followup' || taskType === 'reminder'

    // Routing strategy:
    // - Primary: DeepSeek (for all tasks - cost-effective and high quality)
    // - Fallback: OpenAI → Anthropic → Groq
    // - DeepSeek is preferred for both simple and complex tasks
    
    let primaryProvider: LLMProvider | null = null
    let fallbackProviders: LLMProvider[] = []
    
    // Always prefer DeepSeek as primary
    if (availableProviders.some(p => p.name === 'deepseek')) {
      primaryProvider = availableProviders.find(p => p.name === 'deepseek')!
      // Fallback order: OpenAI → Anthropic → Groq
      fallbackProviders = availableProviders.filter(p => p.name !== 'deepseek').sort((a, b) => {
        const order = { 'openai': 1, 'anthropic': 2, 'llama3': 3 }
        return (order[a.name as keyof typeof order] || 99) - (order[b.name as keyof typeof order] || 99)
      })
    } else {
      // DeepSeek not available, use OpenAI as primary
      if (availableProviders.some(p => p.name === 'openai')) {
        primaryProvider = availableProviders.find(p => p.name === 'openai')!
        fallbackProviders = availableProviders.filter(p => p.name !== 'openai')
      } else {
        // No DeepSeek or OpenAI, use first available
        primaryProvider = availableProviders[0]
        fallbackProviders = availableProviders.slice(1)
      }
    }

    if (!primaryProvider) {
      throw new Error('No suitable LLM provider found')
    }

    // Try providers in order: primary → fallbacks
    const providersToTry = [primaryProvider, ...fallbackProviders]
    let lastError: Error | null = null
    let escalated = false

    for (let i = 0; i < providersToTry.length; i++) {
      const provider = providersToTry[i]
      const isFallback = i > 0

      try {
        console.log(`🔄 [LLM-ROUTING] Trying ${provider.name}${isFallback ? ' (fallback)' : ' (primary)'} for task: ${taskType}`)
        console.log(`🚀 [LLM-ROUTING] Making API call to ${provider.name}...`)
        
        const result = await provider.complete(messages, options)
        
        console.log(`✅ [LLM-ROUTING] ${provider.name} succeeded: ${result.text.substring(0, 100)}...`)
        console.log(`✅ [LLM-ROUTING] Response length: ${result.text.length} chars`)

        // Create decision
        const decision: LLMRoutingDecision = {
          provider,
          reason: isFallback 
            ? `Using ${provider.name} as fallback (DeepSeek primary failed)`
            : provider.name === 'deepseek'
              ? `Using DeepSeek (primary) for ${taskType} task`
              : `Using ${provider.name} (DeepSeek not available)`,
          complexity: analysis.level,
          estimatedCost: this.estimateCost(provider, messages, options),
        }

        // Log usage
        try {
          await logUsage({
            provider: provider.name,
            model: result.model || provider.model,
            promptTokens: result.tokensUsed?.prompt || 0,
            completionTokens: result.tokensUsed?.completion || 0,
            totalTokens: result.tokensUsed?.total || 0,
            cost: this.calculateCost(provider, result.tokensUsed || { prompt: 0, completion: 0, total: 0 }),
            reason: decision.reason,
            complexity: analysis.level,
            success: true,
            timestamp: new Date(),
          })
        } catch (logError) {
          console.warn('Failed to log LLM usage:', logError)
        }

        return {
          result,
          decision,
          escalated: isFallback,
        }
      } catch (error: any) {
        const errorMsg = error.message || 'Unknown error'
        console.error(`❌ [LLM-ROUTING] ${provider.name} failed:`, errorMsg)
        if (error.stack) {
          console.error(`❌ [LLM-ROUTING] ${provider.name} error stack:`, error.stack)
        }
        lastError = error
        escalated = true
        // Continue to next provider
      }
    }

    // All providers failed
    const finalError = `All LLM providers failed. Last error: ${lastError?.message || 'Unknown error'}`
    console.error(`❌ [LLM-ROUTING] ${finalError}`)
    if (lastError?.stack) {
      console.error(`❌ [LLM-ROUTING] Last error stack:`, lastError.stack)
    }
    throw new Error(finalError)
  }

  /**
   * Estimate cost before making request
   */
  private estimateCost(
    provider: LLMProvider,
    messages: LLMMessage[],
    options: LLMCompletionOptions
  ): number {
    // Rough estimation: assume average response length
    const estimatedInputTokens = Math.ceil(
      messages.map(m => m.content).join(' ').length / 4 // ~4 chars per token
    )
    const estimatedOutputTokens = options.maxTokens || 500

    return (
      (estimatedInputTokens / 1000) * provider.costPer1KInput +
      (estimatedOutputTokens / 1000) * provider.costPer1KOutput
    )
  }

  /**
   * Calculate actual cost from usage
   */
  private calculateCost(
    provider: LLMProvider,
    tokensUsed: { prompt: number; completion: number; total: number }
  ): number {
    return (
      (tokensUsed.prompt / 1000) * provider.costPer1KInput +
      (tokensUsed.completion / 1000) * provider.costPer1KOutput
    )
  }
}

// Singleton instance
let routingServiceInstance: RoutingService | null = null

/**
 * Get routing service instance
 */
export function getRoutingService(): RoutingService {
  if (!routingServiceInstance) {
    routingServiceInstance = new RoutingService()
  }
  return routingServiceInstance
}
