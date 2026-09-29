import { hostname } from 'node:os'
import { createAnalysisProvider } from './agent/provider.js'
import { loadConfig } from './config.js'
import { RedisAnalysisWorker } from './queue/analysisQueue.js'
import { createRepository } from './repositories/createRepository.js'
import { AnalysisService } from './services/analysisService.js'

async function start() {
  const config = loadConfig()
  if (config.queueMode === 'memory') {
    console.info(
      'Analysis worker is embedded in the API while QUEUE_MODE=memory',
    )
    await waitForShutdown()
    return
  }

  const repository = createRepository(config)
  const provider = createAnalysisProvider(config)
  const service = new AnalysisService(repository, provider)
  const worker = new RedisAnalysisWorker(
    config,
    service,
    repository,
    `${hostname()}-${process.pid}`,
  )

  const close = async (signal: string) => {
    console.info(`Stopping worker after ${signal}`)
    await worker.stop()
    await repository.close()
  }
  process.once('SIGINT', () => void close('SIGINT'))
  process.once('SIGTERM', () => void close('SIGTERM'))

  await worker.start()
}

function waitForShutdown() {
  return new Promise<void>((resolve) => {
    process.once('SIGINT', resolve)
    process.once('SIGTERM', resolve)
  })
}

start().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
