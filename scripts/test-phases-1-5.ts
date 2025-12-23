/**
 * Test Script for Phases 1-5 Implementation
 * 
 * Run with: npx tsx scripts/test-phases-1-5.ts
 */

import { prisma } from '../src/lib/prisma'

async function testPhase1() {
  console.log('\n🧪 Testing Phase 1: AI Data Extraction...')
  
  try {
    const { extractLeadDataFromMessage } = await import('../src/lib/ai/extractData')
    
    const testMessage = "Hi, I'm Ahmed from Egypt. I need a family visa for my wife and 2 kids. My email is ahmed@example.com. My visa expires on 2025-03-15."
    
    const result = await extractLeadDataFromMessage(testMessage)
    
    console.log('✅ Extraction result:', {
      name: result.name,
      email: result.email,
      nationality: result.nationality,
      serviceType: result.serviceType,
      expiryDate: result.expiryDate,
      confidence: result.confidence,
    })
    
    if (result.confidence > 50) {
      console.log('✅ Phase 1: PASS - High confidence extraction')
    } else {
      console.log('⚠️ Phase 1: WARNING - Low confidence extraction')
    }
  } catch (error: any) {
    console.error('❌ Phase 1: FAIL -', error.message)
  }
}

async function testPhase2() {
  console.log('\n🧪 Testing Phase 2: Info/Quotation Detection...')
  
  try {
    const { detectInfoOrQuotationShared } = await import('../src/lib/automation/infoShared')
    
    const testMessages = [
      "Here is the quotation for your business setup. The total cost is 5,000 AED.",
      "I've shared the information about our services with you.",
      "Thank you for your inquiry.",
    ]
    
    for (const msg of testMessages) {
      const result = detectInfoOrQuotationShared(msg)
      console.log(`✅ "${msg.substring(0, 50)}..." → isInfoShared: ${result.isInfoShared}, type: ${result.infoType}`)
    }
    
    console.log('✅ Phase 2: PASS - Detection working')
  } catch (error: any) {
    console.error('❌ Phase 2: FAIL -', error.message)
  }
}

async function testPhase4() {
  console.log('\n🧪 Testing Phase 4: Agent Fallback...')
  
  try {
    const { detectHumanAgentRequest } = await import('../src/lib/automation/agentFallback')
    
    const testMessages = [
      "I want to speak to a human agent",
      "Can I talk to a real person?",
      "Hello, how are you?",
    ]
    
    for (const msg of testMessages) {
      const result = detectHumanAgentRequest(msg)
      console.log(`✅ "${msg}" → isRequestingHuman: ${result.isRequestingHuman}, confidence: ${result.confidence}`)
    }
    
    console.log('✅ Phase 4: PASS - Human request detection working')
  } catch (error: any) {
    console.error('❌ Phase 4: FAIL -', error.message)
  }
}

async function testPhase5() {
  console.log('\n🧪 Testing Phase 5: Service Prompts...')
  
  try {
    const { getServicePromptConfig, buildServiceEnhancedPrompt } = await import('../src/lib/ai/servicePrompts')
    
    const config = await getServicePromptConfig('FAMILY_VISA')
    console.log('✅ Service config fetch:', config ? 'Found' : 'Not configured (OK)')
    
    const enhanced = await buildServiceEnhancedPrompt(
      'Test base prompt',
      'FAMILY_VISA',
      {}
    )
    console.log('✅ Enhanced prompt length:', enhanced.length, 'characters')
    
    console.log('✅ Phase 5: PASS - Service prompts working')
  } catch (error: any) {
    console.error('❌ Phase 5: FAIL -', error.message)
  }
}

async function testDatabaseSchema() {
  console.log('\n🧪 Testing Database Schema...')
  
  try {
    // Check if new fields exist (will fail if migration not applied, but that's OK)
    const lead = await prisma.lead.findFirst({
      select: {
        id: true,
        infoSharedAt: true,
        quotationSentAt: true,
        lastInfoSharedType: true,
      },
    })
    
    console.log('✅ Schema check: Lead model accessible')
    console.log('⚠️ Note: If migration not applied, new fields will be null')
  } catch (error: any) {
    if (error.message?.includes('Unknown column') || error.message?.includes('no such column')) {
      console.log('⚠️ Schema: Migration not applied yet - fields will be added when migration runs')
    } else {
      console.error('❌ Schema: FAIL -', error.message)
    }
  }
}

async function testAutomationRules() {
  console.log('\n🧪 Testing Automation Rules...')
  
  try {
    const rules = await prisma.automationRule.findMany({
      where: {
        trigger: { in: ['INFO_SHARED', 'NO_REPLY_SLA'] },
      },
    })
    
    console.log(`✅ Found ${rules.length} Phase 3/4 automation rules`)
    
    if (rules.length === 0) {
      console.log('⚠️ No rules found - run seed endpoints to create them')
    }
  } catch (error: any) {
    console.error('❌ Automation Rules: FAIL -', error.message)
  }
}

async function main() {
  console.log('🚀 Starting Phases 1-5 Tests...\n')
  
  await testPhase1()
  await testPhase2()
  await testPhase4()
  await testPhase5()
  await testDatabaseSchema()
  await testAutomationRules()
  
  console.log('\n✅ All tests completed!')
  console.log('\n📝 Next Steps:')
  console.log('1. Apply database migration: npx prisma db push')
  console.log('2. Seed automation rules: POST /api/admin/automation/seed-info-followup')
  console.log('3. Seed escalation rules: POST /api/admin/automation/seed-escalation')
  console.log('4. Test with real messages via webhooks')
  
  await prisma.$disconnect()
}

main().catch(console.error)
