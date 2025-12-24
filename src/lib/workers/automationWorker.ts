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

    // Persist state to database for serverless environments
    try {
      await this.setWorkerState(true)
    } catch (error) {
      console.warn('Failed to persist worker state:', error)
    }

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
    try {
      await this.setWorkerState(false)
    } catch (error) {
      console.warn('Failed to persist worker state:', error)
    }
    
    console.log('🛑 Automation Worker stopped')
  }

  async initialize() {
    // Load persisted state from database
    try {
      const state = await this.getWorkerState()
      if (state) {
        this.isRunning = true
        console.log('🔄 Restored worker state: running')
        // Restart polling
        this.processingInterval = setInterval(() => {
          this.processJobs()
        }, this.POLL_INTERVAL)
        // Process jobs immediately
        this.processJobs()
      }
    } catch (error) {
      console.warn('Failed to restore worker state:', error)
    }
  }

  private async getWorkerState(): Promise<boolean> {
    // In serverless, check if there are recent processing jobs
    // If jobs are being processed, worker is effectively "running"
    const recentJob = await prisma.automationJob.findFirst({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        type: { not: 'worker_heartbeat' },
      },
      orderBy: { createdAt: 'desc' },
    })
    
    // Also check for a worker setting in a simpler way
    // Use ExternalEventLog as a key-value store for worker state
    const stateLog = await prisma.externalEventLog.findFirst({
      where: {
        provider: 'system',
        externalId: 'automation_worker_running',
      },
      orderBy: { receivedAt: 'desc' },
    })
    
    if (stateLog) {
      const payload = JSON.parse(stateLog.payload || '{}')
      const age = Date.now() - stateLog.receivedAt.getTime()
      // If state says running and is less than 2 minutes old, worker is active
      if (payload.running === true && age < 120000) {
        return true
      }
    }
    
    // If there are pending/processing jobs, worker should be running
    return !!recentJob
  }

  private async setWorkerState(running: boolean) {
    // Store state in ExternalEventLog as a simple key-value store
    await prisma.externalEventLog.upsert({
      where: {
        provider_externalId: {
          provider: 'system',
          externalId: 'automation_worker_running',
        },
      },
      create: {
        provider: 'system',
        externalId: 'automation_worker_running',
        payload: JSON.stringify({ running, timestamp: new Date().toISOString() }),
        receivedAt: new Date(),
      },
      update: {
        payload: JSON.stringify({ running, timestamp: new Date().toISOString() }),
        receivedAt: new Date(),
      },
    })
  }

  isActive(): boolean {
    return this.isRunning
  }

  private async processJobs() {
    if (!this.isRunning) return

    try {
      // Get pending jobs from database (exclude heartbeat jobs)
      const jobs = await prisma.automationJob.findMany({
        where: {
          status: 'PENDING',
          type: { not: 'worker_heartbeat' }, // Exclude heartbeat jobs
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
      // Mark as processing
      await prisma.automationJob.update({
        where: { id: job.id },
        data: { 
          status: 'PROCESSING', 
          startedAt: new Date() 
        },
      })

      // Execute job
      await this.executeJob(job)

      // Mark as completed
      await prisma.automationJob.update({
        where: { id: job.id },
        data: { 
          status: 'COMPLETED', 
          completedAt: new Date() 
        },
      })

      console.log(`✅ Job ${job.id} (${job.type}) completed`)
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
      isRunning: this.isRunning,
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

// Auto-start worker in server environment (only in production or when explicitly enabled)
if (typeof window === 'undefined') {
  // Only auto-start if AUTOPILOT_WORKER_AUTO_START is enabled
  const autoStart = process.env.AUTOPILOT_WORKER_AUTO_START === 'true'
  
  if (autoStart) {
    const worker = getAutomationWorker()
    worker.start().catch(console.error)
    console.log('✅ Automation Worker auto-started')
  } else {
    console.log('ℹ️ Automation Worker not auto-started (set AUTOPILOT_WORKER_AUTO_START=true to enable)')
  }
}

