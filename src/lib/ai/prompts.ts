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

CRITICAL ANTI-HALLUCINATION RULES (MUST FOLLOW):
1. ONLY use information EXPLICITLY stated in the conversation - NEVER make up or assume information
2. If the user said "Nigeria", they are Nigerian - do NOT say they mentioned "Kenyan" or any other nationality
3. Read the conversation history CAREFULLY - use ONLY what was actually said
4. If information is missing, say "I need to know..." instead of guessing
5. NEVER contradict what the user already told you

CRITICAL ANTI-REPETITION RULES (MUST FOLLOW):
1. Check what information was ALREADY provided in the conversation
2. DO NOT ask for information that was already mentioned
3. If nationality was already stated, DO NOT ask "what's your nationality?" again
4. If service was already mentioned, DO NOT ask "what service?" again
5. Read ALL previous messages before asking questions

CRITICAL RULES (MUST FOLLOW - VIOLATIONS WILL CAUSE MESSAGE REJECTION):
1. 🚨 TRAINING DOCUMENTS ARE MANDATORY: If training documents are provided, you MUST use them to answer questions about pricing, services, requirements, and procedures. DO NOT make up information.
2. NEVER promise approvals, guarantees, or outcomes (e.g., "you will get approved", "guaranteed", "definitely")
3. Keep replies SHORT (under 300 characters for first message, max 600 total)
4. Ask MAXIMUM 2 questions per message
5. Always include a clear next-step CTA (e.g., "Reply with your nationality", "Share your expiry date")
6. Detect language (EN/AR) and reply in the SAME language
7. Never request sensitive data (bank details, passwords, credit cards)
8. If user asks "how much" or "price" - USE PRICING FROM TRAINING DOCUMENTS, do not say "I need more info" if pricing is in training docs

ABSOLUTELY FORBIDDEN PHRASES (YOUR MESSAGE WILL BE REJECTED IF IT CONTAINS THESE):
- "Thank you for your interest in our services"
- "To better assist you"
- "could you please share"
- "What specific service are you looking for"
- "What is your timeline"
- "Looking forward to helping you"
- Any numbered list format (1. 2. 3.)
- Any template-like structure

