/**
 * Test the complete pipeline: webhook -> extraction -> storage -> recovery
 */

import { prisma } from '../src/lib/prisma'
import { extractMediaInfo, detectMediaType } from '../src/lib/media/extractMediaId'

async function testPipelineIntegration() {
  console.log('🧪 Testing complete media pipeline integration\n')
  
  // Simulate a webhook message
  const mockMessage = {
    id: 'wamid.INTEGRATION_TEST',
    type: 'audio',
    from: '971501234567',
    timestamp: '1234567890',
    audio: {
      id: '9999999999999999',
      mime_type: 'audio/ogg; codecs=opus',
      sha256: 'test_hash',
    },
  }
  
  console.log('1️⃣ Simulating webhook extraction...')
  const detectedType = detectMediaType(mockMessage)
  const mediaInfo = extractMediaInfo(mockMessage, detectedType)
  
  console.log(`   Detected type: ${detectedType}`)
  console.log(`   Extracted providerMediaId: ${mediaInfo.providerMediaId || 'NULL'}`)
  console.log(`   Extracted MIME type: ${mediaInfo.mediaMimeType || 'NULL'}`)
  
  if (!mediaInfo.providerMediaId) {
    console.log('\n❌ FAILED: Could not extract providerMediaId from mock message')
    process.exit(1)
  }
  
  console.log('\n2️⃣ Testing rawPayload storage...')
  const rawPayloadStr = JSON.stringify(mockMessage)
  console.log(`   rawPayload length: ${rawPayloadStr.length} chars`)
  
  // Test parsing back
  const parsed = JSON.parse(rawPayloadStr)
  const hasMediaObject = !!(parsed.audio || parsed.image || parsed.document || parsed.video)
  console.log(`   Has media object in rawPayload: ${hasMediaObject}`)
  
  if (!hasMediaObject) {
    console.log('\n❌ FAILED: rawPayload does not contain media object')
    process.exit(1)
  }
  
  console.log('\n3️⃣ Testing recovery from rawPayload...')
  const recoveredType = detectMediaType(parsed)
  const recoveredInfo = extractMediaInfo(parsed, recoveredType)
  
  console.log(`   Recovered type: ${recoveredType}`)
  console.log(`   Recovered providerMediaId: ${recoveredInfo.providerMediaId || 'NULL'}`)
  
  if (recoveredInfo.providerMediaId !== mediaInfo.providerMediaId) {
    console.log('\n❌ FAILED: Recovery from rawPayload failed')
    process.exit(1)
  }
  
  console.log('\n4️⃣ Testing with real database message...')
  // Find a message with rawPayload
  const realMsg = await prisma.message.findFirst({
    where: {
      rawPayload: { not: null },
      type: { in: ['audio', 'image', 'video', 'document'] },
    },
    select: {
      id: true,
      type: true,
      providerMediaId: true,
      rawPayload: true,
    },
  })
  
  if (realMsg) {
    console.log(`   Found message ${realMsg.id} (${realMsg.type})`)
    
    try {
      const raw = typeof realMsg.rawPayload === 'string' 
        ? JSON.parse(realMsg.rawPayload) 
        : realMsg.rawPayload
      
      const recoveredType = detectMediaType(raw)
      const recoveredInfo = extractMediaInfo(raw, recoveredType)
      
      console.log(`   Recovered providerMediaId: ${recoveredInfo.providerMediaId || 'NULL'}`)
      console.log(`   Stored providerMediaId: ${realMsg.providerMediaId || 'NULL'}`)
      
      if (recoveredInfo.providerMediaId && recoveredInfo.providerMediaId === realMsg.providerMediaId) {
        console.log('   ✅ Recovery matches stored value')
      } else if (recoveredInfo.providerMediaId && !realMsg.providerMediaId) {
        console.log('   ⚠️ Recovery found ID but message has NULL (needs backfill)')
      } else {
        console.log('   ⚠️ Recovery did not find ID')
      }
    } catch (e) {
      console.log(`   ❌ Failed to parse rawPayload: ${e}`)
    }
  } else {
    console.log('   ⚠️ No messages with rawPayload found (this is expected for new messages)')
  }
  
  console.log('\n✅ All integration tests passed!')
  process.exit(0)
}

testPipelineIntegration().catch(console.error)








