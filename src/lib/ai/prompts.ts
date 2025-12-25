import { ConversationContext } from './context'
import { prisma } from '@/lib/prisma'

// Helper to check if lead has uploaded documents
async function checkIfLeadHasDocuments(leadId: number): Promise<boolean> {
  try {
    const docCount = await prisma.document.count({
      where: { leadId },
    })
    return docCount > 0
  } catch {
    return false
  }
}

const COMPANY_IDENTITY = 'Al Ain Business Center – UAE business setup & visa services'

export function getSystemPrompt(): string {
  return `You are an AI assistant helping agents at ${COMPANY_IDENTITY} communicate with clients via WhatsApp.

CRITICAL RULES (MUST FOLLOW):
1. NEVER promise approvals, guarantees, or outcomes (e.g., "you will get approved", "guaranteed", "definitely")
2. Keep replies SHORT (under 300 characters for first message, max 600 total)
3. Ask MAXIMUM 2 questions per message
4. Always include a clear next-step CTA (e.g., "Reply with your nationality", "Share your expiry date")
5. Detect language (EN/AR) and reply in the SAME language
6. Never request sensitive data (bank details, passwords, credit cards)

Your role:
- Generate professional, compliant WhatsApp messages
- Help qualify leads by asking the right questions
- Never make legal promises or guarantees
- Use UAE business context (visa services, business setup, renewals)

Guidelines:
- Always be professional and helpful
- Ask 1-2 qualifying questions maximum if information is missing:
  * Service needed (family visa, visit visa, freelance permit, business setup, renewal) - NEVER mention employment visa
  * Nationality
  * Location (inside UAE or outside)
  * Urgency (expiry date or when they want to proceed)
- If expiry date is close (<30 days), highlight urgency
- Use simple, clear language
- For Arabic: Use Modern Standard Arabic with simple phrasing

Tone guidelines:
- Professional: Formal, structured, business-like
- Friendly: Warm, human, light emojis allowed (1-2 max)
- Short: One-liner + 2 key questions maximum`
}

