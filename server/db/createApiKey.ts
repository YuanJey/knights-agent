import { createHash, randomBytes } from 'node:crypto'
import { loadConfig } from '../config.js'
import { createPool } from './pool.js'

async function createApiKey() {
  const workspaceId = process.env.API_KEY_WORKSPACE_ID
  const name = process.env.API_KEY_NAME
  if (!workspaceId || !name) {
    throw new Error('API_KEY_WORKSPACE_ID and API_KEY_NAME are required')
  }

  const secret = `atlas_${randomBytes(32).toString('base64url')}`
  const hash = createHash('sha256').update(secret).digest('hex')
  const config = loadConfig()
  const pool = createPool(config)

  try {
    const result = await pool.query(
      `
        INSERT INTO api_keys (
          workspace_id, name, key_prefix, key_hash
        )
        SELECT id, $2, $3, $4
        FROM workspaces
        WHERE id = $1
        RETURNING id
      `,
      [workspaceId, name, secret.slice(0, 12), hash],
    )
    if (!result.rowCount) throw new Error('Workspace not found')
    console.info(`API key created: ${secret}`)
    console.info('Store this value now; it cannot be recovered later.')
  } finally {
    await pool.end()
  }
}

createApiKey().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
