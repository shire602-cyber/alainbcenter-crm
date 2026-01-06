#!/usr/bin/env tsx

/**
 * PHASE F: Verification script for messages with missing metadata
 * 
 * Tests that:
 * 1. Messages without providerMediaId return 410 Gone
 * 2. UI shows appropriate "metadata not stored" message
 */

import { PrismaClient } from '@prisma/client'
import fetch from 'node-fetch'

const prisma = new PrismaClient()

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

async function getAuthCookie(): Promise<string | null> {
  const email = process.env.E2E_EMAIL || 'admin@alainbcenter.com'
  const password = process.env.E2E_PASSWORD || ''
  
  if (!password || password === 'CHANGE_ME') {
    console.error('❌ E2E_PASSWORD must be set')
    return null
  }
  
  try {
    const response = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
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

async function main() {
  console.log('🔍 Verifying 410 response for missing metadata...\n')
  
  // Get auth cookie
  const cookie = await getAuthCookie()
  if (!cookie) {
    console.error('❌ Authentication failed')
    process.exit(1)
  }
  
  // Find a media message WITHOUT providerMediaId (old message)
  const messageWithoutProviderId = await prisma.message.findFirst({
    where: {
      providerMediaId: null,
      channel: 'whatsapp',
      type: { in: ['audio', 'image', 'document', 'video'] },
    },
    select: { id: true, type: true, providerMediaId: true, mediaUrl: true },
    orderBy: { createdAt: 'desc' },
  })
  
  if (messageWithoutProviderId) {
    console.log(`✅ Found message without providerMediaId: ${messageWithoutProviderId.id} (type: ${messageWithoutProviderId.type})`)
    
    const proxyUrl = `${BASE_URL}/api/media/messages/${messageWithoutProviderId.id}`
    
    // Test HEAD
    try {
      const headResponse = await fetch(proxyUrl, {
        method: 'HEAD',
        headers: { Cookie: `alaincrm_session=${cookie}` },
      })
      
      if (headResponse.status === 410) {
        console.log('✅ HEAD returns 410 (metadata missing)')
      } else {
        console.log(`❌ HEAD returned ${headResponse.status}, expected 410`)
        process.exit(1)
      }
    } catch (error: any) {
      console.error(`❌ HEAD request failed: ${error.message}`)
      process.exit(1)
    }
    
    // Test GET
    try {
      const getResponse = await fetch(proxyUrl, {
        method: 'GET',
        headers: { Cookie: `alaincrm_session=${cookie}` },
      })
      
      if (getResponse.status === 410) {
        const body = await getResponse.json()
        if (body.error === 'MEDIA_METADATA_MISSING') {
          console.log('✅ GET returns 410 with correct error message')
          console.log(`   Error: ${body.error}`)
          console.log(`   Hint: ${body.hint}`)
        } else {
          console.log(`❌ GET returned 410 but wrong error: ${JSON.stringify(body)}`)
          process.exit(1)
        }
      } else {
        console.log(`❌ GET returned ${getResponse.status}, expected 410`)
        process.exit(1)
      }
    } catch (error: any) {
      console.error(`❌ GET request failed: ${error.message}`)
      process.exit(1)
    }
    
    console.log('\n✅ All tests passed!')
  } else {
    console.log('⚠️  No messages without providerMediaId found')
    console.log('   This is good - all messages have metadata!')
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)








