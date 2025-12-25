/**
 * Comprehensive Rule Engine Test Suite
 * 
 * Tests all critical flows:
 * 1. Greeting flow
 * 2. Name capture
 * 3. Service identification
 * 4. Service-specific flows
 * 5. Memory persistence
 * 6. No repeated questions
 * 7. Pricing accuracy
 * 8. Handover logic
 */

import { PrismaClient } from '@prisma/client'
import { executeRuleEngine, loadConversationMemory, RuleEngineContext } from '../src/lib/ai/ruleEngine'

const prisma = new PrismaClient()

interface TestCase {
  name: string
  messages: Array<{ text: string; expectedReply?: string; expectedMemory?: any }>
  expectedService?: string
  expectedHandover?: boolean
}

const testCases: TestCase[] = [
  {
    name: 'Visit Visa Flow - Complete',
    messages: [
      {
        text: 'hi',
        expectedReply: 'Hello! 👋 I\'m Hamdi from Al Ain Business Center',
      },
      {
        text: 'my name is Ahmed',
        expectedMemory: { name: 'Ahmed' },
      },
      {
        text: 'visit visa',
        expectedMemory: { service: 'Visit Visa' },
      },
      {
        text: 'indian',
        expectedMemory: { nationality: 'indian' },
      },
      {
        text: '30 days',
        expectedMemory: { visit_duration_days: 30 },
        expectedReply: 'AED 400', // Indian 30-day price
      },
    ],
    expectedService: 'Visit Visa',
  },
  {
    name: 'Freelance Visa Flow - Complete',
    messages: [
      {
        text: 'hello',
        expectedReply: 'Hello! 👋',
      },
      {
        text: 'I am John',
        expectedMemory: { name: 'John' },
      },
      {
        text: 'freelance visa',
        expectedMemory: { service: 'Freelance Visa' },
      },
      {
        text: 'somalia',
        expectedMemory: { nationality: 'somali' }, // Normalized to adjective form
      },
      {
        text: 'yes inside uae',
        expectedMemory: { inside_uae: true },
      },
      {
        text: 'visa only',
        expectedMemory: { service_variant: 'visa' },
        expectedReply: 'AED 6999', // Non-Indian/Pakistani price
      },
    ],
    expectedService: 'Freelance Visa',
  },
  {
    name: 'Business Setup Flow - Freezone',
    messages: [
      {
        text: 'hi',
        expectedReply: 'Hello! 👋',
      },
      {
        text: 'my name is Sarah',
        expectedMemory: { name: 'Sarah' },
      },
      {
        text: 'business setup',
        expectedMemory: { service: 'Business Setup' },
      },
      {
        text: 'freezone',
        expectedMemory: { license_type: 'freezone' },
      },
      {
        text: 'general trading',
        expectedMemory: { business_activity: 'general trading' },
      },
    ],
    expectedService: 'Business Setup',
  },
  {
    name: 'No Repeated Questions - Name',
    messages: [
      {
        text: 'hi',
      },
      {
        text: 'I am Mohammed',
        expectedMemory: { name: 'Mohammed' },
      },
      {
        text: 'visit visa',
        expectedMemory: { service: 'Visit Visa' },
      },
      {
        text: 'indian',
        expectedMemory: { nationality: 'indian' },
      },
      {
        text: '30 days',
        // Should NOT ask for name again
        expectedReply: (reply: string) => !reply.toLowerCase().includes('name') && !reply.toLowerCase().includes('what is your'),
      },
    ],
  },
  {
    name: 'Discount Request - Handover',
    messages: [
      {
        text: 'hi',
      },
      {
        text: 'Ahmed',
        expectedMemory: { name: 'Ahmed' },
      },
      {
        text: 'freelance visa',
        expectedMemory: { service: 'Freelance Visa' },
      },
      {
        text: 'can i get discount',
        expectedHandover: true,
        expectedReply: (reply: string) => reply.toLowerCase().includes('team member') || reply.toLowerCase().includes('discount'),
      },
    ],
  },
  {
    name: 'Restricted Nationality - Handover',
    messages: [
      {
        text: 'hi',
      },
      {
        text: 'John',
        expectedMemory: { name: 'John' },
      },
      {
        text: 'freelance visa',
        expectedMemory: { service: 'Freelance Visa' },
      },
      {
        text: 'nigerian',
        expectedMemory: { nationality: 'nigerian' },
        expectedHandover: true, // Nigerian is restricted
      },
    ],
  },
]

