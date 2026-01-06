/**
 * Backfill WhatsApp Media IDs
 * 
 * Finds messages where providerMediaId is missing and attempts to recover it
 * using the canonical resolveWhatsAppMedia() function.
 * 
 * Usage:
 *   DATABASE_URL="postgresql://..." npx tsx scripts/backfillWhatsappMediaIds.ts [N]
 * 
 * Where N is the number of messages to process (default: 100)
 */

import { PrismaClient } from '@prisma/client'
import { resolveWhatsAppMedia } from '../src/lib/media/resolveWhatsAppMedia'
import { MEDIA_TYPES } from '../src/lib/media/extractMediaId'

const prisma = new PrismaClient()

// Media placeholder regex (matches [Image], [Audio], etc.)
const MEDIA_PLACEHOLDER_REGEX = /\[(audio|image|video|document|sticker|Audio received|Image|Video|Document|Sticker)\]/i

async function main() {
  const limit = parseInt(process.argv[2] || '100', 10)
  
  console.log('🚀 Starting WhatsApp media ID backfill...\n')
  console.log(`📊 Processing up to ${limit} messages\n`)

  try {
    // Find messages where providerMediaId is missing
    // Criteria: channel='whatsapp' AND (type in MEDIA_TYPES OR body contains placeholders) AND providerMediaId IS NULL
    const messages = await prisma.message.findMany({
      where: {
        channel: 'WHATSAPP',
        providerMediaId: null,
        OR: [
          {
            type: {
              in: Array.from(MEDIA_TYPES),
            },
          },
          {
            body: {
              contains: '[Image]',
            },
          },
          {
            body: {
              contains: '[Audio]',
            },
          },
          {
            body: {
              contains: '[Video]',
            },
          },
          {
            body: {
              contains: '[Document]',
            },
          },
          {
            body: {
              contains: '[Sticker]',
            },
          },
        ],
      },
      select: {
        id: true,
        type: true,
        body: true,
        providerMediaId: true,
        mediaUrl: true,
        mediaMimeType: true,
        mediaFilename: true,
        mediaSize: true,
        rawPayload: true,
        payload: true,
        providerMessageId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    })

    console.log(`✅ Found ${messages.length} messages to process\n`)

    let updated = 0
    let foundViaDb = 0
    let foundViaExternalEvent = 0
    let notFound = 0
    let errors = 0

    for (const message of messages) {
      try {
        // Build dbMessage object for resolver
        const dbMessage = {
          type: message.type || null,
          body: message.body || null,
          providerMediaId: message.providerMediaId || null,
          mediaUrl: message.mediaUrl || null,
          mediaMimeType: message.mediaMimeType || null,
          rawPayload: message.rawPayload || null,
          payload: message.payload || null,
          providerMessageId: message.providerMessageId || null,
        }

        // Try to resolve from dbMessage first
        let resolved = resolveWhatsAppMedia(undefined, dbMessage, undefined, undefined)
        
        // If not found and we have providerMessageId, try ExternalEventLog (similar to PRIORITY E)
        let externalEventPayload: any = undefined
        if (!resolved.providerMediaId && message.providerMessageId) {
          try {
            const eventLogs = await prisma.externalEventLog.findMany({
              where: {
                provider: 'whatsapp',
                OR: [
                  {
                    externalId: {
                      startsWith: `message-${message.providerMessageId}-`,
                    },
                  },
                  {
                    payload: {
                      contains: message.providerMessageId,
                    },
                  },
                ],
              },
              orderBy: { receivedAt: 'desc' },
              take: 5, // Try first 5 logs
            })

            // Find matching log and extract payload
            for (const eventLog of eventLogs) {
              try {
                const storedPayload = typeof eventLog.payload === 'string'
                  ? JSON.parse(eventLog.payload)
                  : eventLog.payload

                // Check if this log contains the correct message ID
                const logMessageId = storedPayload.messageId || 
                                    storedPayload.message?.id ||
                                    storedPayload.id ||
                                    storedPayload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id ||
                                    null

                // Check nested structures (webhook format)
                const nestedMessages = storedPayload.entry?.[0]?.changes?.[0]?.value?.messages || []
                const hasMatchingMessage = nestedMessages.some((m: any) => m.id === message.providerMessageId)

                if (logMessageId === message.providerMessageId || hasMatchingMessage) {
                  // Use the full webhook payload structure for resolver
                  externalEventPayload = storedPayload
                  break
                }
              } catch (e) {
                // Skip parse errors
                continue
              }
            }
          } catch (e) {
            // Ignore ExternalEventLog query errors
          }
        }

        // If we found externalEventPayload, try resolver again with it
        if (externalEventPayload && !resolved.providerMediaId) {
          resolved = resolveWhatsAppMedia(undefined, dbMessage, externalEventPayload, undefined)
        }

        // If we found a providerMediaId, update the message
        if (resolved.providerMediaId && resolved.isMedia) {
          const updateData: any = {
            providerMediaId: resolved.providerMediaId,
          }

          // Update media metadata if available
          if (resolved.mediaMimeType) {
            updateData.mediaMimeType = resolved.mediaMimeType
          }
          if (resolved.filename) {
            updateData.mediaFilename = resolved.filename
          }
          if (resolved.size !== null) {
            updateData.mediaSize = resolved.size
          }
          
          // Update type if resolved type is different and is a media type
          if (resolved.finalType && MEDIA_TYPES.has(resolved.finalType) && resolved.finalType !== message.type) {
            updateData.type = resolved.finalType
          }

          await prisma.message.update({
            where: { id: message.id },
            data: updateData,
          })

          updated++
          if (externalEventPayload) {
            foundViaExternalEvent++
            console.log(`✅ [${message.id}] Recovered via ExternalEventLog: ${resolved.providerMediaId}`)
          } else {
            foundViaDb++
            console.log(`✅ [${message.id}] Recovered via dbMessage: ${resolved.providerMediaId}`)
          }
        } else {
          notFound++
          if (resolved.isMedia) {
            console.log(`⚠️  [${message.id}] Is media but providerMediaId not found (type: ${resolved.finalType})`)
          } else {
            console.log(`⚠️  [${message.id}] Not classified as media (type: ${message.type})`)
          }
        }
      } catch (error: any) {
        errors++
        console.error(`❌ [${message.id}] Error: ${error.message}`)
      }
    }

    // Print summary
    console.log('\n📊 Summary:')
    console.log(`   Total processed: ${messages.length}`)
    console.log(`   ✅ Updated: ${updated}`)
    console.log(`      - Found via dbMessage: ${foundViaDb}`)
    console.log(`      - Found via ExternalEventLog: ${foundViaExternalEvent}`)
    console.log(`   ⚠️  Not found: ${notFound}`)
    console.log(`   ❌ Errors: ${errors}`)
    console.log('\n✅ Backfill complete!')

  } catch (error: any) {
    console.error('❌ Backfill failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()

