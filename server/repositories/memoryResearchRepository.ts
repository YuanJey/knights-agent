import { createHash, randomUUID } from 'node:crypto'
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
import type {
  AnalysisCompletion,
  ApiKeyIdentity,
  AuditEntry,
  ResearchRepository,
} from './researchRepository.js'

const workspaceId = '00000000-0000-0000-0000-000000000001'
const featuredTopicId = '10000000-0000-0000-0000-000000000001'

const timeline: TimelineEventRecord[] = [
  {
    id: '20000000-0000-0000-0000-000000000001',
    phase: 'occurred',
    category: '安全',
    title: '区域安全事件频率进入上行区间',
    summary:
      '近七日高风险水域事件密度抬升，尚未造成主航道中断，但风险定价开始前置。',
    signal: '事件密度 7日均值较前值上升 38%',
    impact: 'medium',
    confidence: 86,
    sourceLabel: '公开事件库 · 14条信源',
    tags: ['海运', '能源'],
    occurredAt: '2026-09-22T00:40:00.000Z',
    sortOrder: 10,
  },
  {
    id: '20000000-0000-0000-0000-000000000002',
    phase: 'occurred',
    category: '航运',
    title: '部分承运人调整高风险水域作业规则',
    summary:
      '航线暂未大规模绕行，但附加费与船员安全条款趋严，保险端成本已先于运价传导。',
    signal: '战争险询价中位数两日上调 22%',
    impact: 'high',
    confidence: 91,
    sourceLabel: '航运公告 · 9条信源',
    tags: ['保险', '供应链'],
    occurredAt: '2026-09-24T08:15:00.000Z',
    sortOrder: 20,
  },
  {
    id: '20000000-0000-0000-0000-000000000003',
    phase: 'occurred',
    category: '市场',
    title: '油轮即期运价与近月波动率同步走高',
    summary:
      '实物流与金融市场开始形成同向信号，短期风险溢价正从航运环节传向原油定价。',
    signal: 'VLCC 即期运价升至 90 日 82% 分位',
    impact: 'high',
    confidence: 94,
    sourceLabel: '市场数据 · 6个指标',
    tags: ['油价', '波动率'],
    occurredAt: '2026-09-26T03:20:00.000Z',
    sortOrder: 30,
  },
  {
    id: '20000000-0000-0000-0000-000000000004',
    phase: 'evolving',
    category: '政策',
    title: '多方释放护航与局势降温信号',
    summary:
      '安全保障与外交接触并行推进，市场尾部风险有所收敛，但尚不足以逆转保险报价。',
    signal: '政策语义由“警戒”转向“可控”',
    impact: 'medium',
    confidence: 79,
    sourceLabel: '政策追踪 · 11条信源',
    tags: ['外交', '政策'],
    occurredAt: '2026-09-28T13:05:00.000Z',
    sortOrder: 40,
  },
  {
    id: '20000000-0000-0000-0000-000000000005',
    phase: 'evolving',
    category: '宏观',
    title: '能源冲击开始影响通胀与降息预期',
    summary:
      '通胀互换率温和上行，利率市场对年内宽松空间的定价收窄，风险资产分化加剧。',
    signal: '5Y5Y 通胀预期连续三个时段上行',
    impact: 'high',
    confidence: 88,
    sourceLabel: 'Agent 综合研判 · 18个指标',
    tags: ['通胀', '利率'],
    occurredAt: '2026-09-29T06:30:00.000Z',
    sortOrder: 50,
  },
  {
    id: '20000000-0000-0000-0000-000000000006',
    phase: 'watch',
    category: '验证点',
    title: '港口等待时间与保费报价是否回落',
    summary: '若两项指标在四个交易日内同步回落，可确认风险溢价处于消退阶段。',
    signal: '触发条件：等待时间回落至 14 日均值',
    impact: 'medium',
    confidence: 72,
    sourceLabel: '预设验证任务 · 自动更新',
    tags: ['前瞻', '航运'],
    occurredAt: '2026-10-03T01:00:00.000Z',
    sortOrder: 60,
  },
  {
    id: '20000000-0000-0000-0000-000000000007',
    phase: 'watch',
    category: '验证点',
    title: '产油国表态与商业库存能否对冲供给担忧',
    summary:
      '供给侧口径和库存变化将决定风险冲击是停留在价格层，还是扩散至实体经济。',
    signal: '触发条件：库存连续两周低于季节性',
    impact: 'high',
    confidence: 68,
    sourceLabel: '预设验证任务 · 自动更新',
    tags: ['供给', '库存'],
    occurredAt: '2026-10-10T01:00:00.000Z',
    sortOrder: 70,
  },
]

