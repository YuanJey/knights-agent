import { Redis } from 'ioredis'
import type { AppConfig } from '../config.js'
import type { JobRecord } from '../domain/contracts.js'
import type { ResearchRepository } from '../repositories/researchRepository.js'
import type { AnalysisService } from '../services/analysisService.js'

export interface AnalysisQueue {
  enqueue(job: JobRecord): Promise<string>
  close(): Promise<void>
}

export class MemoryAnalysisQueue implements AnalysisQueue {
  private closed = false

  constructor(
    private readonly service: AnalysisService,
    private readonly repository: ResearchRepository,
  ) {}

  async enqueue(job: JobRecord) {
    const messageId = `memory-${job.id}`
    queueMicrotask(() => void this.run(job.id))
    return messageId
  }

  async close() {
    this.closed = true
  }

  private async run(jobId: string): Promise<void> {
    if (this.closed) return
    try {
      await this.service.process(jobId)
    } catch {
      const job = await this.repository.getJobForWorker(jobId)
      if (job?.status === 'retrying' && !this.closed) {
        const delay = Math.min(2000, 200 * 2 ** Math.max(0, job.attempts - 1))
        setTimeout(() => void this.run(jobId), delay)
      }
    }
  }
}

export class RedisAnalysisQueue implements AnalysisQueue {
  private readonly redis: Redis

  constructor(
    private readonly config: AppConfig,
    private readonly repository: ResearchRepository,
  ) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    })
  }

  async enqueue(job: JobRecord) {
    if (this.redis.status === 'wait') await this.redis.connect()
    const messageId = await this.redis.xadd(
      this.config.redisStreamKey,
      '*',
      'jobId',
      job.id,
      'workspaceId',
      job.workspaceId,
      'topicId',
      job.topicId,
      'triggerType',
      job.triggerType,
    )
    if (!messageId) throw new Error('Redis did not return a stream message id')
    await this.repository.setJobStreamId(job.id, messageId)
    return messageId
  }

  async close() {
    if (this.redis.status !== 'end') await this.redis.quit()
  }
}

export class RedisAnalysisWorker {
  private readonly redis: Redis
  private stopping = false

  constructor(
    private readonly config: AppConfig,
    private readonly service: AnalysisService,
    private readonly repository: ResearchRepository,
    private readonly consumerName: string,
  ) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: true,
    })
  }

  async start() {
    await this.redis.connect()
    await this.ensureGroup()
    await this.relayUnpublished()
    await this.recoverPending()

    while (!this.stopping) {
      const response = await this.redis.xreadgroup(
        'GROUP',
        this.config.redisConsumerGroup,
        this.consumerName,
        'COUNT',
        1,
        'BLOCK',
        5000,
        'STREAMS',
        this.config.redisStreamKey,
        '>',
      )
      const messages = parseReadGroupResponse(response)
      if (messages.length === 0) {
        await this.relayUnpublished()
        await this.recoverPending()
        continue
      }
      for (const message of messages) {
        await this.handle(message.id, message.jobId)
      }
    }
  }

  async stop() {
    this.stopping = true
    if (this.redis.status !== 'end') await this.redis.quit()
  }

  private async ensureGroup() {
    try {
      await this.redis.xgroup(
        'CREATE',
        this.config.redisStreamKey,
        this.config.redisConsumerGroup,
        '0',
        'MKSTREAM',
      )
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) {
        throw error
      }
    }
  }

  private async recoverPending() {
    const response = await this.redis.xautoclaim(
      this.config.redisStreamKey,
      this.config.redisConsumerGroup,
      this.consumerName,
      30_000,
      '0-0',
      'COUNT',
      20,
    )
    const claimed = parseAutoClaimResponse(response)
    for (const message of claimed) {
      await this.handle(message.id, message.jobId)
    }
  }

  private async relayUnpublished() {
    const jobs = await this.repository.listUnpublishedJobs(50)
    for (const job of jobs) {
      const messageId = await this.redis.xadd(
        this.config.redisStreamKey,
        '*',
        'jobId',
        job.id,
        'workspaceId',
        job.workspaceId,
        'topicId',
        job.topicId,
        'triggerType',
        job.triggerType,
      )
      if (messageId) {
        await this.repository.setJobStreamId(job.id, messageId)
      }
    }
  }

  private async handle(messageId: string, jobId: string) {
    try {
      await this.service.process(jobId)
      await this.redis.xack(
        this.config.redisStreamKey,
        this.config.redisConsumerGroup,
        messageId,
      )
    } catch {
      const job = await this.repository.getJobForWorker(jobId)
      if (job?.status === 'failed') {
        await this.redis.xadd(
          `${this.config.redisStreamKey}:dead-letter`,
          '*',
          'jobId',
          jobId,
          'sourceMessageId',
          messageId,
          'error',
          job.errorMessage ?? 'Unknown worker error',
        )
        await this.redis.xack(
          this.config.redisStreamKey,
          this.config.redisConsumerGroup,
          messageId,
        )
      }
    }
  }
}

interface StreamMessage {
  id: string
  jobId: string
}

function parseReadGroupResponse(response: unknown): StreamMessage[] {
  if (!Array.isArray(response)) return []
  const messages: StreamMessage[] = []
  for (const stream of response) {
    if (!Array.isArray(stream) || !Array.isArray(stream[1])) continue
    for (const item of stream[1]) {
      const parsed = parseStreamItem(item)
      if (parsed) messages.push(parsed)
    }
  }
  return messages
}

function parseAutoClaimResponse(response: unknown): StreamMessage[] {
  if (!Array.isArray(response) || !Array.isArray(response[1])) return []
  return response[1]
    .map(parseStreamItem)
    .filter((message): message is StreamMessage => message !== null)
}

function parseStreamItem(item: unknown): StreamMessage | null {
  if (!Array.isArray(item) || typeof item[0] !== 'string') return null
  const values = item[1]
  if (!Array.isArray(values)) return null
  const fields = new Map<string, string>()
  for (let index = 0; index < values.length; index += 2) {
    if (
      typeof values[index] === 'string' &&
      typeof values[index + 1] === 'string'
    ) {
      fields.set(values[index], values[index + 1])
    }
  }
  const jobId = fields.get('jobId')
  return jobId ? { id: item[0], jobId } : null
}
