import { createHash, randomUUID } from 'node:crypto'
import type { Pool, QueryResultRow } from 'pg'
import type {
  AnalysisRecord,
  CreateTopicInput,
  IndicatorRecord,
  IngestEventInput,
  JobRecord,
  TimelineEventRecord,
  TopicDetailRecord,
  TopicRecord,
} from '../domain/contracts.js'
import { withTransaction } from '../db/pool.js'
import type {
  AnalysisCompletion,
  ApiKeyIdentity,
  AuditEntry,
  ResearchRepository,
} from './researchRepository.js'

interface TopicRow extends QueryResultRow {
  id: string
  slug: string
  title: string
  summary: string
  region: string
  horizon: string
  status: TopicRecord['status']
  risk_score: number
  risk_delta: number
  market_pricing: string
  impact_scope: string
  confidence: number
  updated_at: Date
}

interface EventRow extends QueryResultRow {
  id: string
  phase: TimelineEventRecord['phase']
  category: string
  title: string
  summary: string
  signal: string
  impact: TimelineEventRecord['impact']
  confidence: number
  source_label: string
  tags: string[]
  occurred_at: Date
  sort_order: number
}

interface AnalysisRow extends QueryResultRow {
  id: string
  summary: string
  confidence: number
  counter_signal: string
  raw_output: { marketImpacts?: AnalysisRecord['marketImpacts'] } | null
  model_provider: string
  model_name: string
  completed_at: Date
}

interface TransmissionRow extends QueryResultRow {
  label: string
  value: string
  tone: AnalysisRecord['transmission'][number]['tone']
  rationale: string
}

interface ScenarioRow extends QueryResultRow {
  name: string
  probability: number
  tone: AnalysisRecord['scenarios'][number]['tone']
  narrative: string
  trigger_condition: string
}

interface IndicatorRow extends QueryResultRow {
  id: string
  category: string
  title: string
  cadence: string
  status: IndicatorRecord['status']
  last_value: string | null
  last_checked_at: Date | null
  next_check_at: Date | null
}

interface JobRow extends QueryResultRow {
  id: string
  workspace_id: string
  topic_id: string
  status: JobRecord['status']
  trigger_type: JobRecord['triggerType']
  question: string | null
  attempts: number
  max_attempts: number
  error_message: string | null
  queued_at: Date
  started_at: Date | null
  completed_at: Date | null
}

export class PostgresResearchRepository implements ResearchRepository {
  constructor(private readonly pool: Pool) {}

  async ping() {
    await this.pool.query('SELECT 1')
  }

  async close() {
    await this.pool.end()
  }

  async findApiKey(keyHash: string): Promise<ApiKeyIdentity | null> {
    const result = await this.pool.query<{
      id: string
      workspace_id: string
      scopes: string[]
    }>(
      `
        UPDATE api_keys
        SET last_used_at = now()
        WHERE key_hash = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())
        RETURNING id, workspace_id, scopes
      `,
      [keyHash],
    )
    const row = result.rows[0]
    return row
      ? {
          id: row.id,
          workspaceId: row.workspace_id,
          scopes: row.scopes,
        }
      : null
  }

  async listTopics(workspaceId: string) {
    const result = await this.pool.query<TopicRow>(
      `
        SELECT id, slug, title, summary, region, horizon, status,
               risk_score, risk_delta, market_pricing, impact_scope,
               confidence, updated_at
        FROM research_topics
        WHERE workspace_id = $1 AND status <> 'archived'
        ORDER BY updated_at DESC
      `,
      [workspaceId],
    )
    return result.rows.map(mapTopic)
  }

