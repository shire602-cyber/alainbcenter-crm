/**
 * STRICT AI QUALIFICATION ENGINE
 * 
 * Phase 3: Enforces strict rules for AI qualification:
 * - Max 1 question per reply
 * - Max 5 questions total per service
 * - Never ask "are you in UAE"
 * - Never promise approvals
 * - Never quote final prices unless explicitly allowed
 * - Never repeat a question already asked
 * - JSON-validated output
 */

import { prisma } from '../prisma'

export interface QualificationOutput {
  reply_text: string
  detected_service?: string
  collected_fields: Record<string, any>
  next_question?: string | null
  should_escalate: boolean
  handover_reason?: string | null
}

/**
 * Track and validate AI qualification questions
 */
export async function validateQualificationRules(
  conversationId: number,
  proposedReply: string
): Promise<{
  isValid: boolean
  error?: string
  sanitizedReply?: string
}> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: {
        select: {
          id: true,
          serviceTypeEnum: true,
        },
      },
      messages: {
        where: {
          direction: 'OUTBOUND',
        },
        orderBy: { createdAt: 'desc' },
        take: 20, // Check last 20 outbound messages
      },
    },
  })

  if (!conversation) {
    return { isValid: false, error: 'Conversation not found' }
  }

  // Rule 1: Max 1 question per reply
  const questionCount = (proposedReply.match(/\?/g) || []).length
  if (questionCount > 1) {
    // Extract first question only
    const firstQuestionIndex = proposedReply.indexOf('?')
    const sanitized = proposedReply.substring(0, firstQuestionIndex + 1).trim()
    return {
      isValid: false,
      error: 'Max 1 question per reply',
      sanitizedReply: sanitized,
    }
  }

  // Rule 2: Never ask "are you in UAE" or similar location questions
  const prohibitedPatterns = [
    /are you in uae/i,
    /are you in dubai/i,
    /are you inside/i,
    /are you outside/i,
    /location/i,
    /where are you/i,
  ]
  for (const pattern of prohibitedPatterns) {
    if (pattern.test(proposedReply)) {
      return {
        isValid: false,
        error: 'Prohibited question pattern detected',
        sanitizedReply: proposedReply.replace(/\?.*$/, '').trim() + '.', // Remove question
      }
    }
  }

  // Rule 3: Never promise approvals
  const approvalPatterns = [
    /guarantee/i,
    /guaranteed/i,
    /will be approved/i,
    /definitely approved/i,
    /sure to get/i,
    /100% approved/i,
  ]
  for (const pattern of approvalPatterns) {
    if (pattern.test(proposedReply)) {
      return {
        isValid: false,
        error: 'Cannot promise approvals',
        sanitizedReply: proposedReply.replace(/guarantee[^.]*/gi, 'can assist').trim(),
      }
    }
  }

  // Rule 4: Never quote final prices unless explicitly allowed
  // (This is a soft check - we'll rely on AI training to avoid this)
  const pricePatterns = [
    /exactly (aed|dhs|dirhams?)\s*[\d,]+/i,
    /final price is/i,
    /total cost is exactly/i,
  ]
  for (const pattern of pricePatterns) {
    if (pattern.test(proposedReply)) {
      return {
        isValid: false,
        error: 'Cannot quote exact final prices',
        sanitizedReply: proposedReply.replace(/exactly (aed|dhs|dirhams?)\s*[\d,]+/gi, 'approximately').trim(),
      }
    }
  }

  // Rule 5: Never repeat a question already asked
  const lastQuestionKey = conversation.lastQuestionKey
  if (lastQuestionKey) {
    // Check if proposed reply contains similar question
    const lastQuestion = conversation.collectedData
      ? JSON.parse(conversation.collectedData)[lastQuestionKey]
      : null

    if (lastQuestion && proposedReply.toLowerCase().includes(lastQuestion.toLowerCase().substring(0, 20))) {
      return {
        isValid: false,
        error: 'Question already asked',
        sanitizedReply: proposedReply.replace(/\?.*$/, '').trim() + '.',
      }
    }
  }

  // Rule 6: Max 5 questions total per service
  const service = conversation.lead?.serviceTypeEnum || 'UNKNOWN'
  const questionKeys = conversation.collectedData
    ? Object.keys(JSON.parse(conversation.collectedData)).filter((k) => k.startsWith('question_'))
    : []
  
  if (questionKeys.length >= 5) {
    return {
      isValid: false,
      error: 'Max 5 questions reached - should escalate',
      sanitizedReply: proposedReply.replace(/\?.*$/, '').trim() + '. Please contact us for more details.',
    }
  }

  return { isValid: true }
}

/**
 * Parse and validate AI qualification output (JSON format)
 */
export function parseQualificationOutput(aiResponse: string): QualificationOutput | null {
  try {
    // Try to extract JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return null // Not JSON format
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!parsed.reply_text || typeof parsed.reply_text !== 'string') {
      return null
    }

    return {
      reply_text: parsed.reply_text,
      detected_service: parsed.detected_service,
      collected_fields: parsed.collected_fields || {},
      next_question: parsed.next_question || null,
      should_escalate: parsed.should_escalate === true,
      handover_reason: parsed.handover_reason || null,
    }
  } catch (error) {
    return null // Invalid JSON
  }
}

/**
 * Update conversation with qualification progress
 */
export async function updateQualificationProgress(
  conversationId: number,
  questionKey: string,
  collectedData: Record<string, any>
): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  })

  if (!conversation) {
    return
  }

  const existingData = conversation.collectedData
    ? JSON.parse(conversation.collectedData)
    : {}

  const updatedData = {
    ...existingData,
    [`question_${questionKey}`]: collectedData[questionKey],
    ...collectedData,
    lastUpdated: new Date().toISOString(),
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastQuestionKey: questionKey,
      lastQuestionAt: new Date(),
      collectedData: JSON.stringify(updatedData),
    },
  })
}

/**
 * Check if conversation should escalate to human
 */
export async function shouldEscalateToHuman(conversationId: number): Promise<{
  shouldEscalate: boolean
  reason?: string
}> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: {
        select: {
          id: true,
          serviceTypeEnum: true,
        },
      },
    },
  })

  if (!conversation) {
    return { shouldEscalate: false }
  }

  // Check question count
  const collectedData = conversation.collectedData
    ? JSON.parse(conversation.collectedData)
    : {}
  const questionCount = Object.keys(collectedData).filter((k) => k.startsWith('question_')).length

  if (questionCount >= 5) {
    return {
      shouldEscalate: true,
      reason: 'Max 5 questions reached',
    }
  }

  // Check for escalation keywords in recent messages
  const recentMessages = await prisma.message.findMany({
    where: {
      conversationId,
      direction: 'INBOUND',
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  const escalationKeywords = [
    'speak to someone',
    'talk to agent',
    'human',
    'manager',
    'supervisor',
    'complaint',
    'urgent',
    'asap',
  ]

  for (const message of recentMessages) {
    const text = (message.body || '').toLowerCase()
    if (escalationKeywords.some((keyword) => text.includes(keyword))) {
      return {
        shouldEscalate: true,
        reason: 'Escalation keyword detected',
      }
    }
  }

  return { shouldEscalate: false }
}

