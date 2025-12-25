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
    const lastMessage = messages[messages.length - 1]?.message || ''
    
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
    // FIRST MESSAGE - Always greet and collect basic info
    const agentName = agent?.name || 'an assistant'
    prompt += `\nThis is the FIRST message from the customer. Generate a friendly greeting that:
1. Welcomes them to Al Ain Business Center
2. Introduces yourself by name: "I'm ${agentName}" (use the agent name: ${agentName})
3. Asks for ONLY ${maxQuestions} piece${maxQuestions > 1 ? 's' : ''} of information:
   - Full name
   ${maxQuestions > 1 ? '- What service do you need? (examples: Family Visa, Business Setup, Visit Visa, etc. - NEVER mention Employment Visa)\n' : ''}
4. Keeps it SHORT (under ${maxMessageLength} characters, ideally ${Math.floor(maxMessageLength * 0.75)})
5. Uses friendly, warm tone
6. NEVER promises approvals or guarantees
7. NEVER mentions "Employment Visa" as an example
8. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}
${agent?.customGreeting ? `9. Use or adapt this greeting style: "${agent.customGreeting}"\n` : ''}

Example format: "Hello! 👋 Welcome to Al Ain Business Center. I'm ${agentName}. To help you, please share: 1) Your full name${maxQuestions > 1 ? ' 2) What service do you need? (e.g., Family Visa, Business Setup, Visit Visa)' : ''}"

CRITICAL: You MUST include your name "${agentName}" in the greeting. Reply only with the message text, no explanations or metadata.`
  } else {
    // FOLLOW-UP MESSAGE
    // Get the most recent inbound message (sort by createdAt desc, take first)
    const inboundMessages = messages
      .filter(m => m.direction === 'INBOUND' || m.direction === 'inbound')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const lastUserMessage = inboundMessages[0]?.message || ''
    
    // Check if documents are uploaded
    const hasDocuments = lead && lead.id ? await checkIfLeadHasDocuments(lead.id) : false
    
    const agentName = agent?.name || 'an assistant'
    prompt += `\nIMPORTANT: The user's latest message is: "${lastUserMessage}"
${hasDocuments ? '\nNOTE: The customer has uploaded documents. If they are asking about documents, acknowledge that you have received them.\n' : ''}

Generate a WhatsApp-ready reply that:
1. DIRECTLY responds to what the user just said - address their specific request/question/statement
2. If they mentioned a service (e.g., "visit visa", "family visa"), acknowledge it and provide relevant next steps
3. If they asked a question, answer it directly and briefly
4. If they asked about documents${hasDocuments ? ', acknowledge that documents have been received and are being reviewed' : ', let them know what documents are needed'}
5. If they provided information, acknowledge it and ask for the NEXT piece of information needed
6. Asks MAXIMUM ${maxQuestions} qualifying question${maxQuestions > 1 ? 's' : ''} if information is still missing (NOT ${maxQuestions + 2}-${maxQuestions + 4}, MAX ${maxQuestions})
7. Highlights urgency if expiry date is close
8. Includes a clear CTA (e.g., "Reply with your nationality", "Share your expiry date")
9. Keeps it SHORT (under ${maxMessageLength} characters, max ${maxTotalLength} total)
10. NEVER promises approvals, guarantees, or outcomes
11. Uses ${tone} tone
12. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}
13. Signs off with your name: "${agentName}" (e.g., "Best regards, ${agentName}" or "Thanks, ${agentName}")
${agent?.customSignoff ? `14. End with or adapt this signoff style: "${agent.customSignoff}"\n` : ''}

CRITICAL: Do NOT send a generic message. Your reply MUST be specific to what the user just said. If they said "visit visa", respond about visit visas. If they said "I want visa", acknowledge their interest and ask which type of visa. Always include your name "${agentName}" in the signoff.

Reply only with the message text, no explanations or metadata.`
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

















