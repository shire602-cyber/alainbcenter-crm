#!/usr/bin/env tsx
/**
 * Verify leads page loads without React #310 error
 * 
 * Usage:
 *   E2E_BASE_URL=https://... E2E_EMAIL=... E2E_PASSWORD=... tsx scripts/verify_prod_leads.ts
 */

import { chromium, Browser, Page } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://alainbcenter-3ke1it6ff-abdurahmans-projects-66129df5.vercel.app'
const EMAIL = process.env.E2E_EMAIL || ''
const PASSWORD = process.env.E2E_PASSWORD || ''

const DEBUG_DIR = 'test-results/leads-debug'
if (!fs.existsSync(DEBUG_DIR)) {
  fs.mkdirSync(DEBUG_DIR, { recursive: true })
}

interface NetworkRequest {
  url: string
  method: string
  status?: number
  startTime: number
  endTime?: number
  duration?: number
  error?: string
}

async function login(page: Page): Promise<string> {
  console.log(`[VERIFY] Logging in as ${EMAIL}...`)
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')

  // PART 1: Wait for either URL change OR logged-in UI element (not waitForURL with "load")
  try {
    await Promise.race([
      page.waitForURL(url => /^\/(inbox|leads|dashboard|\?)/.test(url.pathname), { 
        waitUntil: 'domcontentloaded',
        timeout: 15000 
      }),
      page.waitForSelector('text=/Build:/i, [class*="navbar"], [data-testid="main-layout"]', { 
        timeout: 15000 
      })
    ])
    console.log(`✅ Logged in (URL: ${page.url()})`)
  } catch (error) {
    console.error(`❌ Login timeout - capturing state`)
    await page.screenshot({ path: `${DEBUG_DIR}/login-timeout.png`, fullPage: true })
    const content = await page.content()
    fs.writeFileSync(`${DEBUG_DIR}/login-timeout.html`, content)
    throw error
  }

  // PART 1: Verify auth works
  const cookies = await page.context().cookies()
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ')
  
  const authCheck = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: cookieHeader },
  })
  
  if (!authCheck.ok) {
    throw new Error(`Auth verification failed: ${authCheck.status} ${authCheck.statusText}`)
  }
  
  const authData = await authCheck.json()
  console.log(`✅ Auth verified: ${authData.user?.email || 'unknown'}`)
  
  return cookieHeader
}

