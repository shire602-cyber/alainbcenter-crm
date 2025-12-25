/**
 * AI Agent Profile Helper
 * 
 * Functions to get and use AI agent profiles for leads
 */

import { prisma } from '../prisma'

export interface AgentProfile {
  id: number
  name: string
  description: string | null
  isActive: boolean
  isDefault: boolean
  trainingDocumentIds: number[] | null
  systemPrompt: string | null
  tone: 'professional' | 'friendly' | 'short'
  maxMessageLength: number
  maxTotalLength: number
  maxQuestionsPerMessage: number
  allowedPhrases: string[] | null
  prohibitedPhrases: string[] | null
  customGreeting: string | null
  customSignoff: string | null
  responseDelayMin: number
  responseDelayMax: number
  rateLimitMinutes: number
  businessHoursStart: string
  businessHoursEnd: string
  timezone: string
  allowOutsideHours: boolean
  firstMessageImmediate: boolean
  similarityThreshold: number
  confidenceThreshold: number
  escalateToHumanRules: string[] | null
  skipAutoReplyRules: string[] | null
  defaultLanguage: 'en' | 'ar'
  autoDetectLanguage: boolean
}

/**
 * Get agent profile for a lead
 * Returns the lead's assigned agent, or the default agent if none assigned
 */
export async function getAgentProfileForLead(leadId: number): Promise<AgentProfile | null> {
  try {
    // Get lead with agent profile
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        aiAgentProfileId: true,
        aiAgentProfile: {
          select: {
            id: true,
            name: true,
            description: true,
            isActive: true,
            isDefault: true,
            trainingDocumentIds: true,
            systemPrompt: true,
            tone: true,
            maxMessageLength: true,
            maxTotalLength: true,
            maxQuestionsPerMessage: true,
            allowedPhrases: true,
            prohibitedPhrases: true,
            customGreeting: true,
            customSignoff: true,
            responseDelayMin: true,
            responseDelayMax: true,
            rateLimitMinutes: true,
            businessHoursStart: true,
            businessHoursEnd: true,
            timezone: true,
            allowOutsideHours: true,
            firstMessageImmediate: true,
            similarityThreshold: true,
            confidenceThreshold: true,
            escalateToHumanRules: true,
            skipAutoReplyRules: true,
            defaultLanguage: true,
            autoDetectLanguage: true,
          },
        },
      },
    })

    // If lead has an assigned agent and it's active, use it
    if (lead?.aiAgentProfile && lead.aiAgentProfile.isActive) {
      return parseAgentProfile(lead.aiAgentProfile)
    }

    // Otherwise, get the default agent
    const defaultAgent = await prisma.aIAgentProfile.findFirst({
      where: {
        isDefault: true,
        isActive: true,
      },
    })

    if (defaultAgent) {
      return parseAgentProfile(defaultAgent)
    }

    // If no default agent, get any active agent
    const anyAgent = await prisma.aIAgentProfile.findFirst({
      where: {
        isActive: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    return anyAgent ? parseAgentProfile(anyAgent) : null
  } catch (error: any) {
    console.error('Failed to get agent profile for lead:', error)
    return null
  }
}

/**
 * Parse agent profile from database format to typed format
 */
function parseAgentProfile(agent: any): AgentProfile {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    isActive: agent.isActive,
    isDefault: agent.isDefault,
    trainingDocumentIds: agent.trainingDocumentIds
      ? JSON.parse(agent.trainingDocumentIds)
      : null,
    systemPrompt: agent.systemPrompt,
    tone: agent.tone as 'professional' | 'friendly' | 'short',
    maxMessageLength: agent.maxMessageLength,
    maxTotalLength: agent.maxTotalLength,
    maxQuestionsPerMessage: agent.maxQuestionsPerMessage,
    allowedPhrases: agent.allowedPhrases
      ? JSON.parse(agent.allowedPhrases)
      : null,
    prohibitedPhrases: agent.prohibitedPhrases
      ? JSON.parse(agent.prohibitedPhrases)
      : null,
    customGreeting: agent.customGreeting,
    customSignoff: agent.customSignoff,
    responseDelayMin: agent.responseDelayMin,
    responseDelayMax: agent.responseDelayMax,
    rateLimitMinutes: agent.rateLimitMinutes,
    businessHoursStart: agent.businessHoursStart,
    businessHoursEnd: agent.businessHoursEnd,
    timezone: agent.timezone,
    allowOutsideHours: agent.allowOutsideHours,
    firstMessageImmediate: agent.firstMessageImmediate,
    similarityThreshold: agent.similarityThreshold,
    confidenceThreshold: agent.confidenceThreshold,
    escalateToHumanRules: agent.escalateToHumanRules
      ? JSON.parse(agent.escalateToHumanRules)
      : null,
    skipAutoReplyRules: agent.skipAutoReplyRules
      ? JSON.parse(agent.skipAutoReplyRules)
      : null,
    defaultLanguage: agent.defaultLanguage as 'en' | 'ar',
    autoDetectLanguage: agent.autoDetectLanguage,
  }
}

/**
 * Check if message matches any skip patterns
 */
export function matchesSkipPatterns(
  messageText: string,
  skipRules: string[] | null
): boolean {
  if (!skipRules || skipRules.length === 0) {
    return false
  }

  const lowerMessage = messageText.toLowerCase()
  return skipRules.some((pattern) => {
    try {
      // Try regex pattern
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1), 'i')
        return regex.test(messageText)
      }
      // Simple substring match
      return lowerMessage.includes(pattern.toLowerCase())
    } catch {
      // If regex fails, fall back to substring
      return lowerMessage.includes(pattern.toLowerCase())
    }
  })
}

/**
 * Check if message matches any escalate patterns
 */
export function matchesEscalatePatterns(
  messageText: string,
  escalateRules: string[] | null
): boolean {
  if (!escalateRules || escalateRules.length === 0) {
    return false
  }

  const lowerMessage = messageText.toLowerCase()
  return escalateRules.some((pattern) => {
    try {
      // Try regex pattern
      if (pattern.startsWith('/') && pattern.endsWith('/')) {
        const regex = new RegExp(pattern.slice(1, -1), 'i')
        return regex.test(messageText)
      }
      // Simple substring match
      return lowerMessage.includes(pattern.toLowerCase())
    } catch {
      // If regex fails, fall back to substring
      return lowerMessage.includes(pattern.toLowerCase())
    }
  })
}

/**
 * Check if current time is within business hours for agent
 */
export function isWithinBusinessHours(agent: AgentProfile): boolean {
  const now = new Date()
  const timezone = agent.timezone || 'Asia/Dubai'
  
  // Simple timezone offset calculation (for common timezones)
  const timezoneOffsets: Record<string, number> = {
    'Asia/Dubai': 4,
    'UTC': 0,
    'America/New_York': -5,
    'Europe/London': 1,
  }
  
  const offset = timezoneOffsets[timezone] || 4 // Default to Dubai
  const utcHour = now.getUTCHours()
  const utcMinutes = now.getUTCMinutes()
  const localHour = (utcHour + offset) % 24
  const localMinutes = utcMinutes
  const localTime = localHour * 60 + localMinutes // Total minutes in day
  
  // Parse business hours
  const [startHour, startMin] = agent.businessHoursStart.split(':').map(Number)
  const [endHour, endMin] = agent.businessHoursEnd.split(':').map(Number)
  const startTime = startHour * 60 + startMin
  const endTime = endHour * 60 + endMin
  
  return localTime >= startTime && localTime <= endTime
}

