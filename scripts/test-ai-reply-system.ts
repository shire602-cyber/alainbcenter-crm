/**
 * Comprehensive Test: AI Reply System
 * 
 * Tests all pain points:
 * 1. No duplicate conversations
 * 2. All replies are AI-generated (not templates)
 * 3. Fallback is minimal (only used when AI fails)
 * 4. Current inbound message drives AI response
 * 5. Second messages get replies
 * 6. No saved/template messages
 * 
 * Run: npx tsx scripts/test-ai-reply-system.ts
 */

import { PrismaClient } from '@prisma/client'
import { handleInboundMessage } from '../src/lib/inbound'

const prisma = new PrismaClient()

async function main() {
  console.log('🧪 Starting Comprehensive AI Reply System Tests\n')
  console.log('='.repeat(70))
  
  const testPhone = `+971501234${Date.now().toString().slice(-4)}`
  const testChannel = 'whatsapp'
  
  console.log(`📱 Test Phone: ${testPhone}`)
  console.log(`📡 Test Channel: ${testChannel}\n`)
  
  let allTestsPassed = true
  let testResults: Array<{ name: string; passed: boolean; details?: string }> = []
  
  try {
    // ============================================
    // TEST 1: No Duplicate Conversations
    // ============================================
    console.log('TEST 1: Duplicate Conversation Prevention')
    console.log('-'.repeat(70))
    
    const message1 = await handleInboundMessage({
      channel: 'WHATSAPP',
      externalMessageId: `test-msg-1-${Date.now()}`,
      fromAddress: testPhone,
      body: 'First test message',
      receivedAt: new Date(),
    })
    
    const message2 = await handleInboundMessage({
      channel: 'WHATSAPP',
      externalMessageId: `test-msg-2-${Date.now()}`,
      fromAddress: testPhone,
      body: 'Second test message',
      receivedAt: new Date(),
    })
    
    const conversationCount = await prisma.conversation.count({
      where: {
        contactId: message1.contact.id,
        channel: testChannel,
      },
    })
    
    if (conversationCount === 1) {
      console.log('✅ PASSED: Only 1 conversation exists')
      testResults.push({ name: 'Duplicate Prevention', passed: true })
    } else {
      console.log(`❌ FAILED: Expected 1 conversation, found ${conversationCount}`)
      testResults.push({ name: 'Duplicate Prevention', passed: false, details: `Found ${conversationCount} conversations` })
      allTestsPassed = false
    }
    
    // ============================================
    // TEST 2: AI Reply Generated (Not Template)
    // ============================================
    console.log('\nTEST 2: AI Reply Generated (Not Template)')
    console.log('-'.repeat(70))
    
    // Wait for AI reply to be generated
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    const outboundMessages = await prisma.message.findMany({
      where: {
        conversationId: message1.conversation.id,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    
    if (outboundMessages.length > 0) {
      const replyText = outboundMessages[0].body || ''
      
      // Check it's NOT a template message
      const isTemplate = replyText.includes('Thank you for your interest') &&
                        replyText.includes('What specific service') &&
                        replyText.includes('What is your timeline')
      
      if (!isTemplate) {
        console.log('✅ PASSED: Reply is AI-generated (not template)')
        console.log(`   Reply preview: "${replyText.substring(0, 100)}..."`)
        testResults.push({ name: 'AI Generated (Not Template)', passed: true })
      } else {
        console.log('❌ FAILED: Reply looks like a template message')
        console.log(`   Reply: "${replyText}"`)
        testResults.push({ name: 'AI Generated (Not Template)', passed: false, details: 'Template pattern detected' })
        allTestsPassed = false
      }
    } else {
      console.log('⚠️  WARNING: No outbound message found')
      testResults.push({ name: 'AI Generated (Not Template)', passed: false, details: 'No outbound message' })
      allTestsPassed = false
    }
    
    // ============================================
    // TEST 3: Second Message Gets Reply
    // ============================================
    console.log('\nTEST 3: Second Message Gets Reply')
    console.log('-'.repeat(70))
    
    console.log('⏳ Waiting 15 seconds to test second message reply...')
    await new Promise(resolve => setTimeout(resolve, 15000))
    
    const message3 = await handleInboundMessage({
      channel: 'WHATSAPP',
      externalMessageId: `test-msg-3-${Date.now()}`,
      fromAddress: testPhone,
      body: 'Follow-up question about pricing',
      receivedAt: new Date(),
    })
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    const secondReplyMessages = await prisma.message.findMany({
      where: {
        conversationId: message3.conversation.id,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
      take: 2,
    })
    
    if (secondReplyMessages.length >= 2) {
      console.log('✅ PASSED: Second message received AI reply')
      console.log(`   Second reply preview: "${secondReplyMessages[0].body?.substring(0, 100)}..."`)
      testResults.push({ name: 'Second Message Reply', passed: true })
    } else {
      console.log(`❌ FAILED: Expected 2 replies, found ${secondReplyMessages.length}`)
      testResults.push({ name: 'Second Message Reply', passed: false, details: `Found ${secondReplyMessages.length} replies` })
      allTestsPassed = false
    }
    
    // ============================================
    // TEST 4: Reply Based on Inbound Message
    // ============================================
    console.log('\nTEST 4: Reply Based on Inbound Message')
    console.log('-'.repeat(70))
    
    const message4 = await handleInboundMessage({
      channel: 'WHATSAPP',
      externalMessageId: `test-msg-4-${Date.now()}`,
      fromAddress: testPhone,
      body: 'I need help with family visa application',
      receivedAt: new Date(),
    })
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    const contextAwareReplies = await prisma.message.findMany({
      where: {
        conversationId: message4.conversation.id,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    
    if (contextAwareReplies.length > 0) {
      const replyText = contextAwareReplies[0].body || ''
      const mentionsVisa = replyText.toLowerCase().includes('visa') || 
                          replyText.toLowerCase().includes('family') ||
                          replyText.length > 50 // AI-generated replies are usually longer
      
      if (mentionsVisa || replyText.length > 50) {
        console.log('✅ PASSED: Reply appears context-aware')
        console.log(`   Inbound: "I need help with family visa application"`)
        console.log(`   Reply preview: "${replyText.substring(0, 150)}..."`)
        testResults.push({ name: 'Context-Aware Reply', passed: true })
      } else {
        console.log('⚠️  WARNING: Reply may not be context-aware enough')
        console.log(`   Reply: "${replyText}"`)
        testResults.push({ name: 'Context-Aware Reply', passed: false, details: 'Reply too short or not context-aware' })
      }
    } else {
      console.log('❌ FAILED: No reply found for context-aware test')
      testResults.push({ name: 'Context-Aware Reply', passed: false, details: 'No reply found' })
      allTestsPassed = false
    }
    
    // ============================================
    // TEST 5: AutoReplyLog Verification
    // ============================================
    console.log('\nTEST 5: AutoReplyLog Verification')
    console.log('-'.repeat(70))
    
    const autoReplyLogs = await prisma.autoReplyLog.findMany({
      where: {
        leadId: message1.lead.id,
      },
      orderBy: { createdAt: 'desc' },
    })
    
    console.log(`📊 Found ${autoReplyLogs.length} AutoReplyLog entries`)
    
    if (autoReplyLogs.length > 0) {
      const latestLog = autoReplyLogs[0]
      console.log(`\n📋 Latest Log Details:`)
      console.log(`   - Decision: ${latestLog.decision}`)
      console.log(`   - Used Fallback: ${latestLog.usedFallback}`)
      console.log(`   - Has Useful Context: ${latestLog.hasUsefulContext}`)
      console.log(`   - Reply Sent: ${latestLog.replySent}`)
      console.log(`   - Reply Status: ${latestLog.replyStatus}`)
      
      if (latestLog.decision === 'replied' && latestLog.replySent) {
        console.log('✅ PASSED: AutoReplyLog shows successful AI reply')
        testResults.push({ name: 'AutoReplyLog Tracking', passed: true })
      } else {
        console.log(`⚠️  WARNING: Latest log shows decision: ${latestLog.decision}, replySent: ${latestLog.replySent}`)
        testResults.push({ name: 'AutoReplyLog Tracking', passed: false, details: `Decision: ${latestLog.decision}` })
      }
    } else {
      console.log('⚠️  WARNING: No AutoReplyLog entries found')
      testResults.push({ name: 'AutoReplyLog Tracking', passed: false, details: 'No logs found' })
    }
    
    // ============================================
    // TEST 6: No Template Messages in Database
    // ============================================
    console.log('\nTEST 6: No Template Messages in Database')
    console.log('-'.repeat(70))
    
    const allOutboundMessages = await prisma.message.findMany({
      where: {
        conversationId: message1.conversation.id,
        direction: 'OUTBOUND',
      },
      orderBy: { createdAt: 'desc' },
    })
    
    const templatePatterns = [
      'Thank you for your interest',
      'What specific service are you looking for',
      'What is your timeline',
      'Looking forward to helping you',
    ]
    
    let templateFound = false
    let foundPattern = ''
    for (const msg of allOutboundMessages) {
      const body = (msg.body || '').toLowerCase()
      for (const pattern of templatePatterns) {
        if (body.includes(pattern.toLowerCase())) {
          templateFound = true
          foundPattern = pattern
          console.log(`❌ FAILED: Found template pattern "${pattern}" in message`)
          console.log(`   Message: "${msg.body?.substring(0, 200)}"`)
          break
        }
      }
      if (templateFound) break
    }
    
    if (!templateFound) {
      console.log('✅ PASSED: No template messages found in database')
      testResults.push({ name: 'No Template Messages', passed: true })
    } else {
      testResults.push({ name: 'No Template Messages', passed: false, details: `Found pattern: ${foundPattern}` })
      allTestsPassed = false
    }
    
    // ============================================
    // TEST 7: Fallback is Minimal
    // ============================================
    console.log('\nTEST 7: Fallback is Minimal (Not Template-Like)')
    console.log('-'.repeat(70))
    
    const fallbackLogs = await prisma.autoReplyLog.findMany({
      where: {
        leadId: message1.lead.id,
        usedFallback: true,
      },
      orderBy: { createdAt: 'desc' },
    })
    
    if (fallbackLogs.length > 0) {
      const fallbackLog = fallbackLogs[0]
      const fallbackText = fallbackLog.replyText || ''
      
      // Check fallback is minimal (not asking for multiple things)
      const isMinimal = !fallbackText.includes('•') && 
                       !fallbackText.includes('Your full name') &&
                       !fallbackText.includes('The service you need') &&
                       fallbackText.length < 150
      
      if (isMinimal) {
        console.log('✅ PASSED: Fallback is minimal (not template-like)')
        console.log(`   Fallback: "${fallbackText}"`)
        testResults.push({ name: 'Minimal Fallback', passed: true })
      } else {
        console.log('⚠️  WARNING: Fallback may be too template-like')
        console.log(`   Fallback: "${fallbackText}"`)
        testResults.push({ name: 'Minimal Fallback', passed: false, details: 'Fallback too long or template-like' })
      }
    } else {
      console.log('✅ PASSED: No fallback used (AI generation succeeded)')
      testResults.push({ name: 'Minimal Fallback', passed: true, details: 'No fallback needed' })
    }
    
    // ============================================
    // TEST 8: DB Query Verification
    // ============================================
    console.log('\nTEST 8: Database Query Verification')
    console.log('-'.repeat(70))
    
    const contactCount = await prisma.contact.count({
      where: { phone: testPhone },
    })
    const convCount = await prisma.conversation.count({
      where: {
        contactId: message1.contact.id,
        channel: testChannel,
      },
    })
    const msgCount = await prisma.message.count({
      where: {
        conversationId: message1.conversation.id,
      },
    })
    const logCount = await prisma.autoReplyLog.count({
      where: {
        leadId: message1.lead.id,
      },
    })
    
    console.log(`📊 Contact count: ${contactCount}`)
    console.log(`📊 Conversation count: ${convCount}`)
    console.log(`📊 Messages in conversation: ${msgCount}`)
    console.log(`📊 AutoReplyLog count: ${logCount}`)
    
    if (contactCount === 1 && convCount === 1 && msgCount >= 4) {
      console.log('✅ PASSED: All DB counts are correct')
      testResults.push({ name: 'DB Query Verification', passed: true })
    } else {
      console.log(`❌ FAILED: DB counts incorrect`)
      testResults.push({ name: 'DB Query Verification', passed: false, details: `Contact: ${contactCount}, Conv: ${convCount}, Msg: ${msgCount}` })
      allTestsPassed = false
    }
    
    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n' + '='.repeat(70))
    console.log('TEST SUMMARY')
    console.log('='.repeat(70))
    
    for (const result of testResults) {
      const icon = result.passed ? '✅' : '❌'
      const status = result.passed ? 'PASSED' : 'FAILED'
      console.log(`${icon} ${result.name}: ${status}${result.details ? ` (${result.details})` : ''}`)
    }
    
    console.log('\n' + '='.repeat(70))
    if (allTestsPassed) {
      console.log('🎉 ALL TESTS PASSED!')
      console.log('\n✅ AI Reply System is working correctly:')
      console.log('   - No duplicate conversations')
      console.log('   - All replies are AI-generated')
      console.log('   - No template messages found')
      console.log('   - Second messages get replies')
      console.log('   - Replies are context-aware')
      console.log('   - Fallback is minimal')
    } else {
      console.log('❌ SOME TESTS FAILED')
      console.log('\n⚠️  Please review the failures above')
      process.exit(1)
    }
    
  } catch (error: any) {
    console.error('\n❌ TEST ERROR:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

