#!/usr/bin/env tsx
/**
 * Test AI Reply Flow
 * This script tests the entire AI reply flow to identify where it's breaking
 */

import { prisma } from '../src/lib/prisma'
import { handleInboundAutoReply } from '../src/lib/autoReply'

async function main() {
  console.log('🧪 Testing AI Reply Flow...\n')

  // Step 1: Check if we have a test lead
  const testLead = await prisma.lead.findFirst({
    where: {
      contact: {
        phone: {
          contains: '971',
        },
      },
    },
    include: {
      contact: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  })

  if (!testLead) {
    console.error('❌ No test lead found. Create a lead first.')
    process.exit(1)
  }

  console.log(`✅ Found test lead: ${testLead.id}`)
  console.log(`   Contact: ${testLead.contact.fullName} (${testLead.contact.phone})`)
  console.log(`   Messages: ${testLead.messages.length}`)

  // Step 2: Check AI configuration
  console.log('\n🔍 Checking AI Configuration...')
  try {
    const { getAIConfig, isAIConfigured } = await import('../src/lib/ai/client')
    const configured = await isAIConfigured()
    if (!configured) {
      console.error('❌ AI is NOT configured!')
      process.exit(1)
    }
    const config = await getAIConfig()
    console.log(`✅ AI configured: ${config?.provider} / ${config?.model}`)
  } catch (error: any) {
    console.error('❌ Error checking AI config:', error.message)
    process.exit(1)
  }

  // Step 3: Check LLM provider
  console.log('\n🔍 Checking LLM Provider...')
  try {
    const { getRoutingService } = await import('../src/lib/llm/routing')
    const routingService = getRoutingService()
    const providers = await (routingService as any).getAvailableProviders()
    console.log(`✅ Available providers: ${providers.map((p: any) => p.name).join(', ')}`)
    if (providers.length === 0) {
      console.error('❌ No LLM providers available!')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('❌ Error checking providers:', error.message)
    process.exit(1)
  }

  // Step 4: Create a test message
  console.log('\n📝 Creating test message...')
  const testMessage = await prisma.message.create({
    data: {
      conversationId: testLead.conversations[0]?.id || (await prisma.conversation.findFirst({
        where: { leadId: testLead.id },
      }))?.id || (await prisma.conversation.create({
        data: {
          leadId: testLead.id,
          contactId: testLead.contactId,
          channel: 'WHATSAPP',
        },
      })).id,
      direction: 'INBOUND',
      channel: 'WHATSAPP',
      body: 'Hi, I need help with visa services',
      status: 'RECEIVED',
    },
  })
  console.log(`✅ Created test message: ${testMessage.id}`)

  // Step 5: Test AI reply
  console.log('\n🤖 Testing AI Reply...')
  try {
    const result = await handleInboundAutoReply({
      leadId: testLead.id,
      messageId: testMessage.id,
      messageText: 'Hi, I need help with visa services',
      channel: 'WHATSAPP',
      contactId: testLead.contactId,
    })

    console.log('\n📊 Result:')
    console.log(`   Replied: ${result.replied}`)
    console.log(`   Reason: ${result.reason || 'N/A'}`)
    console.log(`   Error: ${result.error || 'N/A'}`)

    if (result.replied) {
      console.log('\n✅ SUCCESS: AI reply was sent!')
    } else {
      console.log('\n❌ FAILED: AI reply was NOT sent')
      console.log(`   Reason: ${result.reason || result.error}`)
    }
  } catch (error: any) {
    console.error('\n❌ ERROR: AI reply threw exception!')
    console.error(`   Message: ${error.message}`)
    console.error(`   Stack: ${error.stack}`)
    process.exit(1)
  }

  console.log('\n✅ Test complete')
  process.exit(0)
}

main().catch((error) => {
  console.error('❌ Error:', error)
  process.exit(1)
})

