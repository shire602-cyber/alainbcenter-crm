/**
 * AI Messaging Helper - THIN WRAPPER AROUND ORCHESTRATOR
 * 
 * ⚠️ DEPRECATED: This file is a thin wrapper around orchestrator.
 * All new code should call orchestrator directly.
 * This file exists only for backward compatibility.
 * 
 * CRITICAL: This file MUST NOT build prompts or call LLM directly.
 * It MUST route all calls to orchestrator.
 */

import { generateAIReply } from './ai/orchestrator'
import type { AIMessageContext } from './aiMessaging.types'

// Re-export for backward compatibility
export type { AIMessageContext } from './aiMessaging.types'

/**
 * Build WhatsApp template message for expiry reminders
 */
export function buildWhatsAppTemplateForExpiry(lead: any, daysBefore: number): string {
  const { getGreeting } = require('./message-utils')
  const greeting = getGreeting(lead.contact, 'casual')
  const expiryType = lead.leadType || 'service'
  const expiryDate = lead.expiryDate ? new Date(lead.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'soon'
  
  if (daysBefore === 7) {
    return `${greeting}, urgent reminder: Your ${expiryType} expires in 7 days (${expiryDate}). Please contact us immediately to renew. We're here to help!`
  } else if (daysBefore === 30) {
    return `${greeting}, your ${expiryType} expires in 30 days (${expiryDate}). Let's schedule your renewal to avoid any delays. Reply to this message to get started!`
  } else if (daysBefore === 60) {
    return `${greeting}, friendly reminder: Your ${expiryType} expires in 60 days (${expiryDate}). We can help you renew smoothly. Would you like to schedule a call?`
  } else {
    return `${greeting}, your ${expiryType} expires in ${daysBefore} days (${expiryDate}). We're here to assist with your renewal. Please let us know if you have any questions!`
  }
}

/**
 * Build email template for expiry reminders
 */
/**
 * Build email subject for expiry reminders
 */
export function buildEmailSubjectForExpiry(daysBefore: number, leadType: string): string {
  if (daysBefore === 7) {
    return `Urgent: Your ${leadType} expires in 7 days`
  } else if (daysBefore === 30) {
    return `Reminder: Your ${leadType} expires in 30 days`
  } else if (daysBefore === 60) {
    return `Friendly reminder: Your ${leadType} expires in 60 days`
  } else {
    return `Reminder: Your ${leadType} expires in ${daysBefore} days`
  }
}

export function buildEmailTemplateForExpiry(lead: any, daysBefore: number): string {
  const { getGreeting } = require('./message-utils')
  const greeting = getGreeting(lead.contact, 'formal')
  const expiryType = lead.leadType || 'service'
  const expiryDate = lead.expiryDate ? new Date(lead.expiryDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'soon'
  
  return `${greeting},

This is a reminder that your ${expiryType} expires in ${daysBefore} days (${expiryDate}).

To ensure a smooth renewal process, we recommend starting the renewal procedure as soon as possible.

Please contact us if you have any questions or would like to schedule a consultation.

Best regards,
Alain Business Center`
}

/**
 * Generate AI reply - WRAPPER AROUND ORCHESTRATOR
 * 
 * ⚠️ DEPRECATED: Use orchestrator.generateAIReply() directly
 */
export async function generateAIAutoresponse(
  context: AIMessageContext,
  agent?: import('./ai/agentProfile').AgentProfile,
  retrievalResult?: any
): Promise<{
  text: string
  success: boolean
  error?: string
  confidence?: number
}> {
  console.warn(`[DEPRECATED] generateAIAutoresponse called - routing to orchestrator`)
  
  const { lead, contact, channel, language = 'en' } = context
  
  if (!lead || !contact) {
    return {
      text: '',
      success: false,
      error: 'Lead or contact missing',
    }
  }
  
  // Find conversation
  const { prisma } = await import('./prisma')
  const { normalizeChannel } = await import('./utils/channelNormalize')
  
  const conversation = await prisma.conversation.findFirst({
    where: {
      contactId: contact.id,
      channel: normalizeChannel(channel),
    },
  })
  
  if (!conversation) {
    return {
      text: '',
      success: false,
      error: 'Conversation not found',
    }
  }
  
  // Get latest inbound message
  const latestMessage = await prisma.message.findFirst({
    where: {
      conversationId: conversation.id,
      direction: 'INBOUND',
    },
    orderBy: { createdAt: 'desc' },
  })
  
  if (!latestMessage) {
    return {
      text: '',
      success: false,
      error: 'No inbound message found',
    }
  }
  
  // Call orchestrator
  try {
    const result = await generateAIReply({
      conversationId: conversation.id,
      leadId: lead.id,
      contactId: contact.id,
      inboundText: latestMessage.body || '',
      inboundMessageId: latestMessage.id,
      channel: channel,
      language: language as 'en' | 'ar',
      agentProfileId: agent?.id || lead.aiAgentProfileId || undefined,
    })
    
    return {
      text: result.replyText,
      success: result.replyText.length > 0,
      confidence: result.confidence,
    }
  } catch (error: any) {
    return {
      text: '',
      success: false,
      error: error.message,
    }
  }
}

// Re-export types for backward compatibility
export type AIMessageMode = 'QUALIFY' | 'FOLLOW_UP' | 'REMINDER' | 'DOCS' | 'SUPPORT'
