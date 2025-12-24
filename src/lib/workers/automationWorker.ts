/**
 * Background Automation Worker
 * 
 * Continuously processes automation jobs from the queue
 * Runs independently of user sessions - truly "set and forget"
 */

import { prisma } from '../prisma'
import { runInboundAutomationsForMessage } from '../automation/inbound'
import { runAutopilot } from '../autopilot/runAutopilot'

class AutomationWorker {
  private isRunning = false
  private processingInterval: NodeJS.Timeout | null = null
  private readonly POLL_INTERVAL = 5000 // 5 seconds
  private readonly BATCH_SIZE = 10
  private readonly WORKER_STATE_KEY = 'automation_worker_running'

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Automation Worker already running')
      return
    }

    // Persist state to database
    await this.saveWorkerState(true)

    this.isRunning = true
    console.log('🚀 Automation Worker started - processing jobs every 5 seconds')

    // Process jobs immediately
    this.processJobs()

    // Then poll every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processJobs()
    }, this.POLL_INTERVAL)
  }

  async stop() {
    this.isRunning = false
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }
    
    // Persist state to database
    await this.saveWorkerState(false)
    
    console.log('🛑 Automation Worker stopped')
  }

  isActive(): boolean {
    return this.isRunning
  }

  private async saveWorkerState(running: boolean): Promise<void> {
    try {
      // Use a simple key-value approach with ExternalEventLog
      // First, try to find existing record
      const existing = await prisma.externalEventLog.findFirst({
        where: {
          provider: 'system',
          externalId: this.WORKER_STATE_KEY,
        },
        orderBy: { receivedAt: 'desc' },
      })

      const payload = JSON.stringify({ 
        running, 
        timestamp: new Date().toISOString(),
        updatedBy: 'worker_api'
      })

      if (existing) {
        // Update existing
        await prisma.externalEventLog.update({
          where: { id: existing.id },
          data: {
            payload,
            receivedAt: new Date(),
          },
        })
      } else {
        // Create new
        await prisma.externalEventLog.create({
          data: {
            provider: 'system',
            externalId: this.WORKER_STATE_KEY,
            payload,
            receivedAt: new Date(),
          },
        })
      }
    } catch (error: any) {
      // If ExternalEventLog doesn't exist or has issues, use a fallback
      console.warn('Failed to save worker state to database:', error.message)
    }
  }

  async loadWorkerState(): Promise<boolean> {
    try {
      const stateLog = await prisma.externalEventLog.findFirst({
        where: {
          provider: 'system',
          externalId: this.WORKER_STATE_KEY,
        },
        orderBy: { receivedAt: 'desc' },
      })

      if (stateLog) {
        const payload = JSON.parse(stateLog.payload || '{}')
        // If state says running and is less than 5 minutes old, restore it
        const age = Date.now() - stateLog.receivedAt.getTime()
        if (payload.running === true && age < 300000) { // 5 minutes
          return true
        }
      }
      return false
    } catch (error: any) {
      console.warn('Failed to load worker state from database:', error.message)
      return false
    }
  }

  async checkIfRunning(): Promise<boolean> {
    // First check in-memory state
    if (this.isRunning) {
      return true
    }

    // Then check persisted state
    const persistedState = await this.loadWorkerState()
    if (persistedState && !this.isRunning) {
      // State says running but worker isn't - restore it
      console.log('🔄 Restoring worker state from database...')
      await this.start()
      return true
    }

    // Also check if there are pending jobs (worker should be running)
    try {
      const pendingCount = await prisma.automationJob.count({
        where: { status: 'PENDING' },
      })
      
      if (pendingCount > 0 && !this.isRunning) {
        // There are pending jobs but worker isn't running - start it
        console.log(`🔄 Found ${pendingCount} pending jobs, starting worker...`)
        await this.start()
        return true
      }
    } catch (error) {
      // Ignore errors
    }

    return this.isRunning
  }

  private async processJobs() {
    if (!this.isRunning) return

    try {
      // Get pending jobs from database
      const jobs = await prisma.automationJob.findMany({
        where: {
          status: 'PENDING',
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
        take: this.BATCH_SIZE,
      })

      if (jobs.length === 0) {
        return // No jobs to process
      }

      console.log(`📦 Processing ${jobs.length} automation job(s)`)

      // Process jobs in parallel (but limit concurrency)
      const promises = jobs.map(job => this.processJob(job))
      await Promise.allSettled(promises)
    } catch (error: any) {
      console.error('❌ Worker error:', error.message)
    }
  }

  private async processJob(job: any) {
    try {
      // Mark as processing (check if job still exists first)
      const existingJob = await prisma.automationJob.findUnique({
        where: { id: job.id },
      })
      
      if (!existingJob || existingJob.status !== 'PENDING') {
        // Job was already processed or doesn't exist
        return
      }

      await prisma.automationJob.update({
        where: { id: job.id },
        data: { 
          status: 'PROCESSING', 
          startedAt: new Date() 
        },
      })

      // Execute job
      await this.executeJob(job)

      // Mark as completed (check job still exists)
      const jobStillExists = await prisma.automationJob.findUnique({
        where: { id: job.id },
      })
      
      if (jobStillExists) {
        await prisma.automationJob.update({
          where: { id: job.id },
          data: { 
            status: 'COMPLETED', 
            completedAt: new Date() 
          },
        })
        console.log(`✅ Job ${job.id} (${job.type}) completed`)
      }
    } catch (error: any) {
      console.error(`❌ Job ${job.id} failed:`, error.message)
      
      const retryCount = job.retryCount || 0
      const maxRetries = job.maxRetries || 3

      if (retryCount < maxRetries) {
        // Retry the job
        await prisma.automationJob.update({
          where: { id: job.id },
          data: {
            status: 'PENDING',
            retryCount: retryCount + 1,
            error: null, // Clear error for retry
          },
        })
        console.log(`🔄 Job ${job.id} queued for retry (${retryCount + 1}/${maxRetries})`)
      } else {
        // Mark as failed after max retries
        await prisma.automationJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: error.message,
            completedAt: new Date(),
          },
        })
        console.log(`❌ Job ${job.id} failed after ${maxRetries} retries`)
      }
    }
  }

  private async executeJob(job: any) {
    const jobData = typeof job.data === 'string' ? JSON.parse(job.data) : job.data

    switch (job.type) {
      case 'inbound_message':
        // Parse message createdAt back to Date
        const messageData = {
          ...jobData.message,
          createdAt: new Date(jobData.message.createdAt),
        }
        await runInboundAutomationsForMessage(
          jobData.leadId,
          messageData
        )
        break

      case 'scheduled_autopilot':
        await runAutopilot({ dryRun: jobData.dryRun || false })
        break

      case 'followup_due':
        const { runScheduledRules } = await import('../automation/engine')
        await runScheduledRules('daily')
        break

      case 'expiry_reminder':
        await runAutopilot({ dryRun: false })
        break

      default:
        throw new Error(`Unknown job type: ${job.type}`)
    }
  }

  async getStats() {
    // Check if worker should be running (restore if needed)
    const isActuallyRunning = await this.checkIfRunning()
    
    const [pending, processing, completed, failed] = await Promise.all([
      prisma.automationJob.count({ where: { status: 'PENDING' } }),
      prisma.automationJob.count({ where: { status: 'PROCESSING' } }),
      prisma.automationJob.count({ where: { status: 'COMPLETED' } }),
      prisma.automationJob.count({ where: { status: 'FAILED' } }),
    ])

    return {
      pending,
      processing,
      completed,
      failed,
      isRunning: isActuallyRunning,
    }
  }
}

// Singleton instance
let workerInstance: AutomationWorker | null = null

export function getAutomationWorker(): AutomationWorker {
  if (!workerInstance) {
    workerInstance = new AutomationWorker()
  }
  return workerInstance
}

// Auto-restore worker state on server startup
if (typeof window === 'undefined') {
  // Restore worker state from database on module load
  const worker = getAutomationWorker()
  
  // Check if worker should be running (either auto-start enabled OR persisted state says running)
  const autoStart = process.env.AUTOPILOT_WORKER_AUTO_START === 'true'
  
  if (autoStart) {
    // Auto-start if enabled
    worker.start().catch(console.error)
    console.log('✅ Automation Worker auto-started (AUTOPILOT_WORKER_AUTO_START=true)')
  } else {
    // Otherwise, restore from persisted state
    worker.loadWorkerState().then((shouldRun) => {
      if (shouldRun) {
        worker.start().catch(console.error)
        console.log('🔄 Automation Worker restored from persisted state')
      } else {
        console.log('ℹ️ Automation Worker not running (start via UI or set AUTOPILOT_WORKER_AUTO_START=true)')
      }
    }).catch(console.error)
  }
}