YOUR REPLY MUST BE:
- Unique and based on what the user actually said
- Natural and conversational (not robotic)
- Direct response to their message
- NO generic templates or saved messages

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
  agent?: import('../ai/agentProfile').AgentProfile,
  currentMessageText?: string, // Optional: current inbound message text for better training doc retrieval
  preRetrievedDocs?: any // Optional: pre-retrieved training documents
): Promise<string> {
  const { contact, lead, messages } = context

  // Load relevant training documents using vector search
  // Use agent's training documents if specified
  let trainingContext = ''
  try {
    const { searchTrainingDocuments } = await import('./vectorStore')
    // CRITICAL: Use current message text if provided (for pricing queries), otherwise use last message
    const queryText = currentMessageText || (messages.length > 0 ? messages[messages.length - 1]?.message || '' : '')
    
    if (queryText && queryText.trim().length > 0) {
      // Use pre-retrieved documents if available (from autoReply.ts), otherwise retrieve now
      let searchResults: any = null
      
      if (preRetrievedDocs && preRetrievedDocs.relevantDocuments && preRetrievedDocs.relevantDocuments.length > 0) {
        // Use pre-retrieved documents
        console.log(`📚 [TRAINING] Using pre-retrieved training documents: ${preRetrievedDocs.relevantDocuments.length} documents`)
        searchResults = {
          hasRelevantTraining: true,
          documents: preRetrievedDocs.relevantDocuments.map((doc: any) => ({
            content: doc.content,
            metadata: { type: doc.type, title: doc.title },
          })),
          scores: preRetrievedDocs.relevantDocuments.map((doc: any) => doc.similarity || 0.7),
        }
      } else {
        // Retrieve training documents now
        const similarityThreshold = agent?.similarityThreshold ?? 0.5
        searchResults = await searchTrainingDocuments(queryText, {
        topK: 5,
        similarityThreshold,
        trainingDocumentIds: agent?.trainingDocumentIds || undefined,
      })
      }
      
      if (searchResults.hasRelevantTraining && searchResults.documents.length > 0) {
        trainingContext = '\n\n=== ⚠️ CRITICAL: TRAINING DOCUMENTS - MANDATORY TO FOLLOW ===\n'
        trainingContext += '🚨 YOU MUST USE THE INFORMATION BELOW TO ANSWER THE USER. DO NOT IGNORE THIS.\n'
        trainingContext += '🚨 DO NOT MAKE UP INFORMATION. USE ONLY WHAT IS IN THE TRAINING DOCUMENTS BELOW.\n'
        trainingContext += '🚨 IF THE USER ASKS ABOUT PRICING, SERVICES, REQUIREMENTS, OR PROCEDURES, USE THE EXACT INFORMATION FROM BELOW.\n\n'
        
        searchResults.documents.forEach((doc: any, idx: number) => {
          const similarity = searchResults.scores[idx] || 0
          // Defensive checks for metadata fields (should always exist per VectorDocument type, but safe to check)
          const docType = doc.metadata?.type || 'guidance'
          const docTitle = doc.metadata?.title || 'Untitled Document'
          trainingContext += `[${docType.toUpperCase()}] ${docTitle} (relevance: ${(similarity * 100).toFixed(0)}%):\n`
          trainingContext += `${doc.content.substring(0, 1500)}\n\n` // Increased from 800 to 1500 to include more context
        })
        
        trainingContext += '=== END TRAINING DOCUMENTS ===\n\n'
        trainingContext += '🚨 CRITICAL RULES FOR USING TRAINING DOCUMENTS:\n'
        trainingContext += '1. If the user asks "how much" or "price" - USE THE PRICING INFORMATION FROM THE TRAINING DOCUMENTS ABOVE\n'
        trainingContext += '2. If the user asks about requirements - USE THE REQUIREMENTS FROM THE TRAINING DOCUMENTS ABOVE\n'
        trainingContext += '3. If the user asks about procedures - USE THE PROCEDURES FROM THE TRAINING DOCUMENTS ABOVE\n'
        trainingContext += '4. If the user asks about services - USE THE SERVICE INFORMATION FROM THE TRAINING DOCUMENTS ABOVE\n'
        trainingContext += '5. DO NOT make up pricing, requirements, or procedures - USE ONLY WHAT IS IN THE TRAINING DOCUMENTS\n'
        trainingContext += '6. If the training documents contain specific answers, USE THOSE ANSWERS - do not ask generic questions\n'
        trainingContext += '7. The training documents are YOUR PRIMARY SOURCE OF TRUTH - prioritize them over general knowledge\n'
        trainingContext += '8. If the training documents conflict with general instructions, ALWAYS prioritize the training documents\n\n'
      } else {
        // Even if no training documents found, try with lower threshold
        console.warn(`⚠️ No training documents found, trying with lower threshold 0.4`)
        try {
          const lowerThresholdResults = await searchTrainingDocuments(queryText, {
            topK: 5,
            similarityThreshold: 0.4, // Much lower threshold
            trainingDocumentIds: agent?.trainingDocumentIds || undefined,
          })
          
          if (lowerThresholdResults.hasRelevantTraining && lowerThresholdResults.documents.length > 0) {
            trainingContext = '\n\n=== ⚠️ CRITICAL: TRAINING DOCUMENTS - MANDATORY TO FOLLOW ===\n'
            trainingContext += '🚨 YOU MUST USE THE INFORMATION BELOW TO ANSWER THE USER. DO NOT IGNORE THIS.\n\n'
            
            lowerThresholdResults.documents.forEach((doc, idx) => {
              const similarity = lowerThresholdResults.scores[idx] || 0
              const docType = doc.metadata?.type || 'guidance'
              const docTitle = doc.metadata?.title || 'Untitled Document'
              trainingContext += `[${docType.toUpperCase()}] ${docTitle} (relevance: ${(similarity * 100).toFixed(0)}%):\n`
              trainingContext += `${doc.content.substring(0, 1500)}\n\n`
            })
            
            trainingContext += '=== END TRAINING DOCUMENTS ===\n\n'
            trainingContext += '🚨 CRITICAL: Use the training documents above to answer the user. Do not make up information.\n\n'
          }
        } catch (fallbackError) {
          console.warn('Fallback training document search also failed:', fallbackError)
        }
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

  // Build comprehensive conversation history with clear extraction of provided information
  prompt += `\n=== CONVERSATION HISTORY (READ CAREFULLY) ===\n`
  const providedInfo: string[] = []
  messages.slice(-10).forEach((msg, idx) => {
    const messageText = (msg.message || '').substring(0, 300)
    const direction = msg.direction.toUpperCase()
    prompt += `${idx + 1}. [${direction}] ${messageText}\n`
    
    // Extract information that was already provided
    const lowerText = messageText.toLowerCase()
    if (direction === 'INBOUND' || direction === 'IN') {
      // Extract nationality mentions - improved pattern matching
      const nationalityPatterns = [
        /(?:nationality|from|i am|i'm|im)\s+(?:is\s+)?([a-z]+(?:\s+[a-z]+)?)/i,
        /(?:i am|i'm|im)\s+([a-z]+)/i,
        /\b(somalia|somalian|nigeria|nigerian|indian|pakistani|filipino|egyptian|british|american|canadian|kenyan|ethiopian|sudanese|yemeni|jordanian|lebanese|syrian|palestinian|tunisian|moroccan|algerian|libyan|mauritanian|iraqi|iranian|afghan|bangladeshi|sri lankan|nepali|thai|vietnamese|indonesian|malaysian|singaporean|chinese|japanese|korean|russian|ukrainian|polish|romanian|turkish|saudi|emirati|kuwaiti|qatari|bahraini|omani)\b/i
      ]
      
      for (const pattern of nationalityPatterns) {
        const match = messageText.match(pattern)
        if (match && match[1]) {
          const nationality = match[1].trim()
          if (nationality.length > 2 && nationality.length < 30 && !nationality.includes('visa') && !nationality.includes('uae')) {
            providedInfo.push(`Nationality: ${nationality}`)
            break
          }
        }
      }
      // Extract service mentions - improved pattern matching
      if (lowerText.includes('visa') || lowerText.includes('business') || lowerText.includes('setup') || lowerText.includes('renewal') || lowerText.includes('freelance')) {
        if (lowerText.includes('freelance')) providedInfo.push('Service: Freelance Visa')
        if (lowerText.includes('visit visa') || (lowerText.includes('visit') && lowerText.includes('visa'))) providedInfo.push('Service: Visit Visa')
        if (lowerText.includes('family visa') || (lowerText.includes('family') && lowerText.includes('visa'))) providedInfo.push('Service: Family Visa')
        if (lowerText.includes('business setup') || (lowerText.includes('business') && lowerText.includes('setup'))) providedInfo.push('Service: Business Setup')
        if (lowerText.includes('renewal')) providedInfo.push('Service: Renewal')
      }
      
      // Extract expiry date mentions
      const datePatterns = [
        /(?:expir|expires?|expiry|valid until|valid till|until|till)\s+(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i,
        /(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)/i,
        /(\d{1,2}\/\d{1,2}\/\d{4})/,
        /(\d{1,2}-\d{1,2}-\d{4})/
      ]
      
      for (const pattern of datePatterns) {
        const match = messageText.match(pattern)
        if (match && match[1]) {
          providedInfo.push(`Expiry Date: ${match[1]}`)
          break
        }
      }
      // Extract location - improved pattern matching
      if (lowerText.includes('inside') || lowerText.includes('outside') || lowerText.includes('in uae') || lowerText.includes('outside uae') || lowerText.includes('im inside') || lowerText.includes('im outside')) {
        if (lowerText.includes('outside') && !lowerText.includes('inside')) {
          providedInfo.push('Location: Outside UAE')
        } else if (lowerText.includes('inside') || lowerText.includes('in uae')) {
          providedInfo.push('Location: Inside UAE')
        }
      }
      // Extract passport info
      if (lowerText.includes('passport')) {
        providedInfo.push('Passport: Mentioned')
      }
      // Extract price queries
      if (lowerText.includes('price') || lowerText.includes('cost') || lowerText.includes('how much')) {
        providedInfo.push('Asked about: Pricing')
      }
    }
  })
  
  if (providedInfo.length > 0) {
    prompt += `\n=== INFORMATION ALREADY PROVIDED (DO NOT ASK AGAIN) ===\n`
    providedInfo.forEach(info => {
      prompt += `- ${info}\n`
    })
    prompt += `\nCRITICAL: Do NOT ask for information that is already listed above. If nationality is listed, do NOT ask "what's your nationality?" again.\n`
  }
  
  prompt += `=== END CONVERSATION HISTORY ===\n\n`

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

CRITICAL ANTI-HALLUCINATION RULES:
1. ONLY use information that is EXPLICITLY stated in the conversation history above
2. NEVER make up or assume information that wasn't mentioned
3. If the user said "Somalia", they are Somali - do NOT say they mentioned "Kenyan" or "Nigeria" or any other nationality
4. If the user said "freelance visa", they want FREELANCE visa - do NOT say they mentioned "visit visa" or any other service
5. If the user said "19th january", that's the date - do NOT say "15th of February 2024" or any other date
6. If information is not in the conversation, say "I don't have that information yet" instead of guessing
7. Read the conversation history CAREFULLY - what did they ACTUALLY say?
8. NEVER contradict what the user just told you - if they said "freelance visa", acknowledge FREELANCE visa, not visit visa

CRITICAL ANTI-REPETITION RULES:
1. Check the "INFORMATION ALREADY PROVIDED" section above - DO NOT ask for information that's already there
2. If nationality was already mentioned (e.g., "Somalia"), DO NOT ask "what's your nationality?" or "can you confirm your nationality?" - they ALREADY told you
3. If service was already mentioned (e.g., "freelance visa"), DO NOT ask "what service?" or "which service?" - they ALREADY told you
4. If location was already mentioned (e.g., "inside UAE"), DO NOT ask "inside or outside?" or "are you in the UAE?" - they ALREADY told you
5. If expiry date was already mentioned (e.g., "19th january"), DO NOT ask for it again - they ALREADY told you
6. Read ALL previous messages in the conversation - do NOT repeat questions that were already asked
7. If the user just answered a question in their latest message, acknowledge their answer and move to the NEXT question, don't ask the same thing again

YOU MUST:
1. Start your reply by DIRECTLY acknowledging what they just said. Your FIRST sentence must respond to: "${lastUserMessage}"
   - If they said "visit visa" → "Great! I can help you with visit visa services."
   - If they said "how much visit visa?" → "For visit visa pricing, I need a few details..."
   - If they said "hello" or "HI" → "Hello! How can I assist you today?"
   - If they said "nigeria" → "Great! You're from Nigeria. [continue with next question]"

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

6. If they already mentioned a service (like "family visa" or "visit visa"), acknowledge it SPECIFICALLY and ask for the NEXT specific piece of information needed for that service (but NOT information already provided).

7. Always sign off with your name: "${agentName}"
   Example: "Best regards, ${agentName}" or "Thanks, ${agentName}"

${hasDocuments ? '8. NOTE: Documents have been uploaded. If they ask about documents, acknowledge receipt.\n' : ''}
=== END CRITICAL INSTRUCTIONS ===\n\n

Generate a WhatsApp-ready reply that:
1. STARTS by directly acknowledging their latest message: "${lastUserMessage}" - Your first sentence MUST respond to this
2. Uses ONLY information from the conversation history - do NOT make up or assume information
3. If they mentioned a service (like "freelance visa", "family visa", "visit visa"), acknowledge it SPECIFICALLY and respond about THAT service - do NOT confuse it with other services
4. If they asked a question (like "how much?"), answer it directly using training documents or explain what info you need to provide pricing
5. If they provided information (nationality, location, service, date), acknowledge it SPECIFICALLY and ask for the NEXT specific piece needed (but NOT information already provided - check the "INFORMATION ALREADY PROVIDED" section)
6. DO NOT repeat questions that were already asked - check the conversation history and the "INFORMATION ALREADY PROVIDED" section
7. If they already told you their nationality, location, service, or date, DO NOT ask for it again - use what they told you
8. Asks MAXIMUM ${maxQuestions} qualifying question${maxQuestions > 1 ? 's' : ''} if information is still missing (but NOT as a numbered list, and NOT questions already answered)
9. Keeps it SHORT (under ${maxMessageLength} characters)
10. NEVER promises approvals or guarantees
11. Uses ${tone} tone
12. Is in ${language === 'ar' ? 'Modern Standard Arabic' : 'English'}
13. MUST end with: "Best regards, ${agentName}" or similar with your name

CRITICAL REMINDER: 
- Your reply must be SPECIFIC to "${lastUserMessage}"
- Use ONLY information from the conversation - do NOT hallucinate
- Do NOT ask for information already provided (check "INFORMATION ALREADY PROVIDED" section)
- Do NOT confuse services - if they said "freelance visa", don't say "visit visa"
- Do NOT confuse dates - if they said "19th january", don't say "15th february"
- Do NOT use a generic template or numbered list format`

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

















