/**
 * LLM Routing Service
 * 
 * Routes requests to appropriate LLM based on complexity analysis
 * Implements smart fallback: Groq → OpenAI → Claude → Error
 * Uses Groq for simple tasks, OpenAI/Claude for complex tasks
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult, LLMRoutingDecision } from './types'
import { Llama3Provider } from './providers/llama3'
import { OpenAIProvider } from './providers/openai'
import { AnthropicProvider } from './providers/anthropic'
import { analyzeComplexity, requiresPremiumLLM, type ComplexityLevel } from './complexity'
import { logUsage } from './usageLogger'

export class RoutingService {
  private llama3: Llama3Provider
  private openai: OpenAIProvider
  private anthropic: AnthropicProvider

  constructor() {
    this.llama3 = new Llama3Provider()
    this.openai = new OpenAIProvider()
    this.anthropic = new AnthropicProvider()
  }

  /**
   * Get available providers in priority order
   */
  private async getAvailableProviders(): Promise<LLMProvider[]> {
    const providers: LLMProvider[] = []
    
    // Check Groq
    if (await this.llama3.isAvailable()) {
      providers.push(this.llama3)
    }
    
    // Check OpenAI
    if (await this.openai.isAvailable()) {
      providers.push(this.openai)
    }
    
    // Check Anthropic
    if (await this.anthropic.isAvailable()) {
      providers.push(this.anthropic)
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
      throw new Error('No LLM providers available. Configure at least one: Groq, OpenAI, or Anthropic.')
    }

    // Analyze complexity
    const analysis = analyzeComplexity(messages, context)
    const needsPremium = requiresPremiumLLM(analysis)
    
    // Determine task type from context or message content
    const taskType = context?.taskType || this.detectTaskType(messages)
    const isSimpleTask = taskType === 'greeting' || taskType === 'followup' || taskType === 'reminder'

    // Routing strategy:
    // - Simple tasks (greeting, followup, reminder) → Prefer Groq
    // - Complex tasks → Prefer OpenAI or Claude
    // - Fallback: Use whichever is available
    
    let primaryProvider: LLMProvider | null = null
    let fallbackProviders: LLMProvider[] = []
    
    if (isSimpleTask && !needsPremium) {
      // Simple task: Prefer Groq, fallback to OpenAI/Claude
      if (availableProviders.some(p => p.name === 'llama3')) {
        primaryProvider = availableProviders.find(p => p.name === 'llama3')!
        fallbackProviders = availableProviders.filter(p => p.name !== 'llama3')
      } else {
        // Groq not available, use first available premium provider
        primaryProvider = availableProviders[0]
        fallbackProviders = availableProviders.slice(1)
      }
    } else {
      // Complex task: Prefer OpenAI or Claude, fallback to Groq
      const premiumProviders = availableProviders.filter(p => p.name === 'openai' || p.name === 'anthropic')
      if (premiumProviders.length > 0) {
        // Prefer OpenAI over Claude, but use either
        primaryProvider = premiumProviders.find(p => p.name === 'openai') || premiumProviders[0]
        fallbackProviders = [
          ...premiumProviders.filter(p => p !== primaryProvider),
          ...availableProviders.filter(p => p.name === 'llama3')
        ]
      } else {
        // No premium available, use Groq
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
            ? `Using ${provider.name} as fallback (primary failed)`
            : isSimpleTask
              ? `Simple task (${taskType}) - using cost-effective ${provider.name}`
              : `Complex task - using premium ${provider.name}`,
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
