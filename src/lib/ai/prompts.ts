import { ConversationContext } from './context'

const COMPANY_IDENTITY = 'Al Ain Business Center – UAE business setup & visa services'

export function getSystemPrompt(): string {
  return `You are an AI assistant helping agents at ${COMPANY_IDENTITY} communicate with clients via WhatsApp.

Your role:
- Generate professional, compliant WhatsApp messages
- Help qualify leads by asking the right questions
- Never make legal promises or guarantees
- Keep messages concise (under 600 characters unless context requires more)
- Use UAE business context (visa services, business setup, renewals)
- Never request sensitive data (bank details, passwords, etc.)

Guidelines:
- Always be professional and helpful
- Ask 2-4 qualifying questions if information is missing:
  * Service needed (family visa, employment visa, freelance permit, business setup, renewal)
  * Nationality
  * Location (inside UAE or outside)
  * Urgency (expiry date or when they want to proceed)
- If expiry date is close (<30 days), highlight urgency
- Always include a clear call-to-action (CTA)
- Use simple, clear language
- For Arabic: Use Modern Standard Arabic with simple phrasing

Tone guidelines:
- Professional: Formal, structured, business-like
- Friendly: Warm, human, light emojis allowed (1-2 max)
- Short: One-liner + 2 key questions maximum`
}

export function buildDraftReplyPrompt(
  context: ConversationContext,
  tone: 'professional' | 'friendly' | 'short',
  language: 'en' | 'ar'
): string {
  const { contact, lead, messages } = context

  let prompt = `${getSystemPrompt()}

Generate a WhatsApp reply in ${language === 'ar' ? 'Arabic' : 'English'} with ${tone} tone.

Contact Information:
- Name: ${contact.name}
${contact.nationality ? `- Nationality: ${contact.nationality}` : ''}
${contact.email ? `- Email: ${contact.email}` : ''}
- Phone: ${contact.phone}

`

  if (lead) {
    prompt += `Lead Information:
- Service: ${lead.serviceType || lead.leadType || 'Not specified'}
- Status: ${lead.status}
- Pipeline Stage: ${lead.pipelineStage}
${lead.expiryDate ? `- Expiry Date: ${lead.expiryDate.toISOString().split('T')[0]} (URGENT if <30 days)` : ''}
${lead.nextFollowUpAt ? `- Next Follow-up: ${lead.nextFollowUpAt.toISOString().split('T')[0]}` : ''}
${lead.aiScore !== null ? `- AI Score: ${lead.aiScore}/100` : ''}
${lead.aiNotes ? `- AI Notes: ${lead.aiNotes}` : ''}

`
  } else {
    prompt += `No lead created yet - this is a new inquiry.\n\n`
  }

  prompt += `Recent Conversation (last ${messages.length} messages):\n`
  messages.slice(-5).forEach((msg, idx) => {
    prompt += `${idx + 1}. [${msg.direction.toUpperCase()}] ${msg.message.substring(0, 200)}\n`
  })

  prompt += `\nGenerate a WhatsApp-ready reply that:
1. Acknowledges the last message
2. Asks 2-4 qualifying questions if information is missing
3. Highlights urgency if expiry date is close
4. Includes a clear CTA (e.g., "Reply with 1/2/3" or "Share passport copy")
5. Keeps it under 600 characters
6. Uses ${tone} tone
7. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}

Reply only with the message text, no explanations or metadata.`

  return prompt
}

export function buildSummaryPrompt(context: ConversationContext): string {
  const { contact, lead, messages } = context

  let prompt = `${getSystemPrompt()}

Analyze this conversation and provide:
1. A short summary (3-6 bullet points)
2. Missing information checklist
3. Urgency assessment

Contact: ${contact.name}${contact.nationality ? ` (${contact.nationality})` : ''}
${lead ? `Lead: ${lead.serviceType || lead.leadType || 'Not specified'} - ${lead.status}` : 'No lead created yet'}

Recent Messages:
${messages.map((msg, idx) => `${idx + 1}. [${msg.direction}] ${msg.message.substring(0, 150)}`).join('\n')}

Provide your analysis in JSON format:
{
  "summary": ["bullet point 1", "bullet point 2", ...],
  "missingInfo": ["item 1", "item 2", ...],
  "urgency": "low|medium|high",
  "urgencyReason": "explanation"
}`

  return prompt
}

