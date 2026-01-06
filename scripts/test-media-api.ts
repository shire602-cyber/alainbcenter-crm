/**
 * Test script to check API response for mediaProxyUrl
 * Run: npx tsx scripts/test-media-api.ts [conversationId]
 */

import { prisma } from '../src/lib/prisma'

async function main() {
  const conversationId = process.argv[2] ? parseInt(process.argv[2]) : null

  if (!conversationId) {
    // Find a conversation with audio messages
    const audioMessage = await prisma.message.findFirst({
      where: {
        type: 'audio',
        mediaUrl: { not: null },
      },
      include: {
        conversation: true,
      },
    })

    if (!audioMessage) {
      console.log('❌ No audio messages found')
      return
    }

    const convId = audioMessage.conversationId
    console.log(`📞 Found audio message in conversation ${convId}`)
    console.log(`   Contact: ${audioMessage.conversation.contact?.fullName || 'Unknown'}`)
    console.log(`   Testing API response for conversation ${convId}...\n`)
    
    // Test the API endpoint
    const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000'
    const url = `${baseUrl}/api/inbox/conversations/${convId}`
    
    console.log(`🌐 Fetching: ${url}`)
    
    try {
      // You'll need to be authenticated - this is just to show the structure
      console.log('\n⚠️  Note: This requires authentication.')
      console.log('   To test manually:')
      console.log(`   1. Open browser DevTools (F12)`)
      console.log(`   2. Go to Network tab`)
      console.log(`   3. Open conversation ${convId} in inbox`)
      console.log(`   4. Find request to /api/inbox/conversations/${convId}`)
      console.log(`   5. Check Response tab for mediaProxyUrl fields\n`)
      
      // Show what the API should return
      const messages = await prisma.message.findMany({
        where: { conversationId: convId },
        select: {
          id: true,
          type: true,
          mediaUrl: true,
          mediaMimeType: true,
          body: true,
        },
        take: 10,
        orderBy: { createdAt: 'desc' },
      })
      
      console.log('📋 Messages in conversation:')
      messages.forEach(msg => {
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
        const mediaProxyUrl = mediaRenderable ? `/api/media/messages/${msg.id}` : null
        
        console.log(`\n  Message ${msg.id}:`)
        console.log(`    type: ${msg.type || 'null'}`)
        console.log(`    mediaUrl: ${msg.mediaUrl || 'null'}`)
        console.log(`    mediaMimeType: ${msg.mediaMimeType || 'null'}`)
        console.log(`    body: ${msg.body?.substring(0, 30) || 'null'}`)
        console.log(`    → mediaProxyUrl: ${mediaProxyUrl || 'null'}`)
        console.log(`    → mediaRenderable: ${mediaRenderable}`)
      })
    } catch (error) {
      console.error('Error:', error)
    }
  }

  await prisma.$disconnect()
}

main().catch(console.error)









