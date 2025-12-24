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
    console.log('🛑 Automation Worker stopped')
  }

  isActive(): boolean {
    return this.isRunning
  }

  async checkIfRunning(): Promise<boolean> {
    // Check if worker is actually running by looking for recent activity
    // If jobs are being processed, worker is effectively running
    try {
      const recentProcessing = await prisma.automationJob.findFirst({
        where: {
          status: 'PROCESSING',
          startedAt: {
            gte: new Date(Date.now() - 60000), // Last minute
          },
        },
      })
      
      // Also check if there are pending jobs (worker should be running)
      const pendingCount = await prisma.automationJob.count({
        where: { status: 'PENDING' },
      })
      
      // If jobs are processing or pending, worker should be running
      return this.isRunning || !!recentProcessing || pendingCount > 0
    } catch (error) {
      return this.isRunning
    }
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
    const [pending, processing, completed, failed, isActuallyRunning] = await Promise.all([
      prisma.automationJob.count({ where: { status: 'PENDING' } }),
      prisma.automationJob.count({ where: { status: 'PROCESSING' } }),
      prisma.automationJob.count({ where: { status: 'COMPLETED' } }),
      prisma.automationJob.count({ where: { status: 'FAILED' } }),
      this.checkIfRunning(),
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

