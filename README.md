# 经纬 Agent

面向宏观经济与地缘政治研究的全栈 Agent 工作台。系统把事件信源组织为时间线，通过可靠任务队列触发结构化分析，并持续维护传导路径、情景概率和后续观察指标。

## 系统结构

```text
React/Vite Web
      |
      v
Fastify API -- PostgreSQL
      |
      v
Redis Streams -- Analysis Worker -- OpenAI-compatible LLM
                                      |
                                      v
                           validated structured output
```

- `src/`：研究工作台、API 客户端、开发环境降级数据
- `server/app.ts`：HTTP API、鉴权、限流、错误处理和审计入口
- `server/agent/`：模型提供商适配与结构化输出验证
- `server/queue/`：Redis Streams 生产者、消费者、ACK、重试与死信队列
- `server/repositories/`：PostgreSQL 与内存仓储实现
- `database/migrations/`：不可变 DDL 迁移
- `database/seeds/`：本地研究样本
- `tests/`：Playwright 桌面与移动端流程测试

## 本地运行

无需外部基础设施即可运行完整链路。默认使用进程内仓储、队列和确定性分析器：

```bash
npm install
cp .env.example .env
npm run dev
```

- Web: <http://127.0.0.1:5173>
- API: <http://127.0.0.1:8787>
- Readiness: <http://127.0.0.1:8787/readyz>

## PostgreSQL 与 Redis

安装 Docker 后可启动持久化版本：

```bash
docker compose up --build
```

访问 <http://localhost:8080>。Compose 会按顺序执行迁移和开发种子，然后启动 API、Redis Streams Worker 与 Web。

也可以手工连接基础设施：

```bash
DATA_MODE=postgres QUEUE_MODE=redis npm run db:migrate
DATA_MODE=postgres QUEUE_MODE=redis npm run db:seed
DATA_MODE=postgres QUEUE_MODE=redis npm run dev
```

开发种子的 API Key 为 `dev-atlas-local-key`，只允许用于本地环境。

为已有工作空间生成一次性可见的生产 API Key：

```bash
API_KEY_WORKSPACE_ID=<workspace-uuid> \
API_KEY_NAME=research-gateway \
npm run db:create-key
```

## 模型配置

本地默认使用可重复的 `heuristic` 分析器。接入任意 OpenAI-compatible 服务：

```bash
LLM_MODE=openai-compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=...
LLM_MODEL=gpt-4.1-mini
```

模型输出必须通过 Zod 契约校验，包括：

- 核心判断与置信度
- 3–8 个传导节点
- 概率合计为 100% 的情景集合
- 可验证的观察指标
- 跨市场影响与反向信号

## API

所有业务接口位于 `/api/v1`：

| Method | Path | Scope | Purpose |
| --- | --- | --- | --- |
| `GET` | `/topics` | `research:read` | 查询研究议题 |
| `GET` | `/topics/featured` | `research:read` | 获取首页完整研究数据 |
| `GET` | `/topics/:id` | `research:read` | 获取议题、时间线和分析 |
| `POST` | `/topics` | `research:write` | 创建议题并触发基线分析 |
| `POST` | `/topics/:id/events` | `research:write` | 摄入带信源事件并触发刷新 |
| `POST` | `/topics/:id/analyses` | `research:write` | 触发刷新或定时分析 |
| `POST` | `/topics/:id/questions` | `research:write` | 提交后续研究问题 |
| `GET` | `/jobs/:id` | `research:read` | 查询异步任务状态 |

生产环境必须设置 `AUTH_MODE=enabled`。API Key 仅以 SHA-256 哈希存储，日志会自动脱敏。

## 验证

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npm audit --omit=dev
```

## 生产约束

当 `NODE_ENV=production` 时，配置校验会强制：

- `DATA_MODE=postgres`
- `QUEUE_MODE=redis`
- `AUTH_MODE=enabled`
- `LLM_MODE=openai-compatible`
- 配置有效的 `LLM_API_KEY`

正式部署还应由平台提供 TLS、密钥托管、PostgreSQL 备份、Redis 持久化、日志采集和告警。前端若面向终端用户，应在网关接入企业 OAuth/OIDC，不应向浏览器分发服务 API Key。
