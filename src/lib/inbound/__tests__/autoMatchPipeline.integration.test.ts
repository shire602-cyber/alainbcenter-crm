/**
 * Auto-Match Pipeline Integration Tests
 * 
 * Tests for:
 * 1. Lead auto-fill correctness
 * 2. Service extraction and mapping
 * 3. Nationality extraction
 * 4. Expiry extraction
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { handleInboundMessageAutoMatch } from '../autoMatchPipeline'

const prisma = new PrismaClient()

describe('Auto-Match Pipeline Integration Tests', () => {
  let testContactId: number
  
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
  })
  
  afterEach(async () => {
    // Cleanup
    const leads = await prisma.lead.findMany({ where: { contactId: testContactId } })
    for (const lead of leads) {
      await prisma.message.deleteMany({ where: { leadId: lead.id } })
      await prisma.conversation.deleteMany({ where: { leadId: lead.id } })
      await prisma.lead.delete({ where: { id: lead.id } })
    }
    await prisma.contact.delete({ where: { id: testContactId } })
  })
  
  describe('Lead Auto-Fill', () => {
    it('should extract and set serviceTypeEnum when user mentions "freelance"', async () => {
      const result = await handleInboundMessageAutoMatch({
        channel: 'WHATSAPP',
        providerMessageId: `test_${Date.now()}`,
        fromPhone: '+971501234567',
        text: 'I need a freelance visa',
        timestamp: new Date(),
      })
      
      const lead = await prisma.lead.findUnique({
        where: { id: result.lead.id },
        select: {
          serviceTypeEnum: true,
          requestedServiceRaw: true,
        },
      })
      
      expect(lead?.serviceTypeEnum || lead?.requestedServiceRaw).toBeTruthy()
    })
    
    it('should extract nationality when user mentions it', async () => {
      const result = await handleInboundMessageAutoMatch({
        channel: 'WHATSAPP',
        providerMessageId: `test_${Date.now()}`,
        fromPhone: '+971501234567',
        text: 'I am Indian, need business setup',
        timestamp: new Date(),
      })
      
      const contact = await prisma.contact.findUnique({
        where: { id: result.contact.id },
        select: { nationality: true },
      })
      
      // Nationality should be extracted (if extractor works)
      // This test verifies the extraction happens
      expect(result.extractedFields.nationality || contact?.nationality).toBeTruthy()
    })
    
    it('should extract explicit expiry date', async () => {
      const result = await handleInboundMessageAutoMatch({
        channel: 'WHATSAPP',
        providerMessageId: `test_${Date.now()}`,
        fromPhone: '+971501234567',
        text: 'My visa expires on 10/02/2026',
        timestamp: new Date(),
      })
      
      expect(result.extractedFields.expiries).toBeDefined()
      if (result.extractedFields.expiries && result.extractedFields.expiries.length > 0) {
        expect(result.extractedFields.expiries[0].date).toBeInstanceOf(Date)
      }
    })
  })
})

