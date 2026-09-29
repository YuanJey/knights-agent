import { createAnalysisProvider } from './agent/provider.js'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import {
  MemoryAnalysisQueue,
  RedisAnalysisQueue,
} from './queue/analysisQueue.js'
import { createRepository } from './repositories/createRepository.js'
import { AnalysisService } from './services/analysisService.js'

async function start() {
  const config = loadConfig()
  const repository = createRepository(config)
  const provider = createAnalysisProvider(config)
  const analysisService = new AnalysisService(repository, provider)
  const queue =
    config.queueMode === 'memory'
      ? new MemoryAnalysisQueue(analysisService, repository)
      : new RedisAnalysisQueue(config, repository)
  const app = await createApp({ config, repository, queue })

  const close = async (signal: string) => {
    app.log.info({ signal }, 'shutting down API')
    await app.close()
    process.exit(0)
  }
  process.once('SIGINT', () => void close('SIGINT'))
  process.once('SIGTERM', () => void close('SIGTERM'))

  await app.listen({ host: config.host, port: config.port })
}

start().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
