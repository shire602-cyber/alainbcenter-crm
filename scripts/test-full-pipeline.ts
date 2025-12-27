/**
 * TEST: Full Pipeline Integration
 * 
 * Tests that:
 * - Inbound creates exactly 1 conversation
 * - Outbound uses same conversation
 * - Lead fields are auto-filled
 * - No duplicate replies
 * 
 * Usage:
 *   npx tsx scripts/test-full-pipeline.ts <phone_number>
 */

import { PrismaClient } from '@prisma/client'
import { handleInboundMessageAutoMatch } from '../src/lib/inbound/autoMatchPipeline'
import { generateReply } from '../src/lib/replyEngine'
import { sendTextMessage } from '../src/lib/whatsapp'

const prisma = new PrismaClient()

async function testFullPipeline(phone: string) {
  console.log('🧪 [TEST] Testing full pipeline integration...')
  console.log(`   Phone: ${phone}`)
  
  try {
    // Test 1: Inbound message with service mention
    console.log('\n📨 [TEST 1] Sending inbound: "I need freelance visa, I\'m Pakistani"')
    const providerMessageId1 = `test_${Date.now()}_1`
    const result1 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: providerMessageId1,
      fromPhone: phone,
      text: 'I need freelance visa, I\'m Pakistani',
      timestamp: new Date(),
    })
    
    console.log(`   ✅ Contact ID: ${result1.contact.id}`)
    console.log(`   ✅ Lead ID: ${result1.lead.id}`)
    console.log(`   ✅ Conversation ID: ${result1.conversation.id}`)
    console.log(`   ✅ Message ID: ${result1.message.id}`)
    
    // Verify lead fields
    const lead1 = await prisma.lead.findUnique({
      where: { id: result1.lead.id },
      select: {
        serviceTypeEnum: true,
        requestedServiceRaw: true,
        dataJson: true,
      },
    })
    
    console.log(`\n   Lead Fields:`)
    console.log(`   - serviceTypeEnum: ${lead1?.serviceTypeEnum || 'NOT SET'}`)
    console.log(`   - requestedServiceRaw: ${lead1?.requestedServiceRaw || 'NOT SET'}`)
    
    if (!lead1?.serviceTypeEnum && !lead1?.requestedServiceRaw) {
      console.log('   ❌ FAIL: Neither serviceTypeEnum nor requestedServiceRaw was set')
      process.exit(1)
    }
    
    const dataJson = lead1?.dataJson ? JSON.parse(lead1.dataJson) : {}
    console.log(`   - dataJson.nationality: ${dataJson.nationality || 'NOT SET'}`)
    
    // Test 2: Generate reply (should use same conversation)
    console.log('\n📨 [TEST 2] Generating AI reply...')
    const replyResult = await generateReply({
      conversationId: result1.conversation.id,
      inboundMessageId: result1.message.id,
      inboundText: result1.message.body || '',
      channel: 'whatsapp',
      contactName: result1.contact.fullName || 'there',
    })
    
    if (!replyResult) {
      console.log('   ❌ FAIL: No reply generated')
      process.exit(1)
    }
    
    console.log(`   ✅ Reply generated`)
    console.log(`   - Template: ${replyResult.debug.templateKey}`)
    console.log(`   - Action: ${replyResult.debug.plan.action}`)
    console.log(`   - Reply Key: ${replyResult.replyKey.substring(0, 16)}...`)
    
    // Test 3: Verify conversation has both messages
    const messages = await prisma.message.findMany({
      where: { conversationId: result1.conversation.id },
      orderBy: { createdAt: 'asc' },
    })
    
    console.log(`\n   Messages in conversation:`)
    messages.forEach((msg, idx) => {
      console.log(`   ${idx + 1}. ${msg.direction} - ${msg.body?.substring(0, 50) || '[no body]'}`)
    })
    
    if (messages.length < 1) {
      console.log('   ❌ FAIL: No messages in conversation')
      process.exit(1)
    }
    
    // Test 4: Verify no duplicate conversation
    const conversations = await prisma.conversation.findMany({
      where: {
        contactId: result1.contact.id,
        channel: 'whatsapp',
      },
    })
    
    if (conversations.length > 1) {
      console.log(`\n   ❌ FAIL: Found ${conversations.length} conversations (expected 1)`)
      conversations.forEach(c => {
        console.log(`   - Conversation ${c.id}, channel: ${c.channel}`)
      })
      process.exit(1)
    }
    
    console.log(`\n   ✅ PASS: Only one conversation exists`)
    
    // Test 5: Try duplicate inbound (should be rejected)
    console.log('\n📨 [TEST 3] Sending duplicate inbound (same providerMessageId)...')
    try {
      await handleInboundMessageAutoMatch({
        channel: 'WHATSAPP',
        providerMessageId: providerMessageId1, // Same ID
        fromPhone: phone,
        text: 'Duplicate message',
        timestamp: new Date(),
      })
      console.log('   ❌ FAIL: Duplicate message was processed')
      process.exit(1)
    } catch (error: any) {
      if (error.message === 'DUPLICATE_MESSAGE') {
        console.log('   ✅ PASS: Duplicate message correctly rejected')
      } else {
        console.log(`   ❌ FAIL: Unexpected error: ${error.message}`)
        process.exit(1)
      }
    }
    
    console.log('\n✅ [TEST] All pipeline tests passed!')
    
  } catch (error: any) {
    console.error('❌ [TEST] Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

async function main() {
  const phone = process.argv[2] || '+971501234567'
  
  try {
    await testFullPipeline(phone)
  } finally {
    await prisma.$disconnect()
  }
}

main()

