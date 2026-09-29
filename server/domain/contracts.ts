import { z } from 'zod'

export const TopicStatusSchema = z.enum(['draft', 'active', 'paused', 'archived'])
export const EventPhaseSchema = z.enum(['occurred', 'evolving', 'watch'])
export const ImpactSchema = z.enum(['high', 'medium', 'low'])
export const TriggerTypeSchema = z.enum([
  'initial',
  'refresh',
  'question',
  'scheduled',
])

export const CreateTopicSchema = z.object({
  title: z.string().trim().min(4).max(160),
  summary: z.string().trim().max(1200).default(''),
  region: z.string().trim().min(1).max(80).default('全球'),
  horizon: z.string().trim().min(1).max(80).default('1-3个月'),
  coreQuestion: z.string().trim().max(2000).optional(),
})

export const CreateAnalysisSchema = z.object({
  triggerType: TriggerTypeSchema.default('refresh'),
  question: z.string().trim().min(2).max(2000).optional(),
})

export const TimelineQuerySchema = z.object({
  phase: EventPhaseSchema.optional(),
  query: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
})

export const IngestEventSchema = z.object({
  phase: EventPhaseSchema,
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(4).max(300),
  summary: z.string().trim().min(10).max(3000),
  signal: z.string().trim().max(500).default(''),
  impact: ImpactSchema,
  confidence: z.number().int().min(0).max(100),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  occurredAt: z.iso.datetime(),
  source: z.object({
    canonicalUrl: z.url().optional(),
    publisher: z.string().trim().min(1).max(160),
    title: z.string().trim().min(1).max(500),
    publishedAt: z.iso.datetime().optional(),
    excerpt: z.string().trim().max(5000).default(''),
    language: z.string().trim().min(2).max(20).default('zh-CN'),
    credibilityScore: z.number().int().min(0).max(100).default(50),
    metadata: z.record(z.string(), z.unknown()).default({}),
  }),
})

export const TransmissionNodeSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(80),
  tone: z.enum(['red', 'amber', 'blue', 'green']),
  rationale: z.string().max(500).default(''),
})

export const ScenarioSchema = z.object({
  name: z.string().min(1).max(80),
  probability: z.number().int().min(0).max(100),
  tone: z.enum(['base', 'risk', 'ease']),
  narrative: z.string().min(1).max(1000),
  triggerCondition: z.string().max(500).default(''),
})

export const WatchIndicatorSchema = z.object({
  category: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  cadence: z.string().min(1).max(80),
  querySpec: z.record(z.string(), z.unknown()).default({}),
})

export const MarketImpactSchema = z.object({
  symbol: z.string().min(1).max(16),
  name: z.string().min(1).max(100),
  detail: z.string().min(1).max(300),
  direction: z.string().min(1).max(40),
})

export const AnalysisOutputSchema = z
  .object({
    summary: z.string().min(20).max(3000),
    confidence: z.number().int().min(0).max(100),
    counterSignal: z.string().min(5).max(1000),
    transmission: z.array(TransmissionNodeSchema).min(3).max(8),
    scenarios: z.array(ScenarioSchema).min(3).max(5),
    indicators: z.array(WatchIndicatorSchema).min(2).max(12),
    marketImpacts: z.array(MarketImpactSchema).min(1).max(12),
  })
  .superRefine((analysis, context) => {
    const probability = analysis.scenarios.reduce(
      (total, scenario) => total + scenario.probability,
      0,
    )

    if (probability !== 100) {
      context.addIssue({
        code: 'custom',
        path: ['scenarios'],
        message: 'Scenario probabilities must total 100',
      })
    }
  })

export type CreateTopicInput = z.infer<typeof CreateTopicSchema>
export type CreateAnalysisInput = z.infer<typeof CreateAnalysisSchema>
export type IngestEventInput = z.infer<typeof IngestEventSchema>
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>
export type EventPhase = z.infer<typeof EventPhaseSchema>

export interface AuthContext {
  workspaceId: string
  actorType: 'api_key' | 'system'
  actorId: string
  scopes: string[]
}

export interface TopicRecord {
  id: string
  slug: string
  title: string
  summary: string
  region: string
  horizon: string
  status: z.infer<typeof TopicStatusSchema>
  riskScore: number
  riskDelta: number
  marketPricing: string
  impactScope: string
  confidence: number
  updatedAt: string
}

export interface TimelineEventRecord {
  id: string
  phase: z.infer<typeof EventPhaseSchema>
  category: string
  title: string
  summary: string
  signal: string
  impact: z.infer<typeof ImpactSchema>
  confidence: number
  sourceLabel: string
  tags: string[]
  occurredAt: string
  sortOrder: number
}

export interface AnalysisRecord extends AnalysisOutput {
  id: string
  modelProvider: string
  modelName: string
  completedAt: string
}

export interface IndicatorRecord {
  id: string
  category: string
  title: string
  cadence: string
  status: 'pending' | 'confirmed' | 'invalidated' | 'paused'
  lastValue: string | null
  lastCheckedAt: string | null
  nextCheckAt: string | null
}

export interface TopicDetailRecord {
  topic: TopicRecord
  timeline: TimelineEventRecord[]
  analysis: AnalysisRecord | null
  indicators: IndicatorRecord[]
  sourceCount: number
}

export interface JobRecord {
  id: string
  workspaceId: string
  topicId: string
  status: 'queued' | 'running' | 'completed' | 'retrying' | 'failed'
  triggerType: z.infer<typeof TriggerTypeSchema>
  question: string | null
  attempts: number
  maxAttempts: number
  errorMessage: string | null
  queuedAt: string
  startedAt: string | null
  completedAt: string | null
}
