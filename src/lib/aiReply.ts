import { Contact, Lead, CommunicationLog } from '@prisma/client'

type LeadWithRelations = Lead & {
  contact: Contact
  serviceType?: { name: string } | null
}

/**
 * Generate AI-powered reply for sales conversations
 * Business rules based on leadType/serviceType
 */
export async function generateAiReply(
  lead: LeadWithRelations,
  recentLogs: Array<{ channel: string; messageSnippet: string | null }>
): Promise<{
  message: string
  nextFollowUp: Date
  suggestedDocs: string[]
}> {
  const leadType = lead.serviceType?.name || lead.leadType || ''
  const leadTypeLower = leadType.toLowerCase()

  // Business rules for different service types
  let questions: string[] = []
  let context = ''

  // Business Setup
  if (leadTypeLower.includes('business') || leadTypeLower.includes('setup') || leadTypeLower.includes('company')) {
    questions = [
      '1. What type of business activity will you be doing?',
      '2. How many shareholders will be involved?',
      '3. How many visas do you need for employees?',
      '4. Which emirate do you prefer (Dubai, Abu Dhabi, etc.)?',
      '5. What is your budget range?',
      '6. What is your preferred timeline?',
    ]
    context = 'business setup service'
  }
  // Family Visa
  else if (leadTypeLower.includes('family') || leadTypeLower.includes('visa') && leadTypeLower.includes('family')) {
    questions = [
      '1. What is the sponsor\'s current visa status?',
      '2. What is the sponsor\'s monthly salary?',
      '3. What is your relationship to the sponsor?',
      '4. How many dependents need visas?',
      '5. Where are you currently located?',
      '6. How urgent is this application?',
    ]
    context = 'family visa service'
  }
  // Golden Visa
  else if (leadTypeLower.includes('golden') || leadTypeLower.includes('golden visa')) {
    questions = [
      '1. Which Golden Visa category are you applying for?',
      '2. What are your qualifications/credentials?',
      '3. What is your current salary/degree level?',
      '4. What is your timeline for application?',
      '5. Do you currently hold a UAE visa?',
    ]
    context = 'golden visa service'
  }
  // Employment/Freelance Visa
  else if (leadTypeLower.includes('employment') || leadTypeLower.includes('freelance') || leadTypeLower.includes('work')) {
    questions = [
      '1. What field/industry will you be working in?',
      '2. What is your nationality?',
      '3. Are you currently inside or outside UAE?',
      '4. What is your urgency level?',
      '5. Do you have an employer/sponsor ready?',
    ]
    context = 'employment visa service'
  }
  // Default - general qualification
  else {
    questions = [
      '1. What service are you interested in?',
      '2. What is your timeline?',
      '3. What is your current status in UAE?',
      '4. Do you have all required documents ready?',
    ]
    context = 'our services'
  }

  // Check recent logs to avoid asking already answered questions
  const recentMessages = recentLogs
    .map((log) => log.messageSnippet || '')
    .join(' ')
    .toLowerCase()

  // Filter out questions that might have been answered
  const relevantQuestions = questions.filter((q) => {
    const qKeywords = q.toLowerCase().split(' ').slice(2).join(' ') // Skip number and question mark
    return !recentMessages.includes(qKeywords.split(' ')[0])
  })

  // Use first 3-4 questions if many are still relevant
  const questionsToAsk = relevantQuestions.slice(0, 4)

  // Generate friendly WhatsApp-style message
  const contactName = lead.contact.fullName.split(' ')[0] // First name only
  const greeting = `Hi ${contactName}! 👋`
  const intro = `Thank you for your interest in our ${context}. To help you better, I'd like to ask a few questions:`
  const closing = `Please share the details, and I'll get back to you with the best solution! 🙏`

  let message = `${greeting}\n\n${intro}\n\n${questionsToAsk.join('\n')}\n\n${closing}`

  // Try OpenAI if available
  if (process.env.OPENAI_API_KEY) {
    try {
      const integration = await import('@/lib/prisma').then((m) =>
        m.prisma.integration.findUnique({ where: { name: 'openai' } })
      )

      if (integration?.isEnabled && integration.apiKey) {
        const tone = 'friendly' // Default tone for AI replies
        const openaiMessage = await generateWithOpenAI(lead, recentLogs, questionsToAsk, context, tone)
        if (openaiMessage) {
          message = openaiMessage
        }
      }
    } catch (error) {
      console.error('OpenAI generation failed, using template:', error)
    }
  }

  // Suggest next follow-up (2-3 days)
  const nextFollowUp = new Date()
  nextFollowUp.setDate(nextFollowUp.getDate() + 2)

  // Suggest required docs based on service type
  const suggestedDocs = getSuggestedDocs(leadTypeLower)

  return {
    message,
    nextFollowUp,
    suggestedDocs,
  }
}

async function generateWithOpenAI(
  lead: LeadWithRelations,
  recentLogs: Array<{ channel: string; messageSnippet: string | null }>,
  questions: string[],
  context: string,
  tone: string = 'friendly'
): Promise<string | null> {
  try {
    const toneInstruction = tone === 'professional' 
      ? 'Be professional and formal.' 
      : tone === 'friendly' 
      ? 'Be friendly and warm.' 
      : 'Be professional but warm.'
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a ${tone} sales representative for Alain Business Center in UAE. 
Generate short, conversational WhatsApp-style messages in English. 
Keep messages under 300 characters. Use emojis sparingly. ${toneInstruction}`,
          },
          {
            role: 'user',
            content: `Lead: ${lead.contact.fullName}
Service: ${context}
Recent conversation: ${recentLogs.map((l) => l.messageSnippet).join('\n')}

Generate a ${tone} follow-up message that includes these questions:
${questions.join('\n')}

Make it personal, concise, and WhatsApp-appropriate.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    })
 

    if (response.ok) {
      const data = await response.json()
      return data.choices[0]?.message?.content || null
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
  }
  return null
}

function getSuggestedDocs(leadType: string): string[] {
  if (leadType.includes('business') || leadType.includes('setup')) {
    return ['Passport copies', 'Visa copies', 'Trade license (if applicable)', 'Memorandum of Association']
  } else if (leadType.includes('family')) {
    return ['Sponsor passport', 'Sponsor visa', 'Salary certificate', 'Marriage certificate', 'Children birth certificates']
  } else if (leadType.includes('golden')) {
    return ['Passport', 'Qualifications certificates', 'Salary certificate', 'Bank statements']
  } else if (leadType.includes('employment') || leadType.includes('freelance')) {
    return ['Passport', 'Photo', 'Educational certificates', 'Previous visa (if any)']
  }
  return ['Passport', 'Photo', 'Current visa (if any)']
}

