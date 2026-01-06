#!/usr/bin/env tsx
/**
 * Direct test of media proxy endpoint
 */

async function testMediaProxy() {
  const BASE_URL = 'http://localhost:3000'
  const EMAIL = 'admin@alainbcenter.com'
  const PASSWORD = 'admin123'
  
  // Step 1: Login
  console.log('🔐 Logging in...')
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  
  if (!loginRes.ok) {
    console.error('❌ Login failed:', loginRes.status)
    process.exit(1)
  }
  
  const cookie = loginRes.headers.get('set-cookie')?.match(/alaincrm_session=([^;]+)/)?.[1]
  if (!cookie) {
    console.error('❌ No cookie in response')
    process.exit(1)
  }
  
  console.log('✅ Login successful\n')
  
  // Step 2: Test message 2019 (image with providerMediaId)
  const testMessageId = 2019
  console.log(`📸 Testing message ${testMessageId} (image)...`)
  
  const proxyUrl = `${BASE_URL}/api/media/messages/${testMessageId}`
  
  // HEAD request
  const headRes = await fetch(proxyUrl, {
    method: 'HEAD',
    headers: { Cookie: `alaincrm_session=${cookie}` },
  })
  
  console.log(`  HEAD: ${headRes.status}`)
  if (headRes.status === 200) {
    console.log(`  Content-Type: ${headRes.headers.get('content-type')}`)
    console.log(`  Content-Length: ${headRes.headers.get('content-length')}`)
    
    // GET request
    const getRes = await fetch(proxyUrl, {
      headers: { Cookie: `alaincrm_session=${cookie}` },
    })
    
    if (getRes.ok) {
      const buffer = await getRes.arrayBuffer()
      console.log(`  GET: ${getRes.status}, Size: ${buffer.byteLength} bytes`)
      console.log(`  ✅ Image proxy working!\n`)
    } else {
      console.log(`  ❌ GET failed: ${getRes.status}`)
      const error = await getRes.text()
      console.log(`  Error: ${error.substring(0, 200)}\n`)
    }
  } else {
    console.log(`  ❌ HEAD failed: ${headRes.status}`)
    const error = await headRes.text()
    console.log(`  Error: ${error.substring(0, 200)}\n`)
  }
  
  // Step 3: Test an audio message (if available)
  console.log('🔊 Testing audio messages...')
  const convRes = await fetch(`${BASE_URL}/api/inbox/conversations/165`, {
    headers: { Cookie: `alaincrm_session=${cookie}` },
  })
  
  if (convRes.ok) {
    const data = await convRes.json()
    const audioMsgs = data.messages?.filter((m: any) => m.type === 'audio').slice(0, 2)
    
    if (audioMsgs && audioMsgs.length > 0) {
      for (const msg of audioMsgs) {
        console.log(`  Testing audio message ${msg.id}...`)
        const audioProxyUrl = `${BASE_URL}/api/media/messages/${msg.id}`
        const audioHeadRes = await fetch(audioProxyUrl, {
          method: 'HEAD',
          headers: { Cookie: `alaincrm_session=${cookie}` },
        })
        console.log(`    HEAD: ${audioHeadRes.status}`)
        if (audioHeadRes.status === 200 || audioHeadRes.status === 410) {
          console.log(`    ${audioHeadRes.status === 200 ? '✅' : '⚠️'} ${audioHeadRes.status === 200 ? 'Audio available' : 'Metadata missing (expected for old messages)'}`)
        } else {
          console.log(`    ❌ Unexpected status: ${audioHeadRes.status}`)
        }
      }
    } else {
      console.log('  No audio messages found in conversation')
    }
  }
  
  console.log('\n✅ Test complete!')
  console.log('   Open http://localhost:3000/inbox in browser to verify media rendering')
}

testMediaProxy().catch(console.error)