const baselineAnalysis: AnalysisRecord = {
  id: '30000000-0000-0000-0000-000000000001',
  summary:
    '当前冲击仍以风险溢价为主，尚未形成实质供给缺口。未来四个交易日的保费与港口等待时间是方向确认点。',
  confidence: 88,
  counterSignal:
    '若护航机制快速落地且运价先于油价回落，本轮影响可能止于市场情绪层。',
  transmission: [
    { label: '航道风险', value: '+', tone: 'red', rationale: '安全事件密度抬升' },
    {
      label: '运输成本',
      value: '+22%',
      tone: 'amber',
      rationale: '战争险报价领先上行',
    },
    {
      label: '能源价格',
      value: '+8-12%',
      tone: 'amber',
      rationale: '风险溢价进入近月定价',
    },
    {
      label: '通胀预期',
      value: '+18bp',
      tone: 'blue',
      rationale: '通胀互换率连续上行',
    },
    {
      label: '宽松空间',
      value: '收窄',
      tone: 'green',
      rationale: '利率市场下调宽松预期',
    },
  ],
  scenarios: [
    {
      name: '基准情景',
      probability: 55,
      tone: 'base',
      narrative: '通行未中断，风险溢价维持 1-3 周后回落。',
      triggerCondition: '保费与等待时间停止上行',
    },
    {
      name: '升级情景',
      probability: 30,
      tone: 'risk',
      narrative: '局部中断超过 72 小时，油价与通胀预期二次上冲。',
      triggerCondition: '任一主航道连续中断超过 24 小时',
    },
    {
      name: '缓和情景',
      probability: 15,
      tone: 'ease',
      narrative: '保障机制快速落地，保险与运价率先正常化。',
      triggerCondition: '保险报价连续两个交易日回落',
    },
  ],
  indicators: [],
  marketImpacts: [
    {
      symbol: 'CL',
      name: '原油与成品油',
      detail: '供给风险溢价上行',
      direction: '强利多',
    },
    {
      symbol: '10Y',
      name: '核心国债',
      detail: '通胀与避险力量对冲',
      direction: '中性偏空',
    },
    {
      symbol: 'FX',
      name: '能源进口国货币',
      detail: '贸易条件边际承压',
      direction: '偏空',
    },
  ],
  modelProvider: 'memory',
  modelName: 'research-baseline',
  completedAt: '2026-09-29T09:48:00.000Z',
}

const baselineIndicators: IndicatorRecord[] = [
  {
    id: '50000000-0000-0000-0000-000000000001',
    category: '航运保险',
    title: '战争险报价是否连续两日报跌',
    cadence: '每日 09:00',
    status: 'confirmed',
    lastValue: '较前值回落 3%',
    lastCheckedAt: '2026-09-29T01:00:00.000Z',
    nextCheckAt: '2026-09-30T01:00:00.000Z',
  },
  {
    id: '50000000-0000-0000-0000-000000000002',
    category: '高频航运',
    title: '油轮等待时间是否突破 14 日高位',
    cadence: '每 4 小时',
    status: 'pending',
    lastValue: '接近阈值',
    lastCheckedAt: '2026-09-29T08:00:00.000Z',
    nextCheckAt: '2026-09-29T12:00:00.000Z',
  },
  {
    id: '50000000-0000-0000-0000-000000000003',
    category: '能源市场',
    title: '近月价差是否由升水转为深度贴水',
    cadence: '实时',
    status: 'pending',
    lastValue: null,
    lastCheckedAt: null,
    nextCheckAt: '2026-09-29T10:00:00.000Z',
  },
  {
    id: '50000000-0000-0000-0000-000000000004',
    category: '政策信号',
    title: '护航机制是否形成可执行时间表',
    cadence: '事件触发',
    status: 'pending',
    lastValue: null,
    lastCheckedAt: null,
    nextCheckAt: '2026-09-30T01:00:00.000Z',
  },
]

