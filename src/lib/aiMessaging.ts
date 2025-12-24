/**
 * AI Messaging Helper
 * Generates AI-powered replies for automation
 */

import { prisma } from './prisma'

/**
 * Build WhatsApp template message for expiry reminders
 */
export function buildWhatsAppTemplateForExpiry(lead: any, daysBefore: number): string {
  // Use helper to get proper greeting (never "Unknown WHATSAPP User")
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
export function buildEmailTemplateForExpiry(lead: any, daysBefore: number): string {
  // Use helper to get proper greeting (never "Unknown WHATSAPP User")
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
 * Build email subject for expiry reminders
 */
export function buildEmailSubjectForExpiry(daysBefore: number, serviceType: string): string {
  if (daysBefore === 7) {
    return `URGENT: ${serviceType} Renewal - Expires in 7 Days`
  } else if (daysBefore === 30) {
    return `Action Required: ${serviceType} Renewal - 30 Days Remaining`
  } else {
    return `Reminder: ${serviceType} Renewal - ${daysBefore} Days Remaining`
  }
}

export type AIMessageMode = 'FOLLOW_UP' | 'QUALIFY' | 'RENEWAL' | 'GENERIC' | 'PRICING' | 'DOCS' | 'REMIND' | 'BOOK_CALL'

export interface AIMessageContext {
  lead: any
  contact: any
  recentMessages?: any[]
  mode: AIMessageMode
  channel: 'WHATSAPP' | 'EMAIL' | 'INSTAGRAM' | 'FACEBOOK' | 'WEBCHAT'
}

/**
 * Generate AI reply text for automation
 */
export async function generateAIAutoresponse(
  context: AIMessageContext
): Promise<{
  text: string
  success: boolean
  error?: string
  confidence?: number // Phase 4: AI confidence score (0-100)
}> {
  try {
    const { lead, contact, recentMessages = [], mode, channel } = context

    // Handle DOCS mode specially - use docs reminder helper
    if (mode === 'DOCS') {
      try {
        const { generateDocsReminderMessage } = await import('./aiDocsReminder')
        const reminderText = await generateDocsReminderMessage({
          leadId: lead.id,
          channel: channel === 'EMAIL' ? 'EMAIL' : 'WHATSAPP',
        })
        return {
          text: reminderText,
          success: true,
        }
      } catch (error: any) {
        console.warn('DOCS mode - failed to generate docs reminder, falling back to draft-reply:', error)
        // Fall through to use draft-reply endpoint
      }
    }

    // Map mode to objective for AI draft endpoint
    const objectiveMap: Record<AIMessageMode, string> = {
      FOLLOW_UP: 'followup',
      QUALIFY: 'qualify',
      RENEWAL: 'renewal',
      PRICING: 'pricing',
      DOCS: 'docs_request',
      REMIND: 'remind',
      BOOK_CALL: 'book_call',
      GENERIC: 'followup',
    }

    const objective = objectiveMap[mode] || 'followup'

    // Get conversation ID
    const conversation = await prisma.conversation.findFirst({
      where: {
        contactId: contact.id,
        channel: channel.toLowerCase(),
        leadId: lead.id,
      },
      orderBy: { lastMessageAt: 'desc' },
    })

    if (!conversation) {
      return {
        text: '',
        success: false,
        error: 'No conversation found',
      }
    }

    // Call AI draft endpoint (internal HTTP call)
    // Use CRON_SECRET for authentication if available, otherwise will require session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const cronSecret = process.env.CRON_SECRET

    const response = await fetch(`${baseUrl}/api/ai/draft-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cronSecret ? { 'x-cron-secret': cronSecret } : {}),
      },
      body: JSON.stringify({
        conversationId: conversation.id,
        leadId: lead.id,
        objective,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      let error: any
      try {
        error = JSON.parse(errorText)
      } catch {
        error = { error: errorText }
      }
      console.error(`❌ AI draft endpoint failed: ${response.status} - ${error.error || errorText}`)
      return {
        text: '',
        success: false,
        error: error.error || errorText || 'Failed to generate AI reply',
      }
    }

    const data = await response.json()
    const draftText = data.draftText || data.draft || ''
    console.log(`✅ AI draft generated: ${draftText.substring(0, 100)}...`)

    if (!draftText || draftText.trim().length === 0) {
      return {
        text: '',
        success: false,
        error: 'AI returned empty draft',
      }
    }

    // Truncate for WhatsApp (max 1000 chars recommended)
    const maxLength = channel === 'WHATSAPP' ? 1000 : 5000
    const truncatedText = draftText.length > maxLength
      ? draftText.substring(0, maxLength - 3) + '...'
      : draftText

    // Phase 4: Estimate confidence based on message quality and context
    let confidence = 75 // Default confidence
    if (!lead || !lead.serviceType) {
      confidence -= 10 // Lower confidence if lead info missing
    }
    if (recentMessages.length === 0) {
      confidence -= 5 // Lower confidence if no conversation history
    }
    if (truncatedText.length < 50) {
      confidence -= 15 // Lower confidence if message is too short
    }
    if (truncatedText.length > 600) {
      confidence -= 10 // Lower confidence if message is too long
    }
    // Higher confidence if lead is qualified
    if (lead.aiScore && lead.aiScore >= 70) {
      confidence += 10
    }
    
    return {
      text: truncatedText.trim(),
      success: true,
      confidence: Math.max(0, Math.min(100, confidence)), // Clamp between 0-100
    }
  } catch (error: any) {
    console.error('Error generating AI autoresponse:', error)
    return {
      text: '',
      success: false,
      error: error.message || 'Failed to generate AI reply',
      confidence: 0, // No confidence on error
    }
  }
}
