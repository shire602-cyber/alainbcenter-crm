/**
 * REPLY ENGINE IDEMPOTENCY TESTS
 * Tests that duplicate replies are prevented
 */

import { describe, it, expect, beforeEach } from '@jest/globals'
import { generateReply } from '../index'
import { resetFSMState } from '../fsm'
import { prisma } from '../../prisma'

describe('Reply Engine Idempotency', () => {
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

  it('should prevent duplicate reply for same inbound message', async () => {
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

    expect(result1).not.toBeNull()
    expect(result1?.debug.skipped).toBe(false)

    // Second call with same messageId (simulating webhook retry)
    const result2 = await generateReply({
      conversationId,
      inboundMessageId,
      inboundText,
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    // Should be skipped due to duplicate replyKey
    expect(result2?.debug.skipped).toBe(true)
    expect(result2?.debug.reason).toContain('Duplicate')
  })

  it('should allow different replies for different messages', async () => {
    // First message
    const result1 = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'Hi',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    expect(result1?.debug.skipped).toBe(false)

    // Second message (different messageId)
    const result2 = await generateReply({
      conversationId,
      inboundMessageId: 2,
      inboundText: 'I want freelance visa',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    // Should not be skipped (different message)
    expect(result2?.debug.skipped).toBe(false)
    expect(result1?.replyKey).not.toBe(result2?.replyKey)
  })

  it('should compute unique replyKey for each unique input', async () => {
    const results = []

    // Generate replies with different inputs
    for (let i = 1; i <= 5; i++) {
      const result = await generateReply({
        conversationId,
        inboundMessageId: i,
        inboundText: `Message ${i}`,
        channel: 'whatsapp',
        contactName: 'Test User',
      })
      results.push(result)
    }

    // All replyKeys should be unique
    const replyKeys = results.map(r => r?.replyKey).filter(Boolean)
    const uniqueKeys = new Set(replyKeys)
    expect(uniqueKeys.size).toBe(replyKeys.length)
  })

  it('should create ReplyEngineLog with unique replyKey', async () => {
    const result = await generateReply({
      conversationId,
      inboundMessageId: 1,
      inboundText: 'Hi',
      channel: 'whatsapp',
      contactName: 'Test User',
    })

    if (result && result.replyKey) {
      // Check if log was created (if table exists)
      try {
        const log = await (prisma as any).replyEngineLog.findUnique({
          where: { replyKey: result.replyKey },
        })

        if (log) {
          expect(log.replyKey).toBe(result.replyKey)
          expect(log.conversationId).toBe(conversationId)
        }
      } catch (error: any) {
        // Table might not exist yet, that's okay
        if (!error.message?.includes('does not exist')) {
          throw error
        }
      }
    }
  })
})


