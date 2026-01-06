#!/usr/bin/env tsx
/**
 * PHASE 3: Hard Validation Script
 * 
 * Validates media proxy by calling actual dev server endpoints
 * 
 * Requirements:
 * - Dev server must be running (npm run dev)
 * - MEDIA_PROXY_TEST_KEY must be set in .env (for dev auth bypass)
 * - Tests HEAD, GET, and Range requests
 * 
 * Usage:
 *   MEDIA_PROXY_TEST_KEY=test123 npx tsx scripts/verify-media-proxy.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const TEST_KEY = process.env.MEDIA_PROXY_TEST_KEY || 'test123' // Default for dev

interface TestResult {
  messageId: number
  type: string
  hasProviderMediaId: boolean
  headStatus: number | null
  headContentType: string | null
  getStatus: number | null
  getBodyLength: number
  rangeStatus: number | null
  rangeBodyLength: number
  error: string | null
}

async function testMessage(messageId: number, type: string, hasProviderMediaId: boolean): Promise<TestResult> {
  const result: TestResult = {
    messageId,
    type,
    hasProviderMediaId,
    headStatus: null,
    headContentType: null,
    getStatus: null,
    getBodyLength: 0,
    rangeStatus: null,
    rangeBodyLength: 0,
    error: null,
  }

  const url = `${BASE_URL}/api/media/messages/${messageId}`
  const headers: HeadersInit = {}
  
  // Add test key if in dev mode
  if (TEST_KEY) {
    headers['X-Media-Test-Key'] = TEST_KEY
  }

  try {
    // Test 1: HEAD request
    try {
      const headRes = await fetch(url, {
        method: 'HEAD',
        headers,
      })
      result.headStatus = headRes.status
      result.headContentType = headRes.headers.get('content-type')
    } catch (e: any) {
      result.error = `HEAD failed: ${e.message}`
      return result
    }

    // Test 2: GET request
    try {
      const getRes = await fetch(url, {
        headers,
      })
      result.getStatus = getRes.status
      
      if (getRes.ok) {
        const buffer = await getRes.arrayBuffer()
        result.getBodyLength = buffer.byteLength
      }
    } catch (e: any) {
      result.error = result.error ? `${result.error}; GET failed: ${e.message}` : `GET failed: ${e.message}`
      return result
    }

    // Test 3: Range request (for audio/video)
    if (type === 'audio' || type === 'video') {
      try {
        const rangeRes = await fetch(url, {
          headers: {
            ...headers,
            'Range': 'bytes=0-1023',
          },
        })
        result.rangeStatus = rangeRes.status
        
        if (rangeRes.ok || rangeRes.status === 206) {
          const buffer = await rangeRes.arrayBuffer()
          result.rangeBodyLength = buffer.byteLength
        }
      } catch (e: any) {
        result.error = result.error ? `${result.error}; Range failed: ${e.message}` : `Range failed: ${e.message}`
      }
    }
  } catch (e: any) {
    result.error = e.message
  }

  return result
}

function printResults(results: TestResult[]) {
  console.log('\n' + '='.repeat(100))
  console.log('MEDIA PROXY VALIDATION RESULTS')
  console.log('='.repeat(100))
  console.log()

  const table: string[][] = []
  table.push(['Message ID', 'Type', 'Has ID', 'HEAD', 'GET', 'Body Len', 'Range', 'Range Len', 'Status'])

  let passCount = 0
  let failCount = 0

  for (const r of results) {
    let status = '❌ FAIL'
    let statusReason = ''

    // Validation rules
    if (r.error) {
      statusReason = r.error
    } else if (!r.hasProviderMediaId) {
      // Expected 424 for missing metadata
      if (r.headStatus === 424 && r.getStatus === 424) {
        status = '✅ PASS (expected 424)'
        passCount++
      } else {
        statusReason = `Expected 424, got HEAD=${r.headStatus} GET=${r.getStatus}`
      }
    } else {
      // Should work
      if (r.headStatus === 200 && r.getStatus === 200 && r.getBodyLength > 0) {
        if (r.type === 'audio' || r.type === 'video') {
          // Audio/video must support Range
          if (r.rangeStatus === 206 && r.rangeBodyLength > 0) {
            status = '✅ PASS'
            passCount++
          } else {
            statusReason = `Range request failed: status=${r.rangeStatus}, length=${r.rangeBodyLength}`
          }
        } else {
          // Image/document just needs to work
          status = '✅ PASS'
          passCount++
        }
      } else {
        statusReason = `HEAD=${r.headStatus} GET=${r.getStatus} bodyLen=${r.getBodyLength}`
      }
    }

    if (status === '❌ FAIL') {
      failCount++
    }

    table.push([
      String(r.messageId),
      r.type,
      r.hasProviderMediaId ? 'Yes' : 'No',
      r.headStatus?.toString() || 'N/A',
      r.getStatus?.toString() || 'N/A',
      r.getBodyLength > 0 ? String(r.getBodyLength) : '0',
      r.rangeStatus?.toString() || 'N/A',
      r.rangeBodyLength > 0 ? String(r.rangeBodyLength) : '0',
      status + (statusReason ? ` (${statusReason})` : ''),
    ])
  }

  // Print table
  const colWidths = [12, 8, 8, 6, 6, 10, 8, 10, 30]
  for (const row of table) {
    let line = ''
    for (let i = 0; i < row.length; i++) {
      const cell = row[i] || ''
      const width = colWidths[i] || 10
      line += cell.padEnd(width) + '  '
    }
    console.log(line)
  }

  console.log()
  console.log('='.repeat(100))
  console.log(`Total: ${results.length} | ✅ Pass: ${passCount} | ❌ Fail: ${failCount}`)
  console.log('='.repeat(100))
  console.log()

  if (failCount > 0) {
    console.error('❌ VALIDATION FAILED')
    process.exit(1)
  } else {
    console.log('✅ ALL TESTS PASSED')
    process.exit(0)
  }
}

async function main() {
  console.log('🔍 Querying database for media messages...')

  // Check server connectivity
  try {
    const healthRes = await fetch(`${BASE_URL}/api/health`).catch(() => null)
    if (!healthRes || !healthRes.ok) {
      console.warn('⚠️  Server health check failed, but continuing...')
    }
  } catch (e) {
    console.warn('⚠️  Could not check server health, but continuing...')
  }

  // Query for media messages
  const messages = await prisma.message.findMany({
    where: {
      type: { in: ['audio', 'image', 'document', 'video'] },
    },
    select: {
      id: true,
      type: true,
      providerMediaId: true as any,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  if (messages.length === 0) {
    console.error('❌ No media messages found in database')
    process.exit(1)
  }

  console.log(`Found ${messages.length} media messages`)

  // Group by type and pick at least 1 per type
  const byType = new Map<string, typeof messages>()
  for (const msg of messages) {
    const type = msg.type || 'unknown'
    if (!byType.has(type)) {
      byType.set(type, [])
    }
    byType.get(type)!.push(msg)
  }

  // Select test candidates: at least 1 per type with providerMediaId, and 1 without
  const testCandidates: typeof messages = []
  for (const [type, msgs] of byType.entries()) {
    // Pick one with providerMediaId
    const withId = msgs.find(m => (m as any).providerMediaId)
    if (withId) {
      testCandidates.push(withId)
    }
    // Pick one without providerMediaId (to test 424)
    const withoutId = msgs.find(m => !(m as any).providerMediaId)
    if (withoutId && !testCandidates.some(t => t.id === withoutId.id)) {
      testCandidates.push(withoutId)
    }
  }

  // Limit to 20 for reasonable test time
  const toTest = testCandidates.slice(0, 20)

  console.log(`Testing ${toTest.length} messages (${Array.from(byType.keys()).join(', ')})`)
  console.log()

  if (!TEST_KEY) {
    console.warn('⚠️  MEDIA_PROXY_TEST_KEY not set. Add to .env for dev auth bypass.')
    console.warn('   Without it, tests may fail due to auth requirements.')
    console.warn('   Current NODE_ENV:', process.env.NODE_ENV || 'not set')
    console.log()
  } else {
    console.log('✅ Using test key for auth bypass')
  }

  // Test each message
  const results: TestResult[] = []
  for (const msg of toTest) {
    const hasId = !!(msg as any).providerMediaId
    console.log(`Testing message ${msg.id} (${msg.type}, hasProviderMediaId: ${hasId})...`)
    const result = await testMessage(msg.id, msg.type || 'unknown', hasId)
    results.push(result)
  }

  // Print results
  printResults(results)
}

main()
  .catch(async (e) => {
    console.error('❌ Validation script failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
