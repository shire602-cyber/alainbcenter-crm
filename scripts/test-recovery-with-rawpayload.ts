/**
 * Test recovery on a message that HAS rawPayload
 */

import { prisma } from '../src/lib/prisma'

async function testRecovery() {
  // Find a message WITH rawPayload but WITHOUT providerMediaId
  const msg = await prisma.message.findFirst({
    where: {
      rawPayload: { not: null },
      providerMediaId: null,
      OR: [
        { type: { in: ['audio', 'image', 'video', 'document'] } },
        { mediaMimeType: { not: null } },
      ],
    },
    select: {
      id: true,
      type: true,
      rawPayload: true,
      payload: true,
      providerMessageId: true,
    },
  })

  if (!msg) {
    console.log('No messages with rawPayload but missing providerMediaId found')
    console.log('Testing with a message that HAS providerMediaId to verify structure...\n')
    
    const testMsg = await prisma.message.findFirst({
      where: {
        rawPayload: { not: null },
        providerMediaId: { not: null },
        type: { in: ['audio', 'image', 'video', 'document'] },
      },
      select: {
        id: true,
        type: true,
        providerMediaId: true,
        rawPayload: true,
      },
    })

    if (testMsg) {
      console.log(`\n📨 Testing recovery logic on message ${testMsg.id} (has providerMediaId: ${testMsg.providerMediaId})`)
      console.log('This will verify the recovery logic structure matches the data\n')
      
      const rawPayload = typeof testMsg.rawPayload === 'string' 
        ? JSON.parse(testMsg.rawPayload) 
        : testMsg.rawPayload
      
      console.log('rawPayload structure:')
      console.log('  Keys:', Object.keys(rawPayload).join(', '))
      
      const mediaObject = testMsg.type === 'audio' ? (rawPayload.audio || rawPayload.message?.audio) :
                         testMsg.type === 'image' ? (rawPayload.image || rawPayload.message?.image) :
                         testMsg.type === 'video' ? (rawPayload.video || rawPayload.message?.video) :
                         testMsg.type === 'document' ? (rawPayload.document || rawPayload.message?.document) :
                         null
      
      if (mediaObject) {
        console.log(`\n✅ Found ${testMsg.type} object`)
        console.log('  Keys:', Object.keys(mediaObject).join(', '))
        console.log('  id:', mediaObject.id)
        console.log('  media_id:', mediaObject.media_id || 'NULL')
        console.log('  mediaId:', mediaObject.mediaId || 'NULL')
        
        const extractedId = mediaObject?.id || 
                           mediaObject?.media_id || 
                           mediaObject?.mediaId ||
                           null
        
        console.log(`\n  Extracted ID: ${extractedId}`)
        console.log(`  Expected ID: ${testMsg.providerMediaId}`)
        console.log(`  Match: ${extractedId === testMsg.providerMediaId ? '✅' : '❌'}`)
      } else {
        console.log(`\n❌ No ${testMsg.type} object found in rawPayload`)
      }
    }
    process.exit(0)
  }

  console.log(`\n📨 Testing recovery on message ${msg.id} (type: ${msg.type})\n`)

  let providerMediaId: string | null = null

  // PRIORITY C: Extract from rawPayload
  if (msg.rawPayload) {
    try {
      const rawPayload = typeof msg.rawPayload === 'string' 
        ? JSON.parse(msg.rawPayload) 
        : msg.rawPayload
      
      console.log('PRIORITY C: rawPayload')
      console.log('  Keys:', Object.keys(rawPayload).join(', '))
      
      const mediaObject = msg.type === 'audio' ? (rawPayload.audio || rawPayload.message?.audio) :
                         msg.type === 'image' ? (rawPayload.image || rawPayload.message?.image) :
                         msg.type === 'video' ? (rawPayload.video || rawPayload.message?.video) :
                         msg.type === 'document' ? (rawPayload.document || rawPayload.message?.document) :
                         null
      
      if (mediaObject) {
        console.log(`  ✅ Found ${msg.type} object`)
        console.log('    Keys:', Object.keys(mediaObject).join(', '))
        
        const extractedId = mediaObject?.id || 
                           mediaObject?.media_id || 
                           mediaObject?.mediaId ||
                           null
        
        if (extractedId) {
          const extractedStr = String(extractedId).trim()
          if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && extractedStr.length > 0) {
            providerMediaId = extractedStr
            console.log(`  ✅ RECOVERED: ${providerMediaId}`)
          } else {
            console.log(`  ❌ Invalid ID: ${extractedStr}`)
          }
        } else {
          console.log('  ❌ No ID field found')
        }
      } else {
        console.log(`  ❌ No ${msg.type} object found`)
      }
    } catch (e: any) {
      console.log(`  ❌ Parse error: ${e.message}`)
    }
  }

  if (!providerMediaId && msg.payload) {
    console.log('\nPRIORITY D: payload')
    try {
      const payload = typeof msg.payload === 'string'
        ? JSON.parse(msg.payload)
        : msg.payload
      
      console.log('  Keys:', Object.keys(payload).join(', '))
      const extractedId = payload.media?.id || 
                         payload.mediaId || 
                         payload.media_id || 
                         payload.id ||
                         null
      
      if (extractedId) {
        const extractedStr = String(extractedId).trim()
        if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && extractedStr.length > 0) {
          providerMediaId = extractedStr
          console.log(`  ✅ RECOVERED: ${providerMediaId}`)
        }
      }
    } catch (e: any) {
      console.log(`  ❌ Parse error: ${e.message}`)
    }
  }

  if (!providerMediaId) {
    console.log('\n❌ FAILED: Could not recover media ID')
  } else {
    console.log(`\n✅ SUCCESS: Recovered ${providerMediaId}`)
  }

  process.exit(0)
}

testRecovery().catch(console.error)








