import { prisma } from '@/lib/prisma'

export interface AIConfig {
  provider: 'openai' | 'groq' | 'anthropic'
  model: string
  apiKey: string
}

/**
 * Get AI config from Integration settings or environment variable
 * Never expose to client-side code
 * Priority: Groq → OpenAI → Anthropic
 */
export async function getAIConfig(): Promise<AIConfig | null> {
  try {
    // Check Groq first (preferred for simple tasks)
    const groqIntegration = await prisma.integration.findUnique({
      where: { name: 'groq' },
    })
    if (groqIntegration?.isEnabled && groqIntegration.apiKey) {
      let config: any = {}
      try {
        config = groqIntegration.config ? JSON.parse(groqIntegration.config) : {}
      } catch {
        config = {}
      }
      return {
        provider: 'groq',
        model: config.model || 'llama-3.1-70b-versatile',
        apiKey: groqIntegration.apiKey,
      }
    }

    // Fallback to OpenAI
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
      return {
        provider: (config.provider || 'openai') as 'openai' | 'groq' | 'anthropic',
        model: config.model || 'gpt-4o-mini',
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
    if (process.env.GROQ_API_KEY) {
      return {
        provider: 'groq',
        model: 'llama-3.1-70b-versatile',
        apiKey: process.env.GROQ_API_KEY,
      }
    }

    if (process.env.OPENAI_API_KEY) {
      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY,
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

