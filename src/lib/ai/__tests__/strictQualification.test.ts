/**
 * Tests for Strict AI Qualification Rules
 */

import { validateQualificationRules, parseQualificationOutput } from '../strictQualification'
import { prisma } from '../../prisma'

// Mock prisma
jest.mock('../../prisma', () => ({
  prisma: {
    conversation: {
      findUnique: jest.fn(),
    },
  },
}))

describe('Strict AI Qualification', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('validateQualificationRules', () => {
    it('should reject replies with more than 1 question', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        lead: { id: 1, serviceTypeEnum: 'FREELANCE_VISA' },
        messages: [],
        collectedData: null,
        lastQuestionKey: null,
      })

      const reply = 'What is your nationality? And where are you located?'
      const result = await validateQualificationRules(1, reply)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Max 1 question')
      expect(result.sanitizedReply).toBeDefined()
    })

    it('should reject prohibited location questions', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        lead: { id: 1, serviceTypeEnum: 'FREELANCE_VISA' },
        messages: [],
        collectedData: null,
        lastQuestionKey: null,
      })

      const reply = 'Are you in UAE?'
      const result = await validateQualificationRules(1, reply)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Prohibited question pattern')
    })

    it('should reject approval guarantees', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        lead: { id: 1, serviceTypeEnum: 'FREELANCE_VISA' },
        messages: [],
        collectedData: null,
        lastQuestionKey: null,
      })

      const reply = 'Your visa is guaranteed to be approved'
      const result = await validateQualificationRules(1, reply)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Cannot promise approvals')
    })

    it('should reject exact final prices', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        lead: { id: 1, serviceTypeEnum: 'FREELANCE_VISA' },
        messages: [],
        collectedData: null,
        lastQuestionKey: null,
      })

      const reply = 'The final price is exactly AED 8,500'
      const result = await validateQualificationRules(1, reply)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Cannot quote exact final prices')
    })

    it('should allow valid single-question replies', async () => {
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        lead: { id: 1, serviceTypeEnum: 'FREELANCE_VISA' },
        messages: [],
        collectedData: null,
        lastQuestionKey: null,
      })

      const reply = 'What is your nationality?'
      const result = await validateQualificationRules(1, reply)

      expect(result.isValid).toBe(true)
    })

    it('should enforce max 5 questions total', async () => {
      const collectedData = {
        question_1: 'What is your nationality?',
        question_2: 'Where are you located?',
        question_3: 'What service do you need?',
        question_4: 'When do you need it?',
        question_5: 'Do you have documents?',
      }

      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        lead: { id: 1, serviceTypeEnum: 'FREELANCE_VISA' },
        messages: [],
        collectedData: JSON.stringify(collectedData),
        lastQuestionKey: 'question_5',
      })

      const reply = 'One more question?'
      const result = await validateQualificationRules(1, reply)

      expect(result.isValid).toBe(false)
      expect(result.error).toContain('Max 5 questions reached')
    })
  })

  describe('parseQualificationOutput', () => {
    it('should parse valid JSON output', () => {
      const validJson = JSON.stringify({
        reply_text: 'Hello, how can I help?',
        detected_service: 'freelance_visa',
        collected_fields: { nationality: 'Indian' },
        next_question: 'Where are you located?',
        should_escalate: false,
        handover_reason: null,
      })

      const result = parseQualificationOutput(validJson)

      expect(result).not.toBeNull()
      expect(result?.reply_text).toBe('Hello, how can I help?')
      expect(result?.detected_service).toBe('freelance_visa')
      expect(result?.should_escalate).toBe(false)
    })

    it('should handle JSON wrapped in text', () => {
      const wrappedJson = 'Here is the response: ' + JSON.stringify({
        reply_text: 'Test',
        should_escalate: false,
      })

      const result = parseQualificationOutput(wrappedJson)

      expect(result).not.toBeNull()
      expect(result?.reply_text).toBe('Test')
    })

    it('should return null for invalid JSON', () => {
      const invalidJson = 'Not JSON at all'
      const result = parseQualificationOutput(invalidJson)

      expect(result).toBeNull()
    })

    it('should return null for missing required fields', () => {
      const incompleteJson = JSON.stringify({
        detected_service: 'freelance_visa',
        // Missing reply_text
      })

      const result = parseQualificationOutput(incompleteJson)

      expect(result).toBeNull()
    })
  })
})

