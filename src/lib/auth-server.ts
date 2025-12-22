import { cookies } from 'next/headers'
import { prisma } from './prisma'
import { redirect } from 'next/navigation'
import crypto from 'crypto'

// Node.js version of decodeSessionToken (for server components)
// Uses Node.js crypto instead of Web Crypto API
const SECRET = process.env.SESSION_SECRET || 'alain-crm-secret-key-change-in-production'

interface SessionPayload {
  userId: number
  email: string
  role: string
  iat: number
  exp: number
}

async function decodeSessionTokenNode(token: string): Promise<SessionPayload | null> {
  try {
    let decodedToken = token
    
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

    // Use Node.js crypto for HMAC
    const expectedSignature = crypto
      .createHmac('sha256', SECRET)
      .update(encoded)
      .digest('hex')

    if (signature !== expectedSignature) {
      return null
    }

    // Decode base64 using Node.js Buffer
    const payloadStr = Buffer.from(encoded, 'base64').toString('utf-8')
    const payload: SessionPayload = JSON.parse(payloadStr)

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }

    return payload
  } catch (error: any) {
    return null
  }
}

/**
 * Server-side auth helpers
 */

/**
 * Get current user from session
 */
export async function getCurrentUser() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('alaincrm_session')?.value
    
    if (!token) return null

    const payload = await decodeSessionTokenNode(token)
    if (!payload) return null

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    })

    return user
  } catch (error: any) {
    return null
  }
}

/**
 * Require authentication
 * Redirects to login if not authenticated
 */
export async function requireAuth() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }
  
  return user
}

/**
 * Require admin role
 * Redirects to login if not authenticated, or home if not admin
 */
export async function requireAdmin() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }
  
  const userRole = user.role?.toUpperCase() || 'AGENT'
  if (userRole !== 'ADMIN') {
    redirect('/')
  }
  
  return user
}

/**
 * Require admin or agent role
 * Redirects to login if not authenticated
 */
export async function requireAuthOrAgent() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }
  
  const userRole = user.role?.toUpperCase() || 'AGENT'
  if (userRole !== 'ADMIN' && userRole !== 'AGENT') {
    redirect('/')
  }
  
  return user
}

/**
 * Require admin or manager role
 * Redirects to login if not authenticated, or home if not admin/manager
 */
export async function requireAdminOrManager() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/login')
  }
  
  const userRole = user.role?.toUpperCase() || 'AGENT'
  if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
    redirect('/')
  }
  
  return user
}

