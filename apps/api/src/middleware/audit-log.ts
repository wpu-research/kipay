import { FastifyRequest, FastifyReply } from 'fastify'
import { auditLogService } from '../features/audit/audit.service.js'

// onSend hook imzası: async (request, reply, payload) => void
// Request başarıyla tamamlandıktan sonra çalışır
export async function auditLog(
  request: FastifyRequest,
  reply: FastifyReply,
  _payload: unknown
): Promise<void> {
  // Yalnızca auditEntry set edilmişse ve başarılı yanıt (2xx) varsa logla
  if (!request.auditEntry) return
  if (reply.statusCode < 200 || reply.statusCode >= 300) return
  if (!request.user) return  // authenticate olmayan istekler loglanmaz

  // Masquerade altında gerçek aktör originalUserId'dir — adına işlem yapılan değil
  const auditUserId   = request.user.masquerading && request.user.originalUserId
    ? request.user.originalUserId
    : request.user.userId
  // Masquerade aktörü her zaman super_admin rolündedir
  const auditUserRole = request.user.masquerading && request.user.originalUserId
    ? 'super_admin' as const
    : request.user.role

  // Fire-and-forget: await etmeden başlat — yanıt yolunu bloke etmez
  // async function hemen çözülerek Fastify'ın yanıtı göndermesine izin verir
  auditLogService.createAuditLog({
    ...request.auditEntry,
    userId:   auditUserId,
    userRole: auditUserRole,
    ip:       request.ip,  // Fastify trustProxy ayarı sayesinde gerçek IP
  }).catch(err => {
    request.log.error({ err }, 'Audit log yazılamadı')
  })
}
