import { createHash, randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify'
import { ZodError, z } from 'zod'
import type { AppConfig } from './config.js'
import {
  CreateAnalysisSchema,
  CreateTopicSchema,
  IngestEventSchema,
  type AuthContext,
} from './domain/contracts.js'
import type { AnalysisQueue } from './queue/analysisQueue.js'
import type { ResearchRepository } from './repositories/researchRepository.js'

interface AppDependencies {
  config: AppConfig
  repository: ResearchRepository
  queue: AnalysisQueue
}

const IdParamsSchema = z.object({
  id: z
    .string()
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      'Invalid UUID',
    ),
})

export async function createApp({
  config,
  repository,
  queue,
}: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.x-api-key',
          '*.apiKey',
          '*.token',
        ],
        censor: '[REDACTED]',
      },
    },
    trustProxy: true,
    bodyLimit: 1_048_576,
    requestIdHeader: 'x-request-id',
    genReqId: (request) =>
      typeof request.headers['x-request-id'] === 'string'
        ? request.headers['x-request-id'].slice(0, 128)
        : randomUUID(),
  })

  await app.register(helmet)
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin || config.corsOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(new Error('Origin is not allowed'), false)
    },
    credentials: false,
  })
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: (request) => request.url.startsWith('/health'),
  })

  app.decorateRequest('auth', null as unknown as AuthContext)

  app.addHook('onRequest', async (request, reply) => {
    if (
      !request.url.startsWith('/api/v1') ||
      request.method === 'OPTIONS'
    ) {
      return
    }

    const auth = await authenticate(request, config, repository)
    if (!auth) {
      await reply.code(401).send({
        error: {
          code: 'UNAUTHORIZED',
          message: 'A valid API key is required',
          requestId: request.id,
        },
      })
      return reply
    }
    request.auth = auth
  })

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'atlas-agent-api',
    timestamp: new Date().toISOString(),
  }))

  app.get('/readyz', async (_request, reply) => {
    try {
      await repository.ping()
      return {
        status: 'ready',
        dataMode: config.dataMode,
        queueMode: config.queueMode,
      }
    } catch {
      return reply.code(503).send({
        status: 'not-ready',
        dependency: 'database',
      })
    }
  })

  app.get('/api/v1/topics', async (request) => {
    requireScope(request, 'research:read')
    return {
      data: await repository.listTopics(request.auth.workspaceId),
      meta: { requestId: request.id },
    }
  })

  app.get('/api/v1/topics/featured', async (request, reply) => {
    requireScope(request, 'research:read')
    const detail = await repository.getFeaturedTopic(request.auth.workspaceId)
    if (!detail) return notFound(reply, request.id, 'Featured topic not found')
    return { data: detail, meta: { requestId: request.id } }
  })

  app.get('/api/v1/topics/:id', async (request, reply) => {
    requireScope(request, 'research:read')
    const { id } = IdParamsSchema.parse(request.params)
    const detail = await repository.getTopicDetail(
      request.auth.workspaceId,
      id,
    )
    if (!detail) return notFound(reply, request.id, 'Topic not found')
    return { data: detail, meta: { requestId: request.id } }
  })

  app.post('/api/v1/topics', async (request, reply) => {
    requireScope(request, 'research:write')
    const input = CreateTopicSchema.parse(request.body)
    const topic = await repository.createTopic(
      request.auth.workspaceId,
      input,
      request.auth.actorId,
    )
    const job = await repository.createJob(
      request.auth.workspaceId,
      topic.id,
      'initial',
      input.coreQuestion,
    )
    await queue.enqueue(job)
    await auditWrite(request, repository, 'topic.created', 'topic', topic.id, {
      jobId: job.id,
    })

    return reply.code(202).send({
      data: { topic, job },
      meta: { requestId: request.id },
    })
  })

  app.post('/api/v1/topics/:id/events', async (request, reply) => {
    requireScope(request, 'research:write')
    const { id } = IdParamsSchema.parse(request.params)
    const input = IngestEventSchema.parse(request.body)
    const timelineEvent = await repository.ingestEvent(
      request.auth.workspaceId,
      id,
      input,
      request.auth.actorId,
    )
    const job = await repository.createJob(
      request.auth.workspaceId,
      id,
      'refresh',
    )
    await queue.enqueue(job)
    await auditWrite(
      request,
      repository,
      'event.ingested',
      'timeline_event',
      timelineEvent.id,
      { topicId: id, jobId: job.id },
    )
    return reply.code(202).send({
      data: { event: timelineEvent, job },
      meta: { requestId: request.id },
    })
  })

  app.post('/api/v1/topics/:id/analyses', async (request, reply) => {
    requireScope(request, 'research:write')
    const { id } = IdParamsSchema.parse(request.params)
    const input = CreateAnalysisSchema.parse(request.body ?? {})
    const job = await repository.createJob(
      request.auth.workspaceId,
      id,
      input.triggerType,
      input.question,
    )
    await queue.enqueue(job)
    await auditWrite(
      request,
      repository,
      'analysis.queued',
      'analysis_job',
      job.id,
      { topicId: id, triggerType: input.triggerType },
    )
    return reply.code(202).send({
      data: job,
      meta: { requestId: request.id },
    })
  })

  app.post('/api/v1/topics/:id/questions', async (request, reply) => {
    requireScope(request, 'research:write')
    const { id } = IdParamsSchema.parse(request.params)
    const { question } = z
      .object({ question: z.string().trim().min(2).max(2000) })
      .parse(request.body)
    const job = await repository.createJob(
      request.auth.workspaceId,
      id,
      'question',
      question,
    )
    await queue.enqueue(job)
    await auditWrite(
      request,
      repository,
      'question.queued',
      'analysis_job',
      job.id,
      { topicId: id },
    )
    return reply.code(202).send({
      data: job,
      meta: { requestId: request.id },
    })
  })

  app.get('/api/v1/jobs/:id', async (request, reply) => {
    requireScope(request, 'research:read')
    const { id } = IdParamsSchema.parse(request.params)
    const job = await repository.getJob(request.auth.workspaceId, id)
    if (!job) return notFound(reply, request.id, 'Job not found')
    return { data: job, meta: { requestId: request.id } }
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          requestId: request.id,
        },
      })
    }

    if (error instanceof ScopeError) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: error.message,
          requestId: request.id,
        },
      })
    }

    request.log.error({ err: error }, 'request failed')
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          config.nodeEnv === 'production'
            ? 'The request could not be completed'
            : error instanceof Error
              ? error.message
              : String(error),
        requestId: request.id,
      },
    })
  })

  app.addHook('onClose', async () => {
    await Promise.all([queue.close(), repository.close()])
  })

  return app
}

