#!/usr/bin/env tsx
/**
 * One-time migration: Update all messages that have mediaUrl but not providerMediaId
 * This fixes old messages created before the extraction fix
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function migrate() {
  console.log('🔍 Finding messages with mediaUrl but no providerMediaId...')
  
  const messages = await prisma.message.findMany({
    where: {
      type: { in: ['audio', 'image', 'document', 'video'] },
      mediaUrl: { not: null },
      providerMediaId: null,
    },
    select: {
      id: true,
      type: true,
      mediaUrl: true,
      providerMediaId: true,
    },
  })
  
  console.log(`Found ${messages.length} messages to update`)
  
  let updated = 0
  let skipped = 0
  
  for (const msg of messages) {
    if (!msg.mediaUrl) {
      skipped++
      continue
    }
    
    const mediaUrl = typeof msg.mediaUrl === 'string' 
      ? msg.mediaUrl.trim() 
      : String(msg.mediaUrl).trim()
    
    // Only update if mediaUrl looks like a media ID (not a URL)
    if (mediaUrl !== '' && 
        mediaUrl !== 'undefined' && 
        mediaUrl !== 'null' &&
        !mediaUrl.startsWith('http') && 
        !mediaUrl.startsWith('/')) {
      try {
        await prisma.message.update({
          where: { id: msg.id },
          data: { providerMediaId: mediaUrl },
        })
        updated++
        if (updated % 10 === 0) {
          console.log(`  Updated ${updated}/${messages.length}...`)
        }
      } catch (e: any) {
        console.error(`  ❌ Failed to update message ${msg.id}:`, e.message)
        skipped++
      }
    } else {
      skipped++
    }
  }
  
  console.log(`\n✅ Migration complete:`)
  console.log(`   Updated: ${updated}`)
  console.log(`   Skipped: ${skipped}`)
  console.log(`   Total: ${messages.length}`)
}

migrate()
  .catch((e) => {
    console.error('Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })








