import bcrypt from 'bcryptjs'

/**
 * Password hashing utilities using bcrypt
 */

/**
 * Hash a password securely using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10
  return bcrypt.hash(password, saltRounds)
}

/**
 * Verify a password against a bcrypt hash
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  // Handle legacy SHA-256 hashes (for migration)
  if (hashedPassword.length === 64 && /^[a-f0-9]{64}$/i.test(hashedPassword)) {
    // Legacy SHA-256 hash - verify using crypto
    const crypto = await import('crypto')
    const hash = crypto.createHash('sha256').update(password).digest('hex')
    return hash === hashedPassword
  }
  
  // Use bcrypt for new passwords
  return bcrypt.compare(password, hashedPassword)
}

