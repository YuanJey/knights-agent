import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  CalendarRange,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleDotDashed,
  Clock3,
  Compass,
  Download,
  Eye,
  FileText,
  GitBranch,
  Globe2,
  Landmark,
  LayoutDashboard,
  ListFilter,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldAlert,
  Ship,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  askQuestion,
  createTopic,
  getFeaturedTopic,
  getTopic,
  waitForJob,
  type ApiAnalysis,
  type ApiIndicator,
  type ApiTimelineEvent,
  type ApiTopic,
  type ApiTopicDetail,
} from './api'

type EventPhase = '已发生' | '正在演化' | '待验证'
type ImpactLevel = '高' | '中' | '低'
type AnalysisTab = '传导路径' | '情景推演' | '观察清单'

interface TimelineEvent {
  id: string
  date: string
  weekday: string
  time?: string
  phase: EventPhase
  category: string
  title: string
  summary: string
  source: string
  confidence: number
  impact: ImpactLevel
  tags: string[]
  signal: string
}

interface NavItem {
  label: string
  icon: LucideIcon
  badge?: string
}

const navItems: NavItem[] = [
  { label: '研究总览', icon: LayoutDashboard },
  { label: '事件时间线', icon: Clock3, badge: '7' },
  { label: '影响图谱', icon: GitBranch },
  { label: '情景推演', icon: ChartNoAxesCombined },
  { label: '观察清单', icon: Eye, badge: '12' },
]

const demoTimelineEvents: TimelineEvent[] = [
  {
    id: 'demo-1',
    date: '9月22日',
    weekday: '周二',
    time: '08:40',
    phase: '已发生',
    category: '安全',
    title: '区域安全事件频率进入上行区间',
    summary:
      '近七日高风险水域事件密度抬升，尚未造成主航道中断，但风险定价开始前置。',
    source: '公开事件库 · 14条信源',
    confidence: 86,
    impact: '中',
    tags: ['海运', '能源'],
    signal: '事件密度 7日均值较前值上升 38%',
  },
  {
    id: 'demo-2',
    date: '9月24日',
    weekday: '周四',
    time: '16:15',
    phase: '已发生',
    category: '航运',
    title: '部分承运人调整高风险水域作业规则',
    summary:
      '航线暂未大规模绕行，但附加费与船员安全条款趋严，保险端成本已先于运价传导。',
    source: '航运公告 · 9条信源',
    confidence: 91,
    impact: '高',
    tags: ['保险', '供应链'],
    signal: '战争险询价中位数两日上调 22%',
  },
  {
    id: 'demo-3',
    date: '9月26日',
    weekday: '周六',
    time: '11:20',
    phase: '已发生',
    category: '市场',
    title: '油轮即期运价与近月波动率同步走高',
    summary:
      '实物流与金融市场开始形成同向信号，短期风险溢价正从航运环节传向原油定价。',
    source: '市场数据 · 6个指标',
    confidence: 94,
    impact: '高',
    tags: ['油价', '波动率'],
    signal: 'VLCC 即期运价升至 90 日 82% 分位',
  },
  {
    id: 'demo-4',
    date: '9月28日',
    weekday: '周一',
    time: '21:05',
    phase: '正在演化',
    category: '政策',
    title: '多方释放护航与局势降温信号',
    summary:
      '安全保障与外交接触并行推进，市场尾部风险有所收敛，但尚不足以逆转保险报价。',
    source: '政策追踪 · 11条信源',
    confidence: 79,
    impact: '中',
    tags: ['外交', '政策'],
    signal: '政策语义由“警戒”转向“可控”',
  },
  {
    id: 'demo-5',
    date: '9月29日',
    weekday: '今天',
    time: '14:30',
    phase: '正在演化',
    category: '宏观',
    title: '能源冲击开始影响通胀与降息预期',
    summary:
      '通胀互换率温和上行，利率市场对年内宽松空间的定价收窄，风险资产分化加剧。',
    source: 'Agent 综合研判 · 18个指标',
    confidence: 88,
    impact: '高',
    tags: ['通胀', '利率'],
    signal: '5Y5Y 通胀预期连续三个时段上行',
  },
  {
    id: 'demo-6',
    date: '10月3日',
    weekday: '周六',
    phase: '待验证',
    category: '验证点',
    title: '港口等待时间与保费报价是否回落',
    summary:
      '若两项指标在四个交易日内同步回落，可确认风险溢价处于消退阶段。',
    source: '预设验证任务 · 自动更新',
    confidence: 72,
    impact: '中',
    tags: ['前瞻', '航运'],
    signal: '触发条件：等待时间回落至 14 日均值',
  },
  {
    id: 'demo-7',
    date: '10月10日',
    weekday: '周六',
    phase: '待验证',
    category: '验证点',
    title: '产油国表态与商业库存能否对冲供给担忧',
    summary:
      '供给侧口径和库存变化将决定风险冲击是停留在价格层，还是扩散至实体经济。',
    source: '预设验证任务 · 自动更新',
    confidence: 68,
    impact: '高',
    tags: ['供给', '库存'],
    signal: '触发条件：库存连续两周低于季节性',
  },
]

