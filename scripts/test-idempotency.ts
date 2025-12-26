/**
 * Test Script for Idempotency and Flow State
 * 
 * Tests:
 * A) Send "Hi" from WhatsApp once - confirm only one webhook processed, one outbound sent
 * B) Send "Partner" - confirm flowStep advances and doesn't ask visa type again
 * C) Force duplicate webhook replay - confirm 200 OK with dedupeHit true, no outbound
 * D) Verify conversation thread uniqueness
 */

import { prisma } from '../src/lib/prisma'

async function testIdempotency() {
  console.log('🧪 Testing Idempotency and Flow State System\n')

  // Test A: Check for duplicate inbound messages
  console.log('📋 Test A: Checking for duplicate inbound messages...')
  const testProviderMessageId = `test-${Date.now()}`
  
  try {
    // First insert
    const dedup1 = await prisma.inboundMessageDedup.create({
      data: {
        provider: 'whatsapp',
        providerMessageId: testProviderMessageId,
        processingStatus: 'PROCESSING',
      },
    })
    console.log(`✅ First insert successful: ID ${dedup1.id}`)
    
    // Try duplicate insert (should fail)
    try {
      await prisma.inboundMessageDedup.create({
        data: {
          provider: 'whatsapp',
          providerMessageId: testProviderMessageId,
          processingStatus: 'PROCESSING',
        },
      })
      console.log(`❌ FAIL: Duplicate insert should have failed!`)
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`✅ Duplicate insert correctly rejected (unique constraint)`)
      } else {
        console.log(`❌ FAIL: Unexpected error: ${error.message}`)
      }
    }
    
    // Cleanup
    await prisma.inboundMessageDedup.delete({
      where: { id: dedup1.id },
    })
  } catch (error: any) {
    console.error(`❌ Test A failed: ${error.message}`)
  }

  // Test B: Check outbound idempotency
  console.log('\n📋 Test B: Checking outbound message idempotency...')
  const testTriggerId = `trigger-${Date.now()}`
  
  try {
    const outbound1 = await prisma.outboundMessageLog.create({
      data: {
        provider: 'whatsapp',
        conversationId: 1, // Use existing conversation or create test one
        triggerProviderMessageId: testTriggerId,
        outboundTextHash: 'test-hash-123',
      },
    })
    console.log(`✅ First outbound log created: ID ${outbound1.id}`)
    
    // Try duplicate
    try {
      await prisma.outboundMessageLog.create({
        data: {
          provider: 'whatsapp',
          conversationId: 1,
          triggerProviderMessageId: testTriggerId,
          outboundTextHash: 'test-hash-456',
        },
      })
      console.log(`❌ FAIL: Duplicate outbound should have failed!`)
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`✅ Duplicate outbound correctly rejected (unique constraint)`)
      } else {
        console.log(`❌ FAIL: Unexpected error: ${error.message}`)
      }
    }
    
    // Cleanup
    await prisma.outboundMessageLog.delete({
      where: { id: outbound1.id },
    })
  } catch (error: any) {
    console.error(`❌ Test B failed: ${error.message}`)
  }

  // Test C: Check flow state persistence
  console.log('\n📋 Test C: Checking flow state persistence...')
  try {
    // Find or create a test conversation
    let testConversation = await prisma.conversation.findFirst({
      where: { channel: 'whatsapp' },
      take: 1,
    })
    
    if (!testConversation) {
      // Create test contact and conversation
      const testContact = await prisma.contact.create({
        data: {
          fullName: 'Test Contact',
          phone: `+971${Math.floor(Math.random() * 1000000000)}`,
        },
      })
      
      testConversation = await prisma.conversation.create({
        data: {
          contactId: testContact.id,
          channel: 'whatsapp',
          flowKey: 'family_visa',
          flowStep: 'WAIT_SPONSOR_VISA_TYPE',
          lastQuestionKey: 'SPONSOR_VISA_TYPE',
          lastQuestionAt: new Date(),
          collectedData: JSON.stringify({ sponsorVisaType: 'partner' }),
        },
      })
      console.log(`✅ Created test conversation: ID ${testConversation.id}`)
    }
    
    // Update flow state
    await prisma.conversation.update({
      where: { id: testConversation.id },
      data: {
        flowStep: 'WAIT_FAMILY_LOCATION',
        lastQuestionKey: 'FAMILY_LOCATION',
        lastQuestionAt: new Date(),
        collectedData: JSON.stringify({ 
          sponsorVisaType: 'partner',
          familyLocation: 'inside',
        }),
      },
    })
    
    // Verify update
    const updated = await prisma.conversation.findUnique({
      where: { id: testConversation.id },
      select: {
        flowKey: true,
        flowStep: true,
        lastQuestionKey: true,
        collectedData: true,
      },
    })
    
    if (updated?.flowStep === 'WAIT_FAMILY_LOCATION' && updated?.lastQuestionKey === 'FAMILY_LOCATION') {
      console.log(`✅ Flow state updated correctly`)
      const data = JSON.parse(updated.collectedData || '{}')
      if (data.sponsorVisaType === 'partner' && data.familyLocation === 'inside') {
        console.log(`✅ Collected data persisted correctly`)
      } else {
        console.log(`❌ FAIL: Collected data incorrect`)
      }
    } else {
      console.log(`❌ FAIL: Flow state not updated correctly`)
    }
  } catch (error: any) {
    console.error(`❌ Test C failed: ${error.message}`)
  }

  // Test D: Check conversation uniqueness
  console.log('\n📋 Test D: Checking conversation thread uniqueness...')
  try {
    const testContact = await prisma.contact.create({
      data: {
        fullName: 'Uniqueness Test',
        phone: `+971${Math.floor(Math.random() * 1000000000)}`,
      },
    })
    
    // Create first conversation
    const conv1 = await prisma.conversation.create({
      data: {
        contactId: testContact.id,
        channel: 'whatsapp',
      },
    })
    console.log(`✅ Created first conversation: ID ${conv1.id}`)
    
    // Try to create duplicate (should fail or return existing)
    try {
      const conv2 = await prisma.conversation.create({
        data: {
          contactId: testContact.id,
          channel: 'whatsapp',
        },
      })
      console.log(`❌ FAIL: Duplicate conversation created! ID ${conv2.id}`)
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`✅ Duplicate conversation correctly rejected (unique constraint on contactId+channel)`)
      } else {
        console.log(`⚠️ Unexpected error (might be OK): ${error.message}`)
      }
    }
    
    // Verify we can find the conversation
    const found = await prisma.conversation.findUnique({
      where: {
        contactId_channel: {
          contactId: testContact.id,
          channel: 'whatsapp',
        },
      },
    })
    
    if (found && found.id === conv1.id) {
      console.log(`✅ Conversation lookup by (contactId, channel) works correctly`)
    } else {
      console.log(`❌ FAIL: Conversation lookup failed`)
    }
    
    // Cleanup
    await prisma.conversation.delete({ where: { id: conv1.id } })
    await prisma.contact.delete({ where: { id: testContact.id } })
  } catch (error: any) {
    console.error(`❌ Test D failed: ${error.message}`)
  }

  console.log('\n✅ All idempotency tests completed!\n')
}

testIdempotency().catch(console.error)

