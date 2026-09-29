export type ApiEventPhase = 'occurred' | 'evolving' | 'watch'
export type ApiImpact = 'high' | 'medium' | 'low'

export interface ApiTopic {
  id: string
  slug: string
  title: string
  summary: string
  region: string
  horizon: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  riskScore: number
  riskDelta: number
  marketPricing: string
  impactScope: string
  confidence: number
  updatedAt: string
}

export interface ApiTimelineEvent {
  id: string
  phase: ApiEventPhase
  category: string
  title: string
  summary: string
  signal: string
  impact: ApiImpact
  confidence: number
  sourceLabel: string
  tags: string[]
  occurredAt: string
  sortOrder: number
}

export interface ApiAnalysis {
  id: string
  summary: string
  confidence: number
  counterSignal: string
  transmission: Array<{
    label: string
    value: string
    tone: 'red' | 'amber' | 'blue' | 'green'
    rationale: string
  }>
  scenarios: Array<{
    name: string
    probability: number
    tone: 'base' | 'risk' | 'ease'
    narrative: string
    triggerCondition: string
  }>
  indicators: unknown[]
  marketImpacts: Array<{
    symbol: string
    name: string
    detail: string
    direction: string
  }>
  modelProvider: string
  modelName: string
  completedAt: string
}

export interface ApiIndicator {
  id: string
  category: string
  title: string
  cadence: string
  status: 'pending' | 'confirmed' | 'invalidated' | 'paused'
  lastValue: string | null
  lastCheckedAt: string | null
  nextCheckAt: string | null
}

export interface ApiTopicDetail {
  topic: ApiTopic
  timeline: ApiTimelineEvent[]
  analysis: ApiAnalysis | null
  indicators: ApiIndicator[]
  sourceCount: number
}

export interface ApiJob {
  id: string
  workspaceId: string
  topicId: string
  status: 'queued' | 'running' | 'completed' | 'retrying' | 'failed'
  triggerType: 'initial' | 'refresh' | 'question' | 'scheduled'
  errorMessage: string | null
}

interface ApiEnvelope<T> {
  data: T
  meta: { requestId: string }
}

interface CreateTopicInput {
  title: string
  summary: string
  region: string
  horizon: string
  coreQuestion?: string
}

const apiKey = import.meta.env.VITE_API_KEY as string | undefined

export async function getFeaturedTopic(signal?: AbortSignal) {
  return request<ApiTopicDetail>('/api/v1/topics/featured', { signal })
}

export async function getTopic(topicId: string, signal?: AbortSignal) {
  return request<ApiTopicDetail>(`/api/v1/topics/${topicId}`, { signal })
}

export async function createTopic(input: CreateTopicInput) {
  return request<{ topic: ApiTopic; job: ApiJob }>('/api/v1/topics', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function askQuestion(topicId: string, question: string) {
  return request<ApiJob>(`/api/v1/topics/${topicId}/questions`, {
    method: 'POST',
    body: JSON.stringify({ question }),
  })
}

export async function getJob(jobId: string) {
  return request<ApiJob>(`/api/v1/jobs/${jobId}`)
}

export async function waitForJob(
  jobId: string,
  timeoutMs = 20_000,
): Promise<ApiJob> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const job = await getJob(jobId)
    if (job.status === 'completed') return job
    if (job.status === 'failed') {
      throw new Error(job.errorMessage || 'Analysis job failed')
    }
    await delay(300)
  }
  throw new Error('Analysis is still running')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...init.headers,
    },
  })

  const payload = (await response.json()) as
    | ApiEnvelope<T>
    | { error?: { message?: string } }
  if (!response.ok) {
    const error =
      'error' in payload ? payload.error?.message : 'Request failed'
    throw new Error(error || `Request failed with status ${response.status}`)
  }
  return (payload as ApiEnvelope<T>).data
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}
