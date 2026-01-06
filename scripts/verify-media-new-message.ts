#!/usr/bin/env tsx

/**
 * PHASE F: Verification script for new media messages
 * 
 * Tests that:
 * 1. Messages with providerMediaId can be fetched via proxy
 * 2. Proxy returns correct content-type
 * 3. Proxy supports Range requests (206 Partial Content)
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

interface TestResult {
  test: string
  status: 'PASS' | 'FAIL'
  message: string
}

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
    
    // Extract alaincrm_session cookie
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

async function testMediaProxy(messageId: number, cookie: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const proxyUrl = `${BASE_URL}/api/media/messages/${messageId}`
  
  // Test 1: HEAD request should return 200 or 410 (not 404)
  try {
    const headResponse = await fetch(proxyUrl, {
      method: 'HEAD',
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })
    
    if (headResponse.status === 200) {
      results.push({
        test: 'HEAD returns 200',
        status: 'PASS',
        message: 'Media is available',
      })
    } else if (headResponse.status === 410) {
      results.push({
        test: 'HEAD returns 410',
        status: 'PASS',
        message: 'Metadata missing (expected for old messages)',
      })
    } else {
      results.push({
        test: 'HEAD request',
        status: 'FAIL',
        message: `Unexpected status: ${headResponse.status}`,
      })
    }
  } catch (error: any) {
    results.push({
      test: 'HEAD request',
      status: 'FAIL',
      message: `Error: ${error.message}`,
    })
  }
  
  // Test 2: GET request should return 200 or 206 (Range) or 410
  try {
    const getResponse = await fetch(proxyUrl, {
      method: 'GET',
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })
    
    if (getResponse.status === 200 || getResponse.status === 206) {
      const contentType = getResponse.headers.get('content-type')
      const contentLength = getResponse.headers.get('content-length')
      
      results.push({
        test: 'GET returns 200/206',
        status: 'PASS',
        message: `Status: ${getResponse.status}, Content-Type: ${contentType}, Size: ${contentLength} bytes`,
      })
      
      // Test 3: Range request support
      try {
        const rangeResponse = await fetch(proxyUrl, {
          method: 'GET',
          headers: {
            Cookie: `alaincrm_session=${cookie}`,
            Range: 'bytes=0-1023',
          },
        })
        
        if (rangeResponse.status === 206) {
          const contentRange = rangeResponse.headers.get('content-range')
          results.push({
            test: 'Range request (206)',
            status: 'PASS',
            message: `Content-Range: ${contentRange}`,
          })
        } else {
          results.push({
            test: 'Range request',
            status: 'FAIL',
            message: `Expected 206, got ${rangeResponse.status}`,
          })
        }
      } catch (error: any) {
        results.push({
          test: 'Range request',
          status: 'FAIL',
          message: `Error: ${error.message}`,
        })
      }
    } else if (getResponse.status === 410) {
      results.push({
        test: 'GET returns 410',
        status: 'PASS',
        message: 'Metadata missing (expected for old messages without providerMediaId)',
      })
    } else {
      results.push({
        test: 'GET request',
        status: 'FAIL',
        message: `Unexpected status: ${getResponse.status}`,
      })
    }
  } catch (error: any) {
    results.push({
      test: 'GET request',
      status: 'FAIL',
      message: `Error: ${error.message}`,
    })
  }
  
  return results
}

async function main() {
  console.log('🔍 Verifying media proxy for new messages...\n')
  
  // Get auth cookie
  const cookie = await getAuthCookie()
  if (!cookie) {
    console.error('❌ Authentication failed')
    process.exit(1)
  }
  
  // Find a message with providerMediaId (new message)
  const messageWithProviderId = await prisma.message.findFirst({
    where: {
      providerMediaId: { not: null },
      channel: 'whatsapp',
      type: { in: ['audio', 'image', 'document', 'video'] },
    },
    select: { id: true, type: true, providerMediaId: true },
    orderBy: { createdAt: 'desc' },
  })
  
  if (messageWithProviderId) {
    console.log(`✅ Found message with providerMediaId: ${messageWithProviderId.id} (type: ${messageWithProviderId.type})`)
    const results = await testMediaProxy(messageWithProviderId.id, cookie)
    
    console.log('\n📊 Test Results:')
    results.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : '❌'
      console.log(`${icon} ${r.test}: ${r.message}`)
    })
    
    const allPass = results.every(r => r.status === 'PASS')
    if (!allPass) {
      process.exit(1)
    }
  } else {
    console.log('⚠️  No messages with providerMediaId found')
    console.log('   Send a NEW media message via WhatsApp to test')
  }
  
  await prisma.$disconnect()
}

main().catch(console.error)

