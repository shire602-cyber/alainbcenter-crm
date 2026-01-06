/**
 * Test the FULL media flow: webhook -> storage -> recovery -> proxy
 */

import { prisma } from '../src/lib/prisma'

async function testFullFlow() {
  console.log('🧪 Testing FULL media flow...\n')

  // Simulate a webhook message structure
  const mockWebhookMessage = {
    from: '971501234567',
    id: 'wamid.TEST123',
    timestamp: '1234567890',
    type: 'audio',
    audio: {
      id: '1234567890123456',
      mime_type: 'audio/ogg; codecs=opus',
      sha256: 'abc123',
    },
  }

  console.log('1️⃣ Simulating webhook message:')
  console.log(JSON.stringify(mockWebhookMessage, null, 2))

  // Test rawPayload stringification
  console.log('\n2️⃣ Testing rawPayload stringification:')
  try {
    const rawPayloadStr = JSON.stringify(mockWebhookMessage)
    console.log(`✅ Stringified: ${rawPayloadStr.length} chars`)
    console.log(`   Preview: ${rawPayloadStr.substring(0, 100)}...`)

    // Test parsing back
    const parsed = JSON.parse(rawPayloadStr)
    console.log(`✅ Parsed back successfully`)
    console.log(`   audio.id: ${parsed.audio?.id}`)

    // Test recovery logic
    console.log('\n3️⃣ Testing recovery logic:')
    const mediaObject = parsed.audio || parsed.message?.audio
    const extractedId = mediaObject?.id || 
                       mediaObject?.media_id || 
                       mediaObject?.mediaId ||
                       null
    console.log(`   mediaObject: ${mediaObject ? 'found' : 'not found'}`)
    console.log(`   extractedId: ${extractedId}`)
    
    if (extractedId) {
      const extractedStr = String(extractedId).trim()
      if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && extractedStr.length > 0) {
        console.log(`✅ Recovery SUCCESS: ${extractedStr}`)
      } else {
        console.log(`❌ Recovery FAILED: Invalid ID: ${extractedStr}`)
      }
    } else {
      console.log(`❌ Recovery FAILED: No ID found`)
    }
  } catch (e: any) {
    console.log(`❌ Error: ${e.message}`)
  }

  // Test with a real message from DB
  console.log('\n4️⃣ Testing with real message from DB:')
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
    console.log(`   Has providerMediaId: ${!!realMsg.providerMediaId}`)
    
    try {
      const raw = typeof realMsg.rawPayload === 'string' 
        ? JSON.parse(realMsg.rawPayload) 
        : realMsg.rawPayload
      
      const mediaObject = realMsg.type === 'audio' ? (raw.audio || raw.message?.audio) :
                          realMsg.type === 'image' ? (raw.image || raw.message?.image) :
                          realMsg.type === 'video' ? (raw.video || raw.message?.video) :
                          realMsg.type === 'document' ? (raw.document || raw.message?.document) :
                          null
      
      if (mediaObject) {
        const extractedId = mediaObject?.id || 
                           mediaObject?.media_id || 
                           mediaObject?.mediaId ||
                           null
        
        console.log(`   Extracted ID: ${extractedId}`)
        console.log(`   Stored ID: ${realMsg.providerMediaId}`)
        console.log(`   Match: ${extractedId === realMsg.providerMediaId ? '✅' : '❌'}`)
      } else {
        console.log(`   ❌ No media object found in rawPayload`)
      }
    } catch (e: any) {
      console.log(`   ❌ Parse error: ${e.message}`)
    }
  } else {
    console.log('   No messages with rawPayload found')
  }

  process.exit(0)
}

testFullFlow().catch(console.error)








