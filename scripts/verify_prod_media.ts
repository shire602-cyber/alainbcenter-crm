#!/usr/bin/env tsx
/**
 * Verify media end-to-end against production deployment
 * 
 * Usage:
 *   E2E_BASE_URL=https://... E2E_EMAIL=... E2E_PASSWORD=... tsx scripts/verify_prod_media.ts
 */

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://alainbcenter-3ke1it6ff-abdurahmans-projects-66129df5.vercel.app'
const EMAIL = process.env.E2E_EMAIL || ''
const PASSWORD = process.env.E2E_PASSWORD || ''

interface MediaProbeResult {
  messageId: number
  conversationId: number
  mediaUrl: string | null
  mimeType: string | null
  proxyUrl?: string
  head?: {
    status: number
    headers: {
      'content-type': string | null
      'accept-ranges': string | null
      'content-range': string | null
      'content-length': string | null
    }
  }
  get?: {
    status: number
    headers: {
      'content-type': string | null
      'accept-ranges': string | null
      'content-range': string | null
      'content-length': string | null
    }
    byteLength: number
  }
  error?: string
}

async function login(): Promise<string> {
  console.log(`[VERIFY] Logging in as ${EMAIL}...`)
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status} ${loginRes.statusText}`)
  }

  const cookies = loginRes.headers.get('set-cookie')
  if (!cookies) {
    throw new Error('No cookies received from login')
  }

  // Extract session cookie (alaincrm_session)
  const sessionCookie = cookies.split(',').find(c => c.includes('alaincrm_session'))
  if (!sessionCookie) {
    throw new Error('No session cookie found')
  }

  // Extract cookie value (format: "alaincrm_session=value; ...")
  const match = sessionCookie.match(/alaincrm_session=([^;]+)/)
  if (!match) {
    throw new Error('Could not extract session cookie value')
  }

  return match[1]
}

async function getSampleMedia(cookie: string): Promise<any> {
  console.log(`[VERIFY] Fetching sample media from ${BASE_URL}/api/debug/inbox/sample-media...`)
  const res = await fetch(`${BASE_URL}/api/debug/inbox/sample-media`, {
    headers: { Cookie: `alaincrm_session=${cookie}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to get sample media: ${res.status} ${res.statusText}`)
  }

  return await res.json()
}

async function probeMedia(messageId: number, cookie: string): Promise<MediaProbeResult> {
  console.log(`[VERIFY] Probing media for messageId=${messageId}...`)
  const res = await fetch(`${BASE_URL}/api/debug/media/probe?messageId=${messageId}`, {
    headers: { Cookie: `alaincrm_session=${cookie}` },
  })

  if (!res.ok) {
    throw new Error(`Failed to probe media: ${res.status} ${res.statusText}`)
  }

  return await res.json()
}

function verifyMedia(result: MediaProbeResult, type: 'audio' | 'image' | 'pdf'): boolean {
  console.log(`\n[VERIFY] Verifying ${type} media (messageId=${result.messageId})...`)
  console.log(`  mediaUrl: ${result.mediaUrl}`)
  console.log(`  mimeType: ${result.mimeType}`)
  console.log(`  proxyUrl: ${result.proxyUrl}`)

  if (result.error) {
    console.error(`  ❌ Error: ${result.error}`)
    return false
  }

  if (!result.mediaUrl) {
    console.error(`  ❌ mediaUrl is null`)
    return false
  }

  if (!result.get) {
    console.error(`  ❌ GET request failed`)
    return false
  }

  const { status, headers, byteLength } = result.get

  // Check status
  if (status !== 200 && status !== 206) {
    console.error(`  ❌ Status is ${status}, expected 200 or 206`)
    return false
  }

  // Check Content-Type
  const contentType = headers['content-type']
  if (!contentType) {
    console.error(`  ❌ Content-Type header missing`)
    return false
  }

  if (type === 'audio' && !contentType.startsWith('audio/')) {
    console.error(`  ❌ Content-Type is ${contentType}, expected audio/*`)
    return false
  }

  if (type === 'image' && !contentType.startsWith('image/')) {
    console.error(`  ❌ Content-Type is ${contentType}, expected image/*`)
    return false
  }

  if (type === 'pdf' && contentType !== 'application/pdf') {
    console.error(`  ❌ Content-Type is ${contentType}, expected application/pdf`)
    return false
  }

  // Check Range support for audio
  if (type === 'audio') {
    const acceptRanges = headers['accept-ranges']
    const contentRange = headers['content-range']
    const hasRangeSupport = acceptRanges === 'bytes' || (status === 206 && contentRange)

    if (!hasRangeSupport) {
      console.error(`  ❌ Audio missing Range support: Accept-Ranges=${acceptRanges}, Content-Range=${contentRange}, Status=${status}`)
      return false
    }
  }

  // Check byte length
  if (type === 'audio' && byteLength < 10240) {
    console.error(`  ❌ Audio byteLength is ${byteLength}, expected >= 10KB`)
    return false
  }

  if ((type === 'image' || type === 'pdf') && byteLength < 1024) {
    console.error(`  ❌ ${type} byteLength is ${byteLength}, expected >= 1KB`)
    return false
  }

  console.log(`  ✅ Status: ${status}`)
  console.log(`  ✅ Content-Type: ${contentType}`)
  console.log(`  ✅ Accept-Ranges: ${headers['accept-ranges'] || 'N/A'}`)
  console.log(`  ✅ Content-Range: ${headers['content-range'] || 'N/A'}`)
  console.log(`  ✅ ByteLength: ${byteLength} bytes`)

  return true
}

async function main() {
  console.log(`[VERIFY] Starting media verification against ${BASE_URL}\n`)

  if (!EMAIL || !PASSWORD) {
    console.error('❌ E2E_EMAIL and E2E_PASSWORD must be set')
    process.exit(1)
  }

  try {
    // Login
    const cookie = await login()
    console.log(`✅ Logged in\n`)

    // Get sample media
    const sampleMedia = await getSampleMedia(cookie)
    console.log(`✅ Sample media response:`, JSON.stringify(sampleMedia, null, 2))
    console.log()

    if (!sampleMedia.ok) {
      console.error(`❌ Sample media endpoint returned ok=false: ${sampleMedia.reason || 'unknown'}`)
      process.exit(1)
    }

    let allPassed = true

    // Verify audio
    if (sampleMedia.audio && sampleMedia.audio.messageId) {
      const audioProbe = await probeMedia(sampleMedia.audio.messageId, cookie)
      if (!verifyMedia(audioProbe, 'audio')) {
        allPassed = false
      }
    } else {
      console.log(`⚠️  No audio media found`)
    }

    // Verify image
    if (sampleMedia.image && sampleMedia.image.messageId) {
      const imageProbe = await probeMedia(sampleMedia.image.messageId, cookie)
      if (!verifyMedia(imageProbe, 'image')) {
        allPassed = false
      }
    } else {
      console.log(`⚠️  No image media found`)
    }

    // Verify PDF
    if (sampleMedia.pdf && sampleMedia.pdf.messageId) {
      const pdfProbe = await probeMedia(sampleMedia.pdf.messageId, cookie)
      if (!verifyMedia(pdfProbe, 'pdf')) {
        allPassed = false
      }
    } else {
      console.log(`⚠️  No PDF media found`)
    }

    if (!allPassed) {
      console.error(`\n❌ Media verification FAILED`)
      process.exit(1)
    }

    console.log(`\n✅ All media verification PASSED`)
  } catch (error: any) {
    console.error(`\n❌ Verification failed:`, error.message)
    process.exit(1)
  }
}

main()

