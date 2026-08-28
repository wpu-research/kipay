import type { JwtPayload, AuditEntryInput } from '@panel/types'
import type PgBoss from 'pg-boss'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

// auditEntry: onSend hook'un okuyacağı, route handler'ların setlediği obje
declare module 'fastify' {
  interface FastifyRequest {
    auditEntry?: AuditEntryInput
  }
  interface FastifyInstance {
    boss: PgBoss
  }
}
