/**
 * DeepSeek Provider
 * 
 * Primary LLM provider - cost-effective and high quality
 * Uses OpenAI-compatible API
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult } from '../types'

export class DeepSeekProvider implements LLMProvider {
  readonly name = 'deepseek'
  readonly model = 'deepseek-chat' // Default model
  readonly costPer1KInput = 0.14 // $0.14 per 1M input tokens = $0.00014 per 1K
  readonly costPer1KOutput = 0.28 // $0.28 per 1M output tokens = $0.00028 per 1K

  private apiKey: string | null = null
  private configuredModel: string = 'deepseek-chat'
  private baseUrl = 'https://api.deepseek.com/v1'

  constructor() {
    // Get API key from environment or integration
    this.apiKey = process.env.DEEPSEEK_API_KEY || null
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      // Try to get from database integration
      try {
        const { prisma } = await import('@/lib/prisma')
        // Check for deepseek integration first
        let integration = await prisma.integration.findUnique({
          where: { name: 'deepseek' },
        })
        
        // If not found, check openai integration (might be configured for deepseek)
        if (!integration) {
          integration = await prisma.integration.findUnique({
            where: { name: 'openai' },
          })
          
          if (integration?.isEnabled && integration.apiKey) {
            // Check if it's configured for deepseek
            let config: any = {}
            try {
              config = integration.config ? JSON.parse(integration.config) : {}
            } catch {
              config = {}
            }
            
            if (config.provider === 'deepseek') {
              this.apiKey = integration.apiKey
              this.configuredModel = config.model || 'deepseek-chat'
              return true
            }
          }
        } else if (integration?.isEnabled && integration.apiKey) {
          this.apiKey = integration.apiKey
          let config: any = {}
          try {
            config = integration.config ? JSON.parse(integration.config) : {}
          } catch {
            config = {}
          }
          this.configuredModel = config.model || 'deepseek-chat'
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
        throw new Error('DeepSeek API key not configured. Set DEEPSEEK_API_KEY or configure DeepSeek integration.')
      }
    }

    // Double-check API key is set (TypeScript safety)
    if (!this.apiKey) {
      throw new Error('DeepSeek API key is null after availability check')
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.configuredModel,
          messages: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens ?? 1000,
          top_p: options.topP ?? 1.0,
          frequency_penalty: options.frequencyPenalty ?? 0,
          presence_penalty: options.presencePenalty ?? 0,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
        throw new Error(`DeepSeek API error: ${error.error?.message || 'Failed to generate completion'}`)
      }

      const data = await response.json()
      
      // Validate response structure
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('Invalid response from DeepSeek: missing or empty choices array')
      }
      
      const text = data.choices[0]?.message?.content?.trim() || ''

      if (!text) {
        throw new Error('Empty response from DeepSeek')
      }

      // DeepSeek typically has high confidence
      const confidence = Math.min(100, Math.max(75, 85 + (text.length > 100 ? 10 : 0)))

      return {
        text,
        confidence,
        tokensUsed: {
          prompt: data.usage?.prompt_tokens || 0,
          completion: data.usage?.completion_tokens || 0,
          total: data.usage?.total_tokens || 0,
        },
        model: data.model || this.configuredModel,
        finishReason: data.choices[0]?.finish_reason || 'stop',
      }
    } catch (error: any) {
      console.error('DeepSeek API error:', error)
      throw error
    }
  }
}

