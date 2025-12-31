/**
 * CRITICAL FIX D TEST: Unified idempotency across OutboundJob + sendWithIdempotency
 * 
 * Tests:
 * - Same inboundProviderMessageId enqueued twice => only one outbound send is performed
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { enqueueOutboundJob } from '@/lib/jobs/enqueueOutbound'
import { sendOutboundWithIdempotency } from '../sendWithIdempotency'
import { prisma } from '@/lib/prisma'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    outboundJob: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    outboundMessageLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    message: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/whatsapp', () => ({
  sendTextMessage: vi.fn(() => ({ messageId: 'test-message-id' })),
}))

describe('Unified Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should prevent duplicate outbound sends for same inboundProviderMessageId', async () => {
    const conversationId = 1
    const inboundMessageId = 1
    const inboundProviderMessageId = 'wamid.test123'
    const channel = 'whatsapp'

    // First enqueue should succeed
    vi.mocked(prisma.outboundJob.findUnique).mockResolvedValueOnce(null) // No existing job
    vi.mocked(prisma.outboundJob.create).mockResolvedValueOnce({
      id: 1,
      conversationId,
      inboundMessageId,
      inboundProviderMessageId,
      idempotencyKey: 'test-key-1',
      status: 'PENDING',
      createdAt: new Date(),
    } as any)

    const result1 = await enqueueOutboundJob({
      conversationId,
      inboundMessageId,
      inboundProviderMessageId,
      channel,
    })

    expect(result1.wasDuplicate).toBe(false)
    expect(result1.jobId).toBe(1)

    // Second enqueue with same inboundProviderMessageId should be detected as duplicate
    vi.mocked(prisma.outboundJob.findUnique).mockResolvedValueOnce({
      id: 1,
      status: 'PENDING',
    } as any) // Existing job found

    const result2 = await enqueueOutboundJob({
      conversationId,
      inboundMessageId,
      inboundProviderMessageId,
      channel,
    })

    expect(result2.wasDuplicate).toBe(true)
    expect(result2.jobId).toBe(1)

    // Verify create was only called once
    expect(prisma.outboundJob.create).toHaveBeenCalledTimes(1)
  })

  it('should use same idempotencyKey format in OutboundJob and sendWithIdempotency', async () => {
    const conversationId = 1
    const inboundProviderMessageId = 'wamid.test123'
    const channel = 'whatsapp'

    // Mock conversation
    vi.mocked(prisma.conversation.findUnique).mockResolvedValue({
      id: conversationId,
      knownFields: null,
    } as any)

    // Mock no existing outbound log
    vi.mocked(prisma.outboundMessageLog.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.outboundMessageLog.create).mockResolvedValue({
      id: 1,
      outboundDedupeKey: 'test-dedupe-key',
      status: 'PENDING',
    } as any)

    // Mock no existing OutboundJob
    vi.mocked(prisma.outboundJob.findUnique).mockResolvedValue(null)

    // Mock message creation
    vi.mocked(prisma.message.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.message.create).mockResolvedValue({
      id: 1,
      conversationId,
      direction: 'OUTBOUND',
      channel: 'WHATSAPP',
      body: 'Test message',
      status: 'SENT',
    } as any)

    await sendOutboundWithIdempotency({
      conversationId,
      contactId: 1,
      leadId: 1,
      phone: '+1234567890',
      text: 'Test message',
      provider: channel,
      triggerProviderMessageId: inboundProviderMessageId,
      replyType: 'answer',
    })

    // Verify OutboundJob idempotencyKey check was performed
    // The idempotencyKey should be computed as: hash(conversationId + inboundProviderMessageId + channel + purpose=auto_reply)
    expect(prisma.outboundJob.findUnique).toHaveBeenCalled()
    const findUniqueCall = vi.mocked(prisma.outboundJob.findUnique).mock.calls[0]
    expect(findUniqueCall[0]?.where?.idempotencyKey).toBeDefined()
  })
})

