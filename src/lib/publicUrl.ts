// Helper to get public URL for webhooks
// Supports Vercel deployment detection and multiple fallback options

/**
 * Check if we're running on Vercel
 */
export function isVercel(): boolean {
  return !!(
    process.env.VERCEL ||
    process.env.VERCEL_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL
  )
}

/**
 * Check if a URL is publicly accessible (not localhost)
 */
export function isPublicUrl(url: string): boolean {
  if (!url) return false
  const lowerUrl = url.toLowerCase()
  return !(
    lowerUrl.includes('localhost') ||
    lowerUrl.includes('127.0.0.1') ||
    lowerUrl.includes('0.0.0.0') ||
    lowerUrl.startsWith('http://localhost') ||
    lowerUrl.startsWith('http://127.0.0.1')
  )
}

/**
 * Get the public URL for webhooks
 * Priority:
 * 1. APP_PUBLIC_URL (explicit production domain - highest priority)
 * 2. NEXT_PUBLIC_APP_URL (client-accessible production domain)
 * 3. VERCEL_URL (auto-detected on Vercel - fallback for preview deployments)
 * 4. Request origin (if available and not localhost)
 * 5. Default localhost (dev only)
 */
export function getPublicUrl(request?: Request): string {
  // Priority 1: Explicit production domain (highest priority)
  if (process.env.APP_PUBLIC_URL) {
    const url = process.env.APP_PUBLIC_URL.replace(/\/$/, '')
    // If it's a public URL (not localhost), use it
    if (isPublicUrl(url)) {
      return url
    }
  }

  // Priority 2: NEXT_PUBLIC_APP_URL (client-accessible)
  if (process.env.NEXT_PUBLIC_APP_URL) {
    const url = process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
    if (isPublicUrl(url)) {
      return url
    }
  }

  // Priority 3: Vercel deployment URL (fallback for preview deployments)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Priority 4: Request origin (if available and not localhost)
  if (request) {
    const url = new URL(request.url)
    const fullUrl = `${url.protocol}//${url.host}`
    if (isPublicUrl(fullUrl)) {
      return fullUrl
    }
  }

  // Last resort: localhost (dev only) - only if we're not on Vercel
  if (process.env.NODE_ENV === 'development' && !isVercel()) {
    return 'http://localhost:3000'
  }

  // Production fallback
  return 'https://your-domain.com'
}

/**
 * Get webhook URL for a given endpoint
 */
export function getWebhookUrl(endpoint: string, request?: Request): string {
  const baseUrl = getPublicUrl(request)
  return `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
}
























