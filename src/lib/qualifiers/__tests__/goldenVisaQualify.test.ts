/**
 * GOLDEN VISA QUALIFIER TESTS
 * 
 * Tests for strict Golden Visa qualification rules:
 * - "golden visa media personality" -> asks Q1 then Q2 portfolio proof question
 * - "I don't know category" -> ask Q1 with options; do not invent
 * - "maybe" answers -> still can escalate if timeline soon
 * - never uses forbidden phrases
 */

import { detectGoldenVisaIntent, goldenVisaQualify } from '../goldenVisaQualify'
import { prisma } from '../../prisma'

// Mock prisma
jest.mock('../../prisma', () => ({
  prisma: {
    lead: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    task: {
      create: jest.fn(),
    },
    notification: {
      create: jest.fn(),
    },
    integration: {
      findUnique: jest.fn(),
    },
  },
}))

describe('Golden Visa Qualifier', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('detectGoldenVisaIntent', () => {
    it('should detect "golden visa" intent', () => {
      expect(detectGoldenVisaIntent('I want a golden visa')).toBe(true)
      expect(detectGoldenVisaIntent('golden visa application')).toBe(true)
      expect(detectGoldenVisaIntent('10 year visa')).toBe(true)
      expect(detectGoldenVisaIntent('gold visa')).toBe(true)
    })

    it('should not detect intent for other services', () => {
      expect(detectGoldenVisaIntent('I want a family visa')).toBe(false)
      expect(detectGoldenVisaIntent('business setup')).toBe(false)
    })
  })

  describe('goldenVisaQualify - Media Personality Flow', () => {
    it('should ask Q1 category question for "golden visa media personality"', async () => {
      const mockLead = {
        id: 1,
        serviceTypeEnum: 'GOLDEN_VISA',
        dataJson: null,
      }

      const mockConversation = {
        id: 1,
        lastQuestionKey: null,
        collectedData: null,
      }

      ;(prisma.lead.findUnique as jest.Mock).mockResolvedValue(mockLead)
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.lead.update as jest.Mock).mockResolvedValue({})

      const result = await goldenVisaQualify(1, 1, 'I want a golden visa, I am a media personality')

      expect(result.replyText).toContain('Which Golden Visa category')
      expect(result.qualification.questionsAsked).toBe(0) // First question not counted yet
      expect(result.shouldEscalate).toBe(false)
    })

    it('should ask Q2 portfolio proof question after category selected', async () => {
      const mockLead = {
        id: 1,
        serviceTypeEnum: 'GOLDEN_VISA',
        dataJson: JSON.stringify({
          goldenVisa: {
            categoryKey: 'talent_media',
            answers: {},
            questionsAsked: 1,
          },
        }),
      }

      const mockConversation = {
        id: 1,
        lastQuestionKey: 'golden_visa_q1',
        collectedData: JSON.stringify({ golden_visa_q1: 'Which Golden Visa category' }),
      }

      ;(prisma.lead.findUnique as jest.Mock).mockResolvedValue(mockLead)
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.lead.update as jest.Mock).mockResolvedValue({})

      const result = await goldenVisaQualify(1, 1, 'talent media', 'Which Golden Visa category')

      expect(result.replyText).toContain('media work')
      expect(result.replyText).toContain('portfolio')
      expect(result.qualification.categoryKey).toBe('talent_media')
      expect(result.qualification.questionsAsked).toBe(1)
    })
  })

  describe('goldenVisaQualify - Unknown Category', () => {
    it('should ask Q1 with options and not invent categories', async () => {
      const mockLead = {
        id: 1,
        serviceTypeEnum: 'GOLDEN_VISA',
        dataJson: null,
      }

      const mockConversation = {
        id: 1,
        lastQuestionKey: null,
        collectedData: null,
      }

      ;(prisma.lead.findUnique as jest.Mock).mockResolvedValue(mockLead)
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.lead.update as jest.Mock).mockResolvedValue({})

      const result = await goldenVisaQualify(1, 1, "I don't know which category")

      expect(result.replyText).toContain('Which Golden Visa category')
      expect(result.replyText).toContain('Investor')
      expect(result.replyText).toContain('Professional')
      expect(result.replyText).toContain('Entrepreneur')
      expect(result.replyText).toContain('Student')
      expect(result.replyText).toContain('Talent like Media')
      expect(result.replyText).toContain('Scientist')
      expect(result.replyText).toContain('Other')
      // Should not invent categories
      expect(result.replyText).not.toContain('Business Owner')
      expect(result.replyText).not.toContain('Artist')
    })
  })

  describe('goldenVisaQualify - Maybe Answers', () => {
    it('should allow escalation if timeline is soon even with "maybe" answers', async () => {
      const mockLead = {
        id: 1,
        serviceTypeEnum: 'GOLDEN_VISA',
        dataJson: JSON.stringify({
          goldenVisa: {
            categoryKey: 'talent_media',
            answers: {
              mediaType: 'influencer',
            },
            proofStatus: 'partly', // "maybe" -> treated as "partly"
            questionsAsked: 3,
          },
        }),
      }

      const mockConversation = {
        id: 1,
        lastQuestionKey: 'golden_visa_q3',
        collectedData: JSON.stringify({ golden_visa_q3: 'documents ready' }),
      }

      ;(prisma.lead.findUnique as jest.Mock).mockResolvedValue(mockLead)
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.lead.update as jest.Mock).mockResolvedValue({})

      const result = await goldenVisaQualify(1, 1, 'this week', 'When would you like to get started')

      expect(result.qualification.proofStatus).toBe('partly')
      expect(result.qualification.startTimeline).toBe('this week')
      // Should escalate if timeline is soon (not "later")
      expect(result.shouldEscalate).toBe(true)
      expect(result.taskTitle).toBe('Golden Visa Consultation + Document Verification')
    })

    it('should not escalate if timeline is "later" even with eligible answers', async () => {
      const mockLead = {
        id: 1,
        serviceTypeEnum: 'GOLDEN_VISA',
        dataJson: JSON.stringify({
          goldenVisa: {
            categoryKey: 'talent_media',
            answers: {
              mediaType: 'influencer',
            },
            proofStatus: 'yes',
            questionsAsked: 3,
          },
        }),
      }

      const mockConversation = {
        id: 1,
        lastQuestionKey: 'golden_visa_q3',
        collectedData: JSON.stringify({ golden_visa_q3: 'documents ready' }),
      }

      ;(prisma.lead.findUnique as jest.Mock).mockResolvedValue(mockLead)
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.lead.update as jest.Mock).mockResolvedValue({})

      const result = await goldenVisaQualify(1, 1, 'later', 'When would you like to get started')

      expect(result.qualification.startTimeline).toBe('later')
      // Should not escalate if timeline is "later"
      expect(result.shouldEscalate).toBe(false)
    })
  })

  describe('Forbidden Phrases', () => {
    it('should never use forbidden phrases in replies', async () => {
      const mockLead = {
        id: 1,
        serviceTypeEnum: 'GOLDEN_VISA',
        dataJson: JSON.stringify({
          goldenVisa: {
            categoryKey: 'talent_media',
            answers: {},
            questionsAsked: 4,
            likelyEligible: true,
            startTimeline: 'ASAP',
          },
        }),
      }

      const mockConversation = {
        id: 1,
        lastQuestionKey: null,
        collectedData: null,
      }

      ;(prisma.lead.findUnique as jest.Mock).mockResolvedValue(mockLead)
      ;(prisma.conversation.findUnique as jest.Mock).mockResolvedValue(mockConversation)
      ;(prisma.integration.findUnique as jest.Mock).mockResolvedValue(null)
      ;(prisma.lead.update as jest.Mock).mockResolvedValue({})

      const result = await goldenVisaQualify(1, 1, 'test')

      const forbiddenPhrases = [
        'guaranteed',
        'approval guaranteed',
        '100%',
        'inside contact',
        'government connection',
        'definitely approved',
        'sure to get',
        'will be approved',
      ]

      if (result.replyText) {
        const lowerReply = result.replyText.toLowerCase()
        for (const phrase of forbiddenPhrases) {
          expect(lowerReply).not.toContain(phrase)
        }
      }
    })
  })
})

