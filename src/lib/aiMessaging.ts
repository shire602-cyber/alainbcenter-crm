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

    // Generate simple template-based reply (avoid HTTP call in serverless)
    // Check if this is first message
    const outboundCount = await prisma.message.count({
      where: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
      },
    })
    
    const isFirstMessage = outboundCount === 0
    const contactName = lead.contact?.fullName || 'there'
    
    let draftText = ''
    
    if (isFirstMessage && objective === 'qualify') {
      // First message - always greet and collect info
      draftText = `Hello! 👋 Welcome to Al Ain Business Center. I'm here to help you with UAE business setup and visa services.\n\nTo get started, could you please share:\n1. Your full name\n2. What service do you need? (e.g., Family Visa, Business Setup, Employment Visa)\n3. Your nationality\n\nI'll connect you with the right specialist!`
      console.log(`✅ First message greeting generated for lead ${lead.id}`)
    } else {
      // For follow-up messages, use simple template
      switch (objective) {
        case 'qualify':
          draftText = `Hi ${contactName}, thank you for your interest in our services. To better assist you, could you please share:\n\n1. What specific service are you looking for?\n2. What is your timeline?\n\nLooking forward to helping you!`
          break
        case 'followup':
          draftText = `Hi ${contactName}, I wanted to follow up on our previous conversation. How can we assist you further? Please let me know if you have any questions.`
          break
        case 'renewal':
          const nearestExpiry = lead.expiryDate
          if (nearestExpiry) {
            const daysUntil = Math.ceil((nearestExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            draftText = `Hi ${contactName}, I hope this message finds you well. I noticed that your service is expiring in ${daysUntil} days. Would you like to proceed with renewal? We can help you complete the process smoothly.`
          } else {
            draftText = `Hi ${contactName}, I wanted to check in regarding your upcoming renewals. Is there anything we can help you with?`
          }
          break
        default:
          draftText = `Hi ${contactName}, thank you for contacting Al Ain Business Center. How can I assist you today?`
      }
      console.log(`✅ Template reply generated for lead ${lead.id} (objective: ${objective})`)
    }

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
