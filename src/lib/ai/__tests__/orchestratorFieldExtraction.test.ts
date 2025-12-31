/**
 * CRITICAL FIX A TEST: Orchestrator field extraction before gating
 * 
 * Tests:
 * - Inbound message contains service+name+nationality => orchestrator does NOT ask service/name/nationality again
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { generateAIReply } from '../orchestrator'
import { prisma } from '@/lib/prisma'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('@/lib/ai/stateMachine', () => ({
  loadConversationState: vi.fn(),
  updateConversationState: vi.fn(),
  extractFieldsToState: vi.fn((text: string) => {
    // Mock field extraction: if text contains service/name/nationality, extract them
    const lower = text.toLowerCase()
    const extracted: any = {}
    if (lower.includes('business setup') || lower.includes('freelance')) {
      extracted.service = lower.includes('freelance') ? 'Freelance Visa' : 'Business Setup'
    }
    if (lower.match(/my name is (\w+)/i)) {
      const match = text.match(/my name is (\w+)/i)
      if (match) extracted.name = match[1]
    }
    if (lower.includes('indian') || lower.includes('pakistani') || lower.includes('british')) {
      extracted.nationality = lower.includes('indian') ? 'Indian' : lower.includes('pakistani') ? 'Pakistani' : 'British'
    }
    return extracted
  }),
  wasQuestionAsked: vi.fn(() => false),
}))

vi.mock('@/lib/ai/ruleEngine', () => ({
  loadConversationMemory: vi.fn(() => ({})),
  executeRuleEngine: vi.fn(() => ({ kind: 'NO_MATCH', needsHuman: false, memoryUpdates: {} })),
}))

vi.mock('@/lib/llm', () => ({
  generateCompletion: vi.fn(() => ({ text: 'Test reply' })),
}))

vi.mock('@/lib/inbound/fieldExtractors', () => ({
  extractService: vi.fn((text: string) => {
    const lower = text.toLowerCase()
    if (lower.includes('business setup')) return 'Business Setup'
    if (lower.includes('freelance')) return 'Freelance Visa'
    return null
  }),
  extractNationality: vi.fn((text: string) => {
    const lower = text.toLowerCase()
    if (lower.includes('indian')) return 'Indian'
    if (lower.includes('pakistani')) return 'Pakistani'
    return null
  }),
  extractIdentity: vi.fn((text: string) => {
    const match = text.match(/my name is (\w+)/i)
    return { name: match ? match[1] : null }
  }),
}))

describe('Orchestrator Field Extraction Before Gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should extract fields BEFORE gating and NOT ask for already-provided information', async () => {
    const { loadConversationState } = await import('@/lib/ai/stateMachine')
    
    // Mock conversation state with NO fields initially
    vi.mocked(loadConversationState).mockResolvedValue({
      qualificationStage: 'GREETING',
      questionsAskedCount: 0,
      knownFields: {},
      stateVersion: 1,
    })

    // Mock conversation with lead
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: 1,
      leadId: 1,
      lead: {
        id: 1,
        contactId: 1,
        contact: {
          id: 1,
          fullName: 'Test User',
          nationality: null,
        },
        serviceType: null,
      },
      messages: [],
    } as any)

    // Mock no duplicate outbound
    vi.mocked(prisma.message.findFirst).mockResolvedValue(null)

    // Inbound message contains ALL required fields
    const inboundText = 'Hi, my name is John, I need business setup, I am Indian'

    const result = await generateAIReply({
      conversationId: 1,
      contactId: 1,
      inboundText,
      inboundMessageId: 1,
      channel: 'whatsapp',
    })

    // CRITICAL: Should NOT ask for service/name/nationality since they were extracted
    // The orchestrator should either:
    // 1. Return a confirmation message (if qualification complete)
    // 2. Return a reply that does NOT ask for service/name/nationality
    expect(result.replyText).toBeTruthy()
    expect(result.replyText.toLowerCase()).not.toContain('what is your name')
    expect(result.replyText.toLowerCase()).not.toContain('how can i help')
    expect(result.replyText.toLowerCase()).not.toContain('what is your nationality')
    
    // Verify field extraction was called (via extractFieldsToState)
    const { extractFieldsToState } = await import('@/lib/ai/stateMachine')
    expect(extractFieldsToState).toHaveBeenCalled()
  })
})

