/**
 * Renewal Template Management
 * Handles template mapping, variable validation, and required fields
 */

import { prisma } from '@/lib/prisma'
import { getWhatsAppCredentials } from '@/lib/whatsapp'

export type RenewalType = 'TRADE_LICENSE' | 'EMIRATES_ID' | 'RESIDENCY' | 'VISIT_VISA'
export type RenewalStage = 'T-30' | 'T-14' | 'T-7' | 'EXPIRED'

export interface TemplateVariable {
  name: string
  required: boolean
  example?: string
}

export interface RenewalTemplateMapping {
  renewalType: RenewalType
  stage: RenewalStage
  templateName: string
  requiredVariables: TemplateVariable[]
  channel: 'whatsapp' | 'email' | 'sms'
}

export interface TemplateValidationResult {
  isValid: boolean
  missingVariables: string[]
  allVariables: Record<string, string>
}

/**
 * Default template mappings with required variables
 * These can be overridden in Integration config
 */
const DEFAULT_TEMPLATE_MAPPINGS: RenewalTemplateMapping[] = [
  {
    renewalType: 'TRADE_LICENSE',
    stage: 'T-30',
    templateName: 'tl_30',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true, example: 'Ahmed Ali' },
      { name: 'service', required: true, example: 'Trade License' },
      { name: 'expiryDate', required: true, example: '15/02/2024' },
      { name: 'daysRemaining', required: true, example: '30' },
    ],
  },
  {
    renewalType: 'TRADE_LICENSE',
    stage: 'T-14',
    templateName: 'tl_14',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'TRADE_LICENSE',
    stage: 'T-7',
    templateName: 'tl_7',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'TRADE_LICENSE',
    stage: 'EXPIRED',
    templateName: 'tl_expired',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
    ],
  },
  {
    renewalType: 'EMIRATES_ID',
    stage: 'T-30',
    templateName: 'eid_30',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'EMIRATES_ID',
    stage: 'T-14',
    templateName: 'eid_14',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'EMIRATES_ID',
    stage: 'T-7',
    templateName: 'eid_7',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'EMIRATES_ID',
    stage: 'EXPIRED',
    templateName: 'eid_expired',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
    ],
  },
  {
    renewalType: 'RESIDENCY',
    stage: 'T-30',
    templateName: 'res_30',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'RESIDENCY',
    stage: 'T-14',
    templateName: 'res_14',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'RESIDENCY',
    stage: 'T-7',
    templateName: 'res_7',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'RESIDENCY',
    stage: 'EXPIRED',
    templateName: 'res_expired',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
    ],
  },
  {
    renewalType: 'VISIT_VISA',
    stage: 'T-30',
    templateName: 'vv_30',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'VISIT_VISA',
    stage: 'T-14',
    templateName: 'vv_14',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'VISIT_VISA',
    stage: 'T-7',
    templateName: 'vv_7',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
      { name: 'daysRemaining', required: true },
    ],
  },
  {
    renewalType: 'VISIT_VISA',
    stage: 'EXPIRED',
    templateName: 'vv_expired',
    channel: 'whatsapp',
    requiredVariables: [
      { name: 'name', required: true },
      { name: 'service', required: true },
      { name: 'expiryDate', required: true },
    ],
  },
]

/**
 * Get template mapping for a renewal type and stage
 * Checks Integration config first, then uses defaults
 */
export async function getTemplateMapping(
  renewalType: RenewalType,
  stage: RenewalStage
): Promise<RenewalTemplateMapping | null> {
  try {
    // Try to get from Integration config
    const integration = await prisma.integration.findFirst({
      where: {
        OR: [
          { name: 'whatsapp' },
          { provider: 'whatsapp' },
        ],
        isEnabled: true,
      },
      select: { config: true },
    })

    if (integration?.config) {
      const config = typeof integration.config === 'string'
        ? JSON.parse(integration.config)
        : integration.config

      if (config.renewalTemplateMappings && Array.isArray(config.renewalTemplateMappings)) {
        const mapping = config.renewalTemplateMappings.find(
          (m: any) => m.renewalType === renewalType && m.stage === stage
        )
        if (mapping) {
          return mapping as RenewalTemplateMapping
        }
      }
    }
  } catch (error) {
    console.warn('[RENEWAL-TEMPLATES] Failed to load template mapping from config:', error)
  }

  // Fallback to defaults
  return DEFAULT_TEMPLATE_MAPPINGS.find(
    (m) => m.renewalType === renewalType && m.stage === stage
  ) || null
}

