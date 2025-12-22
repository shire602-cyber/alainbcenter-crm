// Helper to get public URL for webhooks
// Supports APP_PUBLIC_URL env var or falls back to request origin

/**
 * Get the public URL for webhooks
 * Priority:
 * 1. APP_PUBLIC_URL environment variable
 * 2. Request origin (if available)
 * 3. Default localhost (dev only)
 */
export function getPublicUrl(request?: Request): string {
  // Check environment variable first
  if (process.env.APP_PUBLIC_URL) {
    return process.env.APP_PUBLIC_URL.replace(/\/$/, '') // Remove trailing slash
  }

  // Try to get from request
  if (request) {
    const url = new URL(request.url)
    return `${url.protocol}//${url.host}`
  }

  // Fallback for server-side without request
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  }

  // Last resort: localhost (dev only)
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3000'
  }

  // Production fallback (should not happen)
  return 'https://your-domain.com'
}

/**
 * Get webhook URL for a given endpoint
 */
export function getWebhookUrl(endpoint: string, request?: Request): string {
  const baseUrl = getPublicUrl(request)
  return `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`
}






















