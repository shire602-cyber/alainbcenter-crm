/**
 * REPLY ENGINE INTEGRATION TESTS
 * Tests full pipeline integration with database
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { generateReply } from '../index'
import { loadFSMState, resetFSMState } from '../fsm'
import { prisma } from '../../prisma'

describe('Reply Engine Integration', () => {
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

  it('should persist FSM state after generating reply', async () => {
    const result = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'I want freelance visa',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    // Load state from database
    const state = await loadFSMState(conversationId)

    // State should be persisted
    expect(state).not.toBeNull()
    expect(state.lastOutboundReplyKey).toBe(result?.replyKey)
  })

  it('should extract and store service from message', async () => {
    await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'I want freelance visa',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    const state = await loadFSMState(conversationId)

    // Service should be extracted and stored
    expect(state.collected.serviceKey).toBe('freelance_visa')
  })

  it('should progress through conversation flow', async () => {
    // Message 1: Service mention
    await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'I want freelance visa',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    let state = await loadFSMState(conversationId)
    expect(state.serviceKey).toBe('freelance_visa')
    expect(state.stage).toBe('QUALIFYING')

    // Message 2: Answer question
    await generateReply({
      conversationId,
      inboundMessageId: 2,
      inboundText: 'My name is John Doe',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    state = await loadFSMState(conversationId)
    expect(state.collected.fullName).toBe('John Doe')
  })

  it('should handle stop state correctly', async () => {
    // Set stop state
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ruleEngineMemory: JSON.stringify({
          serviceKey: null,
          stage: 'NEW',
          collected: {},
          askedQuestionKeys: [],
          stop: {
            enabled: true,
            reason: 'User requested stop',
          },
        }),
      },
    })

    const result = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'Hi',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    // Should skip reply when stop enabled
    expect(result?.debug.skipped).toBe(true)
    expect(result?.debug.plan.action).toBe('STOP')
  })

  it('should handle business setup flow end-to-end', async () => {
    const messages = [
      'I want business setup',
      'My name is John Doe',
      'Marketing license',
      'Mainland',
      '2 partners',
      '3 visas',
    ]

    for (let i = 0; i < messages.length; i++) {
      const result = await generateReply({
        conversationId,
        inboundMessageId: i + 1,
        inboundText: messages[i],
        channel: 'whatsapp',
        contactName: 'Test User',
      })

      const state = await loadFSMState(conversationId)

      // After all questions, should handover
      if (i === messages.length - 1) {
        expect(result?.debug.plan.action).toBe('HANDOVER')
        expect(state.stage).toBe('QUOTE_READY')
      }
    }
  })
})


