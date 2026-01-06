#!/usr/bin/env tsx
/**
 * Backfill script to populate providerMediaId for existing messages
 * 
 * Queries messages where providerMediaId is null but rawPayload or payload exists,
 * then extracts providerMediaId using the unified extraction functions.
 * 
 * Usage:
 *   npx tsx scripts/backfill-provider-media-id.ts [--limit=100] [--dry-run]
 */

import { PrismaClient } from '@prisma/client'
import { detectMediaType, extractMediaId } from '../src/lib/media/extractMediaId'

const prisma = new PrismaClient()

interface BackfillOptions {
  limit?: number
  dryRun?: boolean
  batchSize?: number
}

async function backfillProviderMediaId(options: BackfillOptions = {}) {
  const { limit = 1000, dryRun = false, batchSize = 100 } = options

  console.log(`\n🔍 Starting backfill for providerMediaId...`)
  console.log(`   Limit: ${limit}`)
  console.log(`   Batch size: ${batchSize}`)
  console.log(`   Dry run: ${dryRun ? 'YES (no changes will be made)' : 'NO (will update database)'}\n`)

  let processed = 0
  let updated = 0
  let failed = 0
  let skipped = 0

  try {
    // Query messages where providerMediaId is null but rawPayload or payload exists
    const messages = await prisma.message.findMany({
      where: {
        providerMediaId: null,
        OR: [
          { rawPayload: { not: null } },
          { payload: { not: null } },
        ],
        channel: 'whatsapp',
        type: {
          in: ['image', 'audio', 'document', 'video', 'sticker'],
        },
      },
      select: {
        id: true,
        type: true,
        rawPayload: true,
        payload: true,
        providerMessageId: true,
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    })

    console.log(`📊 Found ${messages.length} messages to process\n`)

    // Process in batches
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize)
      console.log(`\n📦 Processing batch ${Math.floor(i / batchSize) + 1} (${batch.length} messages)...`)

      for (const message of batch) {
        processed++
        let extractedId: string | null = null

        try {
          // Try rawPayload first
          if (message.rawPayload) {
            try {
              const rawPayload = typeof message.rawPayload === 'string'
                ? JSON.parse(message.rawPayload)
                : message.rawPayload

              const detectedType = detectMediaType(rawPayload)
              if (detectedType !== 'text' && detectedType !== 'location' && detectedType !== 'unknown') {
                extractedId = extractMediaId(rawPayload, detectedType)
                if (extractedId) {
                  console.log(`  ✅ Message ${message.id}: Extracted from rawPayload: ${extractedId}`)
                }
              }
            } catch (e: any) {
              // Try payload if rawPayload fails
              if (message.payload) {
                try {
                  const payload = typeof message.payload === 'string'
                    ? JSON.parse(message.payload)
                    : message.payload

                  // Check multiple possible locations
                  extractedId = payload.media?.id ||
                               payload.mediaId ||
                               payload.media_id ||
                               null

                  if (extractedId) {
                    const extractedStr = String(extractedId).trim()
                    if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && extractedStr.length > 0) {
                      extractedId = extractedStr
                      console.log(`  ✅ Message ${message.id}: Extracted from payload: ${extractedId}`)
                    } else {
                      extractedId = null
                    }
                  }
                } catch (e2: any) {
                  console.warn(`  ⚠️  Message ${message.id}: Failed to parse payload: ${e2.message}`)
                }
              }
            }
          } else if (message.payload) {
            // Try payload if no rawPayload
            try {
              const payload = typeof message.payload === 'string'
                ? JSON.parse(message.payload)
                : message.payload

              extractedId = payload.media?.id ||
                           payload.mediaId ||
                           payload.media_id ||
                           null

              if (extractedId) {
                const extractedStr = String(extractedId).trim()
                if (extractedStr && extractedStr !== 'undefined' && extractedStr !== 'null' && extractedStr.length > 0) {
                  extractedId = extractedStr
                  console.log(`  ✅ Message ${message.id}: Extracted from payload: ${extractedId}`)
                } else {
                  extractedId = null
                }
              }
            } catch (e: any) {
              console.warn(`  ⚠️  Message ${message.id}: Failed to parse payload: ${e.message}`)
            }
          }

          if (extractedId) {
            if (!dryRun) {
              await prisma.message.update({
                where: { id: message.id },
                data: { providerMediaId: extractedId } as any,
              })
              updated++
              console.log(`  💾 Message ${message.id}: Updated providerMediaId`)
            } else {
              updated++
              console.log(`  🔍 [DRY RUN] Would update message ${message.id} with providerMediaId: ${extractedId}`)
            }
          } else {
            skipped++
            console.log(`  ⏭️  Message ${message.id}: No providerMediaId found in rawPayload/payload`)
          }
        } catch (e: any) {
          failed++
          console.error(`  ❌ Message ${message.id}: Error: ${e.message}`)
        }
      }
    }

    console.log(`\n\n📊 Backfill Summary:`)
    console.log(`   Processed: ${processed}`)
    console.log(`   Updated: ${updated}`)
    console.log(`   Skipped: ${skipped}`)
    console.log(`   Failed: ${failed}`)
    if (dryRun) {
      console.log(`\n⚠️  DRY RUN - No changes were made to the database`)
    } else {
      console.log(`\n✅ Backfill completed successfully`)
    }
  } catch (e: any) {
    console.error(`\n❌ Backfill failed: ${e.message}`)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Parse command line arguments
const args = process.argv.slice(2)
const options: BackfillOptions = {
  limit: 1000,
  dryRun: false,
  batchSize: 100,
}

for (const arg of args) {
  if (arg.startsWith('--limit=')) {
    options.limit = parseInt(arg.split('=')[1], 10)
  } else if (arg === '--dry-run') {
    options.dryRun = true
  } else if (arg.startsWith('--batch-size=')) {
    options.batchSize = parseInt(arg.split('=')[1], 10)
  }
}

backfillProviderMediaId(options)
  .catch((e) => {
    console.error('Unhandled error:', e)
    process.exit(1)
  })
