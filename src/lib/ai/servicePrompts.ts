/**
 * Enhanced AI Training - Service-Specific Prompts (Phase 5)
 * 
 * Provides custom prompts and examples per service type
 * for better AI responses
 */

import { prisma } from '../prisma'
import { getSystemPrompt } from './prompts'

/**
 * Get service info from Integration config (helper function)
 */
async function getServiceInfo(): Promise<Record<string, { description: string; pricing?: string; requirements?: string[] }>> {
  try {
    const integration = await prisma.integration.findUnique({
      where: { name: 'openai' },
    })

    if (integration?.config) {
      try {
        const config = typeof integration.config === 'string' 
          ? JSON.parse(integration.config) 
          : integration.config
        
        if (config.serviceInfo && typeof config.serviceInfo === 'object') {
          return config.serviceInfo
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  } catch (error) {
    // Ignore errors
  }

  return {}
}

export interface ServicePromptConfig {
  serviceType: string
  customPrompt?: string
  exampleConversations?: Array<{
    customerMessage: string
    agentResponse: string
    context?: string
  }>
  commonQuestions?: Array<{
    question: string
    answer: string
  }>
}

/**
 * Get service-specific prompt configuration
 */
export async function getServicePromptConfig(serviceType: string | null): Promise<ServicePromptConfig | null> {
  if (!serviceType) {
    return null
  }

  try {
    // Try to get from Integration config (openai integration)
    const integration = await prisma.integration.findUnique({
      where: { name: 'openai' },
    })

    if (integration?.config) {
      try {
        const config = typeof integration.config === 'string' 
          ? JSON.parse(integration.config) 
          : integration.config
        
        // Check for service-specific configs
        if (config.servicePrompts && typeof config.servicePrompts === 'object') {
          const serviceConfig = config.servicePrompts[serviceType]
          if (serviceConfig) {
            return {
              serviceType,
              customPrompt: serviceConfig.customPrompt,
              exampleConversations: serviceConfig.exampleConversations || [],
              commonQuestions: serviceConfig.commonQuestions || [],
            }
          }
        }
      } catch (e) {
        console.warn('Failed to parse service prompts from config:', e)
      }
    }
  } catch (error) {
    console.warn('Error fetching service prompt config:', error)
  }

  return null
}

/**
 * Build enhanced prompt with service-specific context
 */
export async function buildServiceEnhancedPrompt(
  basePrompt: string,
  serviceType: string | null,
  context?: {
    lead?: any
    contact?: any
    recentMessages?: any[]
  }
): Promise<string> {
  let enhanced = basePrompt

  // Get service-specific config
  const serviceConfig = await getServicePromptConfig(serviceType)

  if (serviceConfig) {
    // Add custom service prompt if available
    if (serviceConfig.customPrompt) {
      enhanced += `\n\nService-Specific Instructions (${serviceType}):\n${serviceConfig.customPrompt}\n`
    }

    // Add example conversations if available
    if (serviceConfig.exampleConversations && serviceConfig.exampleConversations.length > 0) {
      enhanced += `\n\nExample Conversations for ${serviceType}:\n`
      serviceConfig.exampleConversations.forEach((example, idx) => {
        enhanced += `\nExample ${idx + 1}:\n`
        enhanced += `Customer: ${example.customerMessage}\n`
        enhanced += `Agent: ${example.agentResponse}\n`
        if (example.context) {
          enhanced += `Context: ${example.context}\n`
        }
      })
    }

    // Add common questions if available
    if (serviceConfig.commonQuestions && serviceConfig.commonQuestions.length > 0) {
      enhanced += `\n\nCommon Questions & Answers for ${serviceType}:\n`
      serviceConfig.commonQuestions.forEach((qa, idx) => {
        enhanced += `${idx + 1}. Q: ${qa.question}\n   A: ${qa.answer}\n`
      })
    }
  }

  // Service information can be added here if needed
  // For now, service-specific configs are handled above

  return enhanced
}

/**
 * Get all service prompt configs (for admin UI)
 */
export async function getAllServicePromptConfigs(): Promise<Record<string, ServicePromptConfig>> {
  try {
    const integration = await prisma.integration.findUnique({
      where: { name: 'openai' },
    })

    if (integration?.config) {
      try {
        const config = typeof integration.config === 'string' 
          ? JSON.parse(integration.config) 
          : integration.config
        
        if (config.servicePrompts && typeof config.servicePrompts === 'object') {
          return config.servicePrompts
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  } catch (error) {
    // Ignore errors
  }

  return {}
}

/**
 * Save service prompt config (for admin UI)
 */
export async function saveServicePromptConfig(
  serviceType: string,
  config: ServicePromptConfig
): Promise<void> {
  try {
    const integration = await prisma.integration.findUnique({
      where: { name: 'openai' },
    })

    if (!integration) {
      throw new Error('OpenAI integration not found')
    }

    // Get existing config
    let existingConfig: any = {}
    try {
      existingConfig = integration.config 
        ? (typeof integration.config === 'string' ? JSON.parse(integration.config) : integration.config)
        : {}
    } catch {
      existingConfig = {}
    }

    // Update service prompts
    if (!existingConfig.servicePrompts) {
      existingConfig.servicePrompts = {}
    }

    existingConfig.servicePrompts[serviceType] = {
      serviceType: config.serviceType,
      customPrompt: config.customPrompt || null,
      exampleConversations: config.exampleConversations || [],
      commonQuestions: config.commonQuestions || [],
    }

    // Save back to integration
    await prisma.integration.update({
      where: { id: integration.id },
      data: {
        config: JSON.stringify(existingConfig),
      },
    })

    console.log(`✅ Saved service prompt config for ${serviceType}`)
  } catch (error: any) {
    console.error(`Error saving service prompt config for ${serviceType}:`, error)
    throw error
  }
}