export class MemoryResearchRepository implements ResearchRepository {
  private readonly topics = new Map<string, TopicDetailRecord>()
  private readonly jobs = new Map<string, JobRecord>()

  constructor() {
    const topic: TopicRecord = {
      id: featuredTopicId,
      slug: 'hormuz-transit-risk',
      title: '霍尔木兹海峡通行风险',
      summary:
        '冲突外溢与海运成本上行，正在向能源价格、通胀预期和全球政策路径传导。',
      region: '中东',
      horizon: '未来 7-14 天',
      status: 'active',
      riskScore: 78,
      riskDelta: 6,
      marketPricing: '风险溢价上行',
      impactScope: '全球 · 跨资产',
      confidence: 88,
      updatedAt: '2026-09-29T09:48:00.000Z',
    }

    this.topics.set(featuredTopicId, {
      topic,
      timeline: structuredClone(timeline),
      analysis: structuredClone(baselineAnalysis),
      indicators: structuredClone(baselineIndicators),
      sourceCount: 42,
    })
  }

  async ping() {}

  async close() {}

  async findApiKey(keyHash: string): Promise<ApiKeyIdentity | null> {
    const expected = createHash('sha256')
      .update('dev-atlas-local-key')
      .digest('hex')
    return keyHash === expected
      ? {
          id: '00000000-0000-0000-0000-000000000010',
          workspaceId,
          scopes: ['research:read', 'research:write'],
        }
      : null
  }

  async listTopics(requestWorkspaceId: string) {
    if (requestWorkspaceId !== workspaceId) return []
    return [...this.topics.values()].map(({ topic }) => structuredClone(topic))
  }

  async getFeaturedTopic(requestWorkspaceId: string) {
    if (requestWorkspaceId !== workspaceId) return null
    const topic = this.topics.get(featuredTopicId)
    return topic ? structuredClone(topic) : null
  }

  async getTopicDetail(requestWorkspaceId: string, topicId: string) {
    if (requestWorkspaceId !== workspaceId) return null
    const topic = this.topics.get(topicId)
    return topic ? structuredClone(topic) : null
  }

  async createTopic(
    requestWorkspaceId: string,
    input: CreateTopicInput,
    actorId: string,
  ) {
    if (requestWorkspaceId !== workspaceId) {
      throw new Error('Unknown workspace')
    }

    const id = randomUUID()
    const topic: TopicRecord = {
      id,
      slug: `${slugify(input.title)}-${id.slice(0, 8)}`,
      title: input.title,
      summary: input.summary || input.coreQuestion || '',
      region: input.region,
      horizon: input.horizon,
      status: 'active',
      riskScore: 0,
      riskDelta: 0,
      marketPricing: '建立基线中',
      impactScope: input.region,
      confidence: 0,
      updatedAt: new Date().toISOString(),
    }

    this.topics.set(id, {
      topic,
      timeline: [],
      analysis: null,
      indicators: [],
      sourceCount: 0,
    })
    void actorId
    return structuredClone(topic)
  }

