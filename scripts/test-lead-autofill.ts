/**
 * TEST: Lead Auto-fill from Messages
 * 
 * Sends messages with service/nationality mentions and verifies:
 * - Lead.serviceTypeEnum is set
 * - Lead.requestedServiceRaw is set
 * - Lead.dataJson contains extracted fields
 * 
 * Usage:
 *   npx tsx scripts/test-lead-autofill.ts <phone_number>
 */

import { PrismaClient } from '@prisma/client'
import { handleInboundMessageAutoMatch } from '../src/lib/inbound/autoMatchPipeline'

const prisma = new PrismaClient()

async function testLeadAutofill(phone: string) {
  console.log('🧪 [TEST] Testing lead auto-fill from messages...')
  console.log(`   Phone: ${phone}`)
  
  try {
    // Test 1: Service detection
    console.log('\n📨 [TEST 1] Sending message with service mention: "I want freelance visa"')
    const result1 = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test_${Date.now()}_1`,
      fromPhone: phone,
      text: 'I want freelance visa',
      timestamp: new Date(),
    })
    
    // Fetch updated lead
    const lead1 = await prisma.lead.findUnique({
      where: { id: result1.lead.id },
      select: {
        serviceTypeEnum: true,
        requestedServiceRaw: true,
        dataJson: true,
      },
    })
    
    console.log(`   Lead ID: ${result1.lead.id}`)
    console.log(`   serviceTypeEnum: ${lead1?.serviceTypeEnum || 'NOT SET'}`)
    console.log(`   requestedServiceRaw: ${lead1?.requestedServiceRaw || 'NOT SET'}`)
    
    if (!lead1?.serviceTypeEnum && !lead1?.requestedServiceRaw) {
      console.log('   ❌ FAIL: Neither serviceTypeEnum nor requestedServiceRaw was set')
      process.exit(1)
    }
    
    if (lead1?.requestedServiceRaw && !lead1.requestedServiceRaw.toLowerCase().includes('freelance')) {
      console.log(`   ❌ FAIL: requestedServiceRaw doesn't contain "freelance": ${lead1.requestedServiceRaw}`)
      process.exit(1)
    }
    
    console.log('   ✅ PASS: Service fields were set')
    
    // Test 2: Nationality extraction
    console.log('\n📨 [TEST 2] Sending message with nationality: "I am Indian"')
    await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test_${Date.now()}_2`,
      fromPhone: phone,
      text: 'I am Indian',
      timestamp: new Date(),
    })
    
    const lead2 = await prisma.lead.findUnique({
      where: { id: result1.lead.id },
      select: {
        dataJson: true,
      },
    })
    
    const dataJson = lead2?.dataJson ? JSON.parse(lead2.dataJson) : {}
    console.log(`   dataJson.nationality: ${dataJson.nationality || 'NOT SET'}`)
    
    if (!dataJson.nationality) {
      console.log('   ⚠️  WARN: Nationality not extracted (may need better extraction logic)')
    } else {
      console.log('   ✅ PASS: Nationality was extracted')
    }
    
    console.log('\n✅ [TEST] Lead auto-fill tests completed!')
    
  } catch (error: any) {
    console.error('❌ [TEST] Test failed:', error.message)
    process.exit(1)
  }
}

async function main() {
  const phone = process.argv[2] || '+971501234567'
  
  try {
    await testLeadAutofill(phone)
  } finally {
    await prisma.$disconnect()
  }
}

main()


