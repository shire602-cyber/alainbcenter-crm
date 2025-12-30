/**
 * Test: Lead field wipe prevention
 * 
 * Ensures that if extraction fails, existing lead fields are NOT wiped
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { handleInboundMessageAutoMatch } from '../autoMatchPipeline'

const prisma = new PrismaClient()

describe('Lead Wipe Prevention', () => {
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
    
    // Create test lead with existing service data
    const lead = await prisma.lead.create({
      data: {
        contactId: testContactId,
        stage: 'NEW',
        status: 'new',
        pipelineStage: 'new',
        serviceTypeEnum: 'FREELANCE_VISA',
        requestedServiceRaw: 'freelance visa',
        businessActivityRaw: 'Consulting',
      },
    })
    testLeadId = lead.id
  })
  
  it('should not wipe existing lead service fields if extraction fails', async () => {
    // Simulate inbound message that will cause extraction to fail
    // (e.g., empty text or text that doesn't match any service)
    const result = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test_wipe_${Date.now()}`,
      fromPhone: `+97150${Math.floor(Math.random() * 10000000)}`,
      text: '', // Empty text - extraction will fail
      timestamp: new Date(),
    })
    
    // Reload lead to check fields weren't wiped
    const leadAfter = await prisma.lead.findUnique({
      where: { id: result.lead.id },
      select: {
        serviceTypeEnum: true,
        requestedServiceRaw: true,
        businessActivityRaw: true,
      },
    })
    
    // Fields should still exist (not wiped to null/none)
    expect(leadAfter?.serviceTypeEnum).toBe('FREELANCE_VISA')
    expect(leadAfter?.requestedServiceRaw).toBe('freelance visa')
    expect(leadAfter?.businessActivityRaw).toBe('Consulting')
  })
  
  it('should update fields when extraction succeeds', async () => {
    // Simulate inbound message with valid service
    const result = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test_update_${Date.now()}`,
      fromPhone: `+97150${Math.floor(Math.random() * 10000000)}`,
      text: 'I need a family visa',
      timestamp: new Date(),
    })
    
    // Reload lead to check fields were updated
    const leadAfter = await prisma.lead.findUnique({
      where: { id: result.lead.id },
      select: {
        serviceTypeEnum: true,
        requestedServiceRaw: true,
      },
    })
    
    // Fields should be updated with new service
    expect(leadAfter?.serviceTypeEnum).toBe('FAMILY_VISA')
    expect(leadAfter?.requestedServiceRaw).toContain('family visa')
  })
})


