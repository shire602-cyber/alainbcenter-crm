/**
 * Diagnostic script to check media messages in database
 * Run: npx tsx scripts/check-media-messages.ts
 */

import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('🔍 Checking media messages in database...\n')

  // Find messages with mediaUrl
  const messagesWithMedia = await prisma.message.findMany({
    where: {
      mediaUrl: {
        not: null,
      },
    },
    select: {
      id: true,
      type: true,
      mediaUrl: true,
      mediaMimeType: true,
      body: true,
      direction: true,
      channel: true,
      createdAt: true,
      conversation: {
        select: {
          id: true,
          contact: {
            select: {
              fullName: true,
              phone: true,
            },
          },
        },
      },
    },
    take: 20,
    orderBy: {
      createdAt: 'desc',
    },
  })

  console.log(`Found ${messagesWithMedia.length} messages with mediaUrl\n`)

  if (messagesWithMedia.length === 0) {
    console.log('❌ No messages with mediaUrl found in database!')
    console.log('This means the webhook is not storing media IDs correctly.')
    return
  }

  // Group by type
  const byType: Record<string, number> = {}
  messagesWithMedia.forEach(msg => {
    const type = msg.type || 'unknown'
    byType[type] = (byType[type] || 0) + 1
  })

  console.log('📊 Messages by type:')
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`)
  })

  console.log('\n📋 Sample messages:')
  messagesWithMedia.slice(0, 5).forEach(msg => {
    console.log(`\n  Message ID: ${msg.id}`)
    console.log(`  Type: ${msg.type || 'null'}`)
    console.log(`  Media URL (providerMediaId): ${msg.mediaUrl}`)
    console.log(`  Media MIME Type: ${msg.mediaMimeType || 'null'}`)
    console.log(`  Body: ${msg.body?.substring(0, 50) || 'null'}`)
    console.log(`  Direction: ${msg.direction}`)
    console.log(`  Channel: ${msg.channel}`)
    console.log(`  Contact: ${msg.conversation.contact.fullName} (${msg.conversation.contact.phone})`)
    console.log(`  Created: ${msg.createdAt.toISOString()}`)
    
    // Check if this would be detected as media
    const hasMediaType = msg.type && ['audio', 'image', 'document', 'video'].includes(msg.type.toLowerCase())
    const hasMediaMimeType = msg.mediaMimeType && (
      msg.mediaMimeType.startsWith('audio/') ||
      msg.mediaMimeType.startsWith('image/') ||
      msg.mediaMimeType.startsWith('video/') ||
      msg.mediaMimeType.includes('pdf') ||
      msg.mediaMimeType.includes('document')
    )
    const hasMedia = hasMediaType || hasMediaMimeType
    const hasProviderMediaId = !!msg.mediaUrl && msg.mediaUrl.trim() !== ''
    const mediaRenderable = hasMedia && hasProviderMediaId
    
    console.log(`  ✅ Would generate mediaProxyUrl: ${mediaRenderable ? 'YES' : 'NO'}`)
    if (!mediaRenderable) {
      console.log(`     - hasMediaType: ${hasMediaType}`)
      console.log(`     - hasMediaMimeType: ${hasMediaMimeType}`)
      console.log(`     - hasMedia: ${hasMedia}`)
      console.log(`     - hasProviderMediaId: ${hasProviderMediaId}`)
    }
  })

  // Check for audio messages specifically
  const audioMessages = messagesWithMedia.filter(msg => 
    msg.type?.toLowerCase() === 'audio' || 
    msg.mediaMimeType?.startsWith('audio/')
  )
  
  console.log(`\n🎵 Audio messages: ${audioMessages.length}`)
  if (audioMessages.length > 0) {
    console.log('Sample audio messages:')
    audioMessages.slice(0, 3).forEach(msg => {
      console.log(`  - ID ${msg.id}: type=${msg.type}, mimeType=${msg.mediaMimeType}, mediaUrl=${msg.mediaUrl?.substring(0, 20)}...`)
    })
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())









