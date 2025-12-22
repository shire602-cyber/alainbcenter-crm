import { prisma } from '@/lib/prisma'

export interface AIConfig {
  provider: 'openai' | 'groq' | 'anthropic'
  model: string
  apiKey: string
}

/**
 * Get AI config from Integration settings or environment variable
 * Never expose to client-side code
 */
export async function getAIConfig(): Promise<AIConfig | null> {
  try {
    // First, try to get from Integration settings
    const integration = await prisma.integration.findUnique({
      where: { name: 'openai' },
    })

    if (integration?.isEnabled && integration.apiKey) {
      let config: any = {}
      try {
        config = integration.config ? JSON.parse(integration.config) : {}
      } catch {
        config = {}
      }

      return {
        provider: (config.provider || 'openai') as 'openai' | 'groq' | 'anthropic',
        model: config.model || 'gpt-4o-mini',
        apiKey: integration.apiKey,
      }
    }

    // Fallback to environment variable (legacy support)
    const envKey = process.env.OPENAI_API_KEY
    if (envKey) {
      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKey: envKey,
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

