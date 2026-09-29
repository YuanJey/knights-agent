import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig } from '../config.js'
import { createPool, withTransaction } from './pool.js'

const migrationDirectory = join(process.cwd(), 'database', 'migrations')

async function migrate() {
  const config = loadConfig()
  const pool = createPool(config)

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const files = (await readdir(migrationDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const sql = await readFile(join(migrationDirectory, file), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = await pool.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE version = $1',
        [file],
      )

      const appliedMigration = existing.rows[0]
      if (appliedMigration) {
        if (appliedMigration.checksum !== checksum) {
          throw new Error(`Migration checksum mismatch: ${file}`)
        }
        continue
      }

      const client = await pool.connect()
      try {
        await withTransaction(client, async () => {
          await client.query(sql)
          await client.query(
            'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
            [file, checksum],
          )
        })
        console.info(`Applied migration ${file}`)
      } finally {
        client.release()
      }
    }
  } finally {
    await pool.end()
  }
}

migrate().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
