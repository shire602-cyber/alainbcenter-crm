#!/usr/bin/env tsx
/**
 * Media Diagnostic Script
 * 
 * Tests media proxy endpoint and identifies issues
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const EMAIL = process.env.E2E_EMAIL || 'admin@alainbcenter.com'
const PASSWORD = process.env.E2E_PASSWORD || ''

async function getAuthCookie(): Promise<string | null> {
  if (!PASSWORD || PASSWORD === 'CHANGE_ME') {
    console.error('❌ E2E_PASSWORD must be set')
    return null
  }

  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })

    if (!response.ok) {
      console.error(`❌ Login failed: ${response.status}`)
      return null
    }

    const setCookie = response.headers.get('set-cookie')
    if (!setCookie) {
      console.error('❌ No cookie in login response')
      return null
    }

    const match = setCookie.match(/alaincrm_session=([^;]+)/)
    if (!match) {
      console.error('❌ Could not extract session cookie')
      return null
    }

    return match[1]
  } catch (error: any) {
    console.error('❌ Login error:', error.message)
    return null
  }
}

async function diagnoseMessage(messageId: number, cookie: string) {
  console.log(`\n🔍 Diagnosing message ${messageId}...`)
  
  // 1. Check database record
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      type: true,
      providerMediaId: true,
      mediaUrl: true,
      mediaMimeType: true,
      mediaFilename: true,
      channel: true,
      payload: true,
      rawPayload: true,
      providerMessageId: true,
    },
  })

  if (!message) {
    console.log('❌ Message not found in database')
    return
  }

  console.log('📊 Database Record:')
  console.log(`   Type: ${message.type}`)
  console.log(`   Channel: ${message.channel}`)
  console.log(`   providerMediaId: ${message.providerMediaId || 'NULL'}`)
  console.log(`   mediaUrl: ${message.mediaUrl || 'NULL'}`)
  console.log(`   mediaMimeType: ${message.mediaMimeType || 'NULL'}`)
  console.log(`   mediaFilename: ${message.mediaFilename || 'NULL'}`)
  console.log(`   Has payload: ${!!message.payload}`)
  console.log(`   Has rawPayload: ${!!message.rawPayload}`)

  // 2. Test HEAD request
  console.log('\n🔍 Testing HEAD request...')
  try {
    const headResponse = await fetch(`${BASE_URL}/api/media/messages/${messageId}`, {
      method: 'HEAD',
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })
    console.log(`   Status: ${headResponse.status}`)
    if (!headResponse.ok) {
      const contentType = headResponse.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const errorData = await headResponse.json()
        console.log(`   Error: ${errorData.error}`)
        console.log(`   Reason: ${errorData.reason}`)
      }
    } else {
      console.log(`   Content-Type: ${headResponse.headers.get('content-type')}`)
      console.log(`   Content-Length: ${headResponse.headers.get('content-length')}`)
    }
  } catch (error: any) {
    console.log(`   ❌ HEAD failed: ${error.message}`)
  }

  // 3. Test GET request
  console.log('\n🔍 Testing GET request...')
  try {
    const getResponse = await fetch(`${BASE_URL}/api/media/messages/${messageId}`, {
      method: 'GET',
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })
    console.log(`   Status: ${getResponse.status}`)
    if (!getResponse.ok) {
      const errorData = await getResponse.json()
      console.log(`   Error: ${errorData.error}`)
      console.log(`   Reason: ${errorData.reason}`)
      console.log(`   Resolved Source: ${errorData.resolvedSource || 'N/A'}`)
    } else {
      const buffer = await getResponse.arrayBuffer()
      console.log(`   ✅ Success! Received ${buffer.byteLength} bytes`)
      console.log(`   Content-Type: ${getResponse.headers.get('content-type')}`)
    }
  } catch (error: any) {
    console.log(`   ❌ GET failed: ${error.message}`)
  }

  // 4. Check payload/rawPayload for media ID
  if (message.payload) {
    try {
      const payload = typeof message.payload === 'string' ? JSON.parse(message.payload) : message.payload
      console.log('\n📦 Payload Analysis:')
      console.log(`   Has media.id: ${!!payload?.media?.id}`)
      if (payload?.media?.id) {
        console.log(`   media.id: ${payload.media.id}`)
      }
      console.log(`   Has mediaUrl: ${!!payload?.mediaUrl}`)
      if (payload?.mediaUrl) {
        console.log(`   mediaUrl: ${payload.mediaUrl}`)
      }
    } catch (e) {
      console.log('   ❌ Payload is not valid JSON')
    }
  }

  if (message.rawPayload) {
    try {
      const rawPayload = typeof message.rawPayload === 'string' ? JSON.parse(message.rawPayload) : message.rawPayload
      console.log('\n📦 RawPayload Analysis:')
      console.log(`   Has audio.id: ${!!rawPayload?.audio?.id}`)
      if (rawPayload?.audio?.id) {
        console.log(`   audio.id: ${rawPayload.audio.id}`)
      }
      console.log(`   Has image.id: ${!!rawPayload?.image?.id}`)
      if (rawPayload?.image?.id) {
        console.log(`   image.id: ${rawPayload.image.id}`)
      }
      console.log(`   Has document.id: ${!!rawPayload?.document?.id}`)
      if (rawPayload?.document?.id) {
        console.log(`   document.id: ${rawPayload.document.id}`)
      }
      console.log(`   Has video.id: ${!!rawPayload?.video?.id}`)
      if (rawPayload?.video?.id) {
        console.log(`   video.id: ${rawPayload.video.id}`)
      }
    } catch (e) {
      console.log('   ❌ RawPayload is not valid JSON')
    }
  }
}

async function main() {
  console.log('🔍 Media Diagnostic Tool\n')

  const cookie = await getAuthCookie()
  if (!cookie) {
    console.error('❌ Authentication failed')
    process.exit(1)
  }

  // Find media messages
  const messages = await prisma.message.findMany({
    where: {
      type: { in: ['audio', 'image', 'document', 'video', 'AUDIO', 'IMAGE', 'DOCUMENT', 'VIDEO'] },
      channel: 'whatsapp',
    },
    select: {
      id: true,
      type: true,
      providerMediaId: true,
      mediaUrl: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })

  if (messages.length === 0) {
    console.log('⚠️  No media messages found')
    await prisma.$disconnect()
    process.exit(0)
  }

  console.log(`Found ${messages.length} media messages to diagnose\n`)

  for (const msg of messages) {
    await diagnoseMessage(msg.id, cookie)
  }

  await prisma.$disconnect()
}

main().catch(console.error)








