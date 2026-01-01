#!/usr/bin/env tsx
/**
 * Debug Probe Script
 * 
 * HTTP probes to verify API endpoints and media serving
 * No browser required - pure HTTP requests
 */

const BASE_URL = process.env.DEBUG_BASE_URL || 'https://alainbcenter-3ke1it6ff-abdurahmans-projects-66129df5.vercel.app'

interface ProbeResult {
  endpoint: string
  status: number
  headers: Record<string, string>
  body?: any
  error?: string
}

async function probe(endpoint: string, options: RequestInit = {}): Promise<ProbeResult> {
  const url = `${BASE_URL}${endpoint}`
  console.log(`\n[PROBE] ${options.method || 'GET'} ${url}`)
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Debug-Probe/1.0',
        ...options.headers,
      },
    })
    
    const headers: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      headers[key] = value
    })
    
    let body: any = null
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('application/json')) {
      body = await response.json()
    } else if (contentType?.includes('text/')) {
      body = await response.text()
    } else {
      // For binary, just get size
      const buffer = await response.arrayBuffer()
      body = { size: buffer.byteLength, type: contentType || 'unknown' }
    }
    
    return {
      endpoint,
      status: response.status,
      headers,
      body,
    }
  } catch (error: any) {
    return {
      endpoint,
      status: 0,
      headers: {},
      error: error.message,
    }
  }
}