const demoTopic: ApiTopic = {
  id: '10000000-0000-0000-0000-000000000001',
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

const tabIcons: Record<AnalysisTab, LucideIcon> = {
  传导路径: GitBranch,
  情景推演: ChartNoAxesCombined,
  观察清单: Eye,
}

function App() {
  const [activeNav, setActiveNav] = useState('事件时间线')
  const [activeTab, setActiveTab] = useState<AnalysisTab>('传导路径')
  const [selectedEventId, setSelectedEventId] = useState('demo-5')
  const [phaseFilter, setPhaseFilter] = useState('全部阶段')
  const [query, setQuery] = useState('')
  const [watching, setWatching] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [prompt, setPrompt] = useState('')
  const [topicDetail, setTopicDetail] = useState<ApiTopicDetail | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<
    'loading' | 'live' | 'fallback' | 'error'
  >('loading')
  const [agentBusy, setAgentBusy] = useState(false)

  const topic = topicDetail?.topic ?? demoTopic
  const timelineEvents = useMemo(
    () =>
      topicDetail
        ? topicDetail.timeline.map(toTimelineEvent)
        : demoTimelineEvents,
    [topicDetail],
  )

  const selectedEvent =
    timelineEvents.find((event) => event.id === selectedEventId) ??
    timelineEvents[0] ??
    emptyTimelineEvent

  const filteredEvents = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return timelineEvents.filter((event) => {
      const matchesPhase =
        phaseFilter === '全部阶段' || event.phase === phaseFilter
      const matchesQuery =
        !keyword ||
        [event.title, event.summary, event.category, ...event.tags]
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      return matchesPhase && matchesQuery
    })
  }, [phaseFilter, query, timelineEvents])

  useEffect(() => {
    const controller = new AbortController()
    getFeaturedTopic(controller.signal)
      .then((detail) => {
        setTopicDetail(detail)
        setSelectedEventId(detail.timeline[0]?.id ?? '')
        setConnectionStatus('live')
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setConnectionStatus(import.meta.env.PROD ? 'error' : 'fallback')
        }
      })
    return () => controller.abort()
  }, [])

  const showToast = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const handlePrompt = async (event: FormEvent) => {
    event.preventDefault()
    const question = prompt.trim()
    if (!question || agentBusy) return
    setPrompt('')
    showToast('Agent 已接收问题，正在更新分析')
    setAgentBusy(true)
    try {
      const job = await askQuestion(topic.id, question)
      await waitForJob(job.id)
      setTopicDetail(await getTopic(topic.id))
      setConnectionStatus('live')
      showToast('Agent 已完成分析更新')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '分析任务提交失败')
    } finally {
      setAgentBusy(false)
    }
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (agentBusy) return
    const form = new FormData(event.currentTarget)
    setAgentBusy(true)
    try {
      const result = await createTopic({
        title: String(form.get('title') ?? ''),
        summary: String(form.get('question') ?? ''),
        region: String(form.get('region') ?? '全球'),
        horizon: String(form.get('horizon') ?? '1-3个月'),
        coreQuestion: String(form.get('question') ?? ''),
      })
      setComposerOpen(false)
      showToast('研究议题已创建，Agent 正在建立基线')
      await waitForJob(result.job.id)
      const detail = await getTopic(result.topic.id)
      setTopicDetail(detail)
      setSelectedEventId(detail.timeline[0]?.id ?? '')
      setConnectionStatus('live')
      showToast('议题基线分析已完成')
    } catch (error) {
      showToast(error instanceof Error ? error.message : '创建议题失败')
    } finally {
      setAgentBusy(false)
    }
  }

  if (connectionStatus === 'error') {
    return (
      <main className="service-unavailable">
        <span className="agent-indicator">
          <AlertTriangle size={17} />
        </span>
        <h1>研究服务暂时不可用</h1>
        <p>无法连接数据服务。页面未展示缓存分析，以避免使用过期结论。</p>
        <button
          className="primary-button"
          onClick={() => window.location.reload()}
        >
          重新连接
        </button>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true">
            <Compass size={21} strokeWidth={2.2} />
          </div>
          <div>
            <strong>经纬 Agent</strong>
            <span>MACRO INTELLIGENCE</span>
          </div>
          <button
            className="icon-button sidebar-close"
            aria-label="关闭导航"
            title="关闭导航"
            onClick={() => setSidebarOpen(false)}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        <button
          className="new-topic-button"
          onClick={() => setComposerOpen(true)}
        >
          <Plus size={17} />
          新建研究议题
        </button>

        <nav className="primary-nav" aria-label="主导航">
          <div className="nav-label">研究空间</div>
          {navItems.map(({ label, icon: Icon, badge }) => (
            <button
              className={activeNav === label ? 'active' : ''}
              key={label}
              onClick={() => {
                setActiveNav(label)
                setSidebarOpen(false)
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {badge && <em>{badge}</em>}
            </button>
          ))}
        </nav>

        <section className="watchlist">
          <div className="section-heading">
            <span>持续关注</span>
            <button className="bare-icon" aria-label="添加关注" title="添加关注">
              <Plus size={15} />
            </button>
          </div>
          <button className="watch-item current">
            <span className="risk-dot risk-high" />
            <span>
              <strong>{topic.title}</strong>
              <small>{formatUpdatedAt(topic.updatedAt)}</small>
            </span>
          </button>
          <button className="watch-item">
            <span className="risk-dot risk-medium" />
            <span>
              <strong>美联储政策路径</strong>
              <small>1 小时前更新</small>
            </span>
          </button>
          <button className="watch-item">
            <span className="risk-dot risk-low" />
            <span>
              <strong>欧洲财政扩张</strong>
              <small>昨天更新</small>
            </span>
          </button>
        </section>

        <div className="sidebar-footer">
          <button className="workspace-switch">
            <span className="avatar">林</span>
            <span>
              <strong>全球策略组</strong>
              <small>专业研究空间</small>
            </span>
            <MoreHorizontal size={17} />
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="main-stage">
        <header className="topbar">
          <div className="mobile-brand">
            <button
              className="icon-button"
              aria-label="打开导航"
              title="打开导航"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={19} />
            </button>
            <span>经纬 Agent</span>
          </div>

          <div className="breadcrumbs">
            <span>研究议题</span>
            <span>/</span>
            <strong>{topic.title}</strong>
          </div>

          <div className="topbar-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                aria-label="搜索当前议题"
                placeholder="搜索事件、国家或指标"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </div>
            <button
              className="icon-button notification-button"
              aria-label="通知"
              title="通知"
            >
              <Bell size={18} />
              <span />
            </button>
            <button className="secondary-button" onClick={() => showToast('分享链接已生成')}>
              <Share2 size={16} />
              <span>分享</span>
            </button>
            <button className="primary-button" onClick={() => showToast('简报已生成，可在研究档案中查看')}>
              <Sparkles size={16} />
              <span>生成简报</span>
            </button>
          </div>
        </header>

        <div className="workspace">
          <section className="content-column">
            <div className="topic-header">
              <div className="topic-copy">
                <div className="eyebrow-row">
                  <span className="live-status">
                    <span />
                    持续追踪
                  </span>
                  <span className="topic-label">
                    {connectionStatus === 'live'
                      ? '实时服务'
                      : connectionStatus === 'loading'
                        ? '正在连接'
                        : '开发数据'}
                  </span>
                  <span>{formatUpdatedAt(topic.updatedAt)}</span>
                </div>
                <div className="title-row">
                  <div>
                    <h1>{topic.title}</h1>
                    <p>{topic.summary}</p>
                  </div>
                  <button
                    className={`watch-button ${watching ? 'active' : ''}`}
                    onClick={() => setWatching((value) => !value)}
                  >
                    {watching ? <Check size={16} /> : <Plus size={16} />}
                    {watching ? '已关注' : '关注'}
                  </button>
                </div>
              </div>

              <div className="map-visual">
                <div
                  className="map-canvas"
                  role="img"
                  aria-label={`${topic.region}地缘风险监测示意图`}
                >
                  <span className="map-land map-land-north" />
                  <span className="map-land map-land-south" />
                  <span className="map-island island-one" />
                  <span className="map-island island-two" />
                  <span className="map-route route-one" />
                  <span className="map-route route-two" />
                  <span className="map-route route-three" />
                  <span className="map-label label-iran">IRAN</span>
                  <span className="map-label label-oman">OMAN</span>
                  <span className="map-label label-gulf">PERSIAN GULF</span>
                  <span className="map-label label-sea">ARABIAN SEA</span>
                </div>
                <div className="map-overlay">
                  <span className="map-kicker">
                    <Radio size={13} />
                    风险监测
                  </span>
                  <strong>{topic.region.toUpperCase()} RISK MONITOR</strong>
                  <small>{topic.horizon}</small>
                </div>
                <div className="map-pulse" aria-hidden="true">
                  <i />
                </div>
              </div>
            </div>

            <div className="metric-strip">
              <div className="metric">
                <span className="metric-icon coral">
                  <ShieldAlert size={17} />
                </span>
                <span>
                  <small>综合风险</small>
                  <strong>
                    {topic.riskScore} <em>/ 100</em>
                  </strong>
                </span>
                <span className="trend-up">
                  <TrendingUp size={13} /> {topic.riskDelta}
                </span>
              </div>
              <div className="metric">
                <span className="metric-icon gold">
                  <Activity size={17} />
                </span>
                <span>
                  <small>市场定价</small>
                  <strong>{topic.marketPricing}</strong>
                </span>
                <span className="metric-note">
                  置信度 {topic.confidence}%
                </span>
              </div>
              <div className="metric">
                <span className="metric-icon blue">
                  <Globe2 size={17} />
                </span>
                <span>
                  <small>影响范围</small>
                  <strong>{topic.impactScope}</strong>
                </span>
                <span className="metric-note">{topic.region}</span>
              </div>
              <div className="metric">
                <span className="metric-icon green">
                  <Clock3 size={17} />
                </span>
                <span>
                  <small>关键窗口</small>
                  <strong>{topic.horizon}</strong>
                </span>
                <span className="metric-note">高敏感</span>
              </div>
            </div>

            <div className="timeline-toolbar">
              <div>
                <h2>事件时间线</h2>
                <span>{filteredEvents.length} 个关键节点</span>
              </div>
              <div className="toolbar-actions">
                <label className="select-control">
                  <CalendarRange size={15} />
                  <select aria-label="时间范围">
                    <option>近 30 天</option>
                    <option>近 90 天</option>
                    <option>全部时间</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
                <label className="select-control">
                  <ListFilter size={15} />
                  <select
                    aria-label="阶段筛选"
                    value={phaseFilter}
                    onChange={(event) => setPhaseFilter(event.target.value)}
                  >
                    <option>全部阶段</option>
                    <option>已发生</option>
                    <option>正在演化</option>
                    <option>待验证</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
                <button
                  className="icon-button"
                  aria-label="导出时间线"
                  title="导出时间线"
                  onClick={() => showToast('时间线已导出')}
                >
                  <Download size={17} />
                </button>
              </div>
            </div>

            <div className="timeline-list">
              {filteredEvents.length ? (
                filteredEvents.map((event, index) => {
                  const startsPhase =
                    index === 0 ||
                    filteredEvents[index - 1].phase !== event.phase
                  return (
                    <div className="timeline-block" key={event.id}>
                      {startsPhase && (
                        <div className={`phase-marker phase-${event.phase}`}>
                          <span>{event.phase}</span>
                          {event.phase === '正在演化' && <em>LIVE</em>}
                        </div>
                      )}
                      <div
                        className={`timeline-entry ${
                          selectedEventId === event.id ? 'selected' : ''
                        } ${event.phase === '待验证' ? 'future' : ''}`}
                      >
                        <div className="event-date">
                          <strong>{event.date}</strong>
                          <span>{event.weekday}</span>
                          {event.time && <small>{event.time}</small>}
                        </div>
                        <div className="timeline-axis">
                          <span className={`event-node impact-${event.impact}`}>
                            {event.phase === '待验证' ? (
                              <CircleDotDashed size={13} />
                            ) : (
                              <span />
                            )}
                          </span>
                        </div>
                        <button
                          className="event-card"
                          onClick={() => {
                            setSelectedEventId(event.id)
                            if (window.innerWidth < 1120) {
                              document
                                .querySelector('.analysis-panel')
                                ?.scrollIntoView({ behavior: 'smooth' })
                            }
                          }}
                        >
                          <div className="event-card-topline">
                            <span className="event-category">{event.category}</span>
                            <span className={`impact-pill impact-${event.impact}`}>
                              {event.impact}影响
                            </span>
                          </div>
                          <h3>{event.title}</h3>
                          <p>{event.summary}</p>
                          <div className="signal-row">
                            <Zap size={14} />
                            <span>{event.signal}</span>
                          </div>
                          <div className="event-footer">
                            <span>{event.source}</span>
                            <span>置信度 {event.confidence}%</span>
                            <div className="event-tags">
                              {event.tags.map((tag) => (
                                <em key={tag}>{tag}</em>
                              ))}
                            </div>
                            <ArrowRight className="event-arrow" size={16} />
                          </div>
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="empty-state">
                  <Search size={21} />
                  <strong>没有匹配的时间线事件</strong>
                  <span>调整搜索词或筛选条件后重试</span>
                </div>
              )}
            </div>
          </section>

          <aside className="analysis-panel">
            <div className="analysis-heading">
              <div>
                <span className="agent-indicator">
                  <Bot size={15} />
                </span>
                <div>
                  <h2>后续分析</h2>
                  <span>由 Agent 持续更新</span>
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="分析设置"
                title="分析设置"
              >
                <Settings2 size={17} />
              </button>
            </div>

            <div className="selected-brief">
              <span>当前节点 · {selectedEvent.date}</span>
              <strong>{selectedEvent.title}</strong>
              <div>
                <span className={`impact-pill impact-${selectedEvent.impact}`}>
                  {selectedEvent.impact}影响
                </span>
                <span>置信度 {selectedEvent.confidence}%</span>
              </div>
            </div>

            <div className="analysis-tabs" role="tablist">
              {(Object.keys(tabIcons) as AnalysisTab[]).map((tab) => {
                const Icon = tabIcons[tab]
                return (
                  <button
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={activeTab === tab ? 'active' : ''}
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                  >
                    <Icon size={15} />
                    {tab}
                  </button>
                )
              })}
            </div>

            <div className="analysis-content">
              {activeTab === '传导路径' && (
                <TransmissionView analysis={topicDetail?.analysis} />
              )}
              {activeTab === '情景推演' && (
                <ScenarioView analysis={topicDetail?.analysis} />
              )}
              {activeTab === '观察清单' && (
                <WatchView indicators={topicDetail?.indicators ?? []} />
              )}
            </div>

            <form className="agent-prompt" onSubmit={handlePrompt}>
              <div>
                <Sparkles size={15} />
                <span>继续追问</span>
              </div>
              <textarea
                aria-label="向 Agent 提问"
                placeholder="例如：若油价维持在高位，哪些市场最先承压？"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <button
                className="prompt-send"
                type="submit"
                disabled={agentBusy}
                aria-label="发送问题"
                title="发送问题"
              >
                <Send size={16} />
              </button>
            </form>

            <div className="source-note">
              <FileText size={14} />
              <span>
                本页汇总 {topicDetail?.sourceCount ?? 42} 条信源与{' '}
                {topicDetail?.indicators.length ?? 4} 个观察指标
              </span>
              <button onClick={() => showToast('信源侧栏已更新')}>查看信源</button>
            </div>
          </aside>
        </div>
      </main>

      {composerOpen && (
        <div className="modal-backdrop" role="presentation">
          <div className="topic-modal" role="dialog" aria-modal="true">
            <div className="modal-heading">
              <div>
                <span className="agent-indicator">
                  <Sparkles size={16} />
                </span>
                <div>
                  <h2>新建研究议题</h2>
                  <p>Agent 将自动建立事件基线与观察清单</p>
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="关闭"
                title="关闭"
                onClick={() => setComposerOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <label>
                研究议题
                <input
                  required
                  autoFocus
                  name="title"
                  placeholder="例如：欧洲财政扩张对欧元资产的影响"
                />
              </label>
              <div className="form-grid">
                <label>
                  关注区域
                  <select name="region" defaultValue="全球">
                    <option>全球</option>
                    <option>亚太</option>
                    <option>欧洲</option>
                    <option>中东</option>
                    <option>美洲</option>
                  </select>
                </label>
                <label>
                  分析周期
                  <select name="horizon" defaultValue="中期 · 1-3个月">
                    <option>短期 · 1-4周</option>
                    <option>中期 · 1-3个月</option>
                    <option>长期 · 3-12个月</option>
                  </select>
                </label>
              </div>
              <label>
                核心问题
                <textarea
                  name="question"
                  placeholder="描述需要重点回答的问题、资产或传导路径"
                />
              </label>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setComposerOpen(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={agentBusy}
                >
                  <Sparkles size={16} />
                  {agentBusy ? '正在分析' : '创建并分析'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  )
}

function TransmissionView({ analysis }: { analysis?: ApiAnalysis | null }) {
  const nodeIcons = [AlertTriangle, Ship, Activity, TrendingUp, Landmark]
  const fallbackNodes = [
    { label: '航道风险', value: '+', tone: 'red', icon: AlertTriangle },
    { label: '运输成本', value: '+22%', tone: 'amber', icon: Ship },
    { label: '能源价格', value: '+8–12%', tone: 'amber', icon: Activity },
    { label: '通胀预期', value: '+18bp', tone: 'blue', icon: TrendingUp },
    { label: '宽松空间', value: '收窄', tone: 'green', icon: Landmark },
  ]
  const nodes =
    analysis?.transmission.map((node, index) => ({
      ...node,
      icon: nodeIcons[index] ?? Activity,
    })) ?? fallbackNodes
  const marketImpacts = analysis?.marketImpacts ?? [
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
  ]

  return (
    <div className="transmission-view">
      <div className="analysis-summary">
        <span>核心判断</span>
        <p>{analysis?.summary ?? '当前冲击仍以风险溢价为主，尚未形成实质供给缺口。未来四个交易日的保费与港口等待时间是方向确认点。'}</p>
      </div>

      <div className="subsection-title">
        <span>主传导链</span>
        <em>强度 4.2 / 5</em>
      </div>
      <div className="transmission-chain">
        {nodes.map(({ label, value, tone, icon: Icon }, index) => (
          <div className="chain-item" key={label}>
            <div className={`chain-node ${tone}`}>
              <span>
                <Icon size={15} />
              </span>
              <div>
                <small>{label}</small>
                <strong>{value}</strong>
              </div>
            </div>
            {index < nodes.length - 1 && (
              <div className="chain-link">
                <span />
                <ArrowRight size={13} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="subsection-title">
        <span>跨市场影响</span>
        <button>查看完整图谱</button>
      </div>
      <div className="market-impact-list">
        {marketImpacts.slice(0, 3).map((impact, index) => (
          <div key={`${impact.symbol}-${impact.name}`}>
            <span
              className={`asset-symbol ${['oil', 'rate', 'fx'][index] ?? 'fx'}`}
            >
              {impact.symbol}
            </span>
            <span>
              <strong>{impact.name}</strong>
              <small>{impact.detail}</small>
            </span>
            <em className={index === 1 ? 'neutral' : 'negative'}>
              {impact.direction}
            </em>
          </div>
        ))}
      </div>

      <div className="counter-signal">
        <MessageSquareText size={16} />
        <p>
          <strong>反向信号：</strong>
          {analysis?.counterSignal ??
            '若护航机制快速落地且运价先于油价回落，本轮影响可能止于市场情绪层。'}
        </p>
      </div>
    </div>
  )
}

function ScenarioView({ analysis }: { analysis?: ApiAnalysis | null }) {
  const scenarios = analysis?.scenarios ?? [
    {
      name: '基准情景',
      probability: 55,
      tone: 'base',
      narrative: '通行未中断，风险溢价维持 1–3 周后回落。',
      triggerCondition: '高频风险指标停止创新高',
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
  ]

  return (
    <div className="scenario-view">
      <div className="analysis-summary">
        <span>情景结论</span>
        <p>
          基准情景仍占主导，但升级概率较昨日上调
          <strong> 6 个百分点</strong>，组合需保留尾部保护。
        </p>
      </div>
      <div className="scenario-list">
        {scenarios.map((scenario) => (
          <div className="scenario-item" key={scenario.name}>
            <div>
              <span className={`scenario-dot ${scenario.tone}`} />
              <strong>{scenario.name}</strong>
              <em>{scenario.probability}%</em>
            </div>
            <div className="probability-bar">
              <span
                className={scenario.tone}
                style={{ width: `${scenario.probability}%` }}
              />
            </div>
            <p>{scenario.narrative}</p>
          </div>
        ))}
      </div>
      <div className="decision-box">
        <span>
          <Zap size={14} />
          情景切换条件
        </span>
        <strong>
          {scenarios.find((scenario) => scenario.tone === 'risk')
            ?.triggerCondition ?? '任一主航道连续中断超过 24 小时'}
        </strong>
        <p>触发后，Agent 将自动重估全部情景概率。</p>
      </div>
    </div>
  )
}

function WatchView({ indicators }: { indicators: ApiIndicator[] }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const items =
    indicators.length > 0
      ? indicators
      : [
          {
            id: 'demo-watch-1',
            category: '航运保险',
            title: '战争险报价是否连续两日报跌',
            cadence: '每日 09:00',
            status: 'confirmed' as const,
          },
          {
            id: 'demo-watch-2',
            category: '高频航运',
            title: '油轮等待时间是否突破 14 日高位',
            cadence: '每 4 小时',
            status: 'pending' as const,
          },
          {
            id: 'demo-watch-3',
            category: '能源市场',
            title: '近月价差是否由升水转为深度贴水',
            cadence: '实时',
            status: 'pending' as const,
          },
          {
            id: 'demo-watch-4',
            category: '政策信号',
            title: '护航机制是否形成可执行时间表',
            cadence: '事件触发',
            status: 'pending' as const,
          },
        ]

  return (
    <div className="watch-view">
      <div className="analysis-summary">
        <span>验证框架</span>
        <p>Agent 将持续检查关键指标，并在证据改变核心判断时主动提醒。</p>
      </div>
      <div className="watch-checklist">
        {items.map((item) => {
          const checked =
            overrides[item.id] ?? item.status === 'confirmed'
          return (
            <button
              key={item.id}
              className={checked ? 'done' : ''}
              onClick={() =>
                setOverrides((current) => ({
                  ...current,
                  [item.id]: !checked,
                }))
              }
            >
              <span className="check-box">
                {checked && <Check size={13} />}
              </span>
              <span>
                <small>{item.category}</small>
                <strong>{item.title}</strong>
                <em>{item.cadence}</em>
              </span>
            </button>
          )
        })}
      </div>
      <button className="add-indicator">
        <Plus size={15} />
        添加观察指标
      </button>
    </div>
  )
}

const emptyTimelineEvent: TimelineEvent = {
  id: 'empty',
  date: '待更新',
  weekday: '',
  phase: '待验证',
  category: 'Agent',
  title: '正在建立事件基线',
  summary: 'Agent 正在聚合信源并识别关键事件。',
  source: '尚无信源',
  confidence: 0,
  impact: '低',
  tags: [],
  signal: '等待首轮分析完成',
}

const phaseLabels: Record<ApiTimelineEvent['phase'], EventPhase> = {
  occurred: '已发生',
  evolving: '正在演化',
  watch: '待验证',
}

const impactLabels: Record<ApiTimelineEvent['impact'], ImpactLevel> = {
  high: '高',
  medium: '中',
  low: '低',
}

function toTimelineEvent(event: ApiTimelineEvent): TimelineEvent {
  const occurredAt = new Date(event.occurredAt)
  const validDate = !Number.isNaN(occurredAt.getTime())
  return {
    id: event.id,
    date: validDate
      ? `${occurredAt.getMonth() + 1}月${occurredAt.getDate()}日`
      : '待确认',
    weekday: validDate
      ? new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(
          occurredAt,
        )
      : '',
    time:
      validDate && event.phase !== 'watch'
        ? occurredAt.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })
        : undefined,
    phase: phaseLabels[event.phase],
    category: event.category,
    title: event.title,
    summary: event.summary,
    source: event.sourceLabel,
    confidence: event.confidence,
    impact: impactLabels[event.impact],
    tags: event.tags,
    signal: event.signal,
  }
}

function formatUpdatedAt(value: string) {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return '更新时间待确认'
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return '刚刚更新'
  if (minutes < 60) return `${minutes} 分钟前更新`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} 小时前更新`
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(timestamp)
}

export default App
