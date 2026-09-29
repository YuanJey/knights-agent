import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadConfig } from '../config.js'
import { createPool } from './pool.js'

async function seed() {
  const config = loadConfig()
  if (config.nodeEnv === 'production') {
    throw new Error('Development seed cannot run in production')
  }

  const seedFile = join(process.cwd(), 'database', 'seeds', 'development.sql')
  const pool = createPool(config)

  try {
    await pool.query(await readFile(seedFile, 'utf8'))
    console.info('Development data seeded')
  } finally {
    await pool.end()
  }
}

seed().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
