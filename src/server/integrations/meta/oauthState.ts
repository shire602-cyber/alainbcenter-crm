/**
 * OAuth State Management
 * Stores OAuth tokens temporarily in encrypted session cookies
 * State expires after 5 minutes for security
 */

import { cookies } from 'next/headers'
import { encryptToken, decryptToken } from '@/lib/integrations/meta/encryption'

export interface OAuthState {
  longLivedUserToken: string
  expiresAt: number // Unix timestamp (milliseconds)
  workspaceId: number | null
  metaUserId?: string
}

const OAUTH_STATE_COOKIE_NAME = 'meta_oauth_state'
const OAUTH_STATE_EXPIRY_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Store OAuth state in encrypted cookie
 * Returns session ID (cookie value hash for reference)
 */
export async function storeOAuthState(state: OAuthState): Promise<string> {
  const cookieStore = await cookies()
  
  // Encrypt the long-lived token before storing
  const encryptedToken = encryptToken(state.longLivedUserToken)
  
  const stateData = {
    ...state,
    longLivedUserToken: encryptedToken, // Store encrypted
  }
  
  // Store as JSON in cookie (encrypted token is already encrypted)
  const cookieValue = Buffer.from(JSON.stringify(stateData)).toString('base64url')
  
  cookieStore.set(OAUTH_STATE_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: Math.floor(OAUTH_STATE_EXPIRY_MS / 1000), // Convert to seconds
    path: '/',
  })
  
  // Return a simple session ID (hash of cookie value for reference)
  return Buffer.from(cookieValue).toString('base64url').substring(0, 16)
}

/**
 * Get OAuth state from cookie
 * Returns null if expired or not found
 */
export async function getOAuthState(): Promise<OAuthState | null> {
  const cookieStore = await cookies()
  const cookie = cookieStore.get(OAUTH_STATE_COOKIE_NAME)
  
  if (!cookie?.value) {
    return null
  }
  
  try {
    const stateData = JSON.parse(Buffer.from(cookie.value, 'base64url').toString())
    
    // Check expiry
    if (stateData.expiresAt && Date.now() > stateData.expiresAt) {
      console.log('[META-OAUTH] OAuth state expired', {
        expiresAt: new Date(stateData.expiresAt).toISOString(),
        now: new Date().toISOString(),
      })
      await clearOAuthState()
      return null
    }
    
    // Decrypt the token
    const decryptedToken = decryptToken(stateData.longLivedUserToken)
    
    return {
      ...stateData,
      longLivedUserToken: decryptedToken,
    }
  } catch (error: any) {
    console.error('[META-OAUTH] Failed to parse OAuth state:', error.message)
    await clearOAuthState()
    return null
  }
}

/**
 * Clear OAuth state cookie
 */
export async function clearOAuthState(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(OAUTH_STATE_COOKIE_NAME)
}