async function main() {
  console.log('='.repeat(80))
  console.log('DEBUG PROBE SCRIPT')
  console.log('='.repeat(80))
  console.log(`Base URL: ${BASE_URL}`)
  console.log(`Timestamp: ${new Date().toISOString()}`)
  
  // 1. Health endpoint
  console.log('\n[1] Health Check')
  const health = await probe('/api/health')
  console.log(`Status: ${health.status}`)
  console.log(`Body:`, JSON.stringify(health.body, null, 2))
  
  // 2. Get first lead ID
  console.log('\n[2] Get Leads List')
  const leads = await probe('/api/leads')
  console.log(`Status: ${leads.status}`)
  if (leads.body && Array.isArray(leads.body) && leads.body.length > 0) {
    const firstLead = leads.body[0]
    console.log(`First Lead ID: ${firstLead.id}`)
    console.log(`First Lead Keys:`, Object.keys(firstLead))
    
    // 3. Fetch specific lead
    console.log('\n[3] Get Lead Detail')
    const leadDetail = await probe(`/api/leads/${firstLead.id}`)
    console.log(`Status: ${leadDetail.status}`)
    if (leadDetail.body) {
      console.log(`Lead Keys:`, Object.keys(leadDetail.body))
      console.log(`Has contact:`, !!leadDetail.body.contact)
      console.log(`Has conversations:`, !!leadDetail.body.conversations)
    }
  } else if (leads.body && leads.body.leads && Array.isArray(leads.body.leads)) {
    const firstLead = leads.body.leads[0]
    console.log(`First Lead ID: ${firstLead.id}`)
    
    const leadDetail = await probe(`/api/leads/${firstLead.id}`)
    console.log(`Status: ${leadDetail.status}`)
    if (leadDetail.body) {
      console.log(`Lead Keys:`, Object.keys(leadDetail.body))
    }
  } else {
    console.log('No leads found or unexpected format')
  }
  
  // 4. Get sample media from debug endpoint
  console.log('\n[4] Debug Sample Media Endpoint')
  console.log('NOTE: This requires admin auth - may return 401')
  const sampleMedia = await probe('/api/debug/inbox/sample-media')
  console.log(`Status: ${sampleMedia.status}`)
  console.log(`Body:`, JSON.stringify(sampleMedia.body, null, 2))
  
  // 5. Probe media endpoints (if we have media IDs)
  if (sampleMedia.body && sampleMedia.body.ok) {
    const { audio, image, pdf } = sampleMedia.body
    
    if (audio && audio.url) {
      console.log('\n[5A] Audio Media Probe')
      const audioUrl = audio.url.startsWith('http') || audio.url.startsWith('/')
        ? audio.url
        : `/api/whatsapp/media/${encodeURIComponent(audio.url)}?messageId=${audio.messageId}`
      const audioProbe = await probe(audioUrl, {
        headers: {
          'Range': 'bytes=0-1023', // Request first 1KB
        },
      })
      console.log(`Status: ${audioProbe.status}`)
      console.log(`Content-Type: ${audioProbe.headers['content-type']}`)
      console.log(`Accept-Ranges: ${audioProbe.headers['accept-ranges']}`)
      console.log(`Content-Range: ${audioProbe.headers['content-range']}`)
      console.log(`Content-Length: ${audioProbe.headers['content-length']}`)
      if (audioProbe.body && typeof audioProbe.body === 'object' && 'size' in audioProbe.body) {
        console.log(`Body Size: ${audioProbe.body.size} bytes`)
      }
    }
    
    if (image && image.url) {
      console.log('\n[5B] Image Media Probe')
      const imageUrl = image.url.startsWith('http') || image.url.startsWith('/')
        ? image.url
        : `/api/whatsapp/media/${encodeURIComponent(image.url)}?messageId=${image.messageId}`
      const imageProbe = await probe(imageUrl)
      console.log(`Status: ${imageProbe.status}`)
      console.log(`Content-Type: ${imageProbe.headers['content-type']}`)
      console.log(`Content-Length: ${imageProbe.headers['content-length']}`)
      if (imageProbe.body && typeof imageProbe.body === 'object' && 'size' in imageProbe.body) {
        console.log(`Body Size: ${imageProbe.body.size} bytes`)
      }
    }
    
    if (pdf && pdf.url) {
      console.log('\n[5C] PDF Media Probe')
      const pdfUrl = pdf.url.startsWith('http') || pdf.url.startsWith('/')
        ? pdf.url
        : `/api/whatsapp/media/${encodeURIComponent(pdf.url)}?messageId=${pdf.messageId}`
      const pdfProbe = await probe(pdfUrl)
      console.log(`Status: ${pdfProbe.status}`)
      console.log(`Content-Type: ${pdfProbe.headers['content-type']}`)
      console.log(`Content-Length: ${pdfProbe.headers['content-length']}`)
      if (pdfProbe.body && typeof pdfProbe.body === 'object' && 'size' in pdfProbe.body) {
        console.log(`Body Size: ${pdfProbe.body.size} bytes`)
      }
    }
  } else {
    console.log('\n[5] Skipping media probes - no sample media available')
  }
  
  // 6. Get conversation messages (if we have conversationId)
  if (sampleMedia.body && sampleMedia.body.ok && sampleMedia.body.audio) {
    const conversationId = sampleMedia.body.audio.conversationId
    console.log(`\n[6] Get Conversation Messages (ID: ${conversationId})`)
    const messages = await probe(`/api/inbox/conversations/${conversationId}`)
    console.log(`Status: ${messages.status}`)
    if (messages.body && messages.body.messages && Array.isArray(messages.body.messages)) {
      const firstMsg = messages.body.messages[0]
      console.log(`First Message Keys:`, Object.keys(firstMsg))
      console.log(`First Message Type: ${firstMsg.type}`)
      console.log(`First Message mediaUrl: ${firstMsg.mediaUrl || 'null'}`)
      console.log(`First Message mediaMimeType: ${firstMsg.mediaMimeType || 'null'}`)
      console.log(`First Message attachments: ${firstMsg.attachments?.length || 0}`)
      
      // Find audio message
      const audioMsg = messages.body.messages.find((m: any) => 
        m.type === 'audio' || 
        m.mediaMimeType?.startsWith('audio/') ||
        m.attachments?.some((a: any) => a.type === 'audio')
      )
      if (audioMsg) {
        console.log(`\nAudio Message Found:`)
        console.log(`  ID: ${audioMsg.id}`)
        console.log(`  Type: ${audioMsg.type}`)
        console.log(`  mediaUrl: ${audioMsg.mediaUrl || 'null'}`)
        console.log(`  mediaMimeType: ${audioMsg.mediaMimeType || 'null'}`)
        console.log(`  Attachments:`, audioMsg.attachments || [])
      } else {
        console.log(`\nNo audio message found in conversation`)
      }
    }
  }
  
  console.log('\n' + '='.repeat(80))
  console.log('PROBE COMPLETE')
  console.log('='.repeat(80))
}

main().catch(console.error)

