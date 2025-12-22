import { getCurrentUser } from './auth-server'

/**
 * Auth helpers specifically for API routes
 * These never redirect - they return user or throw, letting API routes handle the response
 */

/**
 * Get current user for API routes
 * Returns user or null (never redirects)
 */
export async function getCurrentUserApi() {
  return await getCurrentUser()
}

/**
 * Require admin for API routes
 * Returns user or throws error (never redirects)
 */
export async function requireAdminApi() {
  const user = await getCurrentUser()
  
  if (!user) {
    const error: any = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }
  
  const userRole = user.role?.toUpperCase() || 'AGENT'
  if (userRole !== 'ADMIN') {
    const error: any = new Error('Forbidden: Admin access required')
    error.statusCode = 403
    throw error
  }
  
  return user
}

/**
 * Require admin or manager for API routes
 * Returns user or throws error (never redirects)
 */
export async function requireAdminOrManagerApi() {
  const user = await getCurrentUser()
  
  if (!user) {
    const error: any = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }
  
  const userRole = user.role?.toUpperCase() || 'AGENT'
  if (userRole !== 'ADMIN' && userRole !== 'MANAGER') {
    const error: any = new Error('Forbidden: Admin or Manager access required')
    error.statusCode = 403
    throw error
  }
  
  return user
}

/**
 * Require admin or agent for API routes
 * Returns user or throws error (never redirects)
 */
export async function requireAuthOrAgentApi() {
  const user = await getCurrentUser()
  
  if (!user) {
    const error: any = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }
  
  const userRole = user.role?.toUpperCase() || 'AGENT'
  if (userRole !== 'ADMIN' && userRole !== 'AGENT') {
    const error: any = new Error('Forbidden: Admin or Agent access required')
    error.statusCode = 403
    throw error
  }
  
  return user
}

/**
 * Require authentication for API routes
 * Returns user or throws error (never redirects)
 */
export async function requireAuthApi() {
  const user = await getCurrentUser()
  
  if (!user) {
    const error: any = new Error('Unauthorized')
    error.statusCode = 401
    throw error
  }
  
  return user
}