async function runTest(testCase: TestCase): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = []
  let conversation: any = null
  let contact: any = null
  let lead: any = null
  
  try {
    // Create test contact and conversation
    contact = await prisma.contact.create({
      data: {
        phone: `+97150${Math.floor(Math.random() * 10000000)}`,
        fullName: 'Test User',
      },
    })
    
    lead = await prisma.lead.create({
      data: {
        contactId: contact.id,
        stage: 'NEW',
        lastContactChannel: 'WHATSAPP',
      },
    })
    
    conversation = await prisma.conversation.create({
      data: {
        contactId: contact.id,
        leadId: lead.id,
        channel: 'whatsapp',
      },
    })
    
    let memory: any = {}
    let isFirstMessage = true
    
    for (let i = 0; i < testCase.messages.length; i++) {
      const message = testCase.messages[i]
      
      // Create inbound message
      const inboundMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          leadId: lead.id,
          contactId: contact.id,
          direction: 'INBOUND',
          channel: 'WHATSAPP',
          body: message.text,
          type: 'text',
        },
      })
      
      // Load memory
      memory = await loadConversationMemory(conversation.id)
      
      // Build conversation history
      const conversationMessages = await prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: 'asc' },
        take: 50,
      })
      
      const conversationHistory = conversationMessages.map(m => ({
        direction: m.direction,
        body: m.body || '',
        createdAt: m.createdAt,
      }))
      
      // Execute rule engine
      const context: RuleEngineContext = {
        conversationId: conversation.id,
        leadId: lead.id,
        contactId: contact.id,
        currentMessage: message.text,
        conversationHistory,
        isFirstMessage,
        memory,
      }
      
      const result = await executeRuleEngine(context)
      
      // Update memory
      memory = { ...memory, ...result.memoryUpdates }
      
      // Create outbound message if reply generated
      if (result.reply) {
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            leadId: lead.id,
            contactId: contact.id,
            direction: 'OUTBOUND',
            channel: 'WHATSAPP',
            body: result.reply,
            type: 'text',
            status: 'SENT',
          },
        })
      }
      
      // Verify expectations
      if (message.expectedMemory) {
        for (const [key, value] of Object.entries(message.expectedMemory)) {
          if (memory[key] !== value && !memory[key]?.toLowerCase().includes(value?.toLowerCase())) {
            errors.push(`Message ${i + 1}: Expected memory.${key} = ${value}, got ${memory[key]}`)
          }
        }
      }
      
      if (message.expectedReply) {
        if (typeof message.expectedReply === 'function') {
          if (!message.expectedReply(result.reply)) {
            errors.push(`Message ${i + 1}: Reply validation failed. Reply: ${result.reply}`)
          }
        } else if (!result.reply.toLowerCase().includes(message.expectedReply.toLowerCase())) {
          errors.push(`Message ${i + 1}: Expected reply to contain "${message.expectedReply}", got: ${result.reply}`)
        }
      }
      
      if (message.expectedHandover !== undefined && result.needsHuman !== message.expectedHandover) {
        errors.push(`Message ${i + 1}: Expected handover=${message.expectedHandover}, got ${result.needsHuman}`)
      }
      
      isFirstMessage = false
    }
    
    // Verify final service
    if (testCase.expectedService && memory.service !== testCase.expectedService) {
      errors.push(`Expected service "${testCase.expectedService}", got "${memory.service}"`)
    }
    
    return {
      passed: errors.length === 0,
      errors,
    }
  } catch (error: any) {
    errors.push(`Test execution error: ${error.message}`)
    return { passed: false, errors }
  } finally {
    // Cleanup
    if (conversation) {
      await prisma.message.deleteMany({ where: { conversationId: conversation.id } })
      await prisma.conversation.delete({ where: { id: conversation.id } })
    }
    if (lead) await prisma.lead.delete({ where: { id: lead.id } })
    if (contact) await prisma.contact.delete({ where: { id: contact.id } })
  }
}

async function main() {
  console.log('🧪 Starting Rule Engine Test Suite...\n')
  
  const results: Array<{ name: string; passed: boolean; errors: string[] }> = []
  
  for (const testCase of testCases) {
    console.log(`\n📋 Running: ${testCase.name}`)
    const result = await runTest(testCase)
    results.push({ name: testCase.name, ...result })
    
    if (result.passed) {
      console.log(`✅ PASSED: ${testCase.name}`)
    } else {
      console.log(`❌ FAILED: ${testCase.name}`)
      result.errors.forEach(error => console.log(`   - ${error}`))
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 TEST SUMMARY')
  console.log('='.repeat(60))
  
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  
  console.log(`✅ Passed: ${passed}/${results.length}`)
  console.log(`❌ Failed: ${failed}/${results.length}`)
  
  if (failed > 0) {
    console.log('\n❌ Failed Tests:')
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}`)
      r.errors.forEach(e => console.log(`     ${e}`))
    })
  }
  
  await prisma.$disconnect()
  
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error)

