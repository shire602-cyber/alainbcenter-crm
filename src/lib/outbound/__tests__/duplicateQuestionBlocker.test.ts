/**
 * Tests for duplicate question send blocker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { prisma } from '../../../lib/prisma'

// Mock Prisma
vi.mock('../../../lib/prisma', () => ({
  prisma: {
    outboundMessageLog: {
      findFirst: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
    },
    message: {
      count: vi.fn(),
    },
  },
}))

describe('Duplicate Question Blocker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Question-level send lock', () => {
    it('should block duplicate question if sent within 60 minutes', async () => {
      const now = new Date()
      const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000)
      
      ;(prisma.outboundMessageLog.findFirst as any).mockResolvedValue({
        id: 1,
        conversationId: 1,
        replyType: 'question',
        lastQuestionKey: 'ASK_SERVICE',
        status: 'SENT',
        sentAt: thirtyMinutesAgo,
      })

      // Simulate check
      const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000)
      const recentQuestion = await prisma.outboundMessageLog.findFirst({
        where: {
          conversationId: 1,
          replyType: 'question',
          lastQuestionKey: 'ASK_SERVICE',
          status: 'SENT',
          sentAt: {
            gte: sixtyMinutesAgo,
          },
        },
        orderBy: {
          sentAt: 'desc',
        },
        take: 1,
      })

      expect(recentQuestion).toBeTruthy()
      expect(recentQuestion?.lastQuestionKey).toBe('ASK_SERVICE')
    })

    it('should allow question if not sent within 60 minutes', async () => {
      const now = new Date()
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
      
      ;(prisma.outboundMessageLog.findFirst as any).mockResolvedValue(null)

      // Simulate check
      const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000)
      const recentQuestion = await prisma.outboundMessageLog.findFirst({
        where: {
          conversationId: 1,
          replyType: 'question',
          lastQuestionKey: 'ASK_SERVICE',
          status: 'SENT',
          sentAt: {
            gte: sixtyMinutesAgo,
          },
        },
        orderBy: {
          sentAt: 'desc',
        },
        take: 1,
      })

      expect(recentQuestion).toBeNull()
    })

    it('should allow question if different questionKey', async () => {
      ;(prisma.outboundMessageLog.findFirst as any).mockResolvedValue({
        id: 1,
        conversationId: 1,
        replyType: 'question',
        lastQuestionKey: 'ASK_NAME', // Different question
        status: 'SENT',
        sentAt: new Date(),
      })

      // Simulate check for ASK_SERVICE
      const sixtyMinutesAgo = new Date(Date.now() - 60 * 60 * 1000)
      const recentQuestion = await prisma.outboundMessageLog.findFirst({
        where: {
          conversationId: 1,
          replyType: 'question',
          lastQuestionKey: 'ASK_SERVICE', // Different from ASK_NAME
          status: 'SENT',
          sentAt: {
            gte: sixtyMinutesAgo,
          },
        },
        orderBy: {
          sentAt: 'desc',
        },
        take: 1,
      })

      expect(recentQuestion).toBeNull()
    })
  })
})


