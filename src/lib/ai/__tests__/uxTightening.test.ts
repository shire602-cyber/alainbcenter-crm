/**
 * Tests for UX tightening features:
 * 1. Branded greeting includes "AIBC Assistant"
 * 2. No-repeat guard prevents asking nationality twice if already asked recently
 * 3. Budget cap triggers handoff at >= 6
 * 4. "new or renew" question never appears
 * 5. "company name" question never appears
 * 6. When core qualification complete -> confirmation + email request
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { executeRuleEngine, loadConversationMemory } from '../ruleEngine'
import { generateAIReply } from '../orchestrator'
import { wasQuestionAsked } from '../../conversation/flowState'
import { prisma } from '../../../lib/prisma'

// Mock Prisma
vi.mock('../../../lib/prisma', () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
    },
    outboundMessageLog: {
      findMany: vi.fn(),
    },
  },
}))

describe('UX Tightening Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Branded greeting includes "AIBC Assistant"', () => {
    it('should include "AIBC Assistant" in first message greeting', async () => {
      const context = {
        conversationId: 1,
        leadId: 1,
        contactId: 1,
        currentMessage: 'Hi',
        conversationHistory: [],
        isFirstMessage: true,
        memory: {},
      }

      const result = await executeRuleEngine(context as any)

      expect(result.reply).toContain('AIBC Assistant')
      expect(result.reply).toContain('Al Ain Business Center')
    })
  })

  describe('2. No-repeat guard prevents asking same question twice', () => {
    it('should prevent asking nationality if already asked in last 3 outbound', async () => {
      // Mock last 3 outbound messages with nationality question
      ;(prisma.message.findMany as any).mockResolvedValue([
        { body: 'What is your nationality?', createdAt: new Date() },
        { body: 'Thanks for your name', createdAt: new Date() },
        { body: 'Hello', createdAt: new Date() },
      ])

      ;(prisma.outboundMessageLog.findMany as any).mockResolvedValue([
        { lastQuestionKey: 'ASK_NATIONALITY', createdAt: new Date() },
      ])

      const wasAsked = await wasQuestionAsked(1, 'ASK_NATIONALITY', 3)

      expect(wasAsked).toBe(true)
    })

    it('should allow asking nationality if not asked in last 3 outbound', async () => {
      ;(prisma.message.findMany as any).mockResolvedValue([
        { body: 'What is your name?', createdAt: new Date() },
        { body: 'Hello', createdAt: new Date() },
      ])

      ;(prisma.outboundMessageLog.findMany as any).mockResolvedValue([])

      const wasAsked = await wasQuestionAsked(1, 'ASK_NATIONALITY', 3)

      expect(wasAsked).toBe(false)
    })
  })

  describe('3. Budget cap triggers handoff at >= 6', () => {
    it('should trigger handoff when questionsAskedCount >= 6', async () => {
      ;(prisma.conversation.findUnique as any).mockResolvedValue({
        id: 1,
        lead: {
          id: 1,
          contact: { id: 1, fullName: 'Test', nationality: null },
          serviceType: null,
        },
        messages: [],
      })

      // Mock loadConversationState to return questionsAskedCount = 6
      vi.mock('../stateMachine', () => ({
        loadConversationState: vi.fn().mockResolvedValue({
          qualificationStage: 'COLLECTING_DETAILS',
          questionsAskedCount: 6,
          knownFields: {},
          lastQuestionKey: undefined,
          serviceKey: undefined,
          stateVersion: 1,
        }),
        updateConversationState: vi.fn().mockResolvedValue(undefined),
      }))

      const result = await generateAIReply({
        conversationId: 1,
        leadId: 1,
        contactId: 1,
        inboundText: 'test',
        inboundMessageId: 1,
        channel: 'whatsapp',
      })

      expect(result.replyText).toContain('Perfect ✅')
      expect(result.replyText).toContain('email')
      expect(result.replyText).toContain('call')
      expect(result.nextStepKey).toBe('HANDOFF')
    })
  })

  describe('4. "new or renew" question never appears', () => {
    it('should not ask "new or renew" question in rule engine', async () => {
      const context = {
        conversationId: 1,
        leadId: 1,
        contactId: 1,
        currentMessage: 'I need business setup',
        conversationHistory: [
          { direction: 'OUTBOUND', body: 'Hello', createdAt: new Date() },
          { direction: 'INBOUND', body: 'I need business setup', createdAt: new Date() },
        ],
        isFirstMessage: false,
        memory: {
          name: 'Test',
          service: 'Business Setup',
        },
      }

      const result = await executeRuleEngine(context as any)

      expect(result.reply.toLowerCase()).not.toContain('new or renew')
      expect(result.reply.toLowerCase()).not.toContain('new business or renew')
    })
  })

  describe('5. "company name" question never appears', () => {
    it('should not ask "company name" question', async () => {
      const context = {
        conversationId: 1,
        leadId: 1,
        contactId: 1,
        currentMessage: 'I need business setup',
        conversationHistory: [
          { direction: 'OUTBOUND', body: 'Hello', createdAt: new Date() },
          { direction: 'INBOUND', body: 'I need business setup', createdAt: new Date() },
        ],
        isFirstMessage: false,
        memory: {
          name: 'Test',
          service: 'Business Setup',
        },
      }

      const result = await executeRuleEngine(context as any)

      expect(result.reply.toLowerCase()).not.toContain('company name')
      expect(result.reply.toLowerCase()).not.toContain('what is your company name')
    })
  })

  describe('6. Qualification complete confirmation', () => {
    it('should send confirmation when name+service+nationality present', async () => {
      ;(prisma.conversation.findUnique as any).mockResolvedValue({
        id: 1,
        lead: {
          id: 1,
          contact: { id: 1, fullName: 'Test User', nationality: 'Indian' },
          serviceType: { name: 'Business Setup' },
        },
        messages: [],
      })

      // Mock loadConversationState to return complete qualification
      vi.mock('../stateMachine', () => ({
        loadConversationState: vi.fn().mockResolvedValue({
          qualificationStage: 'COLLECTING_DETAILS',
          questionsAskedCount: 2,
          knownFields: {
            name: 'Test User',
            service: 'Business Setup',
            nationality: 'Indian',
          },
          lastQuestionKey: undefined,
          serviceKey: 'business_setup',
          stateVersion: 1,
        }),
        updateConversationState: vi.fn().mockResolvedValue(undefined),
        extractFieldsToState: vi.fn().mockReturnValue({}),
      }))

      const result = await generateAIReply({
        conversationId: 1,
        leadId: 1,
        contactId: 1,
        inboundText: 'test',
        inboundMessageId: 1,
        channel: 'whatsapp',
      })

      expect(result.replyText).toContain('Perfect')
      expect(result.replyText).toContain('Noted:')
      expect(result.replyText).toContain('Service:')
      expect(result.replyText).toContain('Nationality:')
      expect(result.replyText).toContain('email')
      expect(result.replyText).toContain('call')
      expect(result.nextStepKey).toBe('QUALIFICATION_COMPLETE')
    })
  })
})

