#!/usr/bin/env tsx
/**
 * Verification script for media proxy endpoint
 * 
 * Queries DB for latest 20 media messages
 * For each, calls HEAD and GET (with Range for audio/video) to /api/media/messages/:id
 * Prints PASS/FAIL table with reason
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const EMAIL = process.env.E2E_EMAIL || 'admin@alainbcenter.com'
const PASSWORD = process.env.E2E_PASSWORD || ''

interface TestResult {
  messageId: number
  type: string
  providerMediaId: string | null
  headStatus: number | null
  headError: string | null
  getStatus: number | null
  getError: string | null
  rangeStatus: number | null
  rangeError: string | null
  overall: 'PASS' | 'FAIL'
  reason: string
}

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

async function testMessage(message: any, cookie: string): Promise<TestResult> {
  const result: TestResult = {
    messageId: message.id,
    type: message.type || 'unknown',
    providerMediaId: message.providerMediaId,
    headStatus: null,
    headError: null,
    getStatus: null,
    getError: null,
    rangeStatus: null,
    rangeError: null,
    overall: 'FAIL',
    reason: '',
  }

  const proxyUrl = `${BASE_URL}/api/media/messages/${message.id}`

  // Test HEAD
  try {
    const headResponse = await fetch(proxyUrl, {
      method: 'HEAD',
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })
    result.headStatus = headResponse.status

    if (headResponse.status === 200) {
      // HEAD passed
    } else if (headResponse.status >= 400) {
      // Try to parse error
      try {
        const contentType = headResponse.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          const errorData = await headResponse.json()
          result.headError = errorData.reason || errorData.error || `Status ${headResponse.status}`
        } else {
          result.headError = `Status ${headResponse.status}`
        }
      } catch (e) {
        result.headError = `Status ${headResponse.status}`
      }
    }
  } catch (error: any) {
    result.headError = error.message
  }

  // Test GET
  try {
    const getResponse = await fetch(proxyUrl, {
      method: 'GET',
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })
    result.getStatus = getResponse.status

    if (getResponse.status === 200) {
      const buffer = await getResponse.arrayBuffer()
      if (buffer.byteLength === 0) {
        result.getError = 'Empty response body'
      }
    } else if (getResponse.status >= 400) {
      // Try to parse error
      try {
        const errorData = await getResponse.json()
        result.getError = errorData.reason || errorData.error || `Status ${getResponse.status}`
      } catch (e) {
        result.getError = `Status ${getResponse.status}`
      }
    }
  } catch (error: any) {
    result.getError = error.message
  }

  // Test Range request (for audio/video)
  if (message.type === 'audio' || message.type === 'video') {
    try {
      const rangeResponse = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          Cookie: `alaincrm_session=${cookie}`,
          Range: 'bytes=0-1023',
        },
      })
      result.rangeStatus = rangeResponse.status

      if (rangeResponse.status === 206) {
        const rangeBuffer = await rangeResponse.arrayBuffer()
        if (rangeBuffer.byteLength !== 1024) {
          result.rangeError = `Expected 1024 bytes, got ${rangeBuffer.byteLength}`
        }
      } else if (rangeResponse.status >= 400) {
        try {
          const errorData = await rangeResponse.json()
          result.rangeError = errorData.reason || errorData.error || `Status ${rangeResponse.status}`
        } catch (e) {
          result.rangeError = `Status ${rangeResponse.status}`
        }
      } else {
        result.rangeError = `Expected 206, got ${rangeResponse.status}`
      }
    } catch (error: any) {
      result.rangeError = error.message
    }
  }

  // Determine overall status
  if (result.headStatus === 200 && result.getStatus === 200) {
    if (message.type === 'audio' || message.type === 'video') {
      if (result.rangeStatus === 206) {
        result.overall = 'PASS'
        result.reason = 'All tests passed'
      } else {
        result.overall = 'FAIL'
        result.reason = result.rangeError || 'Range request failed'
      }
    } else {
      result.overall = 'PASS'
      result.reason = 'All tests passed'
    }
  } else {
    result.overall = 'FAIL'
    if (result.headError) {
      result.reason = `HEAD: ${result.headError}`
    } else if (result.getError) {
      result.reason = `GET: ${result.getError}`
    } else {
      result.reason = `HEAD: ${result.headStatus}, GET: ${result.getStatus}`
    }
  }

  return result
}

async function main() {
  console.log('🔍 Verifying media proxy for latest media messages...\n')

  // Get auth cookie
  const cookie = await getAuthCookie()
  if (!cookie) {
    console.error('❌ Authentication failed')
    process.exit(1)
  }

  // Find latest 20 media messages
  const messages = await prisma.message.findMany({
    where: {
      type: { in: ['image', 'audio', 'document', 'video'] },
      channel: 'whatsapp',
    },
    select: {
      id: true,
      type: true,
      providerMessageId: true,
      mediaUrl: true,
      mediaMimeType: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  console.log(`Found ${messages.length} media messages to test\n`)

  const results: TestResult[] = []

  for (const message of messages) {
    const result = await testMessage(message, cookie)
    results.push(result)
  }

  // Print results table
  console.log('📊 Test Results:')
  console.log('═'.repeat(100))
  console.log(
    'ID'.padEnd(8) +
    'Type'.padEnd(10) +
    'providerMediaId'.padEnd(20) +
    'HEAD'.padEnd(8) +
    'GET'.padEnd(8) +
    'Range'.padEnd(8) +
    'Status'.padEnd(8) +
    'Reason'
  )
  console.log('─'.repeat(100))

  for (const result of results) {
    const headStr = result.headStatus ? String(result.headStatus) : 'N/A'
    const getStr = result.getStatus ? String(result.getStatus) : 'N/A'
    const rangeStr = result.rangeStatus ? String(result.rangeStatus) : result.type === 'audio' || result.type === 'video' ? 'N/A' : '-'
    const statusIcon = result.overall === 'PASS' ? '✅' : '❌'
    const providerId = result.providerMediaId ? result.providerMediaId.substring(0, 15) + '...' : 'NULL'

    console.log(
      String(result.messageId).padEnd(8) +
      result.type.padEnd(10) +
      providerId.padEnd(20) +
      headStr.padEnd(8) +
      getStr.padEnd(8) +
      rangeStr.padEnd(8) +
      statusIcon.padEnd(8) +
      result.reason.substring(0, 40)
    )
  }

  console.log('═'.repeat(100))

  const passed = results.filter(r => r.overall === 'PASS').length
  const failed = results.filter(r => r.overall === 'FAIL').length

  console.log(`\n📈 Summary:`)
  console.log(`  Total: ${results.length}`)
  console.log(`  ✅ Passed: ${passed}`)
  console.log(`  ❌ Failed: ${failed}`)
  console.log(`  Success rate: ${((passed / results.length) * 100).toFixed(1)}%`)

  if (failed > 0) {
    console.log(`\n❌ Failed message IDs:`)
    const failedIds = results.filter(r => r.overall === 'FAIL').map(r => r.messageId)
    console.log(`   ${failedIds.join(', ')}`)
  }

  await prisma.$disconnect()

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch(console.error)
