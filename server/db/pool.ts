import pg from 'pg'
import type { PoolClient } from 'pg'
import type { AppConfig } from '../config.js'

const { Pool } = pg

export function createPool(config: AppConfig) {
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: 'atlas-agent',
    ssl:
      config.nodeEnv === 'production'
        ? { rejectUnauthorized: true }
        : undefined,
  })
}

export async function withTransaction<T>(
  client: PoolClient,
  operation: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN')
  try {
    const result = await operation()
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
