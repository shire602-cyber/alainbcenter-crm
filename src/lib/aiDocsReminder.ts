/**
 * AI-Powered Document Reminder Generator
 * 
 * Generates professional, compliant document reminder messages
 * for WhatsApp/Email based on lead's compliance status
 */

import { prisma } from './prisma'
import { getLeadComplianceStatus } from './compliance'

export interface DocsReminderOptions {
  leadId: number
  channel: 'WHATSAPP' | 'EMAIL'
}

/**
 * Generate AI-powered document reminder message
 * 
 * Uses compliance status to build a structured prompt for OpenAI
 * that generates a professional, clear reminder message
 */
export async function generateDocsReminderMessage(
  options: DocsReminderOptions
): Promise<string> {
  const { leadId, channel } = options

  // Load lead with contact info
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      contact: true,
      serviceType: true,
    },
  })

  if (!lead) {
    throw new Error('Lead not found')
  }

  // Get compliance status
  const compliance = await getLeadComplianceStatus(leadId)

  // Build context for AI
  const contactName = lead.contact?.fullName || 'Valued Client'
  const serviceType = lead.serviceTypeEnum || lead.serviceType?.name || 'service'

  // Build prompt
  const prompt = `You are a professional assistant for Alain Business Center, a UAE business setup and visa services company.

Generate a ${channel === 'WHATSAPP' ? 'concise, friendly WhatsApp message' : 'professional email'} requesting missing documents from a client.

Client: ${contactName}
Service: ${serviceType}

Compliance Status:
${compliance.status === 'CRITICAL' ? '⚠️ CRITICAL: ' : compliance.status === 'WARNING' ? '⚠️ WARNING: ' : ''}${compliance.notes}

${compliance.missingMandatory.length > 0 ? `Missing Mandatory Documents:\n${compliance.missingMandatory.map((doc, i) => `  ${i + 1}. ${doc}`).join('\n')}\n` : ''}
${compliance.expired.length > 0 ? `Expired Documents (need renewal):\n${compliance.expired.map((doc, i) => `  ${i + 1}. ${doc}`).join('\n')}\n` : ''}
${compliance.expiringSoon.length > 0 ? `Documents Expiring Soon:\n${compliance.expiringSoon.map((doc, i) => `  ${i + 1}. ${doc}`).join('\n')}\n` : ''}

Requirements:
- Tone: Professional, warm, respectful (UAE business culture)
- ${channel === 'WHATSAPP' ? 'Keep it concise (2-3 short paragraphs max)' : 'Email format with clear subject line suggestion'}
- DO NOT promise guaranteed visa approvals or 100% success rates
- Use phrases like "we can assist you", "we can help you process", "to proceed with your application"
- Include a clear call-to-action (e.g., "Please share these documents at your earliest convenience")
- ${channel === 'WHATSAPP' ? 'Use emojis sparingly (1-2 max)' : 'No emojis in email'}
- Be specific about which documents are needed
- If documents are expiring, mention the urgency but remain professional

Generate the message now:`

  try {
    // Call OpenAI API
    const aiConfig = await import('./ai/client').then(m => m.getAIConfig())
    if (!aiConfig) {
      // Fallback to template-based message if AI not configured
      return generateFallbackReminder(lead, compliance, channel)
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model || 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional assistant for a UAE business center. Generate clear, compliant document request messages. Never promise guaranteed approvals.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: channel === 'WHATSAPP' ? 300 : 500,
      }),
    })

    if (!response.ok) {
      throw new Error('AI API call failed')
    }

    const data = await response.json()
    const message = data.choices[0]?.message?.content || ''

    if (!message.trim()) {
      throw new Error('AI returned empty message')
    }

    return message.trim()
  } catch (error) {
    console.warn('AI docs reminder generation failed, using fallback:', error)
    return generateFallbackReminder(lead, compliance, channel)
  }
}

/**
 * Fallback template-based reminder (no AI required)
 */
function generateFallbackReminder(
  lead: any,
  compliance: any,
  channel: 'WHATSAPP' | 'EMAIL'
): string {
  const contactName = lead.contact?.fullName || 'Valued Client'
  const serviceType = lead.serviceTypeEnum || lead.serviceType?.name || 'service'

  let message = ''

  if (channel === 'WHATSAPP') {
    message = `Hello ${contactName.split(' ')[0] || 'there'}! 👋\n\n`
    message += `We hope you're doing well. To proceed with your ${serviceType} application, we need the following documents:\n\n`

    if (compliance.missingMandatory.length > 0) {
      message += `📋 Required Documents:\n`
      compliance.missingMandatory.forEach((doc: string, i: number) => {
        message += `${i + 1}. ${doc}\n`
      })
      message += '\n'
    }

    if (compliance.expired.length > 0) {
      message += `⚠️ Documents that need renewal:\n`
      compliance.expired.forEach((doc: string, i: number) => {
        message += `${i + 1}. ${doc}\n`
      })
      message += '\n'
    }

    if (compliance.expiringSoon.length > 0) {
      message += `⏰ Documents expiring soon:\n`
      compliance.expiringSoon.forEach((doc: string, i: number) => {
        message += `${i + 1}. ${doc}\n`
      })
      message += '\n'
    }

    message += `Please share these documents at your earliest convenience so we can assist you with your application.\n\n`
    message += `Thank you! 🙏`
  } else {
    // Email format
    message = `Subject: Document Request - ${serviceType} Application\n\n`
    message += `Dear ${contactName},\n\n`
    message += `I hope this message finds you well.\n\n`
    message += `To proceed with your ${serviceType} application, we require the following documents:\n\n`

    if (compliance.missingMandatory.length > 0) {
      message += `Required Documents:\n`
      compliance.missingMandatory.forEach((doc: string, i: number) => {
        message += `${i + 1}. ${doc}\n`
      })
      message += '\n'
    }

    if (compliance.expired.length > 0) {
      message += `Documents Requiring Renewal:\n`
      compliance.expired.forEach((doc: string, i: number) => {
        message += `${i + 1}. ${doc}\n`
      })
      message += '\n'
    }

    if (compliance.expiringSoon.length > 0) {
      message += `Documents Expiring Soon:\n`
      compliance.expiringSoon.forEach((doc: string, i: number) => {
        message += `${i + 1}. ${doc}\n`
      })
      message += '\n'
    }

    message += `Please provide these documents at your earliest convenience so we can assist you with processing your application.\n\n`
    message += `If you have any questions, please don't hesitate to reach out.\n\n`
    message += `Best regards,\nAlain Business Center`
  }

  return message
}
