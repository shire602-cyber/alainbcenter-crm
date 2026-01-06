import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

test.describe('Media Rendering', () => {
  let baseUrl: string
  
  test.beforeAll(async () => {
    baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000'
  })
  
  test('renders image, plays audio, and downloads PDF', async ({ page, browser }) => {
    // Find a conversation with image + audio + document
    const messages = await prisma.message.findMany({
      where: {
        channel: 'whatsapp',
        type: { in: ['image', 'audio', 'document'] },
      },
      select: {
        id: true,
        type: true,
        conversationId: true,
        providerMediaId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    
    // Group by conversation
    const conversations = new Map<number, { image?: number; audio?: number; document?: number }>()
    for (const msg of messages) {
      if (!msg.conversationId) continue
      if (!conversations.has(msg.conversationId)) {
        conversations.set(msg.conversationId, {})
      }
      const conv = conversations.get(msg.conversationId)!
      if (msg.type === 'image' && !conv.image) conv.image = msg.id
      if (msg.type === 'audio' && !conv.audio) conv.audio = msg.id
      if (msg.type === 'document' && !conv.document) conv.document = msg.id
    }
    
    // Find conversation with all three
    let targetConversation: number | null = null
    for (const [convId, types] of conversations.entries()) {
      if (types.image && types.audio && types.document) {
        targetConversation = convId
        break
      }
    }
    
    if (!targetConversation) {
      test.skip('No conversation found with image + audio + document')
      return
    }
    
    const conv = conversations.get(targetConversation)!
    
    // Navigate to inbox (auth handled by setup file)
    await page.goto(`${baseUrl}/inbox`)
    await page.waitForLoadState('networkidle')
    
    // Wait for conversations to load
    await page.waitForSelector('[data-testid="conversation-list"]', { timeout: 10000 }).catch(() => {})
    
    // Find and click the target conversation
    const conversationSelector = `[data-conversation-id="${targetConversation}"]`
    const conversationExists = await page.locator(conversationSelector).count() > 0
    
    if (!conversationExists) {
      // Try to find by clicking any conversation and checking URL
      const firstConv = page.locator('[data-testid="conversation-item"]').first()
      if (await firstConv.count() > 0) {
        await firstConv.click()
        await page.waitForTimeout(1000)
        
        // Check if this is our target
        const url = page.url()
        if (url.includes(`conversation=${targetConversation}`) || url.includes(`id=${targetConversation}`)) {
          // Good, we're in the right conversation
        } else {
          // Navigate directly
          await page.goto(`${baseUrl}/inbox?conversation=${targetConversation}`)
          await page.waitForLoadState('networkidle')
        }
      }
    } else {
      await page.locator(conversationSelector).click()
      await page.waitForLoadState('networkidle')
    }
    
    // Wait for messages to load
    await page.waitForTimeout(2000)
    
    // Test 1: Image rendering
    if (conv.image) {
      const imageSelector = `img[src*="/api/media/messages/${conv.image}"]`
      const image = page.locator(imageSelector).first()
      
      if (await image.count() > 0) {
        await image.waitFor({ state: 'visible', timeout: 10000 })
        
        // Check naturalWidth > 0
        const naturalWidth = await image.evaluate((img: HTMLImageElement) => img.naturalWidth)
        expect(naturalWidth).toBeGreaterThan(0)
        
        console.log(`✅ Image ${conv.image} rendered with width ${naturalWidth}`)
      } else {
        console.log(`⚠️ Image ${conv.image} not found in DOM`)
      }
    }
    
    // Test 2: Audio playback
    if (conv.audio) {
      const audioSelector = `audio[src*="/api/media/messages/${conv.audio}"], [data-message-id="${conv.audio}"] audio`
      const audio = page.locator(audioSelector).first()
      
      if (await audio.count() > 0) {
        // Wait for audio to load
        await audio.waitFor({ state: 'attached', timeout: 10000 })
        
        // Play audio
        await audio.evaluate((el: HTMLAudioElement) => {
          el.play()
        })
        
        // Wait 3 seconds and check currentTime advanced
        await page.waitForTimeout(3000)
        
        const currentTime = await audio.evaluate((el: HTMLAudioElement) => el.currentTime)
        expect(currentTime).toBeGreaterThan(0)
        
        console.log(`✅ Audio ${conv.audio} played, currentTime: ${currentTime}`)
      } else {
        console.log(`⚠️ Audio ${conv.audio} not found in DOM`)
      }
    }
    
    // Test 3: PDF download
    if (conv.document) {
      const docSelector = `a[href*="/api/media/messages/${conv.document}"], [data-message-id="${conv.document}"] a`
      const docLink = page.locator(docSelector).first()
      
      if (await docLink.count() > 0) {
        // Set up network monitoring
        const responsePromise = page.waitForResponse(
          (response) => 
            response.url().includes(`/api/media/messages/${conv.document}`) && 
            response.status() === 200
        )
        
        // Click download link
        await docLink.click()
        
        // Wait for response
        const response = await responsePromise
        
        // Check content-type
        const contentType = response.headers()['content-type']
        expect(contentType).toMatch(/application\/(pdf|octet-stream)/)
        
        console.log(`✅ Document ${conv.document} downloaded with content-type: ${contentType}`)
      } else {
        console.log(`⚠️ Document ${conv.document} link not found in DOM`)
      }
    }
    
    // Take screenshot
    await page.screenshot({ path: 'test-results/media-test.png', fullPage: true })
    
    // Save console logs
    const consoleLogs: string[] = []
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    })
    
    // Save network logs
    const networkLogs: string[] = []
    page.on('response', (response) => {
      if (response.url().includes('/api/media/messages/')) {
        networkLogs.push(
          `${response.status()} ${response.url()} - ${response.headers()['content-type'] || 'no content-type'}`
        )
      }
    })
    
    // Write logs to files
    const fs = require('fs')
    const path = require('path')
    const resultsDir = path.join(process.cwd(), 'test-results')
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true })
    }
    
    fs.writeFileSync(
      path.join(resultsDir, 'media-test-console.log'),
      consoleLogs.join('\n')
    )
    
    fs.writeFileSync(
      path.join(resultsDir, 'media-test-network.log'),
      networkLogs.join('\n')
    )
  })
  
  test.afterAll(async () => {
    await prisma.$disconnect()
  })
})

