/**
 * Session token management
 * Edge Runtime compatible version using Web Crypto API
 * In production, use proper JWT or session store (Redis)
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
 * Base64 encoding for Edge Runtime (Edge-compatible, no Buffer, no escape)
 * Using TextEncoder/TextDecoder for proper UTF-8 handling
 */
function base64Encode(str: string): string {
  // Convert string to UTF-8 bytes, then to base64
  const encoder = new TextEncoder()
  const bytes = encoder.encode(str)
  // Convert bytes to binary string for btoa
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64Decode(str: string): string {
  // Decode base64 to binary string, then to UTF-8
  try {
    const binaryString = atob(str)
    // Convert binary string to bytes
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    // Decode bytes to UTF-8 string
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(bytes)
  } catch (error) {
    throw new Error('Failed to decode base64 string: ' + (error instanceof Error ? error.message : String(error)))
  }
}

/**
 * Create a session token (used in API routes - Node.js)
 * This uses Node.js crypto for performance, but could also use Web Crypto
 */
export async function createSessionToken(userId: number, email: string, role: string): Promise<string> {
  const payload: SessionPayload = {
    userId,
    email,
    role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days
  }

  // Simple base64 encoding
  const payloadStr = JSON.stringify(payload)
  const encoded = base64Encode(payloadStr)
  
  // Add HMAC signature using Web Crypto API (Edge compatible)
  const signature = await hmacSHA256(SECRET, encoded)

  return `${encoded}.${signature}`
}

/**
 * Decode and verify session token (Edge Runtime compatible)
 * Used in middleware which runs in Edge Runtime
 */
export async function decodeSessionToken(token: string): Promise<SessionPayload | null> {
  try {
    // Next.js automatically URL-decodes cookies when reading, so token should already be decoded
    // But handle both cases (encoded and decoded) for robustness
    let decodedToken = token
    
    // Only try to decode if it looks URL-encoded (contains %)
    if (token.includes('%')) {
      try {
        decodedToken = decodeURIComponent(token)
      } catch {
        // If decoding fails, use as-is
        decodedToken = token
      }
    }

    const [encoded, signature] = decodedToken.split('.')
    if (!encoded || !signature) {
      console.log('[AUTH] Token missing parts after split')
      return null
    }

    // Verify signature using Web Crypto API
    const expectedSignature = await hmacSHA256(SECRET, encoded)

    if (signature !== expectedSignature) {
      console.log('[AUTH] Signature mismatch - expected:', expectedSignature.substring(0, 20) + '...', 'got:', signature.substring(0, 20) + '...')
      return null
    }

    // Decode payload
    const payloadStr = base64Decode(encoded)
    const payload: SessionPayload = JSON.parse(payloadStr)

    // Check expiration
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      console.log('[AUTH] Token expired - exp:', payload.exp, 'now:', Math.floor(Date.now() / 1000))
      return null
    }

    return payload
  } catch (error: any) {
    console.log('[AUTH] Token decode error:', error?.message || error)
    return null
  }
}
