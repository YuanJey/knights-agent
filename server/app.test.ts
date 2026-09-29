import { afterEach, describe, expect, it } from 'vitest'
import { createAnalysisProvider } from './agent/provider.js'
import { createApp } from './app.js'
import { loadConfig, type AppConfig } from './config.js'
import { MemoryAnalysisQueue } from './queue/analysisQueue.js'
import { MemoryResearchRepository } from './repositories/memoryResearchRepository.js'
import { AnalysisService } from './services/analysisService.js'

const apps: Awaited<ReturnType<typeof createApp>>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('Atlas Agent API', () => {
  it('reports liveness and readiness', async () => {
    const app = await buildApp()

    const health = await app.inject({ method: 'GET', url: '/healthz' })
    const ready = await app.inject({ method: 'GET', url: '/readyz' })

    expect(health.statusCode).toBe(200)
    expect(health.json()).toMatchObject({
      status: 'ok',
      service: 'atlas-agent-api',
    })
    expect(ready.statusCode).toBe(200)
    expect(ready.json()).toMatchObject({
      status: 'ready',
      dataMode: 'memory',
      queueMode: 'memory',
    })
  })

  it('returns the featured topic with timeline and analysis', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/topics/featured',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      data: {
        topic: { title: '霍尔木兹海峡通行风险', riskScore: 78 },
        analysis: { confidence: 88 },
        sourceCount: 42,
      },
    })
    expect(response.json().data.timeline).toHaveLength(7)
  })

  it('creates a topic and completes its initial analysis job', async () => {
    const app = await buildApp()

    const creation = await app.inject({
      method: 'POST',
      url: '/api/v1/topics',
      payload: {
        title: '欧洲财政扩张与欧元资产',
        summary: '评估财政乘数、通胀和利率路径。',
        region: '欧洲',
        horizon: '1-3个月',
        coreQuestion: '哪些资产会最先反映财政扩张？',
      },
    })

    expect(creation.statusCode).toBe(202)
    const { topic, job } = creation.json().data
    expect(topic.title).toBe('欧洲财政扩张与欧元资产')

    const completedJob = await waitForCompletedJob(app, job.id)
    expect(completedJob.status).toBe('completed')

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/topics/${topic.id}`,
    })
    expect(detail.statusCode).toBe(200)
    expect(detail.json().data.analysis).toMatchObject({
      modelProvider: 'local',
      modelName: 'deterministic-heuristic-v1',
    })
    expect(detail.json().data.indicators).toHaveLength(4)
  })

  it('ingests an evidence-backed event and schedules a refresh', async () => {
    const app = await buildApp()
    const topicId = '10000000-0000-0000-0000-000000000001'

    const ingestion = await app.inject({
      method: 'POST',
      url: `/api/v1/topics/${topicId}/events`,
      payload: {
        phase: 'evolving',
        category: '政策',
        title: '区域各方公布新的通行保障安排',
        summary: '公开执行时间表为市场提供了可验证的局势降温信号。',
        signal: '保障机制进入执行阶段',
        impact: 'medium',
        confidence: 82,
        tags: ['政策', '航运'],
        occurredAt: '2026-09-29T10:30:00.000Z',
        source: {
          canonicalUrl: 'https://example.com/primary-source',
          publisher: '官方公告',
          title: '通行保障安排',
          publishedAt: '2026-09-29T10:00:00.000Z',
          excerpt: '各方将从即日起执行新的通行保障安排。',
          credibilityScore: 95,
        },
      },
    })

    expect(ingestion.statusCode).toBe(202)
    expect(ingestion.json().data.event).toMatchObject({
      phase: 'evolving',
      sourceLabel: '官方公告 · 1条信源',
    })

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/topics/${topicId}`,
    })
    expect(detail.json().data.timeline).toHaveLength(8)
    expect(detail.json().data.sourceCount).toBe(43)
  })

  it('rejects invalid requests with structured details', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/topics',
      payload: { title: '短' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
      },
    })
  })

  it('enforces API key authentication when enabled', async () => {
    const app = await buildApp({ authMode: 'enabled' })

    const rejected = await app.inject({
      method: 'GET',
      url: '/api/v1/topics/featured',
    })
    const accepted = await app.inject({
      method: 'GET',
      url: '/api/v1/topics/featured',
      headers: { 'x-api-key': 'dev-atlas-local-key' },
    })

    expect(rejected.statusCode).toBe(401)
    expect(accepted.statusCode).toBe(200)
  })
})

async function buildApp(overrides: Partial<AppConfig> = {}) {
  const config = {
    ...loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATA_MODE: 'memory',
      QUEUE_MODE: 'memory',
      AUTH_MODE: 'disabled',
      LLM_MODE: 'heuristic',
    }),
    ...overrides,
  }
  const repository = new MemoryResearchRepository()
  const provider = createAnalysisProvider(config)
  const service = new AnalysisService(repository, provider)
  const queue = new MemoryAnalysisQueue(service, repository)
  const app = await createApp({ config, repository, queue })
  apps.push(app)
  return app
}

async function waitForCompletedJob(
  app: Awaited<ReturnType<typeof createApp>>,
  jobId: string,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/jobs/${jobId}`,
    })
    const job = response.json().data
    if (job.status === 'completed' || job.status === 'failed') return job
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Timed out waiting for analysis job')
}