export function buildNextActionsPrompt(context: ConversationContext): string {
  const { contact, lead, messages } = context

  let prompt = `${getSystemPrompt()}

Based on this conversation, suggest the top 5 next actions for the agent.

Contact: ${contact.name}
${lead ? `Lead: ${lead.serviceType || lead.leadType || 'Not specified'} - ${lead.status}` : 'No lead created yet'}

Recent Messages:
${messages.map((msg, idx) => `${idx + 1}. [${msg.direction}] ${msg.message.substring(0, 150)}`).join('\n')}

Provide top 5 actions in JSON format:
{
  "actions": [
    {"action": "Request documents", "priority": "high|medium|low", "reason": "explanation"},
    ...
  ]
}`

  return prompt
}
/**
 * Build mode-specific draft prompt (FOLLOW_UP, RENEWAL, DOCS, PRICING)
 */
export function buildModeSpecificDraftPrompt(
  context: ConversationContext,
  mode: 'FOLLOW_UP' | 'RENEWAL' | 'DOCS' | 'PRICING' | 'REMIND' | 'BOOK_CALL',
  tone: 'professional' | 'friendly' | 'short' = 'friendly',
  language: 'en' | 'ar' = 'en'
): string {
  const { contact, lead, messages } = context

  let modeInstructions = ''
  switch (mode) {
    case 'FOLLOW_UP':
      modeInstructions = `Generate a FOLLOW-UP message that:
- Checks in on their progress or interest
- Offers to answer any questions
- Suggests next steps if they're ready
- Is warm and helpful, not pushy
- Includes a clear call-to-action`
      break
    case 'RENEWAL':
      modeInstructions = `Generate a RENEWAL message that:
- Highlights upcoming expiry dates (if any)
- Emphasizes the importance of timely renewal
- Offers assistance with the renewal process
- Creates urgency if expiry is within 30 days
- Includes renewal benefits or consequences of delay`
      break
    case 'DOCS':
      modeInstructions = `Generate a DOCUMENTS REQUEST message that:
- Clearly lists which documents are needed
- Explains why each document is required
- Provides easy submission instructions
- Offers help if they have questions
- Makes it simple to share documents (e.g., "Reply with photos" or "Upload here")`
      break
    case 'PRICING':
      modeInstructions = `Generate a PRICING INQUIRY message that:
- Acknowledges their interest in pricing
- Provides transparent pricing information (if available) or offers a consultation
- Highlights value and what's included
- Offers to customize based on their needs
- Includes a clear next step (e.g., "Schedule a call" or "Reply for detailed quote")`
      break
    case 'REMIND':
      modeInstructions = `Generate a REMINDER message that:
- Gently reminds them about an upcoming deadline, follow-up, or action item
- Creates appropriate urgency without being pushy
- Offers assistance if they need help
- Provides clear next steps
- Is friendly and supportive
`
      break
    case 'BOOK_CALL':
      modeInstructions = `Generate a CALL BOOKING message that:
- Invites them to schedule a call or consultation
- Highlights the benefits of speaking directly
- Makes it easy to book (e.g., "Reply with your preferred time" or "Click here to book")
- Suggests available time slots if possible
- Is warm and inviting, not salesy
`
      break
  }

  let prompt = `${getSystemPrompt()}

Generate a WhatsApp message in ${language === 'ar' ? 'Arabic' : 'English'} with ${tone} tone.

MODE: ${mode}
${modeInstructions}

Contact Information:
- Name: ${contact.name}
${contact.nationality ? `- Nationality: ${contact.nationality}` : ''}
${contact.email ? `- Email: ${contact.email}` : ''}
- Phone: ${contact.phone}

`

  if (lead) {
    prompt += `Lead Information:
- Service: ${lead.serviceType || lead.leadType || 'Not specified'}
- Status: ${lead.status}
- Pipeline Stage: ${lead.pipelineStage}
${lead.expiryDate ? `- Expiry Date: ${lead.expiryDate.toISOString().split('T')[0]} (URGENT if <30 days)` : ''}
${lead.nextFollowUpAt ? `- Next Follow-up: ${lead.nextFollowUpAt.toISOString().split('T')[0]}` : ''}
${lead.aiScore !== null ? `- AI Score: ${lead.aiScore}/100` : ''}
${lead.aiNotes ? `- AI Notes: ${lead.aiNotes}` : ''}

`
  } else {
    prompt += `No lead created yet - this is a new inquiry.\n\n`
  }

  prompt += `Recent Conversation (last ${messages.length} messages):\n`
  messages.slice(-5).forEach((msg, idx) => {
    prompt += `${idx + 1}. [${msg.direction.toUpperCase()}] ${msg.message.substring(0, 200)}\n`
  })

  prompt += `\nGenerate a WhatsApp-ready message that:
1. Follows the ${mode} mode instructions above
2. Is personalized to ${contact.name}
3. References recent conversation if relevant
4. Keeps it under 600 characters
5. Uses ${tone} tone
6. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}
7. Includes a clear call-to-action

Reply only with the message text, no explanations or metadata.`

  return prompt
}

















