/**
 * Edge Runtime ONLY - Session token management
 * This file is specifically for Edge Runtime (middleware)
 * Uses ONLY Web APIs - no Node.js dependencies
 */

const SECRET = process.env.SESSION_SECRET || 'alain-crm-secret-key-change-in-production'

export interface SessionPayload {
  userId: number
  email: string
  role: string
  iat: number
  exp: number
}

/**
 * HMAC SHA-256 using Web Crypto API (Edge Runtime compatible)
 */
async function hmacSHA256(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder()
  const keyData = encoder.encode(key)
  const messageData = encoder.encode(message)
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData)
  const hashArray = Array.from(new Uint8Array(signature))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Base64 encode - Pure Edge Runtime (no Buffer, no escape)
 */
function base64Encode(str: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Base64 decode - Pure Edge Runtime (no Buffer, no escape)
 */
function base64Decode(str: string): string {
  try {
    const binaryString = atob(str)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(bytes)
  } catch (error) {
    throw new Error('Failed to decode base64: ' + (error instanceof Error ? error.message : String(error)))
  }
}

/**
 * Decode and verify session token (Edge Runtime ONLY)
 * Used in middleware which runs in Edge Runtime
 */
export async function decodeSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    let decodedToken = token
    
    // Handle URL encoding if present
    if (token.includes('%')) {
      try {
        decodedToken = decodeURIComponent(token)
      } catch {
        decodedToken = token
      }
    }

    const [encoded, signature] = decodedToken.split('.')
    if (!encoded || !signature) {
      return null
    }

    // Verify signature
    const expectedSignature = await hmacSHA256(SECRET, encoded)
    if (signature !== expectedSignature) {
      return null
    }

    // Decode payload
    const payloadStr = base64Decode(encoded)
    const payload: SessionPayload = JSON.parse(payloadStr)

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch (error: any) {
    // Silently fail - don't log in middleware to avoid noise
    return null
  }
}