export async function buildDraftReplyPrompt(
  context: ConversationContext,
  tone: 'professional' | 'friendly' | 'short',
  language: 'en' | 'ar',
  agent?: import('../ai/agentProfile').AgentProfile
): Promise<string> {
  const { contact, lead, messages } = context

  // Load relevant training documents using vector search
  // Use agent's training documents if specified
  let trainingContext = ''
  try {
    const { searchTrainingDocuments } = await import('./vectorStore')
    // Get the actual latest message (messages are sorted chronologically, last one is latest)
    const lastMessage = messages.length > 0 ? messages[messages.length - 1]?.message || '' : ''
    
    if (lastMessage && lastMessage.trim().length > 0) {
      const similarityThreshold = agent?.similarityThreshold ?? 0.6
      const searchResults = await searchTrainingDocuments(lastMessage, {
        topK: 5,
        similarityThreshold,
        trainingDocumentIds: agent?.trainingDocumentIds || undefined,
      })
      
      if (searchResults.hasRelevantTraining && searchResults.documents.length > 0) {
        trainingContext = '\n\n--- AI TRAINING GUIDELINES ---\n'
        trainingContext += 'Use these guidelines when generating your response:\n\n'
        
        searchResults.documents.forEach((doc, idx) => {
          const similarity = searchResults.scores[idx] || 0
          // Defensive checks for metadata fields (should always exist per VectorDocument type, but safe to check)
          const docType = doc.metadata?.type || 'guidance'
          const docTitle = doc.metadata?.title || 'Untitled Document'
          trainingContext += `[${docType.toUpperCase()}] ${docTitle} (relevance: ${(similarity * 100).toFixed(0)}%):\n`
          trainingContext += `${doc.content.substring(0, 800)}\n\n`
        })
        
        trainingContext += '--- END TRAINING GUIDELINES ---\n\n'
        trainingContext += 'IMPORTANT: Follow the training guidelines above when crafting your response. '
        trainingContext += 'If the guidelines conflict with general instructions, prioritize the training guidelines.\n\n'
      }
    }
  } catch (error: any) {
    // Don't fail if training documents can't be loaded
    console.warn('Failed to load training documents for prompt:', error.message)
  }

  // Add agent-specific guidelines
  let agentGuidelines = ''
  if (agent) {
    if (agent.allowedPhrases && agent.allowedPhrases.length > 0) {
      agentGuidelines += `\n\nIMPORTANT - ALLOWED PHRASES/TOPICS:\n`
      agentGuidelines += `You MUST emphasize or use these phrases/topics when relevant:\n`
      agent.allowedPhrases.forEach(phrase => {
        agentGuidelines += `- ${phrase}\n`
      })
    }
    if (agent.prohibitedPhrases && agent.prohibitedPhrases.length > 0) {
      agentGuidelines += `\n\nIMPORTANT - PROHIBITED PHRASES/TOPICS:\n`
      agentGuidelines += `You MUST NEVER use these phrases or discuss these topics:\n`
      agent.prohibitedPhrases.forEach(phrase => {
        agentGuidelines += `- ${phrase}\n`
      })
    }
    if (agent.customGreeting) {
      agentGuidelines += `\n\nCUSTOM GREETING TEMPLATE:\n${agent.customGreeting}\n`
    }
    if (agent.customSignoff) {
      agentGuidelines += `\n\nCUSTOM SIGNOFF TEMPLATE:\n${agent.customSignoff}\n`
    }
  }

  let prompt = `${getSystemPrompt()}${trainingContext}${agentGuidelines}

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
    const messageText = (msg.message || '').substring(0, 200)
    prompt += `${idx + 1}. [${msg.direction.toUpperCase()}] ${messageText}\n`
  })

  // Check if this is first message (no outbound messages yet)
  const hasOutboundMessages = messages.some(m => m.direction === 'OUTBOUND' || m.direction === 'outbound')
  
  const maxMessageLength = agent?.maxMessageLength || 300
  const maxTotalLength = agent?.maxTotalLength || 600
  const maxQuestions = agent?.maxQuestionsPerMessage || 2

  if (!hasOutboundMessages) {
    // FIRST MESSAGE - Respond naturally to what the user said
    const agentName = agent?.name || 'an assistant'
    const lastUserMessage = messages.length > 0 
      ? messages[messages.length - 1]?.message || ''
      : ''
    
    prompt += `\n=== CRITICAL: FIRST MESSAGE REPLY ===
This is the FIRST message from the customer. Their message was: "${lastUserMessage}"

YOU MUST:
1. Respond DIRECTLY to what they said. If they said "HI" or "hello", greet them naturally. If they mentioned a service (like "family visa"), acknowledge it and respond about that service.
2. NEVER use a template or generic message like "Welcome to Al Ain Business Center. Please share: 1. Your full name 2. What service..."
3. NEVER ask for multiple pieces of information in a numbered list format
4. Your reply must be UNIQUE and based on their actual message: "${lastUserMessage}"
5. If they just said "HI" or "hello", respond with a friendly greeting and ask ONE simple question (not a numbered list)
6. If they mentioned a service, acknowledge it and ask ONE follow-up question about that service
7. Keep it SHORT (under ${maxMessageLength} characters)
8. Use friendly, warm tone
9. NEVER promises approvals or guarantees
10. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}
11. Sign off with your name: "${agentName}"

CRITICAL: Your reply must be SPECIFIC to "${lastUserMessage}". Do NOT use a generic template or numbered list of questions.

ABSOLUTELY FORBIDDEN PHRASES (NEVER USE):
- "Thank you for your interest in our services"
- "To better assist you, could you please share"
- "What specific service are you looking for"
- "What is your timeline"
- "Looking forward to helping you"
- Any numbered list format (1. 2. 3.)
- Any template-like structure

Example GOOD replies:
- If they said "HI": "Hello! 👋 I'm ${agentName} from Al Ain Business Center. How can I help you today?"
- If they said "family visa": "Great! I can help you with family visa services. What's your nationality?"
- If they said "visit visa": "I'd be happy to help with visit visa. Are you currently in the UAE?"
- If they said "jama family visa somalia": "I can help you with family visa for Somalia. What's your current situation?"

Example BAD replies (NEVER USE - THESE ARE TEMPLATES):
- "Hi Abdurahman Shire, thank you for your interest in our services. To better assist you, could you please share: 1. What specific service are you looking for? 2. What is your timeline? Looking forward to helping you!"
- "Welcome to Al Ain Business Center. Please share: 1. Your full name 2. What service..."
- "Hi, thank you for your interest. To help you, please provide: 1) Full name 2) Service needed..."

