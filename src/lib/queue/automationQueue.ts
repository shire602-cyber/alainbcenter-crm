/**
 * Automation Queue System
 * 
 * Uses BullMQ for async automation processing
 * Falls back to in-memory queue if Redis not available
 */

interface QueueJob {
  id: string
  type: 'autopilot_run' | 'followup_scheduled' | 'expiry_reminder'
  data: any
  priority?: number
  delay?: number // milliseconds
}

class InMemoryQueue {
  private jobs: QueueJob[] = []
  private processing = false

  async add(job: QueueJob): Promise<string> {
    this.jobs.push(job)
    this.jobs.sort((a, b) => (b.priority || 0) - (a.priority || 0))
    this.processQueue()
    return job.id
  }

  private async processQueue() {
    if (this.processing || this.jobs.length === 0) return

    this.processing = true
    const job = this.jobs.shift()
    if (!job) {
      this.processing = false
      return
    }

    try {
      // Execute job
      await this.executeJob(job)
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error)
    } finally {
      this.processing = false
      // Process next job
      setTimeout(() => this.processQueue(), 100)
    }
  }

  private async executeJob(job: QueueJob) {
    switch (job.type) {
      case 'autopilot_run':
        const { runAutopilot } = await import('../autopilot/runAutopilot')
        // Use dryRun from job data, default to false if not specified
        const dryRun = job.data?.dryRun ?? false
        await runAutopilot({ dryRun })
        break
      case 'followup_scheduled':
        // Handle scheduled follow-up
        break
      case 'expiry_reminder':
        // Handle expiry reminder
        break
    }
  }
}

// Try to use BullMQ if Redis is available, otherwise use in-memory queue
let queue: InMemoryQueue | any = null

async function initializeQueue() {
  const redisUrl = process.env.REDIS_URL
  if (redisUrl) {
    try {
      // Dynamic import to avoid requiring BullMQ if Redis not available
      const { Queue, Worker } = await import('bullmq')
      const connection = {
        host: new URL(redisUrl).hostname,
        port: parseInt(new URL(redisUrl).port) || 6379,
        password: new URL(redisUrl).password || undefined,
      }

      queue = new Queue('automation', { connection })
      
      // Create worker
      const worker = new Worker('automation', async (job) => {
        switch (job.name) {
          case 'autopilot_run':
            const { runAutopilot } = await import('../autopilot/runAutopilot')
            // Use dryRun from job data, default to false if not specified
            const dryRun = job.data?.dryRun ?? false
            return await runAutopilot({ dryRun })
          default:
            throw new Error(`Unknown job type: ${job.name}`)
        }
      }, { connection })

      console.log('✅ BullMQ queue initialized with Redis')
      return queue
    } catch (error) {
      console.warn('⚠️ Failed to initialize BullMQ, using in-memory queue:', error)
    }
  }

  // Fallback to in-memory queue
  queue = new InMemoryQueue()
  console.log('✅ Using in-memory queue (Redis not configured)')
  return queue
}

/**
 * Add automation job to queue
 */
export async function enqueueAutomation(
  type: 'autopilot_run' | 'followup_scheduled' | 'expiry_reminder',
  data: any,
  options: {
    priority?: number
    delay?: number
  } = {}
): Promise<string> {
  if (!queue) {
    queue = await initializeQueue()
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  
  if (queue.add) {
    // BullMQ
    await queue.add(type, data, {
      jobId,
      priority: options.priority || 0,
      delay: options.delay || 0,
    })
  } else {
    // In-memory
    await queue.add({
      id: jobId,
      type,
      data,
      priority: options.priority,
      delay: options.delay,
    })
  }

  return jobId
}

/**
 * Initialize queue on module load
 */
if (typeof window === 'undefined') {
  initializeQueue().catch(console.error)
}