/**
 * Validate template variables against required variables
 */
export function validateTemplateVariables(
  mapping: RenewalTemplateMapping,
  providedVariables: Record<string, string>
): TemplateValidationResult {
  const missingVariables: string[] = []
  const allVariables: Record<string, string> = {}

  // Check each required variable
  for (const variable of mapping.requiredVariables) {
    const value = providedVariables[variable.name]
    allVariables[variable.name] = value || ''

    if (variable.required && (!value || value.trim() === '')) {
      missingVariables.push(variable.name)
    }
  }

  return {
    isValid: missingVariables.length === 0,
    missingVariables,
    allVariables,
  }
}

/**
 * Get all template mappings for a renewal type
 */
export async function getTemplateMappingsForType(
  renewalType: RenewalType
): Promise<RenewalTemplateMapping[]> {
  try {
    const integration = await prisma.integration.findFirst({
      where: {
        OR: [
          { name: 'whatsapp' },
          { provider: 'whatsapp' },
        ],
        isEnabled: true,
      },
      select: { config: true },
    })

    if (integration?.config) {
      const config = typeof integration.config === 'string'
        ? JSON.parse(integration.config)
        : integration.config

      if (config.renewalTemplateMappings && Array.isArray(config.renewalTemplateMappings)) {
        return config.renewalTemplateMappings.filter(
          (m: any) => m.renewalType === renewalType
        ) as RenewalTemplateMapping[]
      }
    }
  } catch (error) {
    console.warn('[RENEWAL-TEMPLATES] Failed to load template mappings from config:', error)
  }

  return DEFAULT_TEMPLATE_MAPPINGS.filter((m) => m.renewalType === renewalType)
}

/**
 * Fetch templates from Meta API using integration credentials
 */
export async function fetchMetaTemplates(): Promise<any[]> {
  try {
    const credentials = await getWhatsAppCredentials()
    
    if (!credentials.accessToken) {
      throw new Error('WhatsApp access token not configured')
    }

    // Get WABA ID for template fetching
    // Templates are fetched at the WABA level, not phone number level
    const integration = await prisma.integration.findFirst({
      where: {
        OR: [
          { name: 'whatsapp' },
          { provider: 'whatsapp' },
        ],
        isEnabled: true,
      },
      select: { config: true },
    })

    let wabaId: string | undefined
    
    if (integration?.config) {
      const config = typeof integration.config === 'string'
        ? JSON.parse(integration.config)
        : integration.config
      
      wabaId = config.wabaId || config.whatsappBusinessAccountId || credentials.wabaId
    }

    if (!wabaId) {
      throw new Error('WhatsApp Business Account ID (WABA ID) not configured')
    }

    // Fetch templates from Meta API
    const url = `https://graph.facebook.com/v21.0/${wabaId}/message_templates`
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
      },
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(`Meta API error: ${error.error?.message || response.statusText}`)
    }

    const data = await response.json()
    return data.data || []
  } catch (error: any) {
    console.error('[RENEWAL-TEMPLATES] Failed to fetch Meta templates:', error)
    throw error
  }
}

/**
 * Verify template exists in Meta and has correct variable structure
 */
export async function verifyTemplateExists(
  templateName: string
): Promise<{ exists: boolean; variables?: string[]; error?: string }> {
  try {
    const templates = await fetchMetaTemplates()
    const template = templates.find((t: any) => t.name === templateName)

    if (!template) {
      return { exists: false, error: `Template "${templateName}" not found in Meta` }
    }

    // Extract variable names from template components
    const variables: string[] = []
    if (template.components) {
      for (const component of template.components) {
        if (component.type === 'BODY' && component.example?.body_text) {
          // Extract {{1}}, {{2}}, etc. from example
          const matches = component.example.body_text.match(/\{\{(\d+)\}\}/g)
          if (matches) {
            variables.push(...matches.map((m: string) => m.replace(/[{}]/g, '')))
          }
        }
      }
    }

    return { exists: true, variables }
  } catch (error: any) {
    return { exists: false, error: error.message }
  }
}

