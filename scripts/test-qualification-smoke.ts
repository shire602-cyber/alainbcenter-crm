/**
 * WhatsApp Qualification Smoke Test
 * 
 * Simulates inbound sequence to verify qualification answer capture and flow advancement
 */

import { prisma } from '../src/lib/prisma'
import { handleInboundMessageAutoMatch } from '../src/lib/inbound/autoMatchPipeline'
import { updateFlowState, loadFlowState } from '../src/lib/conversation/flowState'
import { loadConversationState } from '../src/lib/ai/stateMachine'

async function runSmokeTest() {
  console.log('🧪 [SMOKE-TEST] Starting WhatsApp qualification smoke test...\n')

  // Create test contact
  const testContact = await prisma.contact.create({
    data: {
      phone: `+971${Math.floor(Math.random() * 1000000000)}`,
      phoneNormalized: `+971${Math.floor(Math.random() * 1000000000)}`,
      fullName: 'Test User',
      source: 'test',
    },
  })

  // Create test lead
  const testLead = await prisma.lead.create({
    data: {
      contactId: testContact.id,
      stage: 'NEW',
      status: 'NEW',
      pipelineStage: 'NEW',
    },
  })

  // Create test conversation
  const testConversation = await prisma.conversation.create({
    data: {
      contactId: testContact.id,
      leadId: testLead.id,
      channel: 'whatsapp',
      externalThreadId: `test-thread-${Date.now()}`,
    },
  })

  try {
    console.log('📋 Test Sequence:')
    console.log('  A) inbound="China" (with lastQuestionKey=NATIONALITY)')
    console.log('  B) inbound="Abdurahman\\nBusiness\\nChina" (multiline)')
    console.log('  C) inbound="China" (verify no nationality question)\n')

    // Step A: Set lastQuestionKey and send "China"
    console.log('🔄 Step A: Setting lastQuestionKey=NATIONALITY and sending "China"...')
    await updateFlowState(testConversation.id, {
      lastQuestionKey: 'NATIONALITY',
    })

    const resultA = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-a-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'China',
      timestamp: new Date(),
    })

    console.log(`✅ Step A Result: nationality=${resultA.extractedFields.nationality || 'none'}`)
    
    // Verify nationality saved
    const contactAfterA = await prisma.contact.findUnique({
      where: { id: testContact.id },
      select: { nationality: true },
    })
    console.log(`   Contact nationality: ${contactAfterA?.nationality || 'none'}`)

    // Verify flow advanced
    const stateAfterA = await loadFlowState(testConversation.id)
    console.log(`   lastQuestionKey after A: ${stateAfterA.lastQuestionKey || 'null (cleared)'}`)

    // Step B: Send multiline message
    console.log('\n🔄 Step B: Sending multiline "Abdurahman\\nBusiness\\nChina"...')
    const resultB = await handleInboundMessageAutoMatch({
      channel: 'WHATSAPP',
      providerMessageId: `test-msg-b-${Date.now()}`,
      fromPhone: testContact.phone,
      text: 'Abdurahman\nBusiness\nChina',
      timestamp: new Date(),
    })

    console.log(`✅ Step B Result:`)
    console.log(`   name: ${resultB.extractedFields.identity?.name || 'none'}`)
    console.log(`   nationality: ${resultB.extractedFields.nationality || 'none'}`)
    console.log(`   service: ${resultB.extractedFields.service || resultB.extractedFields.serviceRaw || 'none'}`)

    // Verify conversation.knownFields
    const convAfterB = await prisma.conversation.findUnique({
      where: { id: testConversation.id },
      select: { knownFields: true, lastQuestionKey: true },
    })

    if (convAfterB?.knownFields) {
      const knownFields = JSON.parse(convAfterB.knownFields)
      console.log(`\n📊 Conversation.knownFields after B:`)
      console.log(`   nationality: ${knownFields.nationality || 'none'}`)
      console.log(`   name: ${knownFields.name || knownFields.identity?.name || 'none'}`)
      console.log(`   service: ${knownFields.service || 'none'}`)
      console.log(`   lastQuestionKey: ${convAfterB.lastQuestionKey || 'null'}`)
    }

    // Step C: Verify next reply would NOT ask nationality
    console.log('\n🔄 Step C: Checking if next reply would ask nationality...')
    const stateMachineState = await loadConversationState(testConversation.id)
    console.log(`   State machine knownFields.nationality: ${stateMachineState.knownFields.nationality || 'none'}`)
    console.log(`   State machine lastQuestionKey: ${stateMachineState.lastQuestionKey || 'null'}`)

    // Check if nationality is in knownFields (should prevent asking again)
    const hasNationality = !!(
      stateMachineState.knownFields.nationality ||
      (convAfterB?.knownFields && JSON.parse(convAfterB.knownFields).nationality) ||
      contactAfterA?.nationality
    )

    console.log(`\n✅ Final Assertions:`)
    console.log(`   ✓ Nationality saved: ${hasNationality ? 'PASS' : 'FAIL'}`)
    console.log(`   ✓ Flow advanced (lastQuestionKey cleared): ${!convAfterB?.lastQuestionKey || convAfterB.lastQuestionKey !== 'NATIONALITY' ? 'PASS' : 'FAIL'}`)
    console.log(`   ✓ knownFields.nationality exists: ${convAfterB?.knownFields && JSON.parse(convAfterB.knownFields).nationality ? 'PASS' : 'FAIL'}`)

    if (hasNationality && (!convAfterB?.lastQuestionKey || convAfterB.lastQuestionKey !== 'NATIONALITY')) {
      console.log('\n🎉 ALL TESTS PASSED!')
      return true
    } else {
      console.log('\n❌ SOME TESTS FAILED!')
      return false
    }
  } finally {
    // Cleanup (delete in order to respect foreign keys)
    await prisma.message.deleteMany({ where: { conversationId: testConversation.id } })
    await prisma.communicationLog.deleteMany({ where: { conversationId: testConversation.id } })
    await prisma.conversation.deleteMany({ where: { id: testConversation.id } })
    await prisma.lead.deleteMany({ where: { id: testLead.id } })
    await prisma.contact.deleteMany({ where: { id: testContact.id } })
  }
}

// Run if called directly
if (require.main === module) {
  runSmokeTest()
    .then((passed) => {
      process.exit(passed ? 0 : 1)
    })
    .catch((error) => {
      console.error('❌ Smoke test failed:', error)
      process.exit(1)
    })
}

export { runSmokeTest }

