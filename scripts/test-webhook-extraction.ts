/**
 * Test full webhook extraction flow with mock payloads
 */

import { extractMediaInfo, detectMediaType } from '../src/lib/media/extractMediaId'

interface MockWebhookMessage {
  id: string
  type: string
  from: string
  timestamp: string
  audio?: any
  image?: any
  document?: any
  video?: any
  text?: { body: string }
}

function simulateWebhookExtraction(message: MockWebhookMessage) {
  console.log(`\n📨 Simulating webhook extraction for message ${message.id}`)
  
  // Step 1: Detect media type
  const detectedType = detectMediaType(message)
  const isMediaMessage = detectedType !== 'text' && detectedType !== 'location'
  
  console.log(`  Detected type: ${detectedType}`)
  console.log(`  Is media message: ${isMediaMessage}`)
  
  if (!isMediaMessage) {
    return { success: false, reason: 'Not a media message' }
  }
  
  // Step 2: Extract using extractMediaInfo
  let providerMediaId: string | null = null
  let mediaMimeType: string | null = null
  let filename: string | null = null
  
  const mediaInfo = extractMediaInfo(message, detectedType)
  providerMediaId = mediaInfo.providerMediaId
  mediaMimeType = mediaInfo.mediaMimeType
  filename = mediaInfo.filename
  
  console.log(`  extractMediaInfo result:`)
  console.log(`    providerMediaId: ${providerMediaId || 'NULL'}`)
  console.log(`    mediaMimeType: ${mediaMimeType || 'NULL'}`)
  console.log(`    filename: ${filename || 'NULL'}`)
  
  // Step 3: Fallback extraction if extractMediaInfo failed
  if (!providerMediaId) {
    console.log(`  ⚠️ extractMediaInfo returned null, trying direct extraction...`)
    
    const allMediaObjects = [
      { obj: message.audio, type: 'audio' },
      { obj: message.image, type: 'image' },
      { obj: message.document, type: 'document' },
      { obj: message.video, type: 'video' },
    ].filter(item => item.obj)
    
    console.log(`  Found ${allMediaObjects.length} media objects to try`)
    
    for (const { obj, type } of allMediaObjects) {
      const directId = obj.id || obj.media_id || obj.mediaId || null
      if (directId) {
        const directIdStr = String(directId).trim()
        if (directIdStr && directIdStr !== 'undefined' && directIdStr !== 'null' && 
            directIdStr.length > 0 && directIdStr.length < 500 && !directIdStr.includes(' ')) {
          providerMediaId = directIdStr
          
          if (!mediaMimeType) {
            mediaMimeType = obj.mime_type || obj.mimeType || 
                           (type === 'audio' ? 'audio/ogg' :
                            type === 'image' ? 'image/jpeg' :
                            type === 'document' ? 'application/pdf' :
                            type === 'video' ? 'video/mp4' : 'application/octet-stream')
          }
          
          if (!filename) {
            filename = obj.filename || null
          }
          
          console.log(`  ✅ DIRECT EXTRACTION SUCCESS from ${type}: ${providerMediaId}`)
          break
        }
      }
    }
  }
  
  return {
    success: !!providerMediaId,
    providerMediaId,
    mediaMimeType,
    filename,
    detectedType,
  }
}

async function runWebhookTests() {
  console.log('🧪 Testing full webhook extraction flow\n')
  
  const testMessages: MockWebhookMessage[] = [
    // Test 1: Standard audio
    {
      id: 'wamid.TEST1',
      type: 'audio',
      from: '971501234567',
      timestamp: '1234567890',
      audio: {
        id: '1234567890123456',
        mime_type: 'audio/ogg; codecs=opus',
      },
    },
    
    // Test 2: Audio with type=text
    {
      id: 'wamid.TEST2',
      type: 'text',
      from: '971501234567',
      timestamp: '1234567890',
      audio: {
        id: '2345678901234567',
        mime_type: 'audio/ogg',
      },
    },
    
    // Test 3: Image message
    {
      id: 'wamid.TEST3',
      type: 'image',
      from: '971501234567',
      timestamp: '1234567890',
      image: {
        id: '3456789012345678',
        mime_type: 'image/jpeg',
      },
    },
    
    // Test 4: Document with media_id
    {
      id: 'wamid.TEST4',
      type: 'document',
      from: '971501234567',
      timestamp: '1234567890',
      document: {
        media_id: '4567890123456789',
        filename: 'test.pdf',
        mime_type: 'application/pdf',
      },
    },
    
    // Test 5: Audio missing audio object (should fail)
    {
      id: 'wamid.TEST5',
      type: 'audio',
      from: '971501234567',
      timestamp: '1234567890',
      // No audio object
    },
  ]
  
  let passed = 0
  let failed = 0
  
  for (const message of testMessages) {
    const result = simulateWebhookExtraction(message)
    
    if (result.success) {
      console.log(`  ✅ SUCCESS: Extracted ${result.providerMediaId}`)
      passed++
    } else {
      console.log(`  ❌ FAILED: ${result.reason || 'Could not extract media ID'}`)
      failed++
    }
  }
  
  console.log(`\n\n📊 Test Results:`)
  console.log(`  ✅ Passed: ${passed}/${testMessages.length}`)
  console.log(`  ❌ Failed: ${failed}/${testMessages.length}`)
  console.log(`  Success rate: ${((passed / testMessages.length) * 100).toFixed(1)}%`)
  
  // Expected: 4 passed, 1 failed (Test 5 should fail - no media object)
  if (passed >= 4 && failed <= 1) {
    console.log(`\n✅ Extraction logic working correctly!`)
    process.exit(0)
  } else {
    console.log(`\n❌ Extraction logic needs fixes.`)
    process.exit(1)
  }
}

runWebhookTests().catch(console.error)








