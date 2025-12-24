/**
 * LLM Routing Service
 * 
 * Routes requests to appropriate LLM based on complexity analysis
 * Implements fallback mechanism if primary LLM fails
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult, LLMRoutingDecision } from './types'
import { Llama3Provider } from './providers/llama3'
import { OpenAIProvider } from './providers/openai'
import { analyzeComplexity, requiresPremiumLLM, type ComplexityLevel } from './complexity'
import { logUsage } from './usageLogger'

export class RoutingService {
  private llama3: Llama3Provider
  private openai: OpenAIProvider

  constructor() {
    this.llama3 = new Llama3Provider()
    this.openai = new OpenAIProvider()
  }

  /**
   * Route request to appropriate LLM
   */
  async route(
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
    decision: LLMRoutingDecision
    escalated: boolean
  }> {
    // Analyze complexity
    const analysis = analyzeComplexity(messages, context)
    const needsPremium = requiresPremiumLLM(analysis)

    // Make routing decision
    let decision: LLMRoutingDecision
    let provider: LLMProvider

    if (needsPremium) {
      // High complexity → Use OpenAI GPT-4o
      provider = this.openai
      decision = {
        provider,
        reason: `High complexity detected (score: ${analysis.score}, factors: ${analysis.factors.join(', ')})`,
        complexity: analysis.level,
        estimatedCost: this.estimateCost(provider, messages, options),
      }
    } else {
      // Low/Medium complexity → Use Llama 3
      provider = this.llama3
      decision = {
        provider,
        reason: `Standard complexity (score: ${analysis.score}) - using cost-effective Llama 3`,
        complexity: analysis.level,
        estimatedCost: this.estimateCost(provider, messages, options),
      }
    }

    // Try primary provider with fallback
    let result: LLMCompletionResult
    let escalated = false

    try {
      // Check if provider is available
      const isAvailable = await provider.isAvailable()
      if (!isAvailable) {
        throw new Error(`${provider.name} provider not available`)
      }

      result = await provider.complete(messages, options)

      // Check confidence - if too low, escalate
      if (result.confidence !== undefined && result.confidence < 50 && !needsPremium) {
        console.log(`⚠️ Low confidence (${result.confidence}) from Llama 3, escalating to OpenAI`)
        escalated = true
        result = await this.escalateToOpenAI(messages, options, decision)
      }
    } catch (error: any) {
      console.error(`❌ ${provider.name} failed:`, error.message)
      
      // Fallback to OpenAI if Llama 3 fails
      if (provider.name === 'llama3') {
        console.log('🔄 Falling back to OpenAI GPT-4o')
        escalated = true
        result = await this.escalateToOpenAI(messages, options, decision)
      } else {
        // If OpenAI fails, throw error
        throw error
      }
    }

    // Log usage (non-blocking - don't fail if logging fails)
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
      // Don't fail the request if logging fails
      console.warn('Failed to log LLM usage:', logError)
    }

    return {
      result,
      decision,
      escalated,
    }
  }

  /**
   * Escalate to OpenAI (premium provider)
   */
  private async escalateToOpenAI(
    messages: LLMMessage[],
    options: LLMCompletionOptions,
    originalDecision: LLMRoutingDecision
  ): Promise<LLMCompletionResult> {
    const isAvailable = await this.openai.isAvailable()
    if (!isAvailable) {
      throw new Error('OpenAI not available for escalation')
    }

    const result = await this.openai.complete(messages, options)

    // Log escalation (non-blocking - don't fail if logging fails)
    try {
      await logUsage({
        provider: 'openai',
        model: result.model || this.openai.model,
        promptTokens: result.tokensUsed?.prompt || 0,
        completionTokens: result.tokensUsed?.completion || 0,
        totalTokens: result.tokensUsed?.total || 0,
        cost: this.calculateCost(this.openai, result.tokensUsed || { prompt: 0, completion: 0, total: 0 }),
        reason: `Escalated from ${originalDecision.provider.name}: ${originalDecision.reason}`,
        complexity: originalDecision.complexity,
        success: true,
        timestamp: new Date(),
      })
    } catch (logError) {
      // Don't fail the escalation if logging fails
      console.warn('Failed to log LLM escalation usage:', logError)
    }

    return result
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

