import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('production configuration', () => {
  it('rejects unsafe production defaults', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow()
  })

  it('accepts persistent, authenticated production configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      DATA_MODE: 'postgres',
      QUEUE_MODE: 'redis',
      AUTH_MODE: 'enabled',
      LLM_MODE: 'openai-compatible',
      LLM_API_KEY: 'production-secret',
    })

    expect(config).toMatchObject({
      nodeEnv: 'production',
      dataMode: 'postgres',
      queueMode: 'redis',
      authMode: 'enabled',
      llmMode: 'openai-compatible',
    })
  })
})
