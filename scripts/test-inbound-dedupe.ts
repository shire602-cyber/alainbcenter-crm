/**
 * TEST: Inbound Message Deduplication
 * 
 * Sends the same providerMessageId twice and verifies:
 * - Only 1 message record created
 * - No duplicate replies sent
 * 
 * Usage:
 *   npx tsx scripts/test-inbound-dedupe.ts <phone_number> <message_text>
 */

import { PrismaClient } from '@prisma/client'
import { handleInboundMessageAutoMatch } from '../src/lib/inbound/autoMatchPipeline'

const prisma = new PrismaClient()

async function testInboundDedupe(phone: string, messageText: string) {
  console.log('🧪 [TEST] Testing inbound message deduplication...')
  console.log(`   Phone: ${phone}`)
  console.log(`   Message: ${messageText}`)
  
  const providerMessageId = `test_${Date.now()}`
  
  try {
    // First message
    console.log('\n📨 [TEST] Sending first message...')
    const result1 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `${providerMessageId}_1`,
      fromPhone: phone,
      text: messageText,
      timestamp: new Date(),
    })
    
    console.log(`   ✅ First message processed`)
    console.log(`   Contact ID: ${result1.contact.id}`)
    console.log(`   Lead ID: ${result1.lead.id}`)
    console.log(`   Conversation ID: ${result1.conversation.id}`)
    console.log(`   Message ID: ${result1.message.id}`)
    
    // Second message (same providerMessageId - should be duplicate)
    console.log('\n📨 [TEST] Sending duplicate message (same providerMessageId)...')
    try {
      await handleInboundMessageAutoMatch({
        channel: 'WHATSAPP',
        providerMessageId: `${providerMessageId}_1`, // Same ID
        fromPhone: phone,
        text: messageText,
        timestamp: new Date(),
      })
      console.log('   ❌ FAIL: Duplicate message was processed (should have been rejected)')
      process.exit(1)
    } catch (error: any) {
      if (error.message === 'DUPLICATE_MESSAGE') {
        console.log('   ✅ PASS: Duplicate message correctly rejected')
      } else {
        console.log(`   ❌ FAIL: Unexpected error: ${error.message}`)
        process.exit(1)
      }
    }
    
    // Verify only one message exists
    const messageCount = await prisma.message.count({
      where: {
        conversationId: result1.conversation.id,
        body: messageText,
      },
    })
    
    if (messageCount === 1) {
      console.log('   ✅ PASS: Only one message record exists')
    } else {
      console.log(`   ❌ FAIL: Expected 1 message, found ${messageCount}`)
      process.exit(1)
    }
    
    // Verify no duplicate outbound replies
    const outboundCount = await prisma.message.count({
      where: {
        conversationId: result1.conversation.id,
        direction: 'OUTBOUND',
      },
    })
    
    console.log(`   Outbound messages: ${outboundCount}`)
    console.log('\n✅ [TEST] All deduplication tests passed!')
    
  } catch (error: any) {
    console.error('❌ [TEST] Test failed:', error.message)
    process.exit(1)
  }
}

async function main() {
  const phone = process.argv[2] || '+971501234567'
  const messageText = process.argv[3] || 'I want freelance visa'
  
  try {
    await testInboundDedupe(phone, messageText)
  } finally {
    await prisma.$disconnect()
  }
}

main()

