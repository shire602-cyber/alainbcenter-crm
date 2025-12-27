/**
 * Tests for Outbound Message Idempotency
 */

import { checkOutboundIdempotency, generateOutboundIdempotencyKey } from '../idempotency'
import { prisma } from '../../prisma'

// Mock prisma
jest.mock('../../prisma', () => ({
  prisma: {
    message: {
      findMany: jest.fn(),
    },
  },
}))

describe('Outbound Idempotency', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('checkOutboundIdempotency', () => {
    it('should return not duplicate for new message', async () => {
      ;(prisma.message.findMany as jest.Mock).mockResolvedValue([])

      const result = await checkOutboundIdempotency(
        1, // contactId
        100, // leadId
        'Hello, how can I help?',
        'whatsapp',
        5 // 5 minutes
      )

      expect(result.isDuplicate).toBe(false)
      expect(result.existingMessageId).toBeUndefined()
    })

    it('should detect exact duplicate within time window', async () => {
      const now = new Date()
      const fiveMinutesAgo = new Date(now.getTime() - 4 * 60 * 1000) // 4 minutes ago

      ;(prisma.message.findMany as jest.Mock).mockResolvedValue([
        {
          id: 123,
          body: 'Hello, how can I help?',
          createdAt: fiveMinutesAgo,
          status: 'SENT',
        },
      ])

      const result = await checkOutboundIdempotency(
        1,
        100,
        'Hello, how can I help?',
        'whatsapp',
        5
      )

      expect(result.isDuplicate).toBe(true)
      expect(result.existingMessageId).toBe(123)
      expect(result.reason).toContain('Identical message')
    })

    it('should not detect duplicate outside time window', async () => {
      const now = new Date()
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000) // 10 minutes ago

      ;(prisma.message.findMany as jest.Mock).mockResolvedValue([
        {
          id: 123,
          body: 'Hello, how can I help?',
          createdAt: tenMinutesAgo,
          status: 'SENT',
        },
      ])

      const result = await checkOutboundIdempotency(
        1,
        100,
        'Hello, how can I help?',
        'whatsapp',
        5
      )

      expect(result.isDuplicate).toBe(false)
    })

    it('should detect very similar messages (90%+ similarity)', async () => {
      const now = new Date()
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000)

      ;(prisma.message.findMany as jest.Mock).mockResolvedValue([
        {
          id: 123,
          body: 'Hello, how can I help you?', // Very similar
          createdAt: twoMinutesAgo,
          status: 'SENT',
        },
      ])

      const result = await checkOutboundIdempotency(
        1,
        100,
        'Hello, how can I help?', // Slightly different
        'whatsapp',
        5
      )

      expect(result.isDuplicate).toBe(true)
      expect(result.reason).toContain('Very similar message')
    })

    it('should handle empty message text', async () => {
      const result = await checkOutboundIdempotency(1, 100, '', 'whatsapp', 5)
      expect(result.isDuplicate).toBe(false)
    })
  })

  describe('generateOutboundIdempotencyKey', () => {
    it('should generate consistent keys for same input', () => {
      const key1 = generateOutboundIdempotencyKey(1, 100, 'Hello')
      const key2 = generateOutboundIdempotencyKey(1, 100, 'Hello')
      
      // Keys should be same (within same 5-minute window)
      expect(key1).toBe(key2)
    })

    it('should include contactId and leadId in key', () => {
      const key = generateOutboundIdempotencyKey(123, 456, 'Test message')
      expect(key).toContain('123')
      expect(key).toContain('456')
    })

    it('should handle null leadId', () => {
      const key = generateOutboundIdempotencyKey(123, null, 'Test message')
      expect(key).toContain('null')
    })
  })
})

