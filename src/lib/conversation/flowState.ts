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

