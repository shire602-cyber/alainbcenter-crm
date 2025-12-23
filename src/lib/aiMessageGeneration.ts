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
 * Generate an expiry reminder message using AI or templates
 */
export async function generateExpiryReminderMessage(
  lead: Lead,
  daysBefore: number
): Promise<string> {
  // Try OpenAI if available
  if (process.env.OPENAI_API_KEY) {
    try {
      // TODO: Uncomment when OpenAI package is installed
      // const OpenAI = require('openai')
      // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      // 
      // const completion = await openai.chat.completions.create({
      //   model: "gpt-4",
      //   messages: [
      //     {
      //       role: "system",
      //       content: "You are a professional customer service representative for Alain Business Center in Dubai. Write friendly, professional WhatsApp messages in Arabic/English for clients whose visas or licenses are expiring. Keep messages concise and actionable."
      //     },
      //     {
      //       role: "user",
      //       content: `Generate a WhatsApp reminder for ${lead.contact.fullName}. Their ${lead.leadType || 'service'} expires in ${daysBefore} days. Make it friendly and professional.`
      //     }
      //   ],
      //   max_tokens: 200,
      // })
      // 
      // return completion.choices[0].message.content || generateTemplateExpiryMessage(lead, daysBefore)
      
      // For now, fall through to template
    } catch (error) {
      console.warn('OpenAI API error, using template:', error)
    }
  }

  // Fallback to template
  return generateTemplateExpiryMessage(lead, daysBefore)
}

/**
 * Generate a follow-up message using AI or templates
 */
export async function generateFollowUpMessage(
  lead: Lead,
  lastMessages: Array<{ channel: string; messageSnippet: string | null }>
): Promise<string> {
  // Try OpenAI if available
  if (process.env.OPENAI_API_KEY) {
    try {
      // TODO: Uncomment when OpenAI package is installed
      // const OpenAI = require('openai')
      // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      // 
      // const context = lastMessages.map(m => `${m.channel}: ${m.messageSnippet}`).join('\n')
      // 
      // const completion = await openai.chat.completions.create({
      //   model: "gpt-4",
      //   messages: [
      //     {
      //       role: "system",
      //       content: "You are a professional customer service representative for Alain Business Center in Dubai. Write short, friendly WhatsApp follow-up messages. Keep it conversational and helpful."
      //     },
      //     {
      //       role: "user",
      //       content: `Generate a friendly follow-up message for ${lead.contact.fullName}. Lead status: ${lead.status}. Service: ${lead.leadType || 'N/A'}. Recent context: ${context}`
      //     }
      //   ],
      //   max_tokens: 150,
      // })
      // 
      // return completion.choices[0].message.content || generateTemplateFollowUpMessage(lead)
      
      // For now, fall through to template
    } catch (error) {
      console.warn('OpenAI API error, using template:', error)
    }
  }

  // Fallback to template
  return generateTemplateFollowUpMessage(lead)
}

/**
 * Template-based expiry reminder (fallback when OpenAI is not available)
 */
function generateTemplateExpiryMessage(lead: Lead, daysBefore: number): string {
  // Use helper to get proper greeting (never "Unknown WHATSAPP User")
  const { getGreeting } = require('./message-utils')
  const greeting = getGreeting(lead.contact, 'casual')
  const serviceName = lead.leadType 
    ? lead.leadType.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    : 'service'

  if (daysBefore === 90) {
    return `${greeting === 'Hello there' ? 'Assalamu Alaikum' : greeting}! 👋

This is Alain Business Center. Your ${serviceName} is expiring in approximately 90 days.

We'd love to help you renew smoothly. Would you like to schedule a consultation?

Reply with YES to continue, or call us at +971-XXX-XXXX.

Best regards,
Alain Business Center Team`
  }

  if (daysBefore === 30) {
    return `${greeting}, 

URGENT: Your ${serviceName} expires in 30 days. 

To avoid any interruptions, please renew soon. We can help make the process quick and easy.

Reply to this message or call +971-XXX-XXXX.

Alain Business Center`
  }

  return `${greeting}, 

This is Alain Business Center. Your ${serviceName} is expiring in ${daysBefore} days.

Please contact us to renew: +971-XXX-XXXX

Best regards,
Alain Business Center Team`
}

/**
 * Template-based follow-up message (fallback when OpenAI is not available)
 */
function generateTemplateFollowUpMessage(lead: Lead): string {
  // Use helper to get proper greeting name (never "Unknown WHATSAPP User")
  const { getGreetingName } = require('./message-utils')
  const contactName = getGreetingName(lead.contact) || 'there'
  const serviceName = lead.leadType 
    ? lead.leadType.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase())
    : 'service'

  if (lead.status === 'new') {
    return `Hello ${contactName}! 👋

Just checking in about your ${serviceName} enquiry with Alain Business Center.

How can we help you move forward? Reply to this message or call +971-XXX-XXXX.

Best regards,
Alain Business Center`
  }

  if (lead.status === 'contacted') {
    return `Hi ${contactName},

Following up on our conversation about ${serviceName}.

Any questions or would you like to proceed? We're here to help!

Alain Business Center`
  }

  return `Hello ${contactName},

This is Alain Business Center. We wanted to follow up on your ${serviceName} enquiry.

How can we assist you today?

Best regards,
Alain Business Center Team`
}

