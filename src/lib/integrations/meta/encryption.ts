/**
 * Encryption utility for Meta access tokens
 * Uses AES-256-GCM encryption with a secret key from environment variables
 */

import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.META_ENCRYPTION_KEY || process.env.SESSION_SECRET || 'alain-crm-secret-key-change-in-production'
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

/**
 * Derive a 32-byte key from the secret
 */
function getKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
}

/**
 * Encrypt a token
 */
export function encryptToken(token: string): string {
  try {
    const key = getKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    let encrypted = cipher.update(token, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    // Return: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  } catch (error: any) {
    console.error('Token encryption error:', error)
    throw new Error('Failed to encrypt token')
  }
}

/**
 * Decrypt a token
 */
export function decryptToken(encryptedToken: string): string {
  try {
    const key = getKey()
    const parts = encryptedToken.split(':')
    
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted token format')
    }
    
    const [ivHex, authTagHex, encrypted] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error: any) {
    console.error('Token decryption error:', error)
    throw new Error('Failed to decrypt token')
  }
}

