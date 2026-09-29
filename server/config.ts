import 'dotenv/config'
import { z } from 'zod'

const ConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8787),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATA_MODE: z.enum(['memory', 'postgres']).default('memory'),
    QUEUE_MODE: z.enum(['memory', 'redis']).default('memory'),
    DATABASE_URL: z
      .url()
      .default('postgresql://atlas:atlas@127.0.0.1:5432/atlas'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    REDIS_URL: z.url().default('redis://127.0.0.1:6379'),
    REDIS_STREAM_KEY: z.string().min(1).default('atlas:analysis:jobs'),
    REDIS_CONSUMER_GROUP: z.string().min(1).default('atlas-workers'),
    AUTH_MODE: z.enum(['enabled', 'disabled']).default('disabled'),
    DEV_WORKSPACE_ID: z
      .uuid()
      .default('00000000-0000-0000-0000-000000000001'),
    CORS_ORIGINS: z
      .string()
      .default('http://127.0.0.1:5173,http://localhost:5173'),
    LLM_MODE: z.enum(['heuristic', 'openai-compatible']).default('heuristic'),
    LLM_BASE_URL: z.url().default('https://api.openai.com/v1'),
    LLM_API_KEY: z.string().optional(),
    LLM_MODEL: z.string().min(1).default('gpt-4.1-mini'),
    LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(180000).default(60000),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === 'production' && config.AUTH_MODE !== 'enabled') {
      context.addIssue({
        code: 'custom',
        path: ['AUTH_MODE'],
        message: 'AUTH_MODE must be enabled in production',
      })
    }

    if (config.NODE_ENV === 'production' && config.DATA_MODE !== 'postgres') {
      context.addIssue({
        code: 'custom',
        path: ['DATA_MODE'],
        message: 'DATA_MODE must be postgres in production',
      })
    }

    if (config.NODE_ENV === 'production' && config.QUEUE_MODE !== 'redis') {
      context.addIssue({
        code: 'custom',
        path: ['QUEUE_MODE'],
        message: 'QUEUE_MODE must be redis in production',
      })
    }

    if (
      config.NODE_ENV === 'production' &&
      config.LLM_MODE !== 'openai-compatible'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['LLM_MODE'],
        message: 'A remote LLM provider must be configured in production',
      })
    }

    if (config.LLM_MODE === 'openai-compatible' && !config.LLM_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['LLM_API_KEY'],
        message: 'LLM_API_KEY is required for an OpenAI-compatible provider',
      })
    }
  })

export type AppConfig = {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  logLevel: string
  dataMode: 'memory' | 'postgres'
  queueMode: 'memory' | 'redis'
  databaseUrl: string
  databasePoolMax: number
  redisUrl: string
  redisStreamKey: string
  redisConsumerGroup: string
  authMode: 'enabled' | 'disabled'
  devWorkspaceId: string
  corsOrigins: string[]
  llmMode: 'heuristic' | 'openai-compatible'
  llmBaseUrl: string
  llmApiKey?: string
  llmModel: string
  llmTimeoutMs: number
}

export function loadConfig(environment = process.env): AppConfig {
  const parsed = ConfigSchema.parse(environment)

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    dataMode: parsed.DATA_MODE,
    queueMode: parsed.QUEUE_MODE,
    databaseUrl: parsed.DATABASE_URL,
    databasePoolMax: parsed.DATABASE_POOL_MAX,
    redisUrl: parsed.REDIS_URL,
    redisStreamKey: parsed.REDIS_STREAM_KEY,
    redisConsumerGroup: parsed.REDIS_CONSUMER_GROUP,
    authMode: parsed.AUTH_MODE,
    devWorkspaceId: parsed.DEV_WORKSPACE_ID,
    corsOrigins: parsed.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    llmMode: parsed.LLM_MODE,
    llmBaseUrl: parsed.LLM_BASE_URL.replace(/\/$/, ''),
    llmApiKey: parsed.LLM_API_KEY,
    llmModel: parsed.LLM_MODEL,
    llmTimeoutMs: parsed.LLM_TIMEOUT_MS,
  }
}
