import type { AppConfig } from '../config.js'
import { createPool } from '../db/pool.js'
import { MemoryResearchRepository } from './memoryResearchRepository.js'
import { PostgresResearchRepository } from './postgresResearchRepository.js'
import type { ResearchRepository } from './researchRepository.js'

export function createRepository(config: AppConfig): ResearchRepository {
  if (config.dataMode === 'memory') {
    return new MemoryResearchRepository()
  }
  return new PostgresResearchRepository(createPool(config))
}
