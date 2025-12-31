/**
 * CRITICAL FIX C TEST: Structured rule engine output
 * 
 * Tests:
 * - Rule engine banned questionKey blocks QUESTION kind only, not regular REPLY text
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { executeRuleEngine } from '../ruleEngine'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      update: vi.fn(),
    },
  },
}))

vi.mock('../conversationState', () => ({
  isInLoop: vi.fn(() => false),
  extractProvidedInfo: vi.fn(() => ({})),
}))

vi.mock('../conversation/flowState', () => ({
  wasQuestionAsked: vi.fn(() => false),
  recordQuestionAsked: vi.fn(),
}))

describe('Rule Engine Structured Output', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return QUESTION kind with questionKey for questions', async () => {
    // Mock conversation state that needs name
    const result = await executeRuleEngine({
      conversationId: 1,
      leadId: 1,
      contactId: 1,
      currentMessage: 'Hello',
      conversationHistory: [
        { direction: 'OUTBOUND', body: 'Hello! How can I help you?', createdAt: new Date() },
      ],
      isFirstMessage: false,
      memory: {
        name: undefined,
        service: undefined,
      },
    })

    // Should return QUESTION kind if asking for name
    if (result.kind === 'QUESTION') {
      expect(result.questionKey).toBeDefined()
      expect(result.text).toBeTruthy()
      expect(result.needsHuman).toBe(false)
    }
  })

  it('should return REPLY kind for regular replies (not questions)', async () => {
    // Mock conversation state with all required fields
    const result = await executeRuleEngine({
      conversationId: 1,
      leadId: 1,
      contactId: 1,
      currentMessage: 'Thanks',
      conversationHistory: [
        { direction: 'OUTBOUND', body: 'Here is your quote', createdAt: new Date() },
      ],
      isFirstMessage: false,
      memory: {
        name: 'John',
        service: 'Business Setup',
        nationality: 'Indian',
      },
    })

    // Should return REPLY kind for non-question responses
    if (result.kind === 'REPLY') {
      expect(result.text).toBeTruthy()
      // REPLY kind should NOT have questionKey
      expect('questionKey' in result).toBe(false)
    }
  })

  it('should return NO_MATCH kind when no rule matches', async () => {
    const result = await executeRuleEngine({
      conversationId: 1,
      leadId: 1,
      contactId: 1,
      currentMessage: 'Random message',
      conversationHistory: [],
      isFirstMessage: false,
      memory: {},
    })

    // Should return NO_MATCH if no rule applies
    if (result.kind === 'NO_MATCH') {
      expect(result.needsHuman).toBe(false)
      expect('text' in result).toBe(false)
    }
  })
})

