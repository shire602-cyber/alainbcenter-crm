#!/usr/bin/env tsx
/**
 * VERIFY-THREADING: Test that inbound+outbound messages appear in ONE conversation
 * 
 * Test:
 * 1. Create/use seeded contact
 * 2. Simulate inbound message 1
 * 3. Send outbound reply
 * 4. Simulate inbound message 2
 * 5. Assert: only ONE conversation exists for (contactId, channel, externalThreadId)
 * 6. Assert: all messages reference the same conversationId
 */

import { PrismaClient } from '@prisma/client'
import { handleInboundMessageAutoMatch } from '../src/lib/inbound/autoMatchPipeline'
import { generateAIReply } from '../src/lib/ai/orchestrator'
import { sendTextMessage } from '../src/lib/whatsapp'
import { upsertConversation } from '../src/lib/conversation/upsert'
import { getExternalThreadId } from '../src/lib/conversation/getExternalThreadId'

const prisma = new PrismaClient()

async function main() {
  console.log('🧪 [VERIFY-THREADING] Starting test...\n')
  
  try {
    // Step 1: Create/use seeded contact
    const testPhone = '+971501234567'
    const testWaId = '971501234567'
    
    let contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone: testPhone },
          { phoneNormalized: testPhone.replace(/[^0-9+]/g, '') },
        ],
      },
    })
    
    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          phone: testPhone,
          phoneNormalized: testPhone.replace(/[^0-9+]/g, ''),
          fullName: 'Test Contact (Threading)',
          waId: testWaId,
          source: 'whatsapp',
        },
      })
      console.log(`✅ Created test contact: ${contact.id}`)
    } else {
      console.log(`✅ Using existing contact: ${contact.id}`)
    }
    
    // Step 2: Simulate inbound message 1
    console.log('\n📥 Step 2: Simulating inbound message 1...')
    const inbound1Id = `test_inbound_1_${Date.now()}`
    const result1 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: inbound1Id,
      fromPhone: testPhone.replace(/[^0-9]/g, ''),
      text: 'Hello, I need a freelance visa',
      timestamp: new Date(),
      metadata: {
        webhookValue: {
          contacts: [{ wa_id: testWaId }],
        },
      },
    })
    
    console.log(`✅ Inbound 1 processed:`, {
      contactId: result1.contact.id,
      conversationId: result1.conversation.id,
      leadId: result1.lead.id,
      messageId: result1.message.id,
      externalThreadId: result1.conversation.externalThreadId,
    })
    
    const conversationId1 = result1.conversation.id
    const externalThreadId1 = result1.conversation.externalThreadId
    
    // Step 3: Send outbound reply
    console.log('\n📤 Step 3: Sending outbound reply...')
    const orchestratorResult = await generateAIReply({
      conversationId: conversationId1,
      leadId: result1.lead.id,
      contactId: result1.contact.id,
      inboundText: result1.message.body || '',
      inboundMessageId: result1.message.id,
      channel: 'whatsapp',
      language: 'en',
    })
    
    if (orchestratorResult.replyText && orchestratorResult.replyText.trim().length > 0) {
      const sendResult = await sendTextMessage(
        contact.phone!,
        orchestratorResult.replyText,
        {
          contactId: contact.id,
          leadId: result1.lead.id,
        }
      )
      
      const outboundMessage = await prisma.message.create({
        data: {
          conversationId: conversationId1,
          leadId: result1.lead.id,
          contactId: contact.id,
          direction: 'OUTBOUND',
          channel: 'whatsapp',
          type: 'text',
          body: orchestratorResult.replyText,
          providerMessageId: sendResult.messageId,
          status: 'SENT',
          sentAt: new Date(),
        },
      })
      
      console.log(`✅ Outbound sent:`, {
        messageId: outboundMessage.id,
        conversationId: outboundMessage.conversationId,
      })
    }
    
    // Step 4: Simulate inbound message 2
    console.log('\n📥 Step 4: Simulating inbound message 2...')
    const inbound2Id = `test_inbound_2_${Date.now()}`
    const result2 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: inbound2Id,
      fromPhone: testPhone.replace(/[^0-9]/g, ''),
      text: 'What documents do I need?',
      timestamp: new Date(),
      metadata: {
        webhookValue: {
          contacts: [{ wa_id: testWaId }],
        },
      },
    })
    
    console.log(`✅ Inbound 2 processed:`, {
      contactId: result2.contact.id,
      conversationId: result2.conversation.id,
      leadId: result2.lead.id,
      messageId: result2.message.id,
      externalThreadId: result2.conversation.externalThreadId,
    })
    
    const conversationId2 = result2.conversation.id
    const externalThreadId2 = result2.conversation.externalThreadId
    
    // Step 5: Assertions
    console.log('\n🔍 Step 5: Running assertions...\n')
    
    // Assertion 1: Same conversation ID
    if (conversationId1 !== conversationId2) {
      throw new Error(`❌ FAIL: Conversation IDs differ! Inbound1: ${conversationId1}, Inbound2: ${conversationId2}`)
    }
    console.log(`✅ PASS: Both messages use same conversationId: ${conversationId1}`)
    
    // Assertion 2: Same external thread ID
    if (externalThreadId1 !== externalThreadId2) {
      throw new Error(`❌ FAIL: External thread IDs differ! Inbound1: ${externalThreadId1}, Inbound2: ${externalThreadId2}`)
    }
    console.log(`✅ PASS: Both messages use same externalThreadId: ${externalThreadId1}`)
    
    // Assertion 3: Only one conversation exists
    const allConversations = await prisma.conversation.findMany({
      where: {
        contactId: contact.id,
        channel: 'whatsapp',
      },
    })
    
    if (allConversations.length > 1) {
      throw new Error(`❌ FAIL: Multiple conversations found! Count: ${allConversations.length}`)
    }
    console.log(`✅ PASS: Only one conversation exists for (contactId=${contact.id}, channel=whatsapp)`)
    
    // Assertion 4: All messages reference same conversationId
    const allMessages = await prisma.message.findMany({
      where: {
        OR: [
          { id: result1.message.id },
          { id: result2.message.id },
        ],
      },
    })
    
    const uniqueConversationIds = new Set(allMessages.map(m => m.conversationId))
    if (uniqueConversationIds.size > 1) {
      throw new Error(`❌ FAIL: Messages reference different conversationIds! ${Array.from(uniqueConversationIds).join(', ')}`)
    }
    console.log(`✅ PASS: All messages reference same conversationId: ${Array.from(uniqueConversationIds)[0]}`)
    
    // Assertion 5: Check outbound message also uses same conversationId
    const outboundMessages = await prisma.message.findMany({
      where: {
        conversationId: conversationId1,
        direction: 'OUTBOUND',
      },
    })
    
    if (outboundMessages.length === 0) {
      throw new Error(`❌ FAIL: No outbound messages found in conversation ${conversationId1}`)
    }
    console.log(`✅ PASS: Outbound message(s) found in same conversation: ${outboundMessages.length}`)
    
    console.log('\n✅✅✅ ALL ASSERTIONS PASSED ✅✅✅\n')
    console.log('Summary:')
    console.log(`  - Contact ID: ${contact.id}`)
    console.log(`  - Conversation ID: ${conversationId1}`)
    console.log(`  - External Thread ID: ${externalThreadId1}`)
    console.log(`  - Total messages: ${allMessages.length + outboundMessages.length}`)
    console.log(`  - Conversations for contact: ${allConversations.length}`)
    
  } catch (error: any) {
    console.error('\n❌❌❌ TEST FAILED ❌❌❌\n')
    console.error('Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()


