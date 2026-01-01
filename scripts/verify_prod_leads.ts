#!/usr/bin/env tsx
/**
 * Verify leads page loads without React #310 error
 * 
 * Usage:
 *   E2E_BASE_URL=https://... E2E_EMAIL=... E2E_PASSWORD=... tsx scripts/verify_prod_leads.ts
 */

import { chromium, Browser, Page } from 'playwright'

const BASE_URL = process.env.E2E_BASE_URL || process.env.BASE_URL || 'https://alainbcenter-3ke1it6ff-abdurahmans-projects-66129df5.vercel.app'
const EMAIL = process.env.E2E_EMAIL || ''
const PASSWORD = process.env.E2E_PASSWORD || ''

async function login(page: Page): Promise<void> {
  console.log(`[VERIFY] Logging in as ${EMAIL}...`)
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')

  // Wait for navigation away from login
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 30000 })
  console.log(`✅ Logged in`)
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

async function verifyLeadPage(page: Page, leadId: number): Promise<boolean> {
  console.log(`[VERIFY] Verifying lead page /leads/${leadId}...`)

  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: string[] = []

  // Set up error listeners BEFORE navigation
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })

  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedRequests.push(`${response.url()}: ${response.status()}`)
    }
  })

  await page.goto(`${BASE_URL}/leads/${leadId}`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // Wait for network to be mostly idle (but not fully idle, as polling continues)
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
    console.log(`⚠️  Network not idle, continuing anyway`)
  })

  // Wait a bit for React to hydrate and render
  await page.waitForTimeout(3000)

  // Check for React #310 error FIRST (before waiting for selector)
  const pageContent = await page.content()
  if (pageContent.includes('Minified React error #310') || 
      pageContent.includes('Rendered more hooks than during the previous render') ||
      pageContent.includes('Something went wrong')) {
    console.error(`❌ React error #310 detected in page content`)
    console.error(`Console errors:`, consoleErrors)
    console.error(`Page errors:`, pageErrors)
    console.error(`Failed requests:`, failedRequests)
    await page.screenshot({ path: 'test-results/leads-react-error.png', fullPage: true })
    
    // Try to get more details
    const errorText = await page.locator('text=/error|Error|Something went wrong/i').first().textContent({ timeout: 5000 }).catch(() => null)
    if (errorText) {
      console.error(`Error text found: ${errorText}`)
    }
    
    return false
  }

  // Wait for stable selector - try both mobile and desktop versions
  // The selector exists in both, but one is hidden by CSS
  const leadDetail = page.locator('[data-testid="lead-detail"]')
  
  try {
    // First, check if selector exists in DOM (either mobile or desktop version)
    const selectorCount = await leadDetail.count()
    console.log(`[VERIFY] Found ${selectorCount} element(s) with data-testid="lead-detail"`)
    
    if (selectorCount === 0) {
      // Selector doesn't exist - check what's actually on the page
      const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => null)
      const hasMainLayout = await page.locator('[class*="MainLayout"], main').count()
      const hasError = await page.locator('text=/error|Error|not found|Not Found/i').count()
      const hasLoading = await page.locator('text=/Loading|loading/i, [class*="skeleton"], [class*="Skeleton"]').count()
      
      console.error(`[VERIFY] Selector not found. Page state:`, {
        hasMainLayout,
        hasError,
        hasLoading,
        bodyPreview: bodyText?.substring(0, 200),
      })
      
      throw new Error('Selector [data-testid="lead-detail"] not found in DOM')
    }
    
    // Wait for at least one to be attached
    await leadDetail.first().waitFor({ state: 'attached', timeout: 5000 })
    console.log(`✅ Lead detail selector found in DOM`)
    
    // Check if any version is visible (mobile OR desktop)
    // Use evaluate to check actual computed visibility
    const isVisible = await page.evaluate(() => {
      const elements = document.querySelectorAll('[data-testid="lead-detail"]')
      for (const el of Array.from(elements)) {
        const style = window.getComputedStyle(el as HTMLElement)
        if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
          return true
        }
      }
      return false
    })
    
    if (!isVisible) {
      // Check if page is still loading
      const isLoading = await page.locator('text=/Loading|loading/i, [class*="skeleton"], [class*="Skeleton"], [class*="animate-pulse"]').count()
      if (isLoading > 0) {
        console.log(`⚠️  Page still loading, waiting more...`)
        await page.waitForTimeout(5000)
        const isVisible2 = await page.evaluate(() => {
          const elements = document.querySelectorAll('[data-testid="lead-detail"]')
          for (const el of Array.from(elements)) {
            const style = window.getComputedStyle(el as HTMLElement)
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
              return true
            }
          }
          return false
        })
        if (!isVisible2) {
          throw new Error('Selector exists but not visible after loading')
        }
      } else {
        throw new Error('Selector exists but not visible and page not loading')
      }
    }
    
    console.log(`✅ Lead detail selector is visible`)
  } catch (error: any) {
    console.error(`❌ Lead detail selector not found or not visible within 20s`)
    console.error(`Error: ${error.message}`)
    console.error(`Console errors:`, consoleErrors)
    console.error(`Page errors:`, pageErrors)
    console.error(`Failed requests:`, failedRequests)
    
    // Get page title and URL for debugging
    const title = await page.title()
    const url = page.url()
    console.error(`Page title: ${title}`)
    console.error(`Page URL: ${url}`)
    
    // Check what's actually on the page
    const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => null)
    if (bodyText) {
      console.error(`Page body preview (first 500 chars): ${bodyText.substring(0, 500)}`)
    }
    
    await page.screenshot({ path: 'test-results/leads-verification-failure.png', fullPage: true })
    return false
  }

  // Already checked for React #310 error above

  // Verify build stamp matches /api/health
  const buildStamp = page.locator('text=/Build:/i')
  const buildStampCount = await buildStamp.count()
  if (buildStampCount > 0) {
    const buildStampText = await buildStamp.first().textContent({ timeout: 5000 }).catch(() => null)
    if (buildStampText) {
      const buildSha = buildStampText.replace(/Build:/i, '').trim()
      console.log(`✅ Build stamp in UI: ${buildSha}`)

      // Verify against /api/health
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
  await page.screenshot({ path: 'test-results/leads-verification-success.png', fullPage: true })
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
    await login(page)

    // Get lead ID
    const leadId = await getLeadId(page)

    // Verify lead page
    const passed = await verifyLeadPage(page, leadId)

    if (!passed) {
      console.error(`\n❌ Leads page verification FAILED`)
      process.exit(1)
    }

    console.log(`\n✅ Leads page verification PASSED`)
  } catch (error: any) {
    console.error(`\n❌ Verification failed:`, error.message)
    await page.screenshot({ path: 'test-results/leads-verification-error.png', fullPage: true })
    process.exit(1)
  } finally {
    await browser.close()
  }
}

main()

