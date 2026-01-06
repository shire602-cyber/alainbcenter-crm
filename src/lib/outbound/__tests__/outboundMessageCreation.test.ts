/**
 * CRITICAL FIX 6 TEST: Outbound message creation happens for a send result
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendOutboundWithIdempotency } from '../sendWithIdempotency'
import { prisma } from '@/lib/prisma'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    outboundMessageLog: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    outboundJob: {
      findUnique: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/whatsapp', () => ({
  sendTextMessage: vi.fn(() => ({ messageId: 'test-message-id' })),
}))

describe('Outbound Message Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create Message record when WhatsApp send succeeds', async () => {
    // Mock conversation
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: 1,
      knownFields: null,
    } as any)

    // Mock no existing outbound log
    vi.mocked(prisma.outboundMessageLog.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.outboundMessageLog.create).mockResolvedValue({
      id: 1,
      outboundDedupeKey: 'test-key',
      status: 'PENDING',
    } as any)

    // Mock no existing OutboundJob
    vi.mocked(prisma.outboundJob.findUnique).mockResolvedValue(null)

    // Mock message creation
    vi.mocked(prisma.message.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: 1,
      conversationId: 1,
      direction: 'OUTBOUND',
      channel: 'WHATSAPP',
      body: 'Test message',
      status: 'SENT',
      providerMessageId: 'test-message-id',
    } as any)

    const result = await sendOutboundWithIdempotency({
      conversationId: 1,
      contactId: 1,
      leadId: 1,
      phone: '+1234567890',
      text: 'Test message',
      provider: 'whatsapp',
      triggerProviderMessageId: null,
      replyType: 'answer',
    })

    expect(result.success).toBe(true)
    expect(result.messageId).toBe('test-message-id')
    
    // CRITICAL FIX 6: Verify Message record was created
    expect(prisma.message.create).toHaveBeenCalled()
    const createCall = vi.mocked(prisma.message.create).mock.calls[0]
    expect(createCall[0].data.direction).toBe('OUTBOUND')
    expect(createCall[0].data.channel).toBe('WHATSAPP')
    expect(createCall[0].data.body).toBe('Test message')
    expect(createCall[0].data.providerMessageId).toBe('test-message-id')
  })

  it('should handle Message creation failure gracefully without reversing send', async () => {
    // Mock conversation
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: 1,
      knownFields: null,
    } as any)

    // Mock no existing outbound log
    vi.mocked(prisma.outboundMessageLog.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.outboundMessageLog.create).mockResolvedValue({
      id: 1,
      outboundDedupeKey: 'test-key',
      status: 'PENDING',
    } as any)
    vi.mocked(prisma.outboundMessageLog.update).mockResolvedValue({
      id: 1,
      status: 'SENT',
    } as any)

    // Mock no existing OutboundJob
    vi.mocked(prisma.outboundJob.findUnique).mockResolvedValue(null)

    // Mock message creation failure (but send succeeded)
    vi.mocked(prisma.message.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.message.create).mockRejectedValue(new Error('Message creation failed'))

    const result = await sendOutboundWithIdempotency({
      conversationId: 1,
      contactId: 1,
      leadId: 1,
      phone: '+1234567890',
      text: 'Test message',
      provider: 'whatsapp',
      triggerProviderMessageId: null,
      replyType: 'answer',
    })

    // CRITICAL FIX 6: Send should still succeed even if Message creation fails
    expect(result.success).toBe(true)
    expect(result.messageId).toBe('test-message-id')
    
    // OutboundMessageLog should still be marked SENT
    expect(prisma.outboundMessageLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'SENT' }),
      })
    )
  })
})










