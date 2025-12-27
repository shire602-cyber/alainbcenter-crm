/**
 * GOLDEN VISA HANDLER
 * 
 * Handles Golden Visa qualification flow:
 * - Detects Golden Visa intent
 * - Runs qualification (max 4 questions)
 * - Creates tasks/alerts for eligible leads
 * - Integrates with auto-match pipeline
 */

import { prisma } from '../prisma'
import { detectGoldenVisaIntent, goldenVisaQualify } from '../qualifiers/goldenVisaQualify'

/**
 * Handle Golden Visa qualification for inbound message
 */
export async function handleGoldenVisaQualification(
  leadId: number,
  conversationId: number,
  messageText: string
): Promise<{
  shouldUseQualifier: boolean
  replyText: string | null
  shouldEscalate: boolean
  taskCreated: boolean
  alertCreated: boolean
}> {
  // Check if this is a Golden Visa lead
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      serviceTypeEnum: true,
      dataJson: true,
    },
  })

  if (!lead) {
    return {
      shouldUseQualifier: false,
      replyText: null,
      shouldEscalate: false,
      taskCreated: false,
      alertCreated: false,
    }
  }

  // Check if service is Golden Visa or intent detected
  const isGoldenVisaService = lead.serviceTypeEnum === 'GOLDEN_VISA'
  const hasGoldenVisaIntent = detectGoldenVisaIntent(messageText)

  if (!isGoldenVisaService && !hasGoldenVisaIntent) {
    return {
      shouldUseQualifier: false,
      replyText: null,
      shouldEscalate: false,
      taskCreated: false,
      alertCreated: false,
    }
  }

  // Get last question from conversation
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      lastQuestionKey: true,
      collectedData: true,
    },
  })

  const lastQuestion = conversation?.lastQuestionKey || null

  // Run qualification
  const result = await goldenVisaQualify(leadId, conversationId, messageText, lastQuestion)

  let taskCreated = false
  let alertCreated = false

  // Create task and alert if should escalate
  if (result.shouldEscalate && result.taskTitle) {
    try {
      // Create task (HIGH priority indicated in title)
      await prisma.task.create({
        data: {
          leadId,
          conversationId,
          title: `[HIGH PRIORITY] ${result.taskTitle}`,
          type: 'FOLLOW_UP',
          dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Due in 24 hours
          status: 'OPEN',
          idempotencyKey: `golden_visa_consultation_${leadId}`,
          aiSuggested: true,
        },
      })
      taskCreated = true
      console.log(`✅ [GOLDEN-VISA] Created task for lead ${leadId}`)
    } catch (error: any) {
      if (error.code !== 'P2002') {
        // Not a duplicate, log error
        console.error(`❌ [GOLDEN-VISA] Failed to create task:`, error.message)
      }
    }

    // Create alert
    if (result.alertMessage) {
      try {
        await prisma.notification.create({
          data: {
            type: 'system',
            title: 'Golden Visa Lead - High Priority',
            message: result.alertMessage,
            leadId,
            conversationId,
          },
        })
        alertCreated = true
        console.log(`✅ [GOLDEN-VISA] Created alert for lead ${leadId}`)
      } catch (error: any) {
        console.warn(`⚠️ [GOLDEN-VISA] Failed to create alert:`, error.message)
      }
    }
  }

  // Update conversation with last question if we're asking one
  if (result.replyText && result.qualification.nextQuestion) {
    const questionKey = `golden_visa_q${result.qualification.questionsAsked + 1}`
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastQuestionKey: questionKey,
        lastQuestionAt: new Date(),
        collectedData: JSON.stringify({
          ...(conversation?.collectedData ? JSON.parse(conversation.collectedData) : {}),
          [questionKey]: result.qualification.nextQuestion,
        }),
      },
    })
  }

  return {
    shouldUseQualifier: true,
    replyText: result.replyText,
    shouldEscalate: result.shouldEscalate,
    taskCreated,
    alertCreated,
  }
}

/**
 * Check if lead should use Golden Visa qualifier
 */
export async function shouldUseGoldenVisaQualifier(leadId: number, messageText: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      serviceTypeEnum: true,
    },
  })

  if (!lead) {
    return false
  }

  const isGoldenVisaService = lead.serviceTypeEnum === 'GOLDEN_VISA'
  const hasGoldenVisaIntent = detectGoldenVisaIntent(messageText)

  return isGoldenVisaService || hasGoldenVisaIntent
}

