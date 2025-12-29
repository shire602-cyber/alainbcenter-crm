/**
 * VERIFY AUTO-FILL SYNC SCRIPT
 * 
 * Simulates inbound messages and verifies:
 * 1. Lead fields are auto-filled correctly
 * 2. Fields are NOT wiped on subsequent messages
 * 3. Conversation threading is consistent
 * 4. Tasks are created properly
 * 
 * Run: npx tsx scripts/verify-autofill-sync.ts
 */

import { PrismaClient } from '@prisma/client'
import { handleInboundMessageAutoMatch } from '../src/lib/inbound/autoMatchPipeline'

const prisma = new PrismaClient()

async function main() {
  console.log('🧪 Starting auto-fill sync verification...\n')

  try {
    // Step 1: Create test contact
    const testPhone = `+971${Math.floor(Math.random() * 1000000000)}`
    const contact = await prisma.contact.upsert({
      where: { phoneNormalized: testPhone.replace(/[^0-9+]/g, '') },
      update: {},
      create: {
        fullName: 'Test User',
        phone: testPhone,
        phoneNormalized: testPhone.replace(/[^0-9+]/g, ''),
      },
    })
    console.log(`✅ Created test contact: ${contact.id}`)

    // Step 2: Simulate inbound message 1: "I need freelance visa, I am Indian"
    console.log('\n📥 Simulating inbound message 1: "I need freelance visa, I am Indian"')
    const result1 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test_${Date.now()}_1`,
      fromPhone: testPhone,
      fromName: 'Test User',
      text: 'I need freelance visa, I am Indian',
      timestamp: new Date(),
    })

    const lead1 = await prisma.lead.findUnique({
      where: { id: result1.lead.id },
      include: { contact: true },
    })

    // Assertions for message 1
    console.log('\n✅ Assertions for message 1:')
    const assert1 = {
      serviceTypeEnum: lead1?.serviceTypeEnum === 'FREELANCE_VISA',
      requestedServiceRaw: lead1?.requestedServiceRaw?.toLowerCase().includes('freelance'),
      nationality: lead1?.contact?.nationality?.toLowerCase().includes('indian'),
      hasTasks: result1.tasksCreated > 0,
    }

    console.log(`  - serviceTypeEnum = FREELANCE_VISA: ${assert1.serviceTypeEnum ? '✅' : '❌'}`)
    console.log(`  - requestedServiceRaw contains "freelance": ${assert1.requestedServiceRaw ? '✅' : '❌'}`)
    console.log(`  - contact.nationality = "Indian": ${assert1.nationality ? '✅' : '❌'}`)
    console.log(`  - Tasks created: ${assert1.hasTasks ? '✅' : '❌'}`)

    if (!assert1.serviceTypeEnum || !assert1.requestedServiceRaw || !assert1.nationality) {
      throw new Error('Message 1 assertions failed')
    }

    // Step 3: Simulate inbound message 2: "my visa expires 2026-02-09"
    console.log('\n📥 Simulating inbound message 2: "my visa expires 2026-02-09"')
    const result2 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test_${Date.now()}_2`,
      fromPhone: testPhone,
      fromName: 'Test User',
      text: 'my visa expires 2026-02-09',
      timestamp: new Date(),
    })

    const lead2 = await prisma.lead.findUnique({
      where: { id: result2.lead.id },
      include: { contact: true },
    })

    // Assertions for message 2 (critical: fields should NOT be wiped)
    console.log('\n✅ Assertions for message 2 (no wiping):')
    const assert2 = {
      serviceTypeEnumPreserved: lead2?.serviceTypeEnum === 'FREELANCE_VISA',
      requestedServiceRawPreserved: lead2?.requestedServiceRaw?.toLowerCase().includes('freelance'),
      nationalityPreserved: lead2?.contact?.nationality?.toLowerCase().includes('indian'),
      expiryDateSet: lead2?.expiryDate !== null,
      sameConversation: result2.conversation.id === result1.conversation.id,
    }

    console.log(`  - serviceTypeEnum preserved: ${assert2.serviceTypeEnumPreserved ? '✅' : '❌'}`)
    console.log(`  - requestedServiceRaw preserved: ${assert2.requestedServiceRawPreserved ? '✅' : '❌'}`)
    console.log(`  - nationality preserved: ${assert2.nationalityPreserved ? '✅' : '❌'}`)
    console.log(`  - expiryDate set: ${assert2.expiryDateSet ? '✅' : '❌'}`)
    console.log(`  - Same conversation thread: ${assert2.sameConversation ? '✅' : '❌'}`)

    if (!assert2.serviceTypeEnumPreserved || !assert2.requestedServiceRawPreserved || !assert2.nationalityPreserved) {
      throw new Error('Message 2 assertions failed - fields were wiped!')
    }

    if (!assert2.sameConversation) {
      throw new Error('Conversation threading failed - new conversation created!')
    }

    console.log(`  - serviceTypeEnum preserved: ${assert3.serviceTypeEnumPreserved ? '✅' : '❌'}`)
    console.log(`  - requestedServiceRaw preserved: ${assert3.requestedServiceRawPreserved ? '✅' : '❌'}`)
    console.log(`  - nationality preserved: ${assert3.nationalityPreserved ? '✅' : '❌'}`)
    console.log(`  - expiryDate preserved: ${assert3.expiryDatePreserved ? '✅' : '❌'}`)
    console.log(`  - Same conversation thread: ${assert3.sameConversation ? '✅' : '❌'}`)

    if (!assert3.serviceTypeEnumPreserved || !assert3.requestedServiceRawPreserved || !assert3.nationalityPreserved) {
      throw new Error('Message 3 assertions failed - fields were wiped by unrelated text!')
    }

    if (!assert3.serviceTypeEnumPreserved || !assert3.requestedServiceRawPreserved || !assert3.nationalityPreserved) {
      throw new Error('Message 3 assertions failed - fields were wiped by unrelated text!')
    }

    // Step 4: Check tasks
    const tasks = await prisma.task.findMany({
      where: { leadId: result3.lead.id },
      orderBy: { createdAt: 'desc' },
    })
    console.log(`\n✅ Tasks created: ${tasks.length}`)
    tasks.forEach((task) => {
      console.log(`  - ${task.type}: ${task.title}`)
    })

    console.log('\n🎉 All assertions passed! Auto-fill sync is working correctly.')
    console.log(`\nTest lead ID: ${result3.lead.id}`)
    console.log(`Test contact ID: ${contact.id}`)
    console.log(`Test conversation ID: ${result3.conversation.id}`)

    // Cleanup (optional - comment out to keep test data)
    // await prisma.task.deleteMany({ where: { leadId: result3.lead.id } })
    // await prisma.message.deleteMany({ where: { conversationId: result3.conversation.id } })
    // await prisma.conversation.delete({ where: { id: result3.conversation.id } })
    // await prisma.lead.delete({ where: { id: result3.lead.id } })
    // await prisma.contact.delete({ where: { id: contact.id } })
    // console.log('\n🧹 Test data cleaned up')

  } catch (error: any) {
    console.error('\n❌ Verification failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