async function authenticate(
  request: FastifyRequest,
  config: AppConfig,
  repository: ResearchRepository,
): Promise<AuthContext | null> {
  if (config.authMode === 'disabled') {
    return {
      workspaceId: config.devWorkspaceId,
      actorType: 'system',
      actorId: 'local-development',
      scopes: ['research:read', 'research:write'],
    }
  }

  const authorization = request.headers.authorization
  const directKey = request.headers['x-api-key']
  const apiKey =
    typeof directKey === 'string'
      ? directKey
      : authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : null
  if (!apiKey || apiKey.length < 16) return null

  const identity = await repository.findApiKey(
    createHash('sha256').update(apiKey).digest('hex'),
  )
  return identity
    ? {
        workspaceId: identity.workspaceId,
        actorType: 'api_key',
        actorId: identity.id,
        scopes: identity.scopes,
      }
    : null
}

function requireScope(request: FastifyRequest, scope: string) {
  if (!request.auth.scopes.includes(scope)) {
    throw new ScopeError(`Missing required scope: ${scope}`)
  }
}

async function auditWrite(
  request: FastifyRequest,
  repository: ResearchRepository,
  action: string,
  resourceType: string,
  resourceId: string,
  payload: Record<string, unknown>,
) {
  await repository.recordAudit({
    workspaceId: request.auth.workspaceId,
    actorType: request.auth.actorType,
    actorId: request.auth.actorId,
    action,
    resourceType,
    resourceId,
    requestId: request.id,
    ipAddress: request.ip,
    payload,
  })
}

function notFound(reply: FastifyReply, requestId: string, message: string) {
  return reply.code(404).send({
    error: { code: 'NOT_FOUND', message, requestId },
  })
}

class ScopeError extends Error {}
