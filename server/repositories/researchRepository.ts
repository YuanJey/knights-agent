import type {
  AnalysisOutput,
  CreateTopicInput,
  EventPhase,
  IngestEventInput,
  JobRecord,
  TimelineEventRecord,
  TopicDetailRecord,
  TopicRecord,
} from '../domain/contracts.js'

export interface ApiKeyIdentity {
  id: string
  workspaceId: string
  scopes: string[]
}

export interface TimelineFilters {
  phase?: EventPhase
  query?: string
  limit: number
}

export interface AuditEntry {
  workspaceId: string | null
  actorType: 'api_key' | 'system' | 'worker'
  actorId: string
  action: string
  resourceType: string
  resourceId?: string
  requestId?: string
  ipAddress?: string
  payload?: Record<string, unknown>
}

export interface AnalysisCompletion {
  provider: string
  model: string
  promptVersion: string
  inputSnapshot: Record<string, unknown>
  output: AnalysisOutput
  tokenUsage?: Record<string, unknown>
}

export interface ResearchRepository {
  ping(): Promise<void>
  close(): Promise<void>
  findApiKey(keyHash: string): Promise<ApiKeyIdentity | null>
  listTopics(workspaceId: string): Promise<TopicRecord[]>
  getFeaturedTopic(workspaceId: string): Promise<TopicDetailRecord | null>
  getTopicDetail(
    workspaceId: string,
    topicId: string,
  ): Promise<TopicDetailRecord | null>
  createTopic(
    workspaceId: string,
    input: CreateTopicInput,
    actorId: string,
  ): Promise<TopicRecord>
  ingestEvent(
    workspaceId: string,
    topicId: string,
    input: IngestEventInput,
    actorId: string,
  ): Promise<TimelineEventRecord>
  createJob(
    workspaceId: string,
    topicId: string,
    triggerType: JobRecord['triggerType'],
    question?: string,
  ): Promise<JobRecord>
  setJobStreamId(jobId: string, streamMessageId: string): Promise<void>
  listUnpublishedJobs(limit: number): Promise<JobRecord[]>
  getJob(workspaceId: string, jobId: string): Promise<JobRecord | null>
  getJobForWorker(jobId: string): Promise<JobRecord | null>
  markJobRunning(jobId: string): Promise<boolean>
  completeAnalysis(
    job: JobRecord,
    completion: AnalysisCompletion,
  ): Promise<void>
  failJob(jobId: string, message: string): Promise<'retrying' | 'failed'>
  recordAudit(entry: AuditEntry): Promise<void>
}
