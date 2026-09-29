import type { AppConfig } from '../config.js'
import {
  AnalysisOutputSchema,
  type AnalysisOutput,
  type TopicDetailRecord,
} from '../domain/contracts.js'

export interface AnalysisResult {
  output: AnalysisOutput
  provider: string
  model: string
  promptVersion: string
  tokenUsage: Record<string, unknown>
}

export interface AnalysisProvider {
  analyze(
    topic: TopicDetailRecord,
    question?: string | null,
  ): Promise<AnalysisResult>
}

export function createAnalysisProvider(config: AppConfig): AnalysisProvider {
  if (config.llmMode === 'heuristic') {
    return new HeuristicAnalysisProvider()
  }
  return new OpenAICompatibleProvider(config)
}

export class HeuristicAnalysisProvider implements AnalysisProvider {
  async analyze(
    topic: TopicDetailRecord,
    question?: string | null,
  ): Promise<AnalysisResult> {
    const highImpactCount = topic.timeline.filter(
      (event) => event.impact === 'high',
    ).length
    const confidence = Math.min(
      92,
      Math.max(62, 68 + highImpactCount * 4 + Math.min(topic.timeline.length, 5)),
    )
    const subject = topic.topic.title

    const output = AnalysisOutputSchema.parse({
      summary: question
        ? `围绕“${question}”，${subject}的当前证据更支持风险溢价先于实体冲击传导。需要用高频价格、物流与政策信号交叉验证，避免由单一新闻事件外推长期趋势。`
        : `${subject}的当前冲击仍以风险溢价为主。短期市场会先交易尾部风险，后续是否进入实体经济取决于物流持续时间、替代供给和政策对冲力度。`,
      confidence,
      counterSignal:
        '若风险指标与实物流指标连续两个观察周期背离，应下调当前传导强度并重新估计情景概率。',
      transmission: [
        {
          label: '事件冲击',
          value: '上行',
          tone: 'red',
          rationale: '高影响事件与政策信号密度抬升',
        },
        {
          label: '风险定价',
          value: '+',
          tone: 'amber',
          rationale: '波动率与风险溢价先行调整',
        },
        {
          label: '成本传导',
          value: '扩散',
          tone: 'amber',
          rationale: '运输、保险与融资成本向产业链传递',
        },
        {
          label: '宏观预期',
          value: '重估',
          tone: 'blue',
          rationale: '增长、通胀与政策路径被重新定价',
        },
        {
          label: '政策响应',
          value: '对冲',
          tone: 'green',
          rationale: '供给与流动性工具限制尾部影响',
        },
      ],
      scenarios: [
        {
          name: '基准情景',
          probability: 55,
          tone: 'base',
          narrative: '风险维持但未失控，资产价格在一至三周后重新回归基本面。',
          triggerCondition: '高频风险指标停止创新高',
        },
        {
          name: '升级情景',
          probability: 30,
          tone: 'risk',
          narrative: '冲击持续并进入实物流，成本与通胀预期出现第二轮上行。',
          triggerCondition: '核心物流指标连续两个周期突破阈值',
        },
        {
          name: '缓和情景',
          probability: 15,
          tone: 'ease',
          narrative: '政策协调和替代供给生效，风险溢价快速回落。',
          triggerCondition: '政策执行与市场价格形成一致降温信号',
        },
      ],
      indicators: [
        {
          category: '市场价格',
          title: '核心风险资产波动率是否连续回落',
          cadence: '实时',
          querySpec: { window: '2d', direction: 'down' },
        },
        {
          category: '实体流量',
          title: '关键物流或供给指标是否突破 30 日区间',
          cadence: '每 4 小时',
          querySpec: { window: '30d', threshold: 'breakout' },
        },
        {
          category: '政策信号',
          title: '政策承诺是否形成明确执行时间表',
          cadence: '事件触发',
          querySpec: { sourceTier: ['official', 'primary'] },
        },
        {
          category: '宏观预期',
          title: '通胀与增长预期是否出现同向恶化',
          cadence: '每日',
          querySpec: { confirmationCount: 2 },
        },
      ],
      marketImpacts: [
        {
          symbol: 'CMDTY',
          name: '相关大宗商品',
          detail: '风险溢价与供应弹性共同定价',
          direction: '偏多',
        },
        {
          symbol: '10Y',
          name: '核心国债',
          detail: '通胀压力与避险需求相互对冲',
          direction: '中性',
        },
        {
          symbol: 'FX',
          name: '脆弱经济体货币',
          detail: '贸易条件与资本流动边际承压',
          direction: '偏空',
        },
      ],
    })

    return {
      output,
      provider: 'local',
      model: 'deterministic-heuristic-v1',
      promptVersion: 'macro-v1',
      tokenUsage: {},
    }
  }
}

class OpenAICompatibleProvider implements AnalysisProvider {
  constructor(private readonly config: AppConfig) {}

  async analyze(
    topic: TopicDetailRecord,
    question?: string | null,
  ): Promise<AnalysisResult> {
    const response = await fetch(`${this.config.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.llmApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.llmModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: JSON.stringify({
              topic: topic.topic,
              timeline: topic.timeline,
              previousAnalysis: topic.analysis,
              question: question ?? null,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(this.config.llmTimeoutMs),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(
        `LLM request failed (${response.status}): ${body.slice(0, 500)}`,
      )
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: Record<string, unknown>
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content) throw new Error('LLM returned an empty response')

    return {
      output: AnalysisOutputSchema.parse(parseJson(content)),
      provider: 'openai-compatible',
      model: this.config.llmModel,
      promptVersion: 'macro-v1',
      tokenUsage: payload.usage ?? {},
    }
  }
}

function parseJson(content: string): unknown {
  const trimmed = content.trim()
  if (trimmed.startsWith('{')) return JSON.parse(trimmed)
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('LLM response does not contain a JSON object')
  return JSON.parse(match[0])
}

const systemPrompt = `
You are a senior macroeconomic and geopolitical research analyst.
Return one valid JSON object only. Do not use markdown.

Required shape:
{
  "summary": "20-3000 chars",
  "confidence": 0-100 integer,
  "counterSignal": "falsifiable counter signal",
  "transmission": [
    {"label":"", "value":"", "tone":"red|amber|blue|green", "rationale":""}
  ],
  "scenarios": [
    {
      "name":"",
      "probability":0-100 integer,
      "tone":"base|risk|ease",
      "narrative":"",
      "triggerCondition":""
    }
  ],
  "indicators": [
    {"category":"", "title":"", "cadence":"", "querySpec":{}}
  ],
  "marketImpacts": [
    {"symbol":"", "name":"", "detail":"", "direction":""}
  ]
}

Rules:
- Scenario probabilities must total exactly 100.
- Separate observed facts, inference, and forward-looking conditions.
- Every conclusion must be falsifiable through a counter signal or indicator.
- Avoid false precision and unsupported causal claims.
- Use the language of the input topic.
`.trim()