Reply only with the message text, no explanations or metadata.`
  } else {
    // FOLLOW-UP MESSAGE
    // Get the most recent inbound message - messages are sorted ascending, so last one is latest
    const allInboundMessages = messages.filter(m => m.direction === 'INBOUND' || m.direction === 'inbound' || m.direction === 'IN')
    const lastUserMessage = allInboundMessages.length > 0 
      ? allInboundMessages[allInboundMessages.length - 1]?.message || ''
      : messages[messages.length - 1]?.message || '' // Fallback to last message if no inbound found
    
    // Check if documents are uploaded
    const hasDocuments = lead && lead.id ? await checkIfLeadHasDocuments(lead.id) : false
    
    const agentName = agent?.name || 'an assistant'
    
    // Build a very explicit instruction
    prompt += `\n\n=== CRITICAL INSTRUCTIONS ===
The user's LATEST message (most recent) is: "${lastUserMessage}"

YOU MUST:
1. Start your reply by DIRECTLY acknowledging what they just said. Your FIRST sentence must respond to: "${lastUserMessage}"
   - If they said "visit visa" → "Great! I can help you with visit visa services."
   - If they said "how much visit visa?" → "For visit visa pricing, I need a few details..."
   - If they said "hello" or "HI" → "Hello! How can I assist you today?"
   - If they said "jama family visa somalia" → "I can help you with family visa for Somalia. What's your current situation?"

2. NEVER send a generic message like "Hi, thank you for your interest. Please share: 1. What service... 2. Timeline..."
   This is WRONG and REPETITIVE. Your reply MUST be unique and based on what they just said.

3. ABSOLUTELY FORBIDDEN - NEVER use these phrases:
   - "Thank you for your interest in our services"
   - "To better assist you, could you please share"
   - "What specific service are you looking for"
   - "What is your timeline"
   - "Looking forward to helping you"
   - Any numbered list format (1. 2. 3.)

4. CRITICAL: Your reply must be DIFFERENT from previous messages. Check the conversation history above - do NOT repeat the same questions or use saved templates.

5. NEVER use saved messages or templates. Every reply must be freshly generated based on the current conversation and the latest inbound message.

5. If they already mentioned a service (like "family visa" or "visit visa"), acknowledge it SPECIFICALLY and ask for the NEXT specific piece of information needed for that service.

6. Always sign off with your name: "${agentName}"
   Example: "Best regards, ${agentName}" or "Thanks, ${agentName}"

${hasDocuments ? '7. NOTE: Documents have been uploaded. If they ask about documents, acknowledge receipt.\n' : ''}
=== END CRITICAL INSTRUCTIONS ===\n\n

Generate a WhatsApp-ready reply that:
1. STARTS by directly acknowledging their latest message: "${lastUserMessage}" - Your first sentence MUST respond to this
2. If they mentioned a service (like "family visa", "visit visa"), acknowledge it SPECIFICALLY and respond about that service
3. If they asked a question (like "how much?"), answer it directly or explain what info you need to provide pricing
4. If they provided information, acknowledge it and ask for the NEXT specific piece needed (not a numbered list)
5. Asks MAXIMUM ${maxQuestions} qualifying question${maxQuestions > 1 ? 's' : ''} if information is still missing (but NOT as a numbered list)
6. Keeps it SHORT (under ${maxMessageLength} characters)
7. NEVER promises approvals or guarantees
8. Uses ${tone} tone
9. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}
10. MUST end with: "Best regards, ${agentName}" or similar with your name

CRITICAL REMINDER: Your reply must be SPECIFIC to "${lastUserMessage}". Do NOT use a generic template or numbered list format.`

    if (agent?.customSignoff) {
      prompt += `\n\nCustom signoff style: "${agent.customSignoff}"`
    }
    
    prompt += `\n\nReply ONLY with the message text, no explanations or metadata.`
  }

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
${messages.map((msg, idx) => `${idx + 1}. [${msg.direction}] ${(msg.message || '').substring(0, 150)}`).join('\n')}

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
${messages.map((msg, idx) => `${idx + 1}. [${msg.direction}] ${(msg.message || '').substring(0, 150)}`).join('\n')}

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
    const messageText = (msg.message || '').substring(0, 200)
    prompt += `${idx + 1}. [${msg.direction.toUpperCase()}] ${messageText}\n`
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

















