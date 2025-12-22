// Audit logging helper
// Tracks who did what, when

import { prisma } from './prisma'
import { getCurrentUser } from './auth-server'

type AuditAction =
  | 'message_sent'
  | 'lead_created'
  | 'lead_updated'
  | 'lead_deleted'
  | 'contact_created'
  | 'contact_updated'
  | 'task_created'
  | 'task_completed'
  | 'automation_triggered'
  | 'integration_configured'
  | 'user_login'
  | 'user_logout'

type EntityType = 'lead' | 'contact' | 'message' | 'task' | 'automation' | 'integration' | 'user'

/**
 * Log an audit event
 */
export async function logAudit(
  action: AuditAction,
  entityType: EntityType,
  entityId: number | null,
  details?: Record<string, any>
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      // Don't log if no user (e.g., system actions)
      return
    }

    // Note: AuditLog model may not exist in schema - gracefully skip if missing
    try {
      await (prisma as any).auditLog?.create({
        data: {
          userId: user.id,
          action,
          entityType,
          entityId,
          details: details ? JSON.stringify(details) : null,
        },
      })
    } catch (modelError: any) {
      // Model doesn't exist or other error - just log and continue
      console.warn('AuditLog model not available:', modelError.message)
    }
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error('Failed to log audit event:', error)
  }
}

/**
 * Get audit logs for an entity
 */
export async function getAuditLogs(
  entityType: EntityType,
  entityId: number,
  limit = 50
) {
  // Note: AuditLog model may not exist in schema - return empty array if missing
  try {
    return await (prisma as any).auditLog?.findMany({
    where: {
      entityType,
      entityId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: limit,
  }) || []
  } catch (modelError: any) {
    console.warn('AuditLog model not available:', modelError.message)
    return []
  }
}






















