#!/usr/bin/env node
/**
 * WhatsApp Deduplication Test Suite
 * 
 * Tests:
 * 1. Same inbound message ID twice -> only 1 outbound reply
 * 2. Two different messages from same phone -> same conversation reused, 2 outbound replies
 * 3. Missing training -> still replies with greeting flow
 * 
 * Usage: node scripts/tests/whatsapp-dedupe-test.js
 */

const https = require('https')
const http = require('http')

const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhooks/whatsapp'
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'test-token'

// Test phone numbers
const TEST_PHONE_1 = '971501234567'
const TEST_PHONE_2 = '971509876543'

// Helper: Build webhook payload
function buildWebhookPayload(messageId, from, text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '1234567890',
            phone_number_id: 'PHONE_NUMBER_ID',
          },
          messages: [{
            from: from,
            id: messageId,
            timestamp: Math.floor(Date.now() / 1000).toString(),
            type: 'text',
            text: {
              body: text,
            },
          }],
        },
        field: 'messages',
      }],
    }],
  }
}

// Helper: Send webhook POST
function sendWebhook(payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(WEBHOOK_URL)
    const data = JSON.stringify(payload)
    
    const options = {
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'X-Hub-Signature-256': 'sha256=test-signature', // Skip signature verification in test
      },
    }
    
    const req = (url.protocol === 'https:' ? https : http).request(options, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        resolve({ status: res.statusCode, body: body ? JSON.parse(body) : null })
      })
    })
    
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// Helper: Wait
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Test 1: Same message ID twice -> only 1 outbound
async function test1_DuplicateMessageId() {
  console.log('\n🧪 TEST 1: Duplicate message ID (same providerMessageId twice)')
  console.log('Expected: Only 1 inbound Message created, only 1 outbound reply sent')
  
  const messageId = `wamid.test1.${Date.now()}`
  const payload = buildWebhookPayload(messageId, TEST_PHONE_1, 'Hi, I need business setup')
  
  console.log(`📤 Sending first webhook with messageId: ${messageId}`)
  const result1 = await sendWebhook(payload)
  console.log(`✅ First webhook response: ${result1.status}`)
  
  await sleep(2000) // Wait 2 seconds
  
  console.log(`📤 Sending duplicate webhook with same messageId: ${messageId}`)
  const result2 = await sendWebhook(payload)
  console.log(`✅ Duplicate webhook response: ${result2.status}`)
  
  console.log('\n📊 Manual verification required:')
  console.log('1. Check database: SELECT COUNT(*) FROM "Message" WHERE "providerMessageId" = ?', messageId)
  console.log('   Expected: 1 (only one inbound message)')
  console.log('2. Check database: SELECT COUNT(*) FROM "OutboundMessageLog" WHERE "triggerProviderMessageId" = ?', messageId)
  console.log('   Expected: 1 (only one outbound logged)')
  console.log('3. Check database: SELECT COUNT(*) FROM "InboundMessageDedup" WHERE "providerMessageId" = ?', messageId)
  console.log('   Expected: 1 (dedup record exists)')
  
  return { passed: result1.status === 200 && result2.status === 200, test: 'test1' }
}

// Test 2: Two different messages from same phone -> same conversation
async function test2_TwoDifferentMessages() {
  console.log('\n🧪 TEST 2: Two different messages from same phone')
  console.log('Expected: Same conversation reused, 2 outbound replies')
  
  const messageId1 = `wamid.test2a.${Date.now()}`
  const messageId2 = `wamid.test2b.${Date.now()}`
  
  const payload1 = buildWebhookPayload(messageId1, TEST_PHONE_2, 'Hi, I want family visa')
  const payload2 = buildWebhookPayload(messageId2, TEST_PHONE_2, 'Partner visa')
  
  console.log(`📤 Sending first message: ${messageId1}`)
  const result1 = await sendWebhook(payload1)
  console.log(`✅ First message response: ${result1.status}`)
  
  await sleep(3000) // Wait 3 seconds
  
  console.log(`📤 Sending second message: ${messageId2}`)
  const result2 = await sendWebhook(payload2)
  console.log(`✅ Second message response: ${result2.status}`)
  
  console.log('\n📊 Manual verification required:')
  console.log('1. Check database: SELECT "conversationId" FROM "Message" WHERE "providerMessageId" IN (?, ?)', messageId1, messageId2)
  console.log('   Expected: Both messages have the SAME conversationId')
  console.log('2. Check database: SELECT COUNT(*) FROM "OutboundMessageLog" WHERE "triggerProviderMessageId" IN (?, ?)', messageId1, messageId2)
  console.log('   Expected: 2 (one outbound per inbound)')
  
  return { passed: result1.status === 200 && result2.status === 200, test: 'test2' }
}

// Test 3: Missing training -> still replies
async function test3_MissingTraining() {
  console.log('\n🧪 TEST 3: Message with missing training context')
  console.log('Expected: Still replies with greeting flow (name/service/nationality)')
  
  const messageId = `wamid.test3.${Date.now()}`
  const payload = buildWebhookPayload(messageId, TEST_PHONE_1, 'Hello, I need help')
  
  console.log(`📤 Sending message: ${messageId}`)
  const result = await sendWebhook(payload)
  console.log(`✅ Message response: ${result.status}`)
  
  await sleep(5000) // Wait 5 seconds for AI reply
  
  console.log('\n📊 Manual verification required:')
  console.log('1. Check WhatsApp: Customer should receive a reply (greeting/name/service question)')
  console.log('2. Check database: SELECT * FROM "Message" WHERE "providerMessageId" = ? AND "direction" = \'OUTBOUND\'', messageId)
  console.log('   Expected: At least 1 outbound message exists')
  console.log('3. Check database: SELECT * FROM "AutoReplyLog" WHERE "messageId" = (SELECT id FROM "Message" WHERE "providerMessageId" = ?)', messageId)
  console.log('   Expected: AutoReplyLog entry exists with decision')
  
  return { passed: result.status === 200, test: 'test3' }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting WhatsApp Deduplication Test Suite')
  console.log(`📡 Webhook URL: ${WEBHOOK_URL}`)
  console.log('⚠️  Note: These tests require manual database verification')
  
  const results = []
  
  try {
    results.push(await test1_DuplicateMessageId())
    await sleep(3000)
    
    results.push(await test2_TwoDifferentMessages())
    await sleep(3000)
    
    results.push(await test3_MissingTraining())
  } catch (error) {
    console.error('❌ Test suite error:', error)
    process.exit(1)
  }
  
  console.log('\n📊 Test Summary:')
  results.forEach(r => {
    console.log(`${r.passed ? '✅' : '❌'} ${r.test}: ${r.passed ? 'PASS' : 'FAIL'}`)
  })
  
  const allPassed = results.every(r => r.passed)
  console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`)
  console.log('\n⚠️  Remember to verify database state manually!')
  
  process.exit(allPassed ? 0 : 1)
}

// Run if executed directly
if (require.main === module) {
  runTests().catch(console.error)
}

module.exports = { runTests, test1_DuplicateMessageId, test2_TwoDifferentMessages, test3_MissingTraining }

