/**
 * OpenAI GPT-4o Provider
 * 
 * Premium LLM for high-complexity requests - more capable but expensive
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult } from '../types'

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai'
  readonly model = 'gpt-4o' // GPT-4o for premium tasks
  readonly costPer1KInput = 0.005 // $0.005 per 1K input tokens
  readonly costPer1KOutput = 0.015 // $0.015 per 1K output tokens

  private apiKey: string | null = null
  private baseUrl = 'https://api.openai.com/v1'

  constructor() {
    // Get API key from environment or integration
    this.apiKey = process.env.OPENAI_API_KEY || null
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      // Try to get from database integration
      try {
        const { prisma } = await import('@/lib/prisma')
        const integration = await prisma.integration.findUnique({
          where: { name: 'openai' },
        })
        if (integration?.isEnabled && integration.apiKey) {
          this.apiKey = integration.apiKey
          // Get model from config if available
          if (integration.config) {
            try {
              const config = JSON.parse(integration.config)
              if (config.model) {
                // Update model if specified in config
                (this as any).model = config.model
              }
            } catch {
              // Config parse error, use default
            }
          }
          return true
        }
      } catch {
        // Integration not available
      }
      return false
    }
    return true
  }

  async complete(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<LLMCompletionResult> {
    // Ensure API key is loaded
    if (!this.apiKey) {
      const available = await this.isAvailable()
      if (!available || !this.apiKey) {
        throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY or configure OpenAI integration.')
      }
    }

    // Double-check API key is set (TypeScript safety)
    if (!this.apiKey) {
      throw new Error('OpenAI API key is null after availability check')
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1000,
          top_p: options.topP ?? 1.0,
          frequency_penalty: options.frequencyPenalty ?? 0,
          presence_penalty: options.presencePenalty ?? 0,
          // STEP 6: Enforce strict JSON output
          response_format: options.responseFormat || { type: 'json_object' },
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
        throw new Error(`OpenAI API error: ${error.error?.message || 'Failed to generate completion'}`)
      }

      const data = await response.json()
      
      // Validate response structure
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('Invalid response from OpenAI: missing or empty choices array')
      }
      
      const text = data.choices[0]?.message?.content?.trim() || ''

      if (!text) {
        throw new Error('Empty response from OpenAI')
      }

      // GPT-4o typically has higher confidence
      const confidence = Math.min(100, Math.max(70, 85 + (text.length > 100 ? 10 : 0)))

      return {
        text,
        confidence,
        tokensUsed: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        },
        model: data.model || this.model,
        finishReason: data.choices[0]?.finish_reason || 'stop',
      }
    } catch (error: any) {
      console.error('OpenAI API error:', error)
      throw error
    }
  }
}