async function getLeadId(page: Page): Promise<number> {
  console.log(`[VERIFY] Fetching leads list...`)
  await page.goto(`${BASE_URL}/leads`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // Wait for leads to load
  await page.waitForSelector('a[href^="/leads/"], text=No leads, text=Loading', { timeout: 15000 }).catch(() => {
    console.log(`⚠️  Leads list did not load`)
  })

  // Get first lead ID
  const firstLeadLink = page.locator('a[href^="/leads/"]').first()
  const leadHref = await firstLeadLink.getAttribute('href', { timeout: 10000 }).catch(() => null)

  if (!leadHref) {
    throw new Error('No leads found on page')
  }

  const leadId = parseInt(leadHref.replace('/leads/', '').split('?')[0])
  if (isNaN(leadId)) {
    throw new Error(`Could not extract lead ID from ${leadHref}`)
  }

  console.log(`✅ Found lead ID: ${leadId}`)
  return leadId
}

async function verifyLeadPage(page: Page, leadId: number, cookieHeader: string): Promise<boolean> {
  console.log(`[VERIFY] Verifying lead page /leads/${leadId}...`)

  const consoleLogs: string[] = []
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const networkRequests: Map<string, NetworkRequest> = new Map()
  const pendingRequests: Set<string> = new Set()

  // Set up comprehensive logging BEFORE navigation
  page.on('console', (msg) => {
    const text = msg.text()
    consoleLogs.push(`[${msg.type()}] ${text}`)
    if (msg.type() === 'error') {
      consoleErrors.push(text)
    }
  })

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/leads')) {
      const reqId = `${request.method()}-${url}`
      networkRequests.set(reqId, {
        url,
        method: request.method(),
        startTime: Date.now(),
      })
      pendingRequests.add(reqId)
      console.log(`[NETWORK] ${request.method()} ${url} - START`)
    }
  })

  page.on('response', (response) => {
    const url = response.url()
    if (url.includes('/api/leads')) {
      const reqId = `${response.request().method()}-${url}`
      const req = networkRequests.get(reqId)
      if (req) {
        req.status = response.status()
        req.endTime = Date.now()
        req.duration = req.endTime - req.startTime
        pendingRequests.delete(reqId)
        console.log(`[NETWORK] ${response.request().method()} ${url} - ${response.status()} (${req.duration}ms)`)
      }
    }
  })

  page.on('requestfailed', (request) => {
    const url = request.url()
    if (url.includes('/api/leads')) {
      const reqId = `${request.method()}-${url}`
      const req = networkRequests.get(reqId)
      if (req) {
        req.error = request.failure()?.errorText || 'Unknown error'
        req.endTime = Date.now()
        req.duration = req.endTime - req.startTime
        pendingRequests.delete(reqId)
        console.log(`[NETWORK] ${request.method()} ${url} - FAILED: ${req.error}`)
      }
    }
  })

  await page.goto(`${BASE_URL}/leads/${leadId}`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // PART 1: Capture screenshot at 5s
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `${DEBUG_DIR}/screenshot-5s.png`, fullPage: true })
  console.log(`[VERIFY] Screenshot captured at 5s`)

  // PART 1: Log inflight requests after 10s
  await page.waitForTimeout(5000) // Total 10s
  if (pendingRequests.size > 0) {
    console.log(`[VERIFY] Pending requests after 10s:`)
    for (const reqId of pendingRequests) {
      const req = networkRequests.get(reqId)
      if (req) {
        console.log(`  - ${req.method} ${req.url} (${Date.now() - req.startTime}ms elapsed)`)
      }
    }
  }

  // PART 1: Capture screenshot at 15s
  await page.waitForTimeout(5000) // Total 15s
  await page.screenshot({ path: `${DEBUG_DIR}/screenshot-15s.png`, fullPage: true })
  console.log(`[VERIFY] Screenshot captured at 15s`)

  // PART 1: Dump HTML if selector not found
  const htmlContent = await page.content()
  fs.writeFileSync(`${DEBUG_DIR}/html-dump.txt`, htmlContent.substring(0, 3000))
  console.log(`[VERIFY] HTML dump saved (first 3000 chars)`)

  // PART 1: Write network log
  const networkLog = Array.from(networkRequests.values())
    .map(req => `${req.method} ${req.url} - ${req.status || 'PENDING'} (${req.duration || Date.now() - req.startTime}ms)${req.error ? ` - ERROR: ${req.error}` : ''}`)
    .join('\n')
  fs.writeFileSync(`${DEBUG_DIR}/network-log.txt`, networkLog)
  console.log(`[VERIFY] Network log saved`)

  // PART 1: Write console log
  fs.writeFileSync(`${DEBUG_DIR}/console-log.txt`, consoleLogs.join('\n'))
  console.log(`[VERIFY] Console log saved`)

  // PART 1: Check for React #310 error FIRST
  if (htmlContent.includes('Minified React error #310') || 
      htmlContent.includes('Rendered more hooks than during the previous render') ||
      htmlContent.includes('Something went wrong')) {
    console.error(`❌ React error #310 detected in page content`)
    console.error(`Console errors:`, consoleErrors)
    console.error(`Page errors:`, pageErrors)
    return false
  }

  // PART 1: Wait for readiness indicators (not just data-testid)
  try {
    await Promise.race([
      page.waitForSelector('[data-testid="lead-detail"]', { timeout: 20000 }),
      page.waitForSelector('text=/Lead Not Found/i', { timeout: 20000 }),
      page.waitForSelector('text=/Something went wrong/i', { timeout: 20000 }),
      page.waitForSelector('text=/Phone|Status|Service/i', { timeout: 20000 }),
    ])
    console.log(`✅ Readiness indicator found`)
  } catch (error) {
    // Check if only skeleton/loading remains
    const hasSkeleton = await page.locator('[class*="skeleton"], [class*="Skeleton"], [class*="animate-pulse"]').count()
    const hasLoading = await page.locator('text=/Loading|loading/i').count()
    
    if (hasSkeleton > 0 || hasLoading > 0) {
      console.error(`❌ Only skeleton/loading remains after 20s`)
      console.error(`Pending requests:`, Array.from(pendingRequests).map(reqId => {
        const req = networkRequests.get(reqId)
        return req ? `${req.method} ${req.url}` : reqId
      }))
      return false
    }
    
    throw error
  }

  // Verify build stamp matches /api/health
  const buildStamp = page.locator('text=/Build:/i')
  const buildStampCount = await buildStamp.count()
  if (buildStampCount > 0) {
    const buildStampText = await buildStamp.first().textContent({ timeout: 5000 }).catch(() => null)
    if (buildStampText) {
      const buildSha = buildStampText.replace(/Build:/i, '').trim()
      console.log(`✅ Build stamp in UI: ${buildSha}`)

      const healthRes = await fetch(`${BASE_URL}/api/health`)
      if (healthRes.ok) {
        const health = await healthRes.json()
        const healthSha = health.buildId || health.build || 'unknown'
        console.log(`✅ Build SHA from /api/health: ${healthSha}`)

        if (buildSha !== healthSha) {
          console.error(`❌ Build stamp mismatch: UI=${buildSha}, API=${healthSha}`)
          return false
        }
      }
    }
  }

  console.log(`✅ Lead page verification PASSED`)
  await page.screenshot({ path: `${DEBUG_DIR}/screenshot-success.png`, fullPage: true })
  return true
}

async function main() {
  console.log(`[VERIFY] Starting leads page verification against ${BASE_URL}\n`)

  if (!EMAIL || !PASSWORD) {
    console.error('❌ E2E_EMAIL and E2E_PASSWORD must be set')
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Login
    const cookieHeader = await login(page)

    // Get lead ID
    const leadId = await getLeadId(page)

    // Verify lead page
    const passed = await verifyLeadPage(page, leadId, cookieHeader)

    if (!passed) {
      console.error(`\n❌ Leads page verification FAILED`)
      console.error(`\nDebug artifacts saved to: ${DEBUG_DIR}/`)
      process.exit(1)
    }

    console.log(`\n✅ Leads page verification PASSED`)
    console.log(`\nDebug artifacts saved to: ${DEBUG_DIR}/`)
  } catch (error: any) {
    console.error(`\n❌ Verification failed:`, error.message)
    await page.screenshot({ path: `${DEBUG_DIR}/error.png`, fullPage: true })
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()
