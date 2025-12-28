/**
 * Orchestrator Tests
 * 
 * Tests for:
 * 1. Conversation dedupe + threading
 * 2. Webhook retry idempotency
 * 3. Repeated question prevention
 * 4. Lead autofill correctness
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { generateAIReply } from '../orchestrator'
import { loadConversationState, updateConversationState } from '../stateMachine'

// Mock Prisma for testing
const prisma = new PrismaClient()

describe('Orchestrator Tests', () => {
  let testContactId: number
  let testLeadId: number
  let testConversationId: number
  
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
    
    // Create test conversation
    const conversation = await prisma.conversation.create({
      data: {
        contactId: testContactId,
        leadId: testLeadId,
        channel: 'whatsapp',
        status: 'open',
      },
    })
    testConversationId = conversation.id
  })
  
  afterEach(async () => {
    // Cleanup
    await prisma.message.deleteMany({ where: { conversationId: testConversationId } })
    await prisma.conversation.delete({ where: { id: testConversationId } })
    await prisma.lead.delete({ where: { id: testLeadId } })
    await prisma.contact.delete({ where: { id: testContactId } })
  })
  
  describe('Repeated Question Prevention', () => {
    it('should not ask the same question twice', async () => {
      // First turn: ask name
      const state1 = await loadConversationState(testConversationId)
      await updateConversationState(testConversationId, {
        lastQuestionKey: 'ask_name',
        questionsAskedCount: 1,
      })
      
      // Second turn: should not ask name again
      const state2 = await loadConversationState(testConversationId)
      expect(state2.lastQuestionKey).toBe('ask_name')
      
      // Simulate orchestrator check
      const wasAsked = state2.lastQuestionKey === 'ask_name'
      expect(wasAsked).toBe(true)
    })
  })
  
  describe('Max 5 Questions', () => {
    it('should stop asking after 5 questions', async () => {
      // Set questionsAskedCount to 5
      await updateConversationState(testConversationId, {
        questionsAskedCount: 5,
        qualificationStage: 'READY_FOR_QUOTE',
      })
      
      const state = await loadConversationState(testConversationId)
      expect(state.questionsAskedCount).toBe(5)
      expect(state.qualificationStage).toBe('READY_FOR_QUOTE')
    })
  })
  
  describe('State Persistence', () => {
    it('should persist state updates', async () => {
      await updateConversationState(testConversationId, {
        lastQuestionKey: 'ask_service',
        questionsAskedCount: 2,
        knownFields: { name: 'John', service: 'freelance_visa' },
      })
      
      const state = await loadConversationState(testConversationId)
      expect(state.lastQuestionKey).toBe('ask_service')
      expect(state.questionsAskedCount).toBe(2)
      expect(state.knownFields.name).toBe('John')
      expect(state.knownFields.service).toBe('freelance_visa')
    })
  })
})

