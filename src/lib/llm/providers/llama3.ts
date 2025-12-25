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
  private modelName: string = this.model // Allow model override from config
  private baseUrl = 'https://api.groq.com/openai/v1'

  constructor() {
    // Get API key from environment or integration
    this.apiKey = process.env.GROQ_API_KEY || null
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      // Try to get from database integration
      // Check both 'groq' integration and 'openai' integration (which might have provider: 'groq' in config)
      try {
        const { prisma } = await import('@/lib/prisma')
        console.log(`🔍 [LLM-PROVIDER] Checking Groq integration in database...`)
        
        // First try 'groq' integration
        let integration = await prisma.integration.findUnique({
          where: { name: 'groq' },
        })
        
        // If not found, check 'openai' integration (which might be configured for Groq)
        if (!integration || !integration.isEnabled || !integration.apiKey) {
          console.log(`🔍 [LLM-PROVIDER] Groq integration not found, checking 'openai' integration...`)
          const openaiIntegration = await prisma.integration.findUnique({
            where: { name: 'openai' },
          })
          
          if (openaiIntegration?.isEnabled && openaiIntegration.apiKey) {
            // Check if config specifies Groq as provider
            let config: any = {}
            try {
              config = openaiIntegration.config ? JSON.parse(openaiIntegration.config) : {}
            } catch {}
            
            if (config.provider === 'groq') {
              console.log(`✅ [LLM-PROVIDER] Found Groq config in 'openai' integration`)
              integration = openaiIntegration
            }
          }
        }
        
        console.log(`🔍 [LLM-PROVIDER] Integration check result:`, {
          exists: !!integration,
          isEnabled: integration?.isEnabled,
          hasApiKey: !!integration?.apiKey,
          config: integration?.config ? 'present' : 'missing',
        })
        
        if (integration?.isEnabled && integration.apiKey) {
          this.apiKey = integration.apiKey
          console.log(`✅ [LLM-PROVIDER] Groq API key loaded from database`)
          
          // Get model from config if available
          if (integration.config) {
            try {
              const config = JSON.parse(integration.config)
              if (config.model) {
                this.modelName = config.model
                console.log(`📝 [LLM-PROVIDER] Using model from config: ${this.modelName}`)
              } else {
                console.log(`📝 [LLM-PROVIDER] No model in config, using default: ${this.modelName}`)
              }
            } catch (parseError: any) {
              console.error(`❌ [LLM-PROVIDER] Config parse error:`, parseError.message)
              // Config parse error, use default
            }
          } else {
            console.log(`📝 [LLM-PROVIDER] No config found, using default model: ${this.modelName}`)
          }
          return true
        } else {
          console.log(`❌ [LLM-PROVIDER] Groq integration not available:`, {
            isEnabled: integration?.isEnabled,
            hasApiKey: !!integration?.apiKey,
          })
        }
      } catch (error: any) {
        console.error('❌ [LLM-PROVIDER] Error checking Groq integration:', error.message)
        console.error('❌ [LLM-PROVIDER] Error stack:', error.stack)
      }
      return false
    }
    console.log(`✅ [LLM-PROVIDER] Groq API key already set from environment`)
    return true
  }

  async complete(
    messages: LLMMessage[],
    options: LLMCompletionOptions = {}
  ): Promise<LLMCompletionResult> {
    // Ensure API key is loaded
    if (!this.apiKey) {
      console.log(`🔍 [LLM-PROVIDER] API key not set, checking availability...`)
      const available = await this.isAvailable()
      if (!available || !this.apiKey) {
        console.error(`❌ [LLM-PROVIDER] Groq not available after check`)
        throw new Error('Groq API key not configured. Set GROQ_API_KEY or configure Groq integration.')
      }
      console.log(`✅ [LLM-PROVIDER] API key loaded: ${this.apiKey.substring(0, 10)}...`)
    }

    // Double-check API key is set (TypeScript safety)
    if (!this.apiKey) {
      throw new Error('Groq API key is null after availability check')
    }

    console.log(`🚀 [LLM-PROVIDER] Making Groq API call with model: ${this.modelName}`)
    console.log(`🚀 [LLM-PROVIDER] Request:`, {
      model: this.modelName,
      messageCount: messages.length,
      maxTokens: options.maxTokens ?? 500,
      temperature: options.temperature ?? 0.7,
    })

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName, // Use configured model name
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

      console.log(`📡 [LLM-PROVIDER] Groq API response status: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ [LLM-PROVIDER] Groq API error response:`, errorText)
        let error: any
        try {
          error = JSON.parse(errorText)
        } catch {
          error = { error: { message: errorText || 'Unknown error' } }
        }
        const errorMessage = error.error?.message || error.message || 'Failed to generate completion'
        console.error(`❌ [LLM-PROVIDER] Groq API error: ${errorMessage}`)
        throw new Error(`Groq API error: ${errorMessage}`)
      }

      const data = await response.json()
      console.log(`✅ [LLM-PROVIDER] Groq API success, response structure:`, {
        hasChoices: !!data.choices,
        choicesLength: data.choices?.length || 0,
        model: data.model,
        usage: data.usage ? 'present' : 'missing',
      })
      
      // Validate response structure
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        console.error(`❌ [LLM-PROVIDER] Invalid response structure:`, JSON.stringify(data).substring(0, 500))
        throw new Error('Invalid response from Llama 3: missing or empty choices array')
      }
      
      const text = data.choices[0]?.message?.content?.trim() || ''
      console.log(`✅ [LLM-PROVIDER] Generated text length: ${text.length} chars`)

      if (!text) {
        console.error(`❌ [LLM-PROVIDER] Empty text in response`)
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
        model: data.model || this.modelName,
        finishReason: data.choices[0]?.finish_reason || 'stop',
      }
    } catch (error: any) {
      console.error('Llama 3 (Groq) API error:', error)
      throw error
    }
  }
}

