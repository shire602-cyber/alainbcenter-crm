// AI message generation for automation
// Uses OpenAI if available, falls back to templates

type Lead = {
  id: number
  leadType: string | null
  status: string
  aiScore: number | null
  aiNotes: string | null
  expiryDate: Date | null
  contact: {
    fullName: string
    phone: string
    email: string | null
  }
}

/**
 * Generate an expiry reminder message using AI (NO TEMPLATES)
 */
export async function generateExpiryReminderMessage(
  lead: Lead,
  daysBefore: number
): Promise<string> {
  // CRITICAL: Always use AI generation - no templates
  try {
    const { generateAIAutoresponse } = await import('./aiMessaging')
    const { buildConversationContextFromLead } = await import('./ai/context')
    const { prisma } = await import('./prisma')
    
    // Load full lead with relations
    const fullLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })
    
    if (!fullLead) {
      throw new Error('Lead not found')
    }
    
    // Build conversation context
    const contextSummary = await buildConversationContextFromLead(lead.id, 'whatsapp')
    const conversationContext = contextSummary.structured
    
    // Create AI context for renewal reminder
    const aiContext = {
      lead: fullLead as any,
      contact: fullLead.contact,
      recentMessages: fullLead.messages.map(m => ({
        direction: m.direction as 'INBOUND' | 'OUTBOUND',
        body: m.body || '',
        createdAt: m.createdAt,
      })),
      mode: 'RENEWAL' as const,
      channel: 'WHATSAPP' as const,
      language: 'en' as const,
    }
    
    // Generate AI reply
    const aiResult = await generateAIAutoresponse(aiContext)
    
    if (aiResult.success && aiResult.text) {
      return aiResult.text
    } else {
      // Minimal fallback only if AI completely fails
      const { getGreeting } = require('./message-utils')
      const greeting = getGreeting(fullLead.contact, 'casual')
      return `${greeting}! 👋\n\nThis is Alain Business Center. Your ${lead.leadType || 'service'} expires in ${daysBefore} days. Please contact us to renew.`
    }
  } catch (error: any) {
    console.error(`❌ AI generation error for expiry reminder:`, error.message)
    // Minimal fallback only if AI completely fails
    const { getGreeting } = require('./message-utils')
    const greeting = getGreeting(lead.contact, 'casual')
    return `${greeting}! 👋\n\nThis is Alain Business Center. Your ${lead.leadType || 'service'} expires in ${daysBefore} days. Please contact us to renew.`
  }
}

/**
 * Generate a follow-up message using AI (NO TEMPLATES)
 */
export async function generateFollowUpMessage(
  lead: Lead,
  lastMessages: Array<{ channel: string; messageSnippet: string | null }>
): Promise<string> {
  // CRITICAL: Always use AI generation - no templates
  try {
    const { generateAIAutoresponse } = await import('./aiMessaging')
    const { buildConversationContextFromLead } = await import('./ai/context')
    const { prisma } = await import('./prisma')
    
    // Load full lead with relations
    const fullLead = await prisma.lead.findUnique({
      where: { id: lead.id },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    })
    
    if (!fullLead) {
      throw new Error('Lead not found')
    }
    
    // Build conversation context
    const contextSummary = await buildConversationContextFromLead(lead.id, 'whatsapp')
    const conversationContext = contextSummary.structured
    
    // Create AI context for follow-up
    const aiContext = {
      lead: fullLead as any,
      contact: fullLead.contact,
      recentMessages: [
        ...fullLead.messages.map(m => ({
          direction: m.direction as 'INBOUND' | 'OUTBOUND',
          body: m.body || '',
          createdAt: m.createdAt,
        })),
        ...lastMessages.map(m => ({
          direction: 'INBOUND' as const,
          body: m.messageSnippet || '',
          createdAt: new Date(),
        })),
      ],
      mode: 'FOLLOW_UP' as const,
      channel: 'WHATSAPP' as const,
      language: 'en' as const,
    }
    
    // Generate AI reply
    const aiResult = await generateAIAutoresponse(aiContext)
    
    if (aiResult.success && aiResult.text) {
      return aiResult.text
    } else {
      // Minimal fallback only if AI completely fails
      const { getGreetingName } = require('./message-utils')
      const contactName = getGreetingName(fullLead.contact) || 'there'
      return `Hello ${contactName}! 👋\n\nJust checking in about your ${lead.leadType || 'service'} enquiry. How can we help you move forward?`
    }
  } catch (error: any) {
    console.error(`❌ AI generation error for follow-up:`, error.message)
    // Minimal fallback only if AI completely fails
    const { getGreetingName } = require('./message-utils')
    const contactName = getGreetingName(lead.contact) || 'there'
    return `Hello ${contactName}! 👋\n\nJust checking in about your ${lead.leadType || 'service'} enquiry. How can we help you move forward?`
  }
}

// Template functions removed - ALL messages now use AI generation
// See generateExpiryReminderMessage and generateFollowUpMessage above

