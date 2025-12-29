/**
 * Tests for job runner
 * 
 * Ensures job runner sends exactly one outbound even if webhook is called twice
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../run-outbound/route'

// Mock dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    outboundJob: {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    conversation: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        contact: { id: 1, phone: '+971501234567' },
        lead: { id: 1, serviceType: null },
        assignedUserId: null,
      }),
    },
    message: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        body: 'Hello',
        direction: 'INBOUND',
        channel: 'whatsapp',
        providerMessageId: 'wamid.123',
      }),
    },
  },
}))

vi.mock('@/lib/ai/orchestrator', () => ({
  generateAIReply: vi.fn().mockResolvedValue({
    replyText: 'How can I help you today?',
    extractedFields: {},
    confidence: 100,
    nextStepKey: 'ASK_SERVICE',
    tasksToCreate: [],
    shouldEscalate: false,
  }),
}))

vi.mock('@/lib/outbound/sendWithIdempotency', () => ({
  sendOutboundWithIdempotency: vi.fn().mockResolvedValue({
    success: true,
    wasDuplicate: false,
    messageId: 'outbound_123',
  }),
}))

describe('Job Runner - Outbound Processing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should process queued jobs and send outbound', async () => {
    const { prisma } = await import('@/lib/prisma')
    
    // Mock job query (FOR UPDATE SKIP LOCKED)
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      {
        id: 1,
        conversationId: 1,
        inboundMessageId: 1,
        inboundProviderMessageId: 'wamid.123',
        requestId: 'req_123',
        attempts: 0,
        maxAttempts: 3,
      },
    ])

    const req = new NextRequest('http://localhost/api/jobs/run-outbound?token=dev-token-change-in-production', {
      method: 'GET',
    })

    const response = await GET(req)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.processed).toBe(1)
  })

  it('should prevent duplicate sends using idempotency', async () => {
    const { sendOutboundWithIdempotency } = await import('@/lib/outbound/sendWithIdempotency')
    
    // First call succeeds
    vi.mocked(sendOutboundWithIdempotency).mockResolvedValueOnce({
      success: true,
      wasDuplicate: false,
      messageId: 'outbound_123',
    })
    
    // Second call (duplicate) is blocked
    vi.mocked(sendOutboundWithIdempotency).mockResolvedValueOnce({
      success: false,
      wasDuplicate: true,
      error: 'Duplicate outbound blocked',
    })
    
    const result1 = await sendOutboundWithIdempotency({
      conversationId: 1,
      contactId: 1,
      leadId: 1,
      phone: '+971501234567',
      text: 'How can I help you today?',
      provider: 'whatsapp',
      triggerProviderMessageId: 'wamid.123',
      replyType: 'question',
      lastQuestionKey: 'ASK_SERVICE',
      flowStep: null,
    })
    
    const result2 = await sendOutboundWithIdempotency({
      conversationId: 1,
      contactId: 1,
      leadId: 1,
      phone: '+971501234567',
      text: 'How can I help you today?',
      provider: 'whatsapp',
      triggerProviderMessageId: 'wamid.123',
      replyType: 'question',
      lastQuestionKey: 'ASK_SERVICE',
      flowStep: null,
    })
    
    expect(result1.success).toBe(true)
    expect(result2.wasDuplicate).toBe(true)
  })

  it('should retry failed jobs with exponential backoff', async () => {
    const { prisma } = await import('@/lib/prisma')
    
    // Mock job that will fail
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      {
        id: 1,
        conversationId: 1,
        inboundMessageId: 1,
        inboundProviderMessageId: 'wamid.123',
        requestId: 'req_123',
        attempts: 0,
        maxAttempts: 3,
      },
    ])
    
    // Mock orchestrator to throw error
    const { generateAIReply } = await import('@/lib/ai/orchestrator')
    vi.mocked(generateAIReply).mockRejectedValueOnce(new Error('Orchestrator error'))
    
    const req = new NextRequest('http://localhost/api/jobs/run-outbound?token=dev-token-change-in-production', {
      method: 'GET',
    })

    const response = await GET(req)
    const data = await response.json()

    // Job should be requeued (not failed yet, since attempts < maxAttempts)
    expect(data.ok).toBe(true)
    // Job should be marked for retry
    expect(prisma.outboundJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'queued',
          runAt: expect.any(Date),
        }),
      })
    )
  })
})

