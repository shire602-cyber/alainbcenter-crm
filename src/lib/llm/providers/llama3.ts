/**
 * Llama 3 Provider (via Groq)
 * 
 * Primary LLM for standard tasks - cost-effective and fast
 */

import type { LLMProvider, LLMMessage, LLMCompletionOptions, LLMCompletionResult } from '../types'

export class Llama3Provider implements LLMProvider {
  readonly name = 'llama3'
  readonly model = 'llama-3.1-70b-versatile' // Groq's Llama 3.1 70B model
  readonly costPer1KInput = 0.0 // Free tier available
  readonly costPer1KOutput = 0.0 // Free tier available

  private apiKey: string | null = null
  private baseUrl = 'https://api.groq.com/openai/v1'

  constructor() {
    // Get API key from environment or integration
    this.apiKey = process.env.GROQ_API_KEY || null
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      // Try to get from database integration
      try {
        const { prisma } = await import('@/lib/prisma')
        const integration = await prisma.integration.findUnique({
          where: { name: 'groq' },
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
        throw new Error('Groq API key not configured. Set GROQ_API_KEY or configure Groq integration.')
      }
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
          max_tokens: options.maxTokens ?? 500,
          top_p: options.topP ?? 1.0,
          frequency_penalty: options.frequencyPenalty ?? 0,
          presence_penalty: options.presencePenalty ?? 0,
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }))
        throw new Error(`Groq API error: ${error.error?.message || 'Failed to generate completion'}`)
      }

      const data = await response.json()
      
      // Validate response structure
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('Invalid response from Llama 3: missing or empty choices array')
      }
      
      const text = data.choices[0]?.message?.content?.trim() || ''

      if (!text) {
        throw new Error('Empty response from Llama 3')
      }

      // Calculate confidence (simple heuristic: longer responses = higher confidence)
      // In production, you might use a separate model to assess confidence
      const confidence = Math.min(100, Math.max(50, text.length / 10))

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
      console.error('Llama 3 (Groq) API error:', error)
      throw error
    }
  }
}

