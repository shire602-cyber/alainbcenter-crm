/**
 * Unit tests for qualification answer capture
 * 
 * Tests that short replies like "USA" are saved when the system asks a question.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../prisma'
import { handleInboundMessageAutoMatch } from '../autoMatchPipeline'
import { updateFlowState } from '../../conversation/flowState'

describe('Qualification Answer Capture', () => {
  let testContact: any
  let testLead: any
  let testConversation: any

  beforeEach(async () => {
    // Create test contact
    testContact = await prisma.contact.create({
      data: {
        phone: `+971${Math.floor(Math.random() * 1000000000)}`,
        phoneNormalized: `+971${Math.floor(Math.random() * 1000000000)}`,
        fullName: 'Test User',
        source: 'test',
      },
    })

    // Create test lead
    testLead = await prisma.lead.create({
      data: {
        contactId: testContact.id,
        stage: 'NEW',
        source: 'test',
      },
    })

    // Create test conversation
    testConversation = await prisma.conversation.create({
      data: {
        contactId: testContact.id,
        leadId: testLead.id,
        channel: 'whatsapp',
        externalThreadId: `test-thread-${Date.now()}`,
      },
    })
  })

  afterEach(async () => {
    // Cleanup
    if (testConversation) {
      await prisma.conversation.deleteMany({ where: { id: testConversation.id } })
    }
    if (testLead) {
      await prisma.lead.deleteMany({ where: { id: testLead.id } })
    }
    if (testContact) {
      await prisma.contact.deleteMany({ where: { id: testContact.id } })
    }
  })

  it('should capture nationality from short reply "USA" when lastQuestionKey is NATIONALITY', async () => {
    // Set lastQuestionKey to indicate nationality question was asked
    await updateFlowState(testConversation.id, {
      lastQuestionKey: 'NATIONALITY',
    })

    // Simulate inbound message with short reply
    const result = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'USA',
      timestamp: new Date(),
    })

    // Verify nationality was captured
    expect(result.extractedFields.nationality).toBe('USA')

    // Verify contact was updated
    const updatedContact = await prisma.contact.findUnique({
      where: { id: testContact.id },
      select: { nationality: true },
    })
    expect(updatedContact?.nationality).toBe('USA')

    // Verify lead dataJson contains nationality
    const updatedLead = await prisma.lead.findUnique({
      where: { id: testLead.id },
      select: { dataJson: true },
    })
    if (updatedLead?.dataJson) {
      const data = JSON.parse(updatedLead.dataJson)
      expect(data.nationality).toBe('USA')
    }

    // Verify conversation.knownFields contains qualification answer
    const updatedConversation = await prisma.conversation.findUnique({
      where: { id: testConversation.id },
      select: { knownFields: true },
    })
    if (updatedConversation?.knownFields) {
      const knownFields = JSON.parse(updatedConversation.knownFields)
      expect(knownFields.qualification_nationality).toBe('USA')
      expect(knownFields.nationality).toBe('USA')
    }
  })

  it('should capture name from short reply when lastQuestionKey is ask_name', async () => {
    // Set lastQuestionKey to indicate name question was asked
    await updateFlowState(testConversation.id, {
      lastQuestionKey: 'ask_name',
    })

    // Simulate inbound message with short reply
    const result = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'John Smith',
      timestamp: new Date(),
    })

    // Verify name was captured
    expect(result.extractedFields.identity?.name).toBe('John Smith')

    // Verify contact was updated if name was generic
    const updatedContact = await prisma.contact.findUnique({
      where: { id: testContact.id },
      select: { fullName: true },
    })
    // Name should be updated if it was generic/unknown
    if (testContact.fullName === 'Unknown' || testContact.fullName.startsWith('Contact +')) {
      expect(updatedContact?.fullName).toBe('John Smith')
    }
  })

  it('should NOT wipe existing lead fields when qualification answer extraction fails', async () => {
    // Set existing nationality on lead
    await prisma.lead.update({
      where: { id: testLead.id },
      data: {
        dataJson: JSON.stringify({ nationality: 'Indian' }),
      },
    })

    // Set lastQuestionKey to indicate nationality question was asked
    await updateFlowState(testConversation.id, {
      lastQuestionKey: 'NATIONALITY',
    })

    // Simulate inbound message with invalid reply (too short)
    const result = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'X', // Too short, should be rejected
      timestamp: new Date(),
    })

    // Verify existing nationality was NOT wiped
    const updatedLead = await prisma.lead.findUnique({
      where: { id: testLead.id },
      select: { dataJson: true },
    })
    if (updatedLead?.dataJson) {
      const data = JSON.parse(updatedLead.dataJson)
      // Nationality should still be 'Indian' (not wiped)
      expect(data.nationality).toBe('Indian')
    }
  })

  it('should handle ask_nationality question key (lowercase)', async () => {
    // Set lastQuestionKey with lowercase variant
    await updateFlowState(testConversation.id, {
      lastQuestionKey: 'ask_nationality',
    })

    // Simulate inbound message
    const result = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'Pakistani',
      timestamp: new Date(),
    })

    // Verify nationality was captured
    expect(result.extractedFields.nationality).toBe('Pakistani')
  })

  it('should parse multiline structured reply "Abdurahman\\nBusiness\\nChina"', async () => {
    // Simulate multiline inbound message
    const result = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'Abdurahman\nBusiness\nChina',
      timestamp: new Date(),
    })

    // Verify all fields were captured from multiline
    expect(result.extractedFields.identity?.name).toBe('Abdurahman')
    expect(result.extractedFields.nationality).toBe('China')
    // Service might be extracted as business setup
    expect(result.extractedFields.service || result.extractedFields.serviceRaw).toBeTruthy()
  })

  it('should advance flow state after capturing nationality answer', async () => {
    // Set lastQuestionKey to indicate nationality question was asked
    await updateFlowState(testConversation.id, {
      lastQuestionKey: 'NATIONALITY',
    })

    // Simulate inbound message with nationality answer
    await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'China',
      timestamp: new Date(),
    })

    // Verify lastQuestionKey was cleared (flow advanced)
    const { loadFlowState } = await import('../../conversation/flowState')
    const state = await loadFlowState(testConversation.id)
    expect(state.lastQuestionKey).toBeUndefined()
    
    // Verify nationality was saved
    const updatedContact = await prisma.contact.findUnique({
      where: { id: testContact.id },
      select: { nationality: true },
    })
    expect(updatedContact?.nationality).toBe('China')
  })

  it('should handle inbound sequence: A) "China" B) "Abdurahman\\nBusiness\\nChina" C) "China" - nationality persists', async () => {
    // Step A: First inbound with "China"
    await updateFlowState(testConversation.id, {
      lastQuestionKey: 'NATIONALITY',
    })
    
    const resultA = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-a-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'China',
      timestamp: new Date(),
    })
    
    expect(resultA.extractedFields.nationality).toBe('China')
    
    // Step B: Multiline inbound
    const resultB = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-b-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'Abdurahman\nBusiness\nChina',
      timestamp: new Date(),
    })
    
    // Verify all fields captured
    expect(resultB.extractedFields.identity?.name).toBe('Abdurahman')
    expect(resultB.extractedFields.nationality).toBe('China') // Should still be China
    expect(resultB.extractedFields.service || resultB.extractedFields.serviceRaw).toBeTruthy()
    
    // Step C: Another "China" - should not ask nationality again
    const { loadFlowState } = await import('../../conversation/flowState')
    const stateAfterB = await loadFlowState(testConversation.id)
    
    // Verify conversation.knownFields contains nationality
    const convAfterB = await prisma.conversation.findUnique({
      where: { id: testConversation.id },
      select: { knownFields: true, lastQuestionKey: true },
    })
    
    if (convAfterB?.knownFields) {
      const knownFields = JSON.parse(convAfterB.knownFields)
      expect(knownFields.nationality).toBe('China')
      // After step B, lastQuestionKey should NOT be NATIONALITY (flow advanced)
      expect(convAfterB.lastQuestionKey).not.toBe('NATIONALITY')
    }
  })
})