  async getFeaturedTopic(workspaceId: string) {
    const result = await this.pool.query<{ id: string }>(
      `
        SELECT id
        FROM research_topics
        WHERE workspace_id = $1 AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [workspaceId],
    )
    return result.rows[0]
      ? this.getTopicDetail(workspaceId, result.rows[0].id)
      : null
  }

  async getTopicDetail(
    workspaceId: string,
    topicId: string,
  ): Promise<TopicDetailRecord | null> {
    const topicResult = await this.pool.query<TopicRow>(
      `
        SELECT id, slug, title, summary, region, horizon, status,
               risk_score, risk_delta, market_pricing, impact_scope,
               confidence, updated_at
        FROM research_topics
        WHERE workspace_id = $1 AND id = $2
      `,
      [workspaceId, topicId],
    )
    const topicRow = topicResult.rows[0]
    if (!topicRow) return null

    const [eventResult, analysisResult, indicatorResult, sourceResult] =
      await Promise.all([
        this.pool.query<EventRow>(
          `
            SELECT id, phase, category, title, summary, signal, impact,
                   confidence, source_label, tags,
                   COALESCE(observed_at, expected_at) AS occurred_at,
                   sort_order
            FROM timeline_events
            WHERE workspace_id = $1 AND topic_id = $2
            ORDER BY sort_order, COALESCE(observed_at, expected_at)
          `,
          [workspaceId, topicId],
        ),
        this.pool.query<AnalysisRow>(
          `
            SELECT id, summary, confidence, counter_signal, raw_output,
                   model_provider, model_name, completed_at
            FROM analysis_runs
            WHERE workspace_id = $1
              AND topic_id = $2
              AND status = 'completed'
            ORDER BY completed_at DESC
            LIMIT 1
          `,
          [workspaceId, topicId],
        ),
        this.pool.query<IndicatorRow>(
          `
            SELECT id, category, title, cadence, status, last_value,
                   last_checked_at, next_check_at
            FROM watch_indicators
            WHERE workspace_id = $1
              AND topic_id = $2
              AND status <> 'paused'
            ORDER BY created_at DESC, category
            LIMIT 24
          `,
          [workspaceId, topicId],
        ),
        this.pool.query<{ count: string }>(
          `
            SELECT COUNT(DISTINCT es.source_id)::text AS count
            FROM timeline_events e
            JOIN event_sources es ON es.event_id = e.id
            WHERE e.workspace_id = $1 AND e.topic_id = $2
          `,
          [workspaceId, topicId],
        ),
      ])

    const latestAnalysis = analysisResult.rows[0]
    let analysis: AnalysisRecord | null = null

    if (latestAnalysis) {
      const [transmissionResult, scenarioResult] = await Promise.all([
        this.pool.query<TransmissionRow>(
          `
            SELECT label, value, tone, rationale
            FROM transmission_nodes
            WHERE analysis_id = $1
            ORDER BY position
          `,
          [latestAnalysis.id],
        ),
        this.pool.query<ScenarioRow>(
          `
            SELECT name, probability, tone, narrative, trigger_condition
            FROM scenarios
            WHERE analysis_id = $1
            ORDER BY probability DESC
          `,
          [latestAnalysis.id],
        ),
      ])

      analysis = {
        id: latestAnalysis.id,
        summary: latestAnalysis.summary,
        confidence: latestAnalysis.confidence,
        counterSignal: latestAnalysis.counter_signal,
        transmission: transmissionResult.rows,
        scenarios: scenarioResult.rows.map((scenario) => ({
          name: scenario.name,
          probability: scenario.probability,
          tone: scenario.tone,
          narrative: scenario.narrative,
          triggerCondition: scenario.trigger_condition,
        })),
        indicators: [],
        marketImpacts: latestAnalysis.raw_output?.marketImpacts ?? [],
        modelProvider: latestAnalysis.model_provider,
        modelName: latestAnalysis.model_name,
        completedAt: latestAnalysis.completed_at.toISOString(),
      }
    }

    return {
      topic: mapTopic(topicRow),
      timeline: eventResult.rows.map(mapEvent),
      analysis,
      indicators: indicatorResult.rows.map(mapIndicator),
      sourceCount: Number(sourceResult.rows[0]?.count ?? 0),
    }
  }

  async createTopic(
    workspaceId: string,
    input: CreateTopicInput,
    actorId: string,
  ) {
    const suffix = randomUUID().slice(0, 8)
    const slug = `${slugify(input.title)}-${suffix}`
    const result = await this.pool.query<TopicRow>(
      `
        INSERT INTO research_topics (
          workspace_id, slug, title, summary, region, horizon, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, slug, title, summary, region, horizon, status,
                  risk_score, risk_delta, market_pricing, impact_scope,
                  confidence, updated_at
      `,
      [
        workspaceId,
        slug,
        input.title,
        input.summary || input.coreQuestion || '',
        input.region,
        input.horizon,
        actorId,
      ],
    )
    const topic = result.rows[0]
    if (!topic) throw new Error('Topic insert did not return a row')
    return mapTopic(topic)
  }

  async ingestEvent(
    workspaceId: string,
    topicId: string,
    input: IngestEventInput,
    actorId: string,
  ) {
    const client = await this.pool.connect()
    try {
      return await withTransaction(client, async () => {
        const contentHash = createHash('sha256')
          .update(
            JSON.stringify([
              input.source.canonicalUrl ?? '',
              input.source.publisher,
              input.source.title,
              input.source.excerpt,
            ]),
          )
          .digest('hex')
        const eventFingerprint = createHash('sha256')
          .update(
            JSON.stringify([
              topicId,
              input.title,
              input.occurredAt,
              contentHash,
            ]),
          )
          .digest('hex')
        const sourceResult = await client.query<{ id: string }>(
          `
            INSERT INTO source_documents (
              workspace_id, canonical_url, publisher, title, published_at,
              content_hash, excerpt, language, credibility_score, metadata
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (workspace_id, content_hash)
            DO UPDATE SET
              canonical_url = COALESCE(
                EXCLUDED.canonical_url,
                source_documents.canonical_url
              ),
              metadata = source_documents.metadata || EXCLUDED.metadata
            RETURNING id
          `,
          [
            workspaceId,
            input.source.canonicalUrl ?? null,
            input.source.publisher,
            input.source.title,
            input.source.publishedAt ?? null,
            contentHash,
            input.source.excerpt,
            input.source.language,
            input.source.credibilityScore,
            input.source.metadata,
          ],
        )
        const sourceId = sourceResult.rows[0]?.id
        if (!sourceId) throw new Error('Source insert did not return a row')

        const timestamp = input.occurredAt
        const eventResult = await client.query<EventRow>(
          `
            INSERT INTO timeline_events (
              workspace_id, topic_id, phase, category, title, summary,
              signal, impact, confidence, source_label, tags,
              fingerprint, observed_at, expected_at, sort_order, created_by
            )
            SELECT $1, id, $3, $4, $5, $6, $7, $8, $9, $10, $11,
                   $12,
                   CASE WHEN $3 = 'watch' THEN NULL ELSE $13::timestamptz END,
                   CASE WHEN $3 = 'watch' THEN $13::timestamptz ELSE NULL END,
                   COALESCE(
                     (
                       SELECT MAX(sort_order) + 10
                       FROM timeline_events
                       WHERE workspace_id = $1 AND topic_id = $2
                     ),
                     10
                   ),
                   $14
            FROM research_topics
            WHERE workspace_id = $1 AND id = $2
            ON CONFLICT (workspace_id, topic_id, fingerprint)
              WHERE fingerprint IS NOT NULL
            DO UPDATE SET updated_at = now()
            RETURNING id, phase, category, title, summary, signal, impact,
                      confidence, source_label, tags,
                      COALESCE(observed_at, expected_at) AS occurred_at,
                      sort_order
          `,
          [
            workspaceId,
            topicId,
            input.phase,
            input.category,
            input.title,
            input.summary,
            input.signal,
            input.impact,
            input.confidence,
            `${input.source.publisher} · 1条信源`,
            input.tags,
            eventFingerprint,
            timestamp,
            actorId,
          ],
        )
        const timelineEvent = eventResult.rows[0]
        if (!timelineEvent) throw new Error('Topic not found')

        await client.query(
          `
            INSERT INTO event_sources (event_id, source_id, relevance_score)
            VALUES ($1, $2, 1)
            ON CONFLICT (event_id, source_id) DO NOTHING
          `,
          [timelineEvent.id, sourceId],
        )
        return mapEvent(timelineEvent)
      })
    } finally {
      client.release()
    }
  }

  async createJob(
    workspaceId: string,
    topicId: string,
    triggerType: JobRecord['triggerType'],
    question?: string,
  ) {
    const result = await this.pool.query<JobRow>(
      `
        INSERT INTO analysis_jobs (
          workspace_id, topic_id, trigger_type, question
        )
        SELECT $1, id, $3, $4
        FROM research_topics
        WHERE workspace_id = $1 AND id = $2
        RETURNING id, workspace_id, topic_id, status, trigger_type, question, attempts,
                  max_attempts, error_message, queued_at, started_at, completed_at
      `,
      [workspaceId, topicId, triggerType, question ?? null],
    )
    if (!result.rows[0]) throw new Error('Topic not found')
    return mapJob(result.rows[0])
  }

  async setJobStreamId(jobId: string, streamMessageId: string) {
    await this.pool.query(
      'UPDATE analysis_jobs SET stream_message_id = $2 WHERE id = $1',
      [jobId, streamMessageId],
    )
  }

  async listUnpublishedJobs(limit: number) {
    const result = await this.pool.query<JobRow>(
      `
        SELECT id, workspace_id, topic_id, status, trigger_type, question,
               attempts, max_attempts, error_message, queued_at, started_at,
               completed_at
        FROM analysis_jobs
        WHERE status = 'queued' AND stream_message_id IS NULL
        ORDER BY queued_at
        LIMIT $1
      `,
      [limit],
    )
    return result.rows.map(mapJob)
  }

  async getJob(workspaceId: string, jobId: string) {
    const result = await this.pool.query<JobRow>(
      `
        SELECT id, workspace_id, topic_id, status, trigger_type, question, attempts,
               max_attempts, error_message, queued_at, started_at, completed_at
        FROM analysis_jobs
        WHERE workspace_id = $1 AND id = $2
      `,
      [workspaceId, jobId],
    )
    return result.rows[0] ? mapJob(result.rows[0]) : null
  }

  async getJobForWorker(jobId: string) {
    const result = await this.pool.query<JobRow>(
      `
        SELECT id, workspace_id, topic_id, status, trigger_type, question, attempts,
               max_attempts, error_message, queued_at, started_at, completed_at
        FROM analysis_jobs
        WHERE id = $1
      `,
      [jobId],
    )
    return result.rows[0] ? mapJob(result.rows[0]) : null
  }

  async markJobRunning(jobId: string) {
    const result = await this.pool.query(
      `
        UPDATE analysis_jobs
        SET status = 'running',
            attempts = attempts + 1,
            started_at = now(),
            error_message = NULL
        WHERE id = $1 AND status IN ('queued', 'retrying')
      `,
      [jobId],
    )
    return (result.rowCount ?? 0) > 0
  }

  async completeAnalysis(
    job: JobRecord,
    completion: AnalysisCompletion,
  ) {
    const client = await this.pool.connect()
    try {
      await withTransaction(client, async () => {
        const analysisResult = await client.query<{ id: string }>(
          `
            INSERT INTO analysis_runs (
              workspace_id, topic_id, trigger_type, status,
              model_provider, model_name, prompt_version, input_snapshot,
              summary, confidence, counter_signal, raw_output, token_usage,
              completed_at
            )
            SELECT workspace_id, topic_id, trigger_type, 'completed',
                   $2, $3, $4, $5, $6, $7, $8, $9, $10, now()
            FROM analysis_jobs
            WHERE id = $1
            RETURNING id
          `,
          [
            job.id,
            completion.provider,
            completion.model,
            completion.promptVersion,
            completion.inputSnapshot,
            completion.output.summary,
            completion.output.confidence,
            completion.output.counterSignal,
            { marketImpacts: completion.output.marketImpacts },
            completion.tokenUsage ?? {},
          ],
        )
        const analysisId = analysisResult.rows[0]?.id
        if (!analysisId) throw new Error('Analysis job no longer exists')

        for (const [position, node] of completion.output.transmission.entries()) {
          await client.query(
            `
              INSERT INTO transmission_nodes (
                analysis_id, position, label, value, tone, rationale
              )
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              analysisId,
              position,
              node.label,
              node.value,
              node.tone,
              node.rationale,
            ],
          )
        }

        for (const scenario of completion.output.scenarios) {
          await client.query(
            `
              INSERT INTO scenarios (
                analysis_id, name, probability, tone, narrative,
                trigger_condition
              )
              VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
              analysisId,
              scenario.name,
              scenario.probability,
              scenario.tone,
              scenario.narrative,
              scenario.triggerCondition,
            ],
          )
        }

        await client.query(
          `
            UPDATE watch_indicators
            SET status = 'paused'
            WHERE topic_id = $1 AND status = 'pending'
          `,
          [job.topicId],
        )

        for (const indicator of completion.output.indicators) {
          await client.query(
            `
              INSERT INTO watch_indicators (
                workspace_id, topic_id, analysis_id, category, title,
                cadence, query_spec
              )
              SELECT workspace_id, topic_id, $2, $3, $4, $5, $6
              FROM analysis_jobs
              WHERE id = $1
            `,
            [
              job.id,
              analysisId,
              indicator.category,
              indicator.title,
              indicator.cadence,
              indicator.querySpec,
            ],
          )
        }

        await client.query(
          `
            UPDATE research_topics
            SET confidence = $2,
                market_pricing = '分析已更新',
                updated_at = now()
            WHERE id = $1
          `,
          [job.topicId, completion.output.confidence],
        )

        await client.query(
          `
            UPDATE analysis_jobs
            SET status = 'completed',
                completed_at = now(),
                error_message = NULL
            WHERE id = $1
          `,
          [job.id],
        )
      })
    } finally {
      client.release()
    }
  }

  async failJob(jobId: string, message: string) {
    const result = await this.pool.query<{ status: 'retrying' | 'failed' }>(
      `
        UPDATE analysis_jobs
        SET status = CASE
              WHEN attempts >= max_attempts THEN 'failed'
              ELSE 'retrying'
            END,
            error_message = $2
        WHERE id = $1
        RETURNING status
      `,
      [jobId, message.slice(0, 2000)],
    )
    if (!result.rows[0]) throw new Error('Job not found')
    return result.rows[0].status
  }

  async recordAudit(entry: AuditEntry) {
    await this.pool.query(
      `
        INSERT INTO audit_logs (
          workspace_id, actor_type, actor_id, action, resource_type,
          resource_id, request_id, ip_address, payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        entry.workspaceId,
        entry.actorType,
        entry.actorId,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        entry.requestId ?? null,
        entry.ipAddress ?? null,
        entry.payload ?? {},
      ],
    )
  }
}

function mapTopic(row: TopicRow): TopicRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    region: row.region,
    horizon: row.horizon,
    status: row.status,
    riskScore: row.risk_score,
    riskDelta: row.risk_delta,
    marketPricing: row.market_pricing,
    impactScope: row.impact_scope,
    confidence: row.confidence,
    updatedAt: row.updated_at.toISOString(),
  }
}

function mapEvent(row: EventRow): TimelineEventRecord {
  return {
    id: row.id,
    phase: row.phase,
    category: row.category,
    title: row.title,
    summary: row.summary,
    signal: row.signal,
    impact: row.impact,
    confidence: row.confidence,
    sourceLabel: row.source_label,
    tags: row.tags,
    occurredAt: row.occurred_at.toISOString(),
    sortOrder: row.sort_order,
  }
}

function mapIndicator(row: IndicatorRow): IndicatorRecord {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    cadence: row.cadence,
    status: row.status,
    lastValue: row.last_value,
    lastCheckedAt: row.last_checked_at?.toISOString() ?? null,
    nextCheckAt: row.next_check_at?.toISOString() ?? null,
  }
}

function mapJob(row: JobRow): JobRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    topicId: row.topic_id,
    status: row.status,
    triggerType: row.trigger_type,
    question: row.question,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    errorMessage: row.error_message,
    queuedAt: row.queued_at.toISOString(),
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
  }
}

function slugify(value: string) {
  return (
    value
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
      .replace(/^-|-$/g, '') || 'topic'
  )
}
