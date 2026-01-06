/**
 * Test script to verify media recovery logic works correctly
 * This simulates the actual recovery flow with real database data
 */

import { prisma } from '../src/lib/prisma'

async function testMediaRecovery() {
  console.log('🔍 Testing media recovery logic...\n')

  // Find messages with media type but missing providerMediaId
  const testMessages = await prisma.message.findMany({
    where: {
      OR: [
        { type: { in: ['audio', 'image', 'video', 'document'] } },
        { mediaMimeType: { not: null } },
      ],
      providerMediaId: null,
      mediaUrl: null,
    },
    select: {
      id: true,
      type: true,
      mediaMimeType: true,
      rawPayload: true,
      payload: true,
      providerMessageId: true,
      createdAt: true,
    },
    take: 10,
  })

  console.log(`Found ${testMessages.length} messages to test recovery\n`)

  let recovered = 0
  let failed = 0

  for (const msg of testMessages) {
    console.log(`\n📨 Testing message ${msg.id} (type: ${msg.type})`)
    
    let providerMediaId: string | null = null

    // PRIORITY C: Extract from rawPayload
    if (msg.rawPayload) {
      try {
        const rawPayload = typeof msg.rawPayload === 'string' 
          ? JSON.parse(msg.rawPayload) 
          : msg.rawPayload
        
        console.log('  rawPayload keys:', Object.keys(rawPayload))
        
        // Try multiple payload structures
        const mediaObject = msg.type === 'audio' ? (rawPayload.audio || rawPayload.message?.audio) :
                           msg.type === 'image' ? (rawPayload.image || rawPayload.message?.image) :
                           msg.type === 'video' ? (rawPayload.video || rawPayload.message?.video) :
                           msg.type === 'document' ? (rawPayload.document || rawPayload.message?.document) :
                           null
        
        if (mediaObject) {
          console.log('  mediaObject keys:', Object.keys(mediaObject))
          const extractedId = mediaObject?.id || 
                             mediaObject?.media_id || 
                             mediaObject?.mediaId ||
                             null
          
          if (extractedId) {
            const extractedStr = String(extractedId).trim()
            if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && extractedStr.length > 0) {
              providerMediaId = extractedStr
              console.log(`  ✅ PRIORITY C: Recovered ${providerMediaId}`)
              recovered++
              continue
            }
          }
        }
      } catch (e: any) {
        console.log(`  ❌ PRIORITY C failed: ${e.message}`)
      }
    }

    // PRIORITY D: Extract from payload
    if (!providerMediaId && msg.payload) {
      try {
        const payload = typeof msg.payload === 'string'
          ? JSON.parse(msg.payload)
          : msg.payload
        
        console.log('  payload keys:', Object.keys(payload))
        const extractedId = payload.media?.id || 
                           payload.mediaId || 
                           payload.media_id || 
                           payload.id ||
                           null
        
        if (extractedId) {
          const extractedStr = String(extractedId).trim()
          if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && extractedStr.length > 0) {
            providerMediaId = extractedStr
            console.log(`  ✅ PRIORITY D: Recovered ${providerMediaId}`)
            recovered++
            continue
          }
        }
      } catch (e: any) {
        console.log(`  ❌ PRIORITY D failed: ${e.message}`)
      }
    }

    // PRIORITY E: Query ExternalEventLog
    if (!providerMediaId && msg.providerMessageId) {
      try {
        const eventLogs = await prisma.externalEventLog.findMany({
          where: {
            provider: 'whatsapp',
            externalId: {
              startsWith: `message-${msg.providerMessageId}-`,
            },
          },
          orderBy: { receivedAt: 'desc' },
          take: 5,
        })

        console.log(`  Found ${eventLogs.length} ExternalEventLog entries`)

        for (const eventLog of eventLogs) {
          try {
            const storedPayload = typeof eventLog.payload === 'string'
              ? JSON.parse(eventLog.payload)
              : eventLog.payload
            
            // PRIORITY 1: Check top-level providerMediaId
            if (storedPayload.providerMediaId) {
              const extractedStr = String(storedPayload.providerMediaId).trim()
              if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && 
                  extractedStr.length > 0 && !extractedStr.startsWith('http') && !extractedStr.startsWith('/')) {
                providerMediaId = extractedStr
                console.log(`  ✅ PRIORITY E (top-level): Recovered ${providerMediaId}`)
                recovered++
                break
              }
            }

            // PRIORITY 2: Check message object
            if (storedPayload.messageId === msg.providerMessageId || 
                storedPayload.message?.id === msg.providerMessageId) {
              const extractedId = storedPayload.message?.audio?.id ||
                                 storedPayload.message?.image?.id ||
                                 storedPayload.message?.video?.id ||
                                 storedPayload.message?.document?.id ||
                                 storedPayload.audioObject?.id ||
                                 storedPayload.imageObject?.id ||
                                 storedPayload.videoObject?.id ||
                                 storedPayload.documentObject?.id ||
                                 null
              
              if (extractedId) {
                const extractedStr = String(extractedId).trim()
                if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && 
                    extractedStr.length > 0 && !extractedStr.startsWith('http') && !extractedStr.startsWith('/')) {
                  providerMediaId = extractedStr
                  console.log(`  ✅ PRIORITY E (message object): Recovered ${providerMediaId}`)
                  recovered++
                  break
                }
              }
            }
          } catch (e: any) {
            console.log(`  ❌ Failed to parse ExternalEventLog: ${e.message}`)
            continue
          }
        }
      } catch (e: any) {
        console.log(`  ❌ PRIORITY E query failed: ${e.message}`)
      }
    }

    if (!providerMediaId) {
      console.log(`  ❌ FAILED: Could not recover media ID`)
      failed++
    }
  }

  console.log(`\n\n📊 Results:`)
  console.log(`  ✅ Recovered: ${recovered}/${testMessages.length}`)
  console.log(`  ❌ Failed: ${failed}/${testMessages.length}`)
  console.log(`  Success rate: ${((recovered / testMessages.length) * 100).toFixed(1)}%`)

  process.exit(0)
}

testMediaRecovery().catch(console.error)








