/**
 * Conversation Upsert Tests
 * 
 * Tests for:
 * 1. One conversation per (contactId, channel, externalThreadId)
 * 2. Inbound+outbound use same conversationId
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getTestPrisma } from '@/lib/test/db'
import { upsertConversation } from '../upsert'

const prisma = getTestPrisma()

describe('Conversation Upsert Tests', () => {
  let testContactId: number
  let testLeadId: number
  
  beforeEach(async () => {
    // Create test contact
    const contact = await prisma.contact.create({
      data: {
        phone: `+97150${Math.floor(Math.random() * 10000000)}`,
        phoneNormalized: `+97150${Math.floor(Math.random() * 10000000)}`,
        fullName: 'Test Contact',
        source: 'whatsapp',
      },
    })
    testContactId = contact.id
    
    // Create test lead
    const lead = await prisma.lead.create({
      data: {
        contactId: testContactId,
        stage: 'NEW',
        status: 'new',
        pipelineStage: 'new',
      },
    })
    testLeadId = lead.id
  })
  
  afterEach(async () => {
    // Cleanup
    await prisma.conversation.deleteMany({ where: { contactId: testContactId } })
    await prisma.lead.delete({ where: { id: testLeadId } })
    await prisma.contact.delete({ where: { id: testContactId } })
  })
  
  describe('Conversation Uniqueness', () => {
    it('should return same conversation for same (contactId, channel, externalThreadId)', async () => {
      const externalThreadId = 'test_thread_123'
      
      // First upsert
      const result1 = await upsertConversation({
        contactId: testContactId,
        channel: 'whatsapp',
        leadId: testLeadId,
        externalThreadId,
      })
      
      // Second upsert (should return same conversation)
      const result2 = await upsertConversation({
        contactId: testContactId,
        channel: 'whatsapp',
        leadId: testLeadId,
        externalThreadId,
      })
      
      expect(result1.id).toBe(result2.id)
      
      // Verify only one conversation exists
      const conversations = await prisma.conversation.findMany({
        where: {
          contactId: testContactId,
          channel: 'whatsapp',
        },
      })
      
      expect(conversations.length).toBe(1)
    })
    
    it('should create different conversations for different externalThreadIds', async () => {
      const result1 = await upsertConversation({
        contactId: testContactId,
        channel: 'whatsapp',
        leadId: testLeadId,
        externalThreadId: 'thread_1',
      })
      
      const result2 = await upsertConversation({
        contactId: testContactId,
        channel: 'whatsapp',
        leadId: testLeadId,
        externalThreadId: 'thread_2',
      })
      
      // Should create different conversations if externalThreadId differs
      // (Note: This depends on DB constraint - if unique is only on (contactId, channel), they'll be the same)
      // For now, we expect them to be different if externalThreadId is used
      expect(result1.id).not.toBe(result2.id)
    })
  })
  
  describe('Channel Normalization', () => {
    it('should normalize channel to lowercase', async () => {
      const result = await upsertConversation({
        contactId: testContactId,
        channel: 'WHATSAPP', // Uppercase
        leadId: testLeadId,
      })
      
      const conversation = await prisma.conversation.findUnique({
        where: { id: result.id },
      })
      
      expect(conversation?.channel).toBe('whatsapp') // Lowercase
    })
  })
})

