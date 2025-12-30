/**
 * REPLY ENGINE RELIABILITY TESTS
 * Tests deterministic behavior, template usage, and script following
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { generateReply } from '../index'
import { loadFSMState, resetFSMState } from '../fsm'
import { prisma } from '../../prisma'

describe('Reply Engine Reliability', () => {
  let conversationId: number
  let contactId: number
  let leadId: number

  beforeEach(async () => {
    // Create test contact
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Test User',
        phone: `+97150${Date.now()}`,
        phoneNormalized: `+97150${Date.now()}`,
      },
    })
    contactId = contact.id

    // Create test lead
    const lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        stage: 'NEW',
        source: 'whatsapp',
      },
    })
    leadId = lead.id

    // Create test conversation
    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        leadId: lead.id,
        channel: 'whatsapp',
        status: 'open',
      },
    })
    conversationId = conversation.id

    // Reset FSM state
    await resetFSMState(conversationId)
  })

  afterEach(async () => {
    // Cleanup
    await prisma.conversation.deleteMany({ where: { id: conversationId } })
    await prisma.lead.deleteMany({ where: { id: leadId } })
    await prisma.contact.deleteMany({ where: { id: contactId } })
  })

  it('should return same reply for same input (deterministic)', async () => {
    const inboundMessageId = 1
    const inboundText = 'Hi'

    const result1 = await generateReply({
      conversationId,
      inboundMessageId,
      inboundText,
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    // Reset state to simulate same input
    await resetFSMState(conversationId)

    const result2 = await generateReply({
      conversationId,
      inboundMessageId,
      inboundText,
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    // Should produce same template (deterministic)
    expect(result1?.debug.templateKey).toBe(result2?.debug.templateKey)
    expect(result1?.debug.plan.action).toBe(result2?.debug.plan.action)
  })

  it('should use template, not freeform generation', async () => {
    const result = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'I want freelance visa',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    expect(result).not.toBeNull()
    expect(result?.text).toBeTruthy()
    
    // Check that reply comes from template (contains template placeholders or known template text)
    const knownTemplates = [
      'greeting_first',
      'ask_service',
      'ask_full_name',
      'ask_nationality',
    ]
    
    // Reply should match a known template pattern
    const matchesTemplate = knownTemplates.some(template => 
      result?.debug.templateKey === template
    )
    expect(matchesTemplate).toBe(true)
  })

  it('should ask only one question per message', async () => {
    const result = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'Hi',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    if (result && result.text) {
      // Count question marks
      const questionCount = (result.text.match(/\?/g) || []).length
      expect(questionCount).toBeLessThanOrEqual(1)
    }
  })

  it('should not repeat already asked questions', async () => {
    // First message - ask for service
    const result1 = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'Hi',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    const state1 = await loadFSMState(conversationId)
    const firstQuestion = state1.askedQuestionKeys[0]

    // Second message - should not ask same question
    const result2 = await generateReply({
      conversationId,
      inboundMessageId: 2,
      inboundText: 'I want freelance visa',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    const state2 = await loadFSMState(conversationId)
    
    // If first question was asked, it should be in askedQuestionKeys
    if (firstQuestion) {
      expect(state2.askedQuestionKeys).toContain(firstQuestion)
    }
  })

  it('should follow business setup script (max 5 questions)', async () => {
    // Set service to business_setup
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ruleEngineMemory: JSON.stringify({
          serviceKey: 'business_setup',
          stage: 'QUALIFYING',
          collected: {},
          askedQuestionKeys: [],
        }),
      },
    })

    let questionCount = 0
    const maxQuestions = 5

    for (let i = 1; i <= 10; i++) {
      const result = await generateReply({
        conversationId,
        inboundMessageId: i,
        inboundText: `Answer ${i}`,
        channel: 'whatsapp',
        contactName: 'Test User',
      })

      if (result?.debug.plan.action === 'ASK') {
        questionCount++
      }

      const state = await loadFSMState(conversationId)
      
      // Should not exceed max questions
      expect(state.askedQuestionKeys.length).toBeLessThanOrEqual(maxQuestions)
      
      // If all questions answered, should handover
      if (state.askedQuestionKeys.length >= maxQuestions) {
        expect(result?.debug.plan.action).toBe('HANDOVER')
        break
      }
    }

    expect(questionCount).toBeLessThanOrEqual(maxQuestions)
  })

  it('should handle cheapest/budget request with special offer', async () => {
    // Set service to business_setup
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ruleEngineMemory: JSON.stringify({
          serviceKey: 'business_setup',
          stage: 'QUALIFYING',
          collected: {},
          askedQuestionKeys: [],
        }),
      },
    })

    const result = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'I want the cheapest option',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    // Should show special offer template
    expect(result?.debug.templateKey).toBe('cheapest_offer_12999')
    expect(result?.debug.plan.action).toBe('OFFER')
  })

  it('should not contain forbidden phrases', async () => {
    const forbiddenPhrases = [
      'guaranteed',
      'approval guaranteed',
      '100%',
      'inside contact',
      'government connection',
    ]

    const result = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'Hi',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    if (result && result.text) {
      const lowerText = result.text.toLowerCase()
      for (const phrase of forbiddenPhrases) {
        expect(lowerText).not.toContain(phrase)
      }
    }
  })

  it('should skip reply if duplicate replyKey detected', async () => {
    const inboundMessageId = 1
    const inboundText = 'Hi'

    // First call
    const result1 = await generateReply({
      conversationId,
      inboundMessageId,
      inboundText,
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    const replyKey1 = result1?.replyKey

    // Second call with same input (should be skipped)
    const result2 = await generateReply({
      conversationId,
      inboundMessageId,
      inboundText,
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    expect(result2?.debug.skipped).toBe(true)
    expect(result2?.debug.reason).toContain('Duplicate')
  })
})


