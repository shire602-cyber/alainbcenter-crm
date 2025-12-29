/**
 * VERIFY SYNC GUARANTEES SCRIPT
 * 
 * Hard evidence that lead fields never disappear after being set:
 * - serviceTypeEnum never disappears
 * - requestedServiceRaw never disappears
 * - nationality never disappears
 * - expiry dates never disappear
 * - inbound/outbound stay in same conversation thread
 * 
 * Run: npx tsx scripts/verify-sync-guarantees.ts
 */

import { PrismaClient } from '@prisma/client'
import { handleInboundMessageAutoMatch } from '../src/lib/inbound/autoMatchPipeline'

const prisma = new PrismaClient()

interface Assertion {
  name: string
  passed: boolean
  reason?: string
}

async function main() {
  console.log('🧪 Starting sync guarantees verification...\n')
  const assertions: Assertion[] = []

  try {
    // Step 1: Create test contact + open lead
    const testPhone = `+971${Math.floor(Math.random() * 1000000000)}`
    const contact = await prisma.contact.upsert({
      where: { phoneNormalized: testPhone.replace(/[^0-9+]/g, '') },
      update: {},
      create: {
        fullName: 'Sync Test User',
        phone: testPhone,
        phoneNormalized: testPhone.replace(/[^0-9+]/g, ''),
      },
    })
    console.log(`✅ Created test contact: ${contact.id}`)

    // Step 2: Send inbound: "Hello I need freelance visa. I am Indian."
    console.log('\n📥 Message 1: "Hello I need freelance visa. I am Indian."')
    const result1 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `sync_test_${Date.now()}_1`,
      fromPhone: testPhone,
      fromName: 'Sync Test User',
      text: 'Hello I need freelance visa. I am Indian.',
      timestamp: new Date(),
    })

    const lead1 = await prisma.lead.findUnique({
      where: { id: result1.lead.id },
      include: { contact: true },
    })

    // Assertions for message 1
    assertions.push({
      name: 'Message 1: serviceTypeEnum set to FREELANCE_VISA',
      passed: lead1?.serviceTypeEnum === 'FREELANCE_VISA',
      reason: lead1?.serviceTypeEnum === 'FREELANCE_VISA' 
        ? undefined 
        : `Expected FREELANCE_VISA, got ${lead1?.serviceTypeEnum || 'null'}`,
    })

    assertions.push({
      name: 'Message 1: requestedServiceRaw contains "freelance"',
      passed: lead1?.requestedServiceRaw?.toLowerCase().includes('freelance') || false,
      reason: lead1?.requestedServiceRaw?.toLowerCase().includes('freelance')
        ? undefined
        : `Expected "freelance" in requestedServiceRaw, got ${lead1?.requestedServiceRaw || 'null'}`,
    })

    assertions.push({
      name: 'Message 1: contact.nationality set to "Indian"',
      passed: lead1?.contact?.nationality?.toLowerCase().includes('indian') || false,
      reason: lead1?.contact?.nationality?.toLowerCase().includes('indian')
        ? undefined
        : `Expected "Indian" in nationality, got ${lead1?.contact?.nationality || 'null'}`,
    })

    const conversationId1 = result1.conversation.id

    // Step 3: Send inbound: "ok" (unrelated text)
    console.log('\n📥 Message 2: "ok" (unrelated, should NOT wipe fields)')
    const result2 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `sync_test_${Date.now()}_2`,
      fromPhone: testPhone,
      fromName: 'Sync Test User',
      text: 'ok',
      timestamp: new Date(),
    })

    const lead2 = await prisma.lead.findUnique({
      where: { id: result2.lead.id },
      include: { contact: true },
    })

    // Critical assertions: fields should STILL be present
    assertions.push({
      name: 'Message 2: serviceTypeEnum preserved (no wipe)',
      passed: lead2?.serviceTypeEnum === 'FREELANCE_VISA',
      reason: lead2?.serviceTypeEnum === 'FREELANCE_VISA'
        ? undefined
        : `CRITICAL: serviceTypeEnum was wiped! Expected FREELANCE_VISA, got ${lead2?.serviceTypeEnum || 'null'}`,
    })

    assertions.push({
      name: 'Message 2: requestedServiceRaw preserved (no wipe)',
      passed: lead2?.requestedServiceRaw?.toLowerCase().includes('freelance') || false,
      reason: lead2?.requestedServiceRaw?.toLowerCase().includes('freelance')
        ? undefined
        : `CRITICAL: requestedServiceRaw was wiped! Expected "freelance", got ${lead2?.requestedServiceRaw || 'null'}`,
    })

    assertions.push({
      name: 'Message 2: nationality preserved (no wipe)',
      passed: lead2?.contact?.nationality?.toLowerCase().includes('indian') || false,
      reason: lead2?.contact?.nationality?.toLowerCase().includes('indian')
        ? undefined
        : `CRITICAL: nationality was wiped! Expected "Indian", got ${lead2?.contact?.nationality || 'null'}`,
    })

    assertions.push({
      name: 'Message 2: Same conversation thread',
      passed: result2.conversation.id === conversationId1,
      reason: result2.conversation.id === conversationId1
        ? undefined
        : `CRITICAL: Conversation split! Expected ${conversationId1}, got ${result2.conversation.id}`,
    })

    // Step 4: Send inbound with explicit expiry date
    console.log('\n📥 Message 3: "My visa expires 2026-02-09"')
    const result3 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `sync_test_${Date.now()}_3`,
      fromPhone: testPhone,
      fromName: 'Sync Test User',
      text: 'My visa expires 2026-02-09',
      timestamp: new Date(),
    })

    const lead3 = await prisma.lead.findUnique({
      where: { id: result3.lead.id },
      include: { contact: true },
    })

    assertions.push({
      name: 'Message 3: Expiry date extracted and persisted',
      passed: lead3?.expiryDate !== null && lead3?.expiryDate !== undefined,
      reason: lead3?.expiryDate !== null && lead3?.expiryDate !== undefined
        ? undefined
        : `Expected expiryDate to be set, got ${lead3?.expiryDate || 'null'}`,
    })

    assertions.push({
      name: 'Message 3: serviceTypeEnum still preserved',
      passed: lead3?.serviceTypeEnum === 'FREELANCE_VISA',
      reason: lead3?.serviceTypeEnum === 'FREELANCE_VISA'
        ? undefined
        : `CRITICAL: serviceTypeEnum was wiped after expiry extraction!`,
    })

    assertions.push({
      name: 'Message 3: Same conversation thread',
      passed: result3.conversation.id === conversationId1,
      reason: result3.conversation.id === conversationId1
        ? undefined
        : `CRITICAL: Conversation split after expiry!`,
    })

    // Step 5: Send inbound: "ok" again (should NOT wipe expiry)
    console.log('\n📥 Message 4: "ok" (should NOT wipe expiry)')
    const result4 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `sync_test_${Date.now()}_4`,
      fromPhone: testPhone,
      fromName: 'Sync Test User',
      text: 'ok',
      timestamp: new Date(),
    })

    const lead4 = await prisma.lead.findUnique({
      where: { id: result4.lead.id },
      include: { contact: true },
    })

    assertions.push({
      name: 'Message 4: Expiry date preserved (no wipe)',
      passed: lead4?.expiryDate !== null && lead4?.expiryDate !== undefined,
      reason: lead4?.expiryDate !== null && lead4?.expiryDate !== undefined
        ? undefined
        : `CRITICAL: expiryDate was wiped!`,
    })

    assertions.push({
      name: 'Message 4: All fields still preserved',
      passed: lead4?.serviceTypeEnum === 'FREELANCE_VISA' &&
              lead4?.requestedServiceRaw?.toLowerCase().includes('freelance') &&
              lead4?.contact?.nationality?.toLowerCase().includes('indian'),
      reason: lead4?.serviceTypeEnum === 'FREELANCE_VISA' &&
              lead4?.requestedServiceRaw?.toLowerCase().includes('freelance') &&
              lead4?.contact?.nationality?.toLowerCase().includes('indian')
        ? undefined
        : `CRITICAL: One or more fields were wiped!`,
    })

    assertions.push({
      name: 'Message 4: Same conversation thread',
      passed: result4.conversation.id === conversationId1,
      reason: result4.conversation.id === conversationId1
        ? undefined
        : `CRITICAL: Conversation split!`,
    })

    // Print results table
    console.log('\n' + '='.repeat(80))
    console.log('📊 SYNC GUARANTEES VERIFICATION RESULTS')
    console.log('='.repeat(80) + '\n')

    let allPassed = true
    for (const assertion of assertions) {
      const icon = assertion.passed ? '✅' : '❌'
      console.log(`${icon} ${assertion.name}`)
      if (!assertion.passed && assertion.reason) {
        console.log(`   ⚠️  ${assertion.reason}`)
        allPassed = false
      }
    }

    console.log('\n' + '='.repeat(80))
    if (allPassed) {
      console.log('✅✅✅ ALL ASSERTIONS PASSED ✅✅✅')
      console.log('\n🎉 Sync guarantees verified: No field wiping, no conversation splitting!')
    } else {
      console.log('❌❌❌ SOME ASSERTIONS FAILED ❌❌❌')
      console.log('\n⚠️  Sync guarantees violated! Check reasons above.')
      process.exit(1)
    }

    console.log(`\nTest lead ID: ${result4.lead.id}`)
    console.log(`Test contact ID: ${contact.id}`)
    console.log(`Test conversation ID: ${result4.conversation.id}`)

  } catch (error: any) {
    console.error('\n❌ Verification failed with error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

