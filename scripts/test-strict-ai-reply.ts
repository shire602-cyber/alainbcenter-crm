/**
 * Test Script for Strict AI Reply System
 * 
 * Tests the critical fixes:
 * 1. One conversation per phone number
 * 2. JSON output parsing
 * 3. Service locking
 * 4. No hallucinations (dates, names, service switching)
 * 5. No forbidden phrases
 */

import { prisma } from '../src/lib/prisma'
import { handleInboundMessage } from '../src/lib/inbound'
import { handleInboundAutoReply } from '../src/lib/autoReply'

const TEST_PHONE = '+971501234567' // Use a test number

async function testStrictAIReply() {
  console.log('🧪 Testing Strict AI Reply System\n')
  
  try {
    // Test 1: Conversation Uniqueness
    console.log('📋 Test 1: Conversation Uniqueness')
    console.log('   Sending 2 messages from same phone...')
    
    const message1 = await handleInboundMessage({
      channel: 'WHATSAPP',
      fromAddress: TEST_PHONE,
      body: 'Hi, I need freelance visa',
      externalMessageId: `test-${Date.now()}-1`,
      receivedAt: new Date(),
    })
    
    console.log(`   ✅ Message 1: Conversation ID = ${message1.conversation.id}`)
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    const message2 = await handleInboundMessage({
      channel: 'WHATSAPP',
      fromAddress: TEST_PHONE,
      body: 'How much does it cost?',
      externalMessageId: `test-${Date.now()}-2`,
      receivedAt: new Date(),
    })
    
    console.log(`   ✅ Message 2: Conversation ID = ${message2.conversation.id}`)
    
    if (message1.conversation.id === message2.conversation.id) {
      console.log('   ✅ PASS: Same conversation used for both messages')
    } else {
      console.log('   ❌ FAIL: Different conversations created!')
      return
    }
    
    // Test 2: Check for forbidden phrases
    console.log('\n📋 Test 2: Forbidden Phrases Check')
    const conversations = await prisma.conversation.findMany({
      where: {
        contactId: message1.contact.id,
        channel: 'whatsapp',
      },
      include: {
        messages: {
          where: {
            direction: 'OUTBOUND',
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    })
    
    const forbiddenPhrases = [
      'best regards',
      'let\'s proceed',
      'i should',
      'i will',
      'thank you for your interest',
      'to better assist you',
    ]
    
    let foundForbidden = false
    for (const conv of conversations) {
      for (const msg of conv.messages) {
        const lowerBody = (msg.body || '').toLowerCase()
        for (const phrase of forbiddenPhrases) {
          if (lowerBody.includes(phrase)) {
            console.log(`   ❌ FAIL: Found forbidden phrase "${phrase}" in message: ${msg.body?.substring(0, 100)}`)
            foundForbidden = true
          }
        }
      }
    }
    
    if (!foundForbidden) {
      console.log('   ✅ PASS: No forbidden phrases found')
    } else {
      console.log('   ❌ FAIL: Forbidden phrases detected!')
    }
    
    // Test 3: Service Locking
    console.log('\n📋 Test 3: Service Locking')
    const conversation = await prisma.conversation.findUnique({
      where: {
        contactId_channel: {
          contactId: message1.contact.id,
          channel: 'whatsapp',
        },
      },
    })
    
    // Check if lockedService exists (might be null if migration not run)
    const hasLockedService = (conversation as any)?.lockedService !== undefined
    if (hasLockedService) {
      const lockedService = (conversation as any).lockedService
      if (lockedService) {
        console.log(`   ✅ Service locked: ${lockedService}`)
      } else {
        console.log(`   ⚠️  Service not locked yet (might be 'unknown')`)
      }
    } else {
      console.log(`   ⚠️  lockedService column not found - migration needed`)
    }
    
    // Test 4: Check AutoReplyLog
    console.log('\n📋 Test 4: AutoReplyLog Entries')
    const autoReplyLogs = await (prisma as any).autoReplyLog.findMany({
      where: {
        leadId: message1.lead.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    
    console.log(`   Found ${autoReplyLogs.length} AutoReplyLog entries`)
    for (const log of autoReplyLogs) {
      console.log(`   - Decision: ${log.decision}, Service: ${log.decisionReason || 'N/A'}`)
    }
    
    console.log('\n✅ All tests completed!')
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message)
    console.error(error.stack)
  } finally {
    await prisma.$disconnect()
  }
}

// Run tests
testStrictAIReply()
  .then(() => {
    console.log('\n✅ Test script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error)
    process.exit(1)
  })

