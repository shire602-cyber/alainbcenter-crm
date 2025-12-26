import { prisma } from '@/lib/prisma'

export interface AIConfig {
  provider: 'deepseek' | 'openai' | 'groq' | 'anthropic'
  model: string
  apiKey: string
}

/**
 * Get AI config from Integration settings or environment variable
 * Never expose to client-side code
 * Priority: DeepSeek (Primary) → OpenAI (Fallback) → Anthropic → Groq
 */
export async function getAIConfig(): Promise<AIConfig | null> {
  try {
    // Check DeepSeek first (Primary)
    const deepseekIntegration = await prisma.integration.findUnique({
      where: { name: 'deepseek' },
    })
    if (deepseekIntegration?.isEnabled && deepseekIntegration.apiKey) {
      let config: any = {}
      try {
        config = deepseekIntegration.config ? JSON.parse(deepseekIntegration.config) : {}
      } catch {
        config = {}
      }
      return {
        provider: 'deepseek',
        model: config.model || 'deepseek-chat',
        apiKey: deepseekIntegration.apiKey,
      }
    }

    // Fallback to OpenAI integration (which might be configured for DeepSeek or other providers)
    const openaiIntegration = await prisma.integration.findUnique({
      where: { name: 'openai' },
    })
    if (openaiIntegration?.isEnabled && openaiIntegration.apiKey) {
      let config: any = {}
      try {
        config = openaiIntegration.config ? JSON.parse(openaiIntegration.config) : {}
      } catch {
        config = {}
      }
      // Use provider from config if specified, otherwise default to 'openai'
      const provider = (config.provider || 'openai') as 'deepseek' | 'openai' | 'groq' | 'anthropic'
      const model = config.model || (
        provider === 'deepseek' ? 'deepseek-chat' :
        provider === 'groq' ? 'llama-3.1-70b-versatile' : 
        provider === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 
        'gpt-4o-mini'
      )
      
      return {
        provider,
        model,
        apiKey: openaiIntegration.apiKey,
      }
    }

    // Fallback to Anthropic
    const anthropicIntegration = await prisma.integration.findUnique({
      where: { name: 'anthropic' },
    })
    if (anthropicIntegration?.isEnabled && anthropicIntegration.apiKey) {
      let config: any = {}
      try {
        config = anthropicIntegration.config ? JSON.parse(anthropicIntegration.config) : {}
      } catch {
        config = {}
      }
      return {
        provider: 'anthropic',
        model: config.model || 'claude-3-5-sonnet-20241022',
        apiKey: anthropicIntegration.apiKey,
      }
    }

    // Environment variable fallbacks (in priority order)
    if (process.env.DEEPSEEK_API_KEY) {
      return {
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: process.env.DEEPSEEK_API_KEY,
      }
    }

    if (process.env.OPENAI_API_KEY) {
      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY,
      }
    }

    if (process.env.GROQ_API_KEY) {
      return {
        provider: 'groq',
        model: 'llama-3.1-70b-versatile',
        apiKey: process.env.GROQ_API_KEY,
      }
    }

    if (process.env.ANTHROPIC_API_KEY) {
      return {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        apiKey: process.env.ANTHROPIC_API_KEY,
      }
    }

    return null
  } catch (error) {
    console.error('Error getting AI config:', error)
    return null
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function getOpenAIConfig(): Promise<{ apiKey: string } | null> {
  const config = await getAIConfig()
  if (!config) return null
  return { apiKey: config.apiKey }
}

/**
 * Check if AI is configured
 */
export async function isAIConfigured(): Promise<boolean> {
  const config = await getAIConfig()
  return config !== null
}

/**
 * Legacy function for backward compatibility
 */
export async function isOpenAIConfigured(): Promise<boolean> {
  return isAIConfigured()
}

