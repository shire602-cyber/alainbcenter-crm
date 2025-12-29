/**
 * Conversation Flow State Management
 * 
 * Persists conversation state machine to prevent asking same questions
 */

import { prisma } from '../prisma'

export interface ConversationFlowState {
  flowKey?: string // e.g., "family_visa", "freelance_visa"
  flowStep?: string // e.g., "WAIT_SPONSOR_VISA_TYPE", "PRICING"
  lastQuestionKey?: string // e.g., "SPONSOR_VISA_TYPE"
  lastQuestionAt?: Date
  collectedData?: Record<string, any> // sponsorVisaType, familyLocation, etc.
}

/**
 * Load conversation flow state
 */
export async function loadFlowState(conversationId: number): Promise<ConversationFlowState> {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        flowKey: true,
        flowStep: true,
        lastQuestionKey: true,
        lastQuestionAt: true,
        collectedData: true,
      },
    })
    
    if (!conversation) {
      return {}
    }
    
    let collectedData: Record<string, any> = {}
    if (conversation.collectedData) {
      try {
        collectedData = JSON.parse(conversation.collectedData)
      } catch {
        collectedData = {}
      }
    }
    
    return {
      flowKey: conversation.flowKey || undefined,
      flowStep: conversation.flowStep || undefined,
      lastQuestionKey: conversation.lastQuestionKey || undefined,
      lastQuestionAt: conversation.lastQuestionAt || undefined,
      collectedData,
    }
  } catch (error: any) {
    console.error(`❌ [FLOW-STATE] Failed to load: ${error.message}`)
    return {}
  }
}

/**
 * Update conversation flow state
 */
export async function updateFlowState(
  conversationId: number,
  updates: Partial<ConversationFlowState>
): Promise<void> {
  try {
    const updateData: any = {}
    
    if (updates.flowKey !== undefined) {
      updateData.flowKey = updates.flowKey
    }
    if (updates.flowStep !== undefined) {
      updateData.flowStep = updates.flowStep
    }
    if (updates.lastQuestionKey !== undefined) {
      updateData.lastQuestionKey = updates.lastQuestionKey
      updateData.lastQuestionAt = new Date()
    }
    if (updates.collectedData !== undefined) {
      updateData.collectedData = JSON.stringify(updates.collectedData)
    }
    
    if (Object.keys(updateData).length > 0) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: updateData,
      })
      
      console.log(`✅ [FLOW-STATE] Updated conversation ${conversationId}:`, Object.keys(updateData))
    }
  } catch (error: any) {
    console.error(`❌ [FLOW-STATE] Failed to update: ${error.message}`)
  }
}

/**
 * Check if question was already asked (within last 3 minutes)
 * Also checks last 3 outbound messages for questionKey repetition
 */
export async function wasQuestionAsked(
  conversationId: number,
  questionKey: string,
  minMinutesSince: number = 3
): Promise<boolean> {
  try {
    const state = await loadFlowState(conversationId)
    
    // If same question key and asked recently, don't ask again
    if (state.lastQuestionKey === questionKey && state.lastQuestionAt) {
      const minutesSince = (Date.now() - state.lastQuestionAt.getTime()) / (1000 * 60)
      if (minutesSince < minMinutesSince) {
        console.log(`⚠️ [FLOW-STATE] Question ${questionKey} asked ${minutesSince.toFixed(1)} minutes ago - skipping`)
        return true
      }
    }
    
    // Check last 3 outbound messages for questionKey repetition
    const { prisma } = await import('../prisma')
    const lastOutboundMessages = await prisma.message.findMany({
      where: {
        conversationId,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        body: true,
        createdAt: true,
      },
    })
    
    // Also check OutboundMessageLog for lastQuestionKey
    const lastOutboundLogs = await prisma.outboundMessageLog.findMany({
      where: {
        conversationId,
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        lastQuestionKey: true,
        createdAt: true,
      },
    })
    
    // Check if questionKey matches any of the last 3 outbound's lastQuestionKey
    for (const log of lastOutboundLogs) {
      if (log.lastQuestionKey === questionKey) {
        console.log(`⚠️ [FLOW-STATE] Question ${questionKey} was asked in last 3 outbound messages - skipping`)
        return true
      }
    }
    
    // Also check message body for semantic similarity
    const questionKeyLower = questionKey.toLowerCase()
    for (const msg of lastOutboundMessages) {
      const body = (msg.body || '').toLowerCase()
      if (questionKeyLower.includes('name') && (body.includes('name') || body.includes('what is your name'))) {
        console.log(`⚠️ [FLOW-STATE] Name question was asked in last 3 outbound - skipping`)
        return true
      }
      if (questionKeyLower.includes('nationality') && (body.includes('nationality') || body.includes('what is your nationality'))) {
        console.log(`⚠️ [FLOW-STATE] Nationality question was asked in last 3 outbound - skipping`)
        return true
      }
      if (questionKeyLower.includes('service') && (body.includes('service') || body.includes('which service'))) {
        console.log(`⚠️ [FLOW-STATE] Service question was asked in last 3 outbound - skipping`)
        return true
      }
    }
    
    return false
  } catch (error: any) {
    console.error(`❌ [FLOW-STATE] Failed to check question: ${error.message}`)
    return false
  }
}

/**
 * Record that we asked a question
 */
export async function recordQuestionAsked(
  conversationId: number,
  questionKey: string,
  flowStep?: string
): Promise<void> {
  // Load current state to check if this question was asked recently
  const current = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { lastQuestionKey: true, lastQuestionAt: true, questionsAskedCount: true },
  })
  
  // CRITICAL: Only increment questionsAskedCount if lastQuestionKey actually changed
  // This prevents counting the same question multiple times
  const questionKeyChanged = current?.lastQuestionKey !== questionKey
  
  // Check if this question was asked in the last 30 seconds (same turn)
  const justAsked = !questionKeyChanged && 
    current?.lastQuestionAt && 
    (Date.now() - current.lastQuestionAt.getTime()) < 30000
  
  // If question key changed and not just asked, increment the count
  if (questionKeyChanged && !justAsked) {
    const newCount = (current?.questionsAskedCount || 0) + 1
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { questionsAskedCount: newCount },
    })
    console.log(`✅ [FLOW-STATE] Incremented questionsAskedCount: ${newCount} (question key changed: ${current?.lastQuestionKey} -> ${questionKey})`)
  } else if (!questionKeyChanged) {
    console.log(`⚠️ [FLOW-STATE] Question key unchanged (${questionKey}) - not incrementing count`)
  }
  
  await updateFlowState(conversationId, {
    lastQuestionKey: questionKey,
    flowStep: flowStep || `WAIT_${questionKey}`,
  })
}

/**
 * Record collected data
 */
export async function recordCollectedData(
  conversationId: number,
  data: Record<string, any>
): Promise<void> {
  const currentState = await loadFlowState(conversationId)
  const updatedData = {
    ...currentState.collectedData,
    ...data,
  }
  
  await updateFlowState(conversationId, {
    collectedData: updatedData,
  })
}

