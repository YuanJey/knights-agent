import type { AnalysisProvider } from '../agent/provider.js'
import type { ResearchRepository } from '../repositories/researchRepository.js'

export class AnalysisService {
  constructor(
    private readonly repository: ResearchRepository,
    private readonly provider: AnalysisProvider,
  ) {}

  async process(jobId: string): Promise<'completed' | 'skipped'> {
    const job = await this.repository.getJobForWorker(jobId)
    if (!job || ['completed', 'failed'].includes(job.status)) return 'skipped'

    const claimed = await this.repository.markJobRunning(jobId)
    if (!claimed) return 'skipped'

    try {
      const topic = await this.repository.getTopicDetail(
        job.workspaceId,
        job.topicId,
      )
      if (!topic) throw new Error('Topic context not found')

      const result = await this.provider.analyze(topic, job.question)
      await this.repository.completeAnalysis(job, {
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
        inputSnapshot: {
          topicUpdatedAt: topic.topic.updatedAt,
          eventIds: topic.timeline.map((event) => event.id),
          question: job.question,
        },
        output: result.output,
        tokenUsage: result.tokenUsage,
      })
      await this.repository.recordAudit({
        workspaceId: job.workspaceId,
        actorType: 'worker',
        actorId: 'analysis-worker',
        action: 'analysis.completed',
        resourceType: 'analysis_job',
        resourceId: job.id,
        payload: {
          topicId: job.topicId,
          provider: result.provider,
          model: result.model,
        },
      })
      return 'completed'
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = await this.repository.failJob(jobId, message)
      await this.repository.recordAudit({
        workspaceId: job.workspaceId,
        actorType: 'worker',
        actorId: 'analysis-worker',
        action: `analysis.${status}`,
        resourceType: 'analysis_job',
        resourceId: job.id,
        payload: { topicId: job.topicId, error: message.slice(0, 500) },
      })
      throw error
    }
  }
}
