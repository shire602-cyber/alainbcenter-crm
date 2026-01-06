/**
 * Inspect actual message data to understand what's stored
 */

import { prisma } from '../src/lib/prisma'

async function inspectMessages() {
  // Get a few messages with different states
  const messages = await prisma.message.findMany({
    where: {
      OR: [
        { type: { in: ['audio', 'image', 'video', 'document'] } },
        { mediaMimeType: { not: null } },
      ],
    },
    select: {
      id: true,
      type: true,
      mediaMimeType: true,
      providerMediaId: true,
      mediaUrl: true,
      rawPayload: true,
      payload: true,
      providerMessageId: true,
      createdAt: true,
    },
    take: 20,
    orderBy: { createdAt: 'desc' },
  })

  console.log(`\n📊 Inspecting ${messages.length} messages:\n`)

  for (const msg of messages) {
    console.log(`\n📨 Message ${msg.id} (${msg.type})`)
    console.log(`  providerMediaId: ${msg.providerMediaId || 'NULL'}`)
    console.log(`  mediaUrl: ${msg.mediaUrl || 'NULL'}`)
    console.log(`  providerMessageId: ${msg.providerMessageId || 'NULL'}`)
    console.log(`  hasRawPayload: ${!!msg.rawPayload}`)
    console.log(`  hasPayload: ${!!msg.payload}`)
    
    if (msg.rawPayload) {
      try {
        const raw = typeof msg.rawPayload === 'string' ? JSON.parse(msg.rawPayload) : msg.rawPayload
        console.log(`  rawPayload keys: ${Object.keys(raw).join(', ')}`)
        if (raw.audio) console.log(`  rawPayload.audio keys: ${Object.keys(raw.audio).join(', ')}`)
        if (raw.image) console.log(`  rawPayload.image keys: ${Object.keys(raw.image).join(', ')}`)
        if (raw.document) console.log(`  rawPayload.document keys: ${Object.keys(raw.document).join(', ')}`)
        if (raw.video) console.log(`  rawPayload.video keys: ${Object.keys(raw.video).join(', ')}`)
        if (raw.message) console.log(`  rawPayload.message keys: ${Object.keys(raw.message).join(', ')}`)
      } catch (e) {
        console.log(`  rawPayload parse error: ${e}`)
      }
    }
    
    if (msg.payload) {
      try {
        const payload = typeof msg.payload === 'string' ? JSON.parse(msg.payload) : msg.payload
        console.log(`  payload keys: ${Object.keys(payload).join(', ')}`)
      } catch (e) {
        console.log(`  payload parse error: ${e}`)
      }
    }

    // Check ExternalEventLog
    if (msg.providerMessageId) {
      const logs = await prisma.externalEventLog.findMany({
        where: {
          provider: 'whatsapp',
          externalId: {
            startsWith: `message-${msg.providerMessageId}-`,
          },
        },
        take: 1,
      })
      console.log(`  ExternalEventLog entries: ${logs.length}`)
      if (logs.length > 0) {
        try {
          const logPayload = typeof logs[0].payload === 'string' ? JSON.parse(logs[0].payload) : logs[0].payload
          console.log(`  ExternalEventLog.payload keys: ${Object.keys(logPayload).join(', ')}`)
          console.log(`  ExternalEventLog.providerMediaId: ${logPayload.providerMediaId || 'NULL'}`)
        } catch (e) {
          console.log(`  ExternalEventLog parse error: ${e}`)
        }
      }
    }
  }

  process.exit(0)
}

inspectMessages().catch(console.error)








