/**
 * Check messages that DO have rawPayload to verify structure
 */

import { prisma } from '../src/lib/prisma'

async function checkRawPayload() {
  // Find messages WITH rawPayload
  const messages = await prisma.message.findMany({
    where: {
      rawPayload: { not: null },
      OR: [
        { type: { in: ['audio', 'image', 'video', 'document'] } },
        { mediaMimeType: { not: null } },
      ],
    },
    select: {
      id: true,
      type: true,
      providerMediaId: true,
      mediaUrl: true,
      rawPayload: true,
      providerMessageId: true,
    },
    take: 5,
  })

  console.log(`\n📊 Found ${messages.length} messages WITH rawPayload:\n`)

  for (const msg of messages) {
    console.log(`\n📨 Message ${msg.id} (${msg.type})`)
    console.log(`  providerMediaId: ${msg.providerMediaId || 'NULL'}`)
    console.log(`  mediaUrl: ${msg.mediaUrl || 'NULL'}`)
    
    if (msg.rawPayload) {
      try {
        const raw = typeof msg.rawPayload === 'string' ? JSON.parse(msg.rawPayload) : msg.rawPayload
        console.log(`  rawPayload type: ${typeof raw}`)
        console.log(`  rawPayload keys: ${Object.keys(raw).slice(0, 10).join(', ')}`)
        
        // Check for media objects
        if (raw.audio) {
          console.log(`  ✅ rawPayload.audio exists`)
          console.log(`     audio keys: ${Object.keys(raw.audio).join(', ')}`)
          console.log(`     audio.id: ${raw.audio.id || 'NULL'}`)
          console.log(`     audio.media_id: ${raw.audio.media_id || 'NULL'}`)
        }
        if (raw.image) {
          console.log(`  ✅ rawPayload.image exists`)
          console.log(`     image keys: ${Object.keys(raw.image).join(', ')}`)
          console.log(`     image.id: ${raw.image.id || 'NULL'}`)
        }
        if (raw.document) {
          console.log(`  ✅ rawPayload.document exists`)
          console.log(`     document keys: ${Object.keys(raw.document).join(', ')}`)
          console.log(`     document.id: ${raw.document.id || 'NULL'}`)
        }
        if (raw.video) {
          console.log(`  ✅ rawPayload.video exists`)
          console.log(`     video keys: ${Object.keys(raw.video).join(', ')}`)
          console.log(`     video.id: ${raw.video.id || 'NULL'}`)
        }
        if (raw.message) {
          console.log(`  ✅ rawPayload.message exists`)
          console.log(`     message keys: ${Object.keys(raw.message).slice(0, 10).join(', ')}`)
          if (raw.message.audio) console.log(`     message.audio.id: ${raw.message.audio.id || 'NULL'}`)
          if (raw.message.image) console.log(`     message.image.id: ${raw.message.image.id || 'NULL'}`)
          if (raw.message.document) console.log(`     message.document.id: ${raw.message.document.id || 'NULL'}`)
          if (raw.message.video) console.log(`     message.video.id: ${raw.message.video.id || 'NULL'}`)
        }
      } catch (e: any) {
        console.log(`  ❌ Parse error: ${e.message}`)
      }
    }
  }

  // Also check ExternalEventLog
  console.log(`\n\n📊 Checking ExternalEventLog entries:\n`)
  const logs = await prisma.externalEventLog.findMany({
    where: {
      provider: 'whatsapp',
      payload: { contains: 'providerMediaId' },
    },
    take: 5,
  })

  console.log(`Found ${logs.length} ExternalEventLog entries with providerMediaId\n`)

  for (const log of logs) {
    try {
      const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload
      console.log(`  ExternalEventLog ${log.id}:`)
      console.log(`    externalId: ${log.externalId}`)
      console.log(`    providerMediaId: ${payload.providerMediaId || 'NULL'}`)
      console.log(`    messageId: ${payload.messageId || 'NULL'}`)
      console.log(`    payload keys: ${Object.keys(payload).slice(0, 10).join(', ')}`)
    } catch (e) {
      console.log(`  ❌ Parse error: ${e}`)
    }
  }

  process.exit(0)
}

checkRawPayload().catch(console.error)








