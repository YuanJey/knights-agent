import type { AuthContext } from '../domain/contracts.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext
  }
}
