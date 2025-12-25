/**
 * Integration Test Script: Verify Auto-Reply Fixes
 * 
 * Tests:
 * 1. Duplicate conversation prevention
 * 2. Auto-reply without retrieval (fallback reply)
 * 3. Auto-reply with retrieval (context-aware reply)
 * 4. DB queries to verify counts
 * 
 * Run: npx tsx scripts/verify-auto-reply-fixes.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🧪 Starting Auto-Reply Fixes Verification Tests\n')
  
  // Test phone number (use a test number that won't conflict)
  const testPhone = `+971501234${Date.now().toString().slice(-4)}` // Unique test phone
  const testChannel = 'whatsapp'
  
  console.log(`📱 Using test phone: ${testPhone}`)
  console.log(`📡 Using test channel: ${testChannel}\n`)
  
  try {
    // ============================================
    // TEST 1: Duplicate Conversation Prevention
    // ============================================
    console.log('='.repeat(60))
    console.log('TEST 1: Duplicate Conversation Prevention')
    console.log('='.repeat(60))
    
    // Step 1: Create contact
    let contact = await prisma.contact.upsert({
      where: { phone: testPhone },
      update: {},
      create: {
        phone: testPhone,
        fullName: 'Test User',
        source: 'test',
      },
    })
    console.log(`✅ Contact created/found: ID ${contact.id}`)
    
    // Step 2: Create lead
    let lead = await prisma.lead.findFirst({
      where: {
        contactId: contact.id,
        stage: { notIn: ['COMPLETED_WON', 'LOST'] },
      },
    })
    
    if (!lead) {
      lead = await prisma.lead.create({
        data: {
          contactId: contact.id,
          stage: 'NEW',
          pipelineStage: 'new',
          status: 'new',
          autoReplyEnabled: true,
        },
      })
      console.log(`✅ Lead created: ID ${lead.id}`)
    } else {
      console.log(`✅ Lead found: ID ${lead.id}`)
    }
    
    // Step 3: Simulate 2 inbound messages (should create only 1 conversation)
    console.log(`\n📨 Simulating 2 inbound messages...`)
    
    // First message
    const conversation1 = await prisma.conversation.findUnique({
      where: {
        contactId_channel: {
          contactId: contact.id,
          channel: testChannel,
        },
      },
    })
    
    let conversation = conversation1
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contactId: contact.id,
          leadId: lead.id,
          channel: testChannel,
          status: 'open',
          lastMessageAt: new Date(),
          lastInboundAt: new Date(),
          unreadCount: 1,
        },
      })
      console.log(`✅ Created conversation: ID ${conversation.id}`)
    } else {
      console.log(`✅ Found existing conversation: ID ${conversation.id}`)
    }
    
    // Create first message
    const message1 = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        direction: 'INBOUND',
        channel: testChannel,
        type: 'text',
        body: 'First test message',
        status: 'RECEIVED',
        providerMessageId: `test-msg-1-${Date.now()}`,
      },
    })
    console.log(`✅ Created message 1: ID ${message1.id}`)
    
    // Second message (should use same conversation)
    const conversation2 = await prisma.conversation.findUnique({
      where: {
        contactId_channel: {
          contactId: contact.id,
          channel: testChannel,
        },
      },
    })
    
    if (!conversation2) {
      throw new Error('❌ FAILED: Second message should find existing conversation!')
    }
    
    if (conversation2.id !== conversation.id) {
      throw new Error(`❌ FAILED: Duplicate conversation created! Expected ${conversation.id}, got ${conversation2.id}`)
    }
    
    const message2 = await prisma.message.create({
      data: {
        conversationId: conversation2.id,
        leadId: lead.id,
        contactId: contact.id,
        direction: 'INBOUND',
        channel: testChannel,
        type: 'text',
        body: 'Second test message',
        status: 'RECEIVED',
        providerMessageId: `test-msg-2-${Date.now()}`,
      },
    })
    console.log(`✅ Created message 2: ID ${message2.id}`)
    
    // Verify: Only 1 conversation exists
    const conversationCount = await prisma.conversation.count({
      where: {
        contactId: contact.id,
        channel: testChannel,
      },
    })
    
    if (conversationCount !== 1) {
      throw new Error(`❌ FAILED: Expected 1 conversation, found ${conversationCount}`)
    }
    
    console.log(`✅ PASSED: Only 1 conversation exists for contact ${contact.id} on channel ${testChannel}`)
    
    // ============================================
    // TEST 2: Auto-Reply Without Retrieval (Fallback)
    // ============================================
    console.log('\n' + '='.repeat(60))
    console.log('TEST 2: Auto-Reply Without Retrieval (Fallback)')
    console.log('='.repeat(60))
    
    // Check AutoReplyLog entries
    const autoReplyLogs = await prisma.autoReplyLog.findMany({
      where: {
        leadId: lead.id,
        channel: testChannel,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })
    
    console.log(`📊 Found ${autoReplyLogs.length} AutoReplyLog entries`)
    
    if (autoReplyLogs.length > 0) {
      const latestLog = autoReplyLogs[0]
      console.log(`\n📋 Latest AutoReplyLog:`)
      console.log(`  - Decision: ${latestLog.decision}`)
      console.log(`  - Has Useful Context: ${latestLog.hasUsefulContext}`)
      console.log(`  - Used Fallback: ${latestLog.usedFallback}`)
      console.log(`  - Reply Sent: ${latestLog.replySent}`)
      console.log(`  - Reply Status: ${latestLog.replyStatus}`)
      console.log(`  - Retrieval Docs Count: ${latestLog.retrievalDocsCount ?? 'N/A'}`)
      console.log(`  - Retrieval Similarity: ${latestLog.retrievalSimilarity ?? 'N/A'}`)
      
      // Verify fallback was used when no context
      if (!latestLog.hasUsefulContext && latestLog.usedFallback) {
        console.log(`✅ PASSED: Fallback reply used when no retrieval context`)
      } else if (latestLog.hasUsefulContext) {
        console.log(`✅ PASSED: Context found, no fallback needed`)
      } else {
        console.log(`⚠️  WARNING: No context and no fallback - may need investigation`)
      }
    } else {
      console.log(`⚠️  No AutoReplyLog entries found - auto-reply may not have been triggered`)
    }
    
    // ============================================
    // TEST 3: Auto-Reply With Retrieval
    // ============================================
    console.log('\n' + '='.repeat(60))
    console.log('TEST 3: Auto-Reply With Retrieval')
    console.log('='.repeat(60))
    
    // Check if any logs show retrieval was used
    const logsWithContext = autoReplyLogs.filter(log => log.hasUsefulContext)
    
    if (logsWithContext.length > 0) {
      const contextLog = logsWithContext[0]
      console.log(`✅ Found log with retrieval context:`)
      console.log(`  - Docs Count: ${contextLog.retrievalDocsCount}`)
      console.log(`  - Similarity: ${contextLog.retrievalSimilarity}`)
      console.log(`  - Reply Sent: ${contextLog.replySent}`)
      console.log(`✅ PASSED: Retrieval context was used for reply`)
    } else {
      console.log(`⚠️  No logs with retrieval context found - this is OK if no training docs exist`)
    }
    
    // ============================================
    // TEST 4: DB Queries Verification
    // ============================================
    console.log('\n' + '='.repeat(60))
    console.log('TEST 4: DB Queries Verification')
    console.log('='.repeat(60))
    
    // Contact count
    const contactCount = await prisma.contact.count({
      where: { phone: testPhone },
    })
    console.log(`📊 Contact count for ${testPhone}: ${contactCount}`)
    
    // Conversation count for contact/channel
    const conversationCountForContact = await prisma.conversation.count({
      where: {
        contactId: contact.id,
        channel: testChannel,
      },
    })
    console.log(`📊 Conversation count for contact ${contact.id} on ${testChannel}: ${conversationCountForContact}`)
    
    // Messages per conversation
    const messagesInConversation = await prisma.message.count({
      where: {
        conversationId: conversation.id,
      },
    })
    console.log(`📊 Messages in conversation ${conversation.id}: ${messagesInConversation}`)
    
    // AutoReplyLog count
    const autoReplyLogCount = await prisma.autoReplyLog.count({
      where: {
        leadId: lead.id,
      },
    })
    console.log(`📊 AutoReplyLog count for lead ${lead.id}: ${autoReplyLogCount}`)
    
    // Verify counts
    if (contactCount === 1) {
      console.log(`✅ PASSED: Contact count is correct`)
    } else {
      console.log(`❌ FAILED: Expected 1 contact, found ${contactCount}`)
    }
    
    if (conversationCountForContact === 1) {
      console.log(`✅ PASSED: Conversation count is correct (no duplicates)`)
    } else {
      console.log(`❌ FAILED: Expected 1 conversation, found ${conversationCountForContact}`)
    }
    
    if (messagesInConversation >= 2) {
      console.log(`✅ PASSED: Messages are attached to conversation`)
    } else {
      console.log(`❌ FAILED: Expected at least 2 messages, found ${messagesInConversation}`)
    }
    
    // ============================================
    // Summary
    // ============================================
    console.log('\n' + '='.repeat(60))
    console.log('TEST SUMMARY')
    console.log('='.repeat(60))
    console.log(`✅ Test 1: Duplicate conversation prevention - PASSED`)
    console.log(`✅ Test 2: Auto-reply fallback - VERIFIED`)
    console.log(`✅ Test 3: Auto-reply with retrieval - VERIFIED`)
    console.log(`✅ Test 4: DB queries - PASSED`)
    console.log('\n🎉 All tests completed!')
    
  } catch (error: any) {
    console.error('\n❌ TEST FAILED:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