  async ingestEvent(
    requestWorkspaceId: string,
    topicId: string,
    input: IngestEventInput,
    actorId: string,
  ) {
    if (requestWorkspaceId !== workspaceId) throw new Error('Unknown workspace')
    const detail = this.topics.get(topicId)
    if (!detail) throw new Error('Topic not found')
    const sourceLabel = `${input.source.publisher} · 1条信源`
    const existing = detail.timeline.find(
      (event) =>
        event.title === input.title &&
        event.occurredAt === input.occurredAt &&
        event.sourceLabel === sourceLabel,
    )
    if (existing) return structuredClone(existing)

    const timelineEvent: TimelineEventRecord = {
      id: randomUUID(),
      phase: input.phase,
      category: input.category,
      title: input.title,
      summary: input.summary,
      signal: input.signal,
      impact: input.impact,
      confidence: input.confidence,
      sourceLabel,
      tags: input.tags,
      occurredAt: input.occurredAt,
      sortOrder:
        Math.max(0, ...detail.timeline.map((event) => event.sortOrder)) + 10,
    }
    detail.timeline.push(timelineEvent)
    detail.sourceCount += 1
    detail.topic.updatedAt = new Date().toISOString()
    void actorId
    return structuredClone(timelineEvent)
  }

  async createJob(
    requestWorkspaceId: string,
    topicId: string,
    triggerType: JobRecord['triggerType'],
    question?: string,
  ) {
    if (
      requestWorkspaceId !== workspaceId ||
      !this.topics.has(topicId)
    ) {
      throw new Error('Topic not found')
    }

    const now = new Date().toISOString()
    const job: JobRecord = {
      id: randomUUID(),
      workspaceId: requestWorkspaceId,
      topicId,
      status: 'queued',
      triggerType,
      question: question ?? null,
      attempts: 0,
      maxAttempts: 3,
      errorMessage: null,
      queuedAt: now,
      startedAt: null,
      completedAt: null,
    }
    this.jobs.set(job.id, job)
    return structuredClone(job)
  }

  async setJobStreamId() {}

  async listUnpublishedJobs(limit: number) {
    return [...this.jobs.values()]
      .filter((job) => job.status === 'queued')
      .slice(0, limit)
      .map((job) => structuredClone(job))
  }

  async getJob(requestWorkspaceId: string, jobId: string) {
    if (requestWorkspaceId !== workspaceId) return null
    const job = this.jobs.get(jobId)
    return job ? structuredClone(job) : null
  }

  async getJobForWorker(jobId: string) {
    const job = this.jobs.get(jobId)
    return job ? structuredClone(job) : null
  }

  async markJobRunning(jobId: string) {
    const job = this.jobs.get(jobId)
    if (!job || !['queued', 'retrying'].includes(job.status)) return false
    job.status = 'running'
    job.attempts += 1
    job.startedAt = new Date().toISOString()
    return true
  }

  async completeAnalysis(job: JobRecord, completion: AnalysisCompletion) {
    const detail = this.topics.get(job.topicId)
    const storedJob = this.jobs.get(job.id)
    if (!detail || !storedJob) throw new Error('Job context not found')

    const completedAt = new Date().toISOString()
    detail.analysis = {
      id: randomUUID(),
      ...structuredClone(completion.output),
      modelProvider: completion.provider,
      modelName: completion.model,
      completedAt,
    }
    detail.indicators = completion.output.indicators.map((indicator) => ({
      id: randomUUID(),
      category: indicator.category,
      title: indicator.title,
      cadence: indicator.cadence,
      status: 'pending',
      lastValue: null,
      lastCheckedAt: null,
      nextCheckAt: null,
    }))
    detail.topic.confidence = completion.output.confidence
    detail.topic.updatedAt = completedAt
    storedJob.status = 'completed'
    storedJob.completedAt = completedAt
    storedJob.errorMessage = null
  }

  async failJob(jobId: string, message: string) {
    const job = this.jobs.get(jobId)
    if (!job) throw new Error('Job not found')
    const status = job.attempts >= job.maxAttempts ? 'failed' : 'retrying'
    job.status = status
    job.errorMessage = message
    return status
  }

  async recordAudit(entry: AuditEntry) {
    void entry
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
