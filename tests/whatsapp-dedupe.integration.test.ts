/**
 * Integration Tests: WhatsApp Webhook Handler + Database
 * 
 * Tests idempotency, deduplication, and flow state in realistic scenarios
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../src/app/api/webhooks/whatsapp/route'
import { getTestPrisma, cleanTestDb, setupTestDb, closeTestDb } from './helpers/testDb'
import {
  buildInboundTextPayload,
  buildDuplicatePayloadSameId,
  buildInboundTextPayloadNewId,
  buildInboundStatusPayload,
  buildEchoPayload,
} from './helpers/metaPayloadBuilder'
import {
  resetMockSendCalls,
  getMockSendCalls,
  getMockSendCallCount,
  mockSendTextMessage,
} from './helpers/mockWhatsApp'

// Mock WhatsApp send function BEFORE importing route
vi.mock('../src/lib/whatsapp', async () => {
  const actual = await vi.importActual('../src/lib/whatsapp')
  return {
    ...actual,
    sendTextMessage: vi.fn((to: string, text: string) => mockSendTextMessage(to, text)),
  }
})

describe('WhatsApp Webhook Integration Tests', () => {
  let prisma: ReturnType<typeof getTestPrisma>
  let testContactId: number
  let testLeadId: number
  let testConversationId: number
  const testPhone = '971501234567'

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      console.warn('⚠️ TEST_DATABASE_URL not set - skipping integration tests')
      return
    }
    await setupTestDb()
    prisma = getTestPrisma()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await cleanTestDb()
    resetMockSendCalls()

    // Create test contact, lead, and conversation
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Test Contact',
        phone: `+${testPhone}`,
      },
    })
    testContactId = contact.id

    const lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        stage: 'NEW',
        pipelineStage: 'new',
        status: 'new',
        // @ts-ignore
        autoReplyEnabled: true,
      },
    })
    testLeadId = lead.id

    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        leadId: lead.id,
        channel: 'whatsapp',
      },
    })
    testConversationId = conversation.id
  })

  describe('3.1 Single Inbound => Single Outbound', () => {
    it('should send exactly one outbound message for one inbound', async () => {
      const payload = buildInboundTextPayload({
        id: 'wamid.test.001',
        from: testPhone,
        text: 'Hi',
      })

      const request = new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'application/json',
        },
      })

      // Process webhook
      const response = await POST(request)
      expect(response.status).toBe(200)

      // Wait for background processing (give it time)
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Assert: Exactly one outbound sent
      expect(getMockSendCallCount()).toBe(1)

      // Assert: OutboundMessageLog has exactly one entry
      const outboundLogs = await prisma.outboundMessageLog.findMany({
        where: {
          triggerProviderMessageId: 'wamid.test.001',
        },
      })
      expect(outboundLogs.length).toBe(1)
      expect(outboundLogs[0].triggerProviderMessageId).toBe('wamid.test.001')

      // Assert: InboundMessageDedup has one entry
      const dedup = await prisma.inboundMessageDedup.findUnique({
        where: { providerMessageId: 'wamid.test.001' },
      })
      expect(dedup).toBeTruthy()
      expect(dedup?.processingStatus).toBe('COMPLETED')
    })
  })

  describe('3.2 Exact Duplicate Webhook (Same ID)', () => {
    it('should NOT send additional outbound for duplicate webhook', async () => {
      const payload1 = buildInboundTextPayload({
        id: 'wamid.test.002',
        from: testPhone,
        text: 'Hello',
      })

      // First request
      const request1 = new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        body: JSON.stringify(payload1),
        headers: { 'Content-Type': 'application/json' },
      })
      const response1 = await POST(request1)
      expect(response1.status).toBe(200)

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Second request (exact duplicate)
      const payload2 = buildDuplicatePayloadSameId(payload1)
      const request2 = new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        body: JSON.stringify(payload2),
        headers: { 'Content-Type': 'application/json' },
      })
      const response2 = await POST(request2)
      expect(response2.status).toBe(200)

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Assert: Still only one outbound
      expect(getMockSendCallCount()).toBe(1)

      // Assert: InboundMessageDedup has exactly one row
      const dedups = await prisma.inboundMessageDedup.findMany({
        where: { providerMessageId: 'wamid.test.002' },
      })
      expect(dedups.length).toBe(1)

      // Assert: OutboundMessageLog still has one entry
      const outboundLogs = await prisma.outboundMessageLog.findMany({
        where: { triggerProviderMessageId: 'wamid.test.002' },
      })
      expect(outboundLogs.length).toBe(1)
    })
  })

  describe('3.3 Duplicate Webhook Replay Storm', () => {
    it('should handle 20 sequential duplicate requests', async () => {
      const payload = buildInboundTextPayload({
        id: 'wamid.test.003',
        from: testPhone,
        text: 'Test message',
      })

      // Send 20 requests sequentially
      for (let i = 0; i < 20; i++) {
        const request = new NextRequest('http://localhost/api/webhooks/whatsapp', {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { 'Content-Type': 'application/json' },
        })
        const response = await POST(request)
        expect(response.status).toBe(200)
      }

      // Wait for all processing
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Assert: Only one outbound sent
      expect(getMockSendCallCount()).toBe(1)

      // Assert: Only one dedup record
      const dedups = await prisma.inboundMessageDedup.findMany({
        where: { providerMessageId: 'wamid.test.003' },
      })
      expect(dedups.length).toBe(1)
    })
  })

  describe('3.4 Concurrency Test: Parallel Duplicate Requests', () => {
    it('should handle 10 parallel requests with same ID', async () => {
      const payload = buildInboundTextPayload({
        id: 'wamid.test.004',
        from: testPhone,
        text: 'Concurrent test',
      })

      // Send 10 parallel requests
      const requests = Array.from({ length: 10 }, () =>
        POST(
          new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )

      const responses = await Promise.all(requests)

      // All should return 200
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Assert: Only one outbound sent
      expect(getMockSendCallCount()).toBe(1)

      // Assert: Only one dedup record (unique constraint enforced)
      const dedups = await prisma.inboundMessageDedup.findMany({
        where: { providerMessageId: 'wamid.test.004' },
      })
      expect(dedups.length).toBe(1)
    })
  })

  describe('3.5 Concurrency Test: Two Different Messages', () => {
    it('should process two different messages correctly', async () => {
      const payload1 = buildInboundTextPayload({
        id: 'wamid.test.005',
        from: testPhone,
        text: 'Hi',
      })

      const payload2 = buildInboundTextPayload({
        id: 'wamid.test.006',
        from: testPhone,
        text: 'Partner',
      })

      // Send both in parallel
      const [response1, response2] = await Promise.all([
        POST(
          new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            body: JSON.stringify(payload1),
            headers: { 'Content-Type': 'application/json' },
          })
        ),
        POST(
          new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            body: JSON.stringify(payload2),
            headers: { 'Content-Type': 'application/json' },
          })
        ),
      ])

      expect(response1.status).toBe(200)
      expect(response2.status).toBe(200)

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Assert: Two outbound messages (one per inbound)
      expect(getMockSendCallCount()).toBe(2)

      // Assert: Two outbound logs
      const outboundLogs = await prisma.outboundMessageLog.findMany({
        where: {
          conversationId: testConversationId,
        },
        orderBy: { createdAt: 'asc' },
      })
      expect(outboundLogs.length).toBe(2)
      expect(outboundLogs[0].triggerProviderMessageId).toBe('wamid.test.005')
      expect(outboundLogs[1].triggerProviderMessageId).toBe('wamid.test.006')

      // Assert: Two dedup records
      const dedups = await prisma.inboundMessageDedup.findMany({
        where: {
          providerMessageId: {
            in: ['wamid.test.005', 'wamid.test.006'],
          },
        },
      })
      expect(dedups.length).toBe(2)
    })
  })

  describe('3.6 Outbound Echo/Status Ignored', () => {
    it('should ignore status update payloads', async () => {
      const statusPayload = buildInboundStatusPayload({
        id: 'wamid.status.001',
        status: 'delivered',
      })

      const request = new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        body: JSON.stringify(statusPayload),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(200)

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Assert: No outbound sent
      expect(getMockSendCallCount()).toBe(0)
    })

    it('should ignore echo payloads (from our own number)', async () => {
      const echoPayload = buildEchoPayload('wamid.echo.001', '123456789')

      const request = new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        body: JSON.stringify(echoPayload),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(200)

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Assert: No outbound sent
      expect(getMockSendCallCount()).toBe(0)
    })
  })

  describe('3.7 Loop Prevention', () => {
    it('should not process outbound messages as inbound', async () => {
      // This is tested implicitly - if we send an outbound, it should not trigger
      // another inbound processing cycle. The echo detection handles this.
      
      // Send a message that looks like it could be from our system
      const echoPayload = buildEchoPayload('wamid.loop.001', '123456789')

      const request = new NextRequest('http://localhost/api/webhooks/whatsapp', {
        method: 'POST',
        body: JSON.stringify(echoPayload),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      expect(response.status).toBe(200)

      await new Promise(resolve => setTimeout(resolve, 1000))

      // Assert: No outbound (echo was ignored)
      expect(getMockSendCallCount()).toBe(0)
    })
  })
})

describe('4. Flow Anti-Repeat Tests (Real Bug Repro)', () => {
  let prisma: ReturnType<typeof getTestPrisma>
  let testContactId: number
  let testLeadId: number
  let testConversationId: number
  const testPhone = '971501234567'

  beforeAll(async () => {
    await setupTestDb()
    prisma = getTestPrisma()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await cleanTestDb()
    resetMockSendCalls()

    const contact = await prisma.contact.create({
      data: {
        fullName: 'Test Contact',
        phone: `+${testPhone}`,
      },
    })
    testContactId = contact.id

    const lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        stage: 'NEW',
        pipelineStage: 'new',
        status: 'new',
        // @ts-ignore
        autoReplyEnabled: true,
      },
    })
    testLeadId = lead.id

    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        leadId: lead.id,
        channel: 'whatsapp',
      },
    })
    testConversationId = conversation.id
  })

  it('4.1 should NOT ask sponsor visa type again after user answered "Partner"', async () => {
    // Step 1: User says "I'm looking for family visa"
    const payload1 = buildInboundTextPayload({
      id: 'wamid.family.001',
      from: testPhone,
      text: "I'm looking for family visa",
    })

    const request1 = new NextRequest('http://localhost/api/webhooks/whatsapp', {
      method: 'POST',
      body: JSON.stringify(payload1),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(request1)
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Step 2: User says "Partner"
    const payload2 = buildInboundTextPayload({
      id: 'wamid.family.002',
      from: testPhone,
      text: 'Partner',
    })

    const request2 = new NextRequest('http://localhost/api/webhooks/whatsapp', {
      method: 'POST',
      body: JSON.stringify(payload2),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(request2)
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Step 3: User sends "Partner" again (duplicate user input, new providerMessageId)
    const payload3 = buildInboundTextPayloadNewId(payload2, 'wamid.family.003')

    const request3 = new NextRequest('http://localhost/api/webhooks/whatsapp', {
      method: 'POST',
      body: JSON.stringify(payload3),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(request3)
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Assert: Check conversation flow state
    const conversation = await prisma.conversation.findUnique({
      where: { id: testConversationId },
    })

    // Should have collected sponsorVisaType
    const collectedData = conversation?.collectedData 
      ? JSON.parse(conversation.collectedData) 
      : {}
    
    // Assert: Sponsor visa type should be stored
    expect(collectedData.sponsorVisaType || collectedData.sponsor_status).toBeTruthy()

    // Assert: Check all outbound messages - SPONSOR_VISA_TYPE question should appear only once
    const outboundMessages = await prisma.message.findMany({
      where: {
        conversationId: testConversationId,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'asc' },
    })

    const sponsorQuestionCount = outboundMessages.filter(msg => 
      msg.body?.toLowerCase().includes('what type of uae visa') ||
      msg.body?.toLowerCase().includes('employment / partner / investor')
    ).length

    // Should ask sponsor question at most once (unless clarification allowed)
    expect(sponsorQuestionCount).toBeLessThanOrEqual(1)
  })
})

describe('5. Hard Guarantees via DB Constraints', () => {
  let prisma: ReturnType<typeof getTestPrisma>

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      console.warn('⚠️ TEST_DATABASE_URL not set - skipping integration tests')
      return
    }
    await setupTestDb()
    prisma = getTestPrisma()
  })

  afterAll(async () => {
    await closeTestDb()
  })

  beforeEach(async () => {
    await cleanTestDb()
  })

  it('5.1 should enforce unique constraint on InboundMessageDedup', async () => {
    // Create first record
    await prisma.inboundMessageDedup.create({
      data: {
        provider: 'whatsapp',
        providerMessageId: 'wamid.constraint.001',
        processingStatus: 'PROCESSING',
      },
    })

    // Try to create duplicate - should fail
    await expect(
      prisma.inboundMessageDedup.create({
        data: {
          provider: 'whatsapp',
          providerMessageId: 'wamid.constraint.001', // Same ID
          processingStatus: 'PROCESSING',
        },
      })
    ).rejects.toThrow() // Should throw unique constraint violation
  })

  it('5.2 should enforce unique constraint on OutboundMessageLog', async () => {
    // Create test conversation
    const contact = await prisma.contact.create({
      data: {
        fullName: 'Test',
        phone: '+971501234567',
      },
    })

    const conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        channel: 'whatsapp',
      },
    })

    // Create first outbound log
    await prisma.outboundMessageLog.create({
      data: {
        provider: 'whatsapp',
        conversationId: conversation.id,
        triggerProviderMessageId: 'wamid.constraint.002',
        outboundTextHash: 'hash1',
      },
    })

    // Try to create duplicate - should fail
    await expect(
      prisma.outboundMessageLog.create({
        data: {
          provider: 'whatsapp',
          conversationId: conversation.id,
          triggerProviderMessageId: 'wamid.constraint.002', // Same trigger ID
          outboundTextHash: 'hash2',
        },
      })
    ).rejects.toThrow() // Should throw unique constraint violation
  })
})

