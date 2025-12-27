/**
 * REPLY ENGINE ORCHESTRATOR
 * Main entry point for fail-proof reply generation
 */

import { createHash } from 'crypto'
import { prisma } from '../prisma'
import { loadFSMState, updateFSMState, shouldStop } from './fsm'
import { extractFields, mergeExtractedFields } from './extract'
import { planNextAction } from './planner'
import { getTemplate, renderTemplate } from './templates'
import { getFinalText } from './llmGateway'
import type { ReplyEngineResult, ExtractedFields } from './types'

export interface GenerateReplyOptions {
  conversationId: number
  inboundMessageId: number
  inboundText: string
  channel: string
  useLLM?: boolean
  contactName?: string
  language?: string
}

/**
 * Generate reply using reply engine
 */
export async function generateReply(
  options: GenerateReplyOptions
): Promise<ReplyEngineResult | null> {
  const {
    conversationId,
    inboundMessageId,
    inboundText,
    channel,
    useLLM = false,
    contactName = 'there',
    language = 'en',
  } = options

  try {
    // Step 0: Check database-level idempotency FIRST (prevents race conditions)
    // Check if we already generated a reply for this inbound message
    try {
      const existingLog = await (prisma as any).replyEngineLog.findFirst({
        where: {
          conversationId,
          inboundMessageId,
        },
        orderBy: { createdAt: 'desc' },
      })
      
      if (existingLog && existingLog.replyKey) {
        console.log(`[REPLY-ENGINE] Duplicate detected in database (inboundMessageId: ${inboundMessageId}), skipping`)
        return {
          text: existingLog.replyText || '',
          replyKey: existingLog.replyKey,
          debug: {
            plan: {
              action: 'STOP',
              templateKey: existingLog.templateKey,
              updates: {},
              reason: 'Duplicate inbound message - reply already generated',
            },
            extractedFields: existingLog.extractedFields ? JSON.parse(existingLog.extractedFields) : {},
            templateKey: existingLog.templateKey,
            skipped: true,
            reason: 'Duplicate inbound message - reply already generated',
          },
        }
      }
    } catch (dbError: any) {
      // ReplyEngineLog table might not exist yet, continue
      if (!dbError.message?.includes('does not exist') && !dbError.code?.includes('P2001')) {
        console.warn(`[REPLY-ENGINE] Error checking idempotency:`, dbError.message)
      }
    }

    // Step 1: Load conversation + FSM state
    const state = await loadFSMState(conversationId)

    // Step 2: Check if we should stop
    if (shouldStop(state)) {
      console.log(`[REPLY-ENGINE] Stop enabled for conversation ${conversationId}`)
      return {
        text: '',
        replyKey: '',
        debug: {
          plan: {
            action: 'STOP',
            templateKey: '',
            updates: {},
            reason: state.stop.reason || 'Stop enabled',
          },
          extractedFields: {},
          templateKey: '',
          skipped: true,
          reason: state.stop.reason || 'Stop enabled',
        },
      }
    }

    // Step 3: Run extractor -> updatedState
    // CRITICAL: Get conversation history for better service detection
    const conversationMessages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 20, // Get recent messages for context
    })
    
    // Combine all message text for better extraction
    const allMessageText = conversationMessages
      .map(m => m.body || '')
      .join(' ')
    
    // Extract from current message + conversation history
    const extracted = extractFields(inboundText + ' ' + allMessageText)
    const mergedCollected = mergeExtractedFields(state.collected, extracted)
    const updatedState = {
      ...state,
      collected: mergedCollected,
      lastInboundMessageId: inboundMessageId.toString(),
    }

    // Step 4: Run planner -> plan
    const plan = planNextAction(updatedState, inboundText, extracted)

    // Step 5: Render template -> rawText
    const template = getTemplate(plan.templateKey)
    if (!template) {
      console.error(`[REPLY-ENGINE] Template not found: ${plan.templateKey}`)
      return null
    }

    // Prepare variables for template
    const variables: Record<string, string> = {
      name: contactName || updatedState.collected.fullName || 'there',
      language,
      ...(updatedState.serviceKey && { service: updatedState.serviceKey }),
      ...Object.entries(updatedState.collected).reduce((acc, [key, value]) => {
        acc[key] = String(value || '')
        return acc
      }, {} as Record<string, string>),
    }

    // Step 6: Optionally pass through LLM gateway -> finalText
    const finalText = await getFinalText(plan.templateKey, template, variables, useLLM)

    // Step 7: Compute replyKey for idempotency
    const replyKey = computeReplyKey(
      conversationId,
      inboundMessageId,
      plan.action,
      plan.templateKey,
      plan.questionKey || ''
    )

    // Step 8: Check idempotency (if replyKey == state.lastOutboundReplyKey -> SKIP)
    if (replyKey === state.lastOutboundReplyKey) {
      console.log(`[REPLY-ENGINE] Duplicate detected (replyKey: ${replyKey}), skipping send`)
      return {
        text: finalText,
        replyKey,
        debug: {
          plan,
          extractedFields: extracted,
          templateKey: plan.templateKey,
          skipped: true,
          reason: 'Duplicate replyKey detected',
        },
      }
    }

    // Step 9: Persist state updates
    const finalState = {
      ...updatedState,
      ...plan.updates,
      lastOutboundReplyKey: replyKey,
      askedQuestionKeys: [
        ...updatedState.askedQuestionKeys,
        ...(plan.questionKey ? [plan.questionKey] : []),
      ],
    }

    await updateFSMState(conversationId, finalState)

    // Step 10: Create debug log record
    await createReplyEngineLog({
      conversationId,
      inboundMessageId,
      plan,
      extractedFields: extracted,
      templateKey: plan.templateKey,
      replyKey,
      finalText,
    })

    // Step 11: Return result
    return {
      text: finalText,
      replyKey,
      debug: {
        plan,
        extractedFields: extracted,
        templateKey: plan.templateKey,
        skipped: false,
      },
    }
  } catch (error: any) {
    console.error(`[REPLY-ENGINE] Error generating reply:`, error)
    throw error
  }
}

/**
 * Compute replyKey for idempotency
 */
function computeReplyKey(
  conversationId: number,
  inboundMessageId: number,
  action: string,
  templateKey: string,
  questionKey: string
): string {
  const input = `${conversationId}:${inboundMessageId}:${action}:${templateKey}:${questionKey}`
  return createHash('sha256').update(input).digest('hex')
}

/**
 * Create ReplyEngineLog record
 */
async function createReplyEngineLog(data: {
  conversationId: number
  inboundMessageId: number
  plan: any
  extractedFields: ExtractedFields
  templateKey: string
  replyKey: string
  finalText: string
}): Promise<void> {
  try {
    // Check if ReplyEngineLog table exists (it may not be migrated yet)
    await (prisma as any).replyEngineLog.create({
      data: {
        conversationId: data.conversationId,
        inboundMessageId: data.inboundMessageId,
        action: data.plan.action,
        templateKey: data.templateKey,
        questionKey: data.plan.questionKey || null,
        reason: data.plan.reason,
        extractedFields: JSON.stringify(data.extractedFields),
        replyKey: data.replyKey,
        replyText: data.finalText.substring(0, 500),
        createdAt: new Date(),
      },
    })
  } catch (error: any) {
    // Table may not exist yet, log but don't fail
    if (error.code === 'P2001' || error.message?.includes('does not exist')) {
      console.warn(`[REPLY-ENGINE] ReplyEngineLog table not found, skipping log creation`)
    } else {
      console.error(`[REPLY-ENGINE] Failed to create log:`, error)
    }
  }
}

