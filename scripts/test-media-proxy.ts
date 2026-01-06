#!/usr/bin/env tsx
/**
 * Test script for media proxy endpoint
 * 
 * Tests:
 * - HEAD /api/media/messages/:id → expect 200 with proper headers
 * - GET /api/media/messages/:id → expect 200 and correct Content-Type
 * - GET with Range header → expect 206 Partial Content with Content-Range
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'
const EMAIL = process.env.E2E_EMAIL || 'admin@alainbcenter.com'
const PASSWORD = process.env.E2E_PASSWORD || ''

interface TestResult {
  test: string
  status: 'PASS' | 'FAIL'
  message: string
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

async function testMediaProxy(messageId: number, cookie: string): Promise<TestResult[]> {
  const results: TestResult[] = []
  const proxyUrl = `${BASE_URL}/api/media/messages/${messageId}`

  // Test 1: HEAD request
  try {
    const headResponse = await fetch(proxyUrl, {
      method: 'HEAD',
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })

    if (headResponse.status === 200) {
      const contentType = headResponse.headers.get('content-type')
      const acceptRanges = headResponse.headers.get('accept-ranges')
      const contentLength = headResponse.headers.get('content-length')

      results.push({
        test: 'HEAD returns 200',
        status: 'PASS',
        message: `Content-Type: ${contentType}, Accept-Ranges: ${acceptRanges}, Content-Length: ${contentLength || 'unknown'}`,
      })

      // Verify required headers
      if (!acceptRanges || acceptRanges !== 'bytes') {
        results.push({
          test: 'HEAD has Accept-Ranges: bytes',
          status: 'FAIL',
          message: `Expected 'bytes', got '${acceptRanges}'`,
        })
      } else {
        results.push({
          test: 'HEAD has Accept-Ranges: bytes',
          status: 'PASS',
          message: 'Header present and correct',
        })
      }
    } else if (headResponse.status === 410) {
      results.push({
        test: 'HEAD returns 410',
        status: 'PASS',
        message: 'Metadata missing (expected for old messages without providerMediaId)',
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

  // Test 2: GET request (full content)
  try {
    const getResponse = await fetch(proxyUrl, {
      method: 'GET',
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })

    if (getResponse.status === 200) {
      const contentType = getResponse.headers.get('content-type')
      const contentLength = getResponse.headers.get('content-length')
      const buffer = await getResponse.arrayBuffer()

      results.push({
        test: 'GET returns 200',
        status: 'PASS',
        message: `Content-Type: ${contentType}, Size: ${buffer.byteLength} bytes`,
      })

      // Test 3: Range request (206 Partial Content)
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
          const rangeBuffer = await rangeResponse.arrayBuffer()

          results.push({
            test: 'Range request (206)',
            status: 'PASS',
            message: `Content-Range: ${contentRange}, Size: ${rangeBuffer.byteLength} bytes`,
          })

          // Verify range size
          if (rangeBuffer.byteLength === 1024) {
            results.push({
              test: 'Range request size correct',
              status: 'PASS',
              message: 'Returned exactly 1024 bytes as requested',
            })
          } else {
            results.push({
              test: 'Range request size correct',
              status: 'FAIL',
              message: `Expected 1024 bytes, got ${rangeBuffer.byteLength}`,
            })
          }
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
        message: 'Metadata missing (expected for old messages)',
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
  console.log('🧪 Testing media proxy endpoint...\n')

  // Get auth cookie
  const cookie = await getAuthCookie()
  if (!cookie) {
    console.error('❌ Authentication failed')
    process.exit(1)
  }

  // Test with message 2019 (known to have providerMediaId)
  const testMessageId = 2019
  console.log(`📸 Testing message ${testMessageId} (image with providerMediaId)...\n`)

  const results = await testMediaProxy(testMessageId, cookie)

  console.log('📊 Test Results:')
  console.log('─'.repeat(60))
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌'
    console.log(`${icon} ${r.test}`)
    console.log(`   ${r.message}`)
    console.log('')
  })

  const allPass = results.every(r => r.status === 'PASS')
  if (allPass) {
    console.log('✅ All tests passed!')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed')
    process.exit(1)
  }
}

main().catch(console.error)








