/**
 * Anthropic Claude Provider
 * 
 * Premium LLM for high-complexity requests - alternative to OpenAI
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult } from '../types'

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic'
  readonly model = 'claude-3-5-sonnet-20241022' // Claude 3.5 Sonnet
  readonly costPer1KInput = 0.003 // $0.003 per 1K input tokens
  readonly costPer1KOutput = 0.015 // $0.015 per 1K output tokens

  private apiKey: string | null = null
  private baseUrl = 'https://api.anthropic.com/v1'

  constructor() {
    // Get API key from environment or integration
    this.apiKey = process.env.ANTHROPIC_API_KEY || null
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      // Try to get from database integration
      try {
        const { prisma } = await import('@/lib/prisma')
        const integration = await prisma.integration.findUnique({
          where: { name: 'anthropic' },
        })
        if (integration?.isEnabled && integration.apiKey) {
          this.apiKey = integration.apiKey
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
    if (!this.apiKey) {
      const available = await this.isAvailable()
      if (!available) {
        throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY or configure Anthropic integration.')
      }
    }

    try {
      // Convert messages to Anthropic format (system message separate)
      const systemMessage = messages.find(m => m.role === 'system')
      const conversationMessages = messages.filter(m => m.role !== 'system')

      const requestBody = {
        model: this.model,
        max_tokens: options.maxTokens ?? 1000,
        temperature: options.temperature ?? 0.7,
        system: systemMessage?.content || 'You are a helpful assistant.',
        messages: conversationMessages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      }

      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
        throw new Error(`Anthropic API error: ${error.error?.message || 'Failed to generate completion'}`)
      }

      const data = await response.json()
      
      const text = data.content?.[0]?.text?.trim() || ''

      if (!text) {
        throw new Error('Empty response from Claude')
      }

      // Claude typically has high confidence
      const confidence = Math.min(100, Math.max(75, 85 + (text.length > 100 ? 10 : 0)))

      return {
        text,
        confidence,
        tokensUsed: {
          prompt: data.usage?.input_tokens || 0,
          completion: data.usage?.output_tokens || 0,
          total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
        },
        model: data.model || this.model,
        finishReason: data.stop_reason || 'stop',
      }
    } catch (error: any) {
      console.error('Anthropic (Claude) API error:', error)
      throw error
    }
  }
}

