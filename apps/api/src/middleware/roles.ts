import type { FastifyRequest, FastifyReply } from 'fastify'
import { AppError } from '../errors/app-error.js'

export async function requireTenantAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!['tenant_admin', 'super_admin'].includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu endpoint yalnızca tenant_admin rolü için geçerlidir.', 403)
  }
}

export async function requireFinansAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!['finans_admin', 'super_admin'].includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu endpoint yalnızca finans_admin rolü için geçerlidir.', 403)
  }
}

export async function requireFinansOperator(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!['finans_operator', 'super_admin'].includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu endpoint yalnızca finans_operator rolü için geçerlidir.', 403)
  }
}

// tenant_admin veya finans_admin — manuel çekim oluşturma gibi yönetici işlemleri için (super_admin dahil değil — AC #5)
export async function requireTenantOrFinansAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!['tenant_admin', 'finans_admin'].includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu endpoint tenant_admin veya finans_admin rolü için geçerlidir.', 403)
  }
}

// finans_admin veya finans_operator — işlemleri görüntüleme gibi ortak endpointler için
export async function requireFinans(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!['finans_admin', 'finans_operator', 'super_admin'].includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu endpoint finans rolleri için geçerlidir.', 403)
  }
}

// finans_operator STRICT — claim/approve/reject gibi işlemler (super_admin dahil değil)
export async function requireStrictFinansOperator(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (request.user.role !== 'finans_operator') {
    throw new AppError('FORBIDDEN', 'Bu endpoint yalnızca finans_operator rolü için geçerlidir.', 403)
  }
}

// claim/approve/reject — finans_operator, finans_admin, tenant_admin (super_admin dahil değil — AC #5)
export async function requireTransactionProcessor(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!['finans_operator', 'finans_admin', 'tenant_admin'].includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu endpoint finans veya tenant_admin rolleri için geçerlidir.', 403)
  }
}

// tenant_admin, finans_admin, finans_operator + super_admin — audit log gibi tenant-scoped görüntüleme
export async function requireTenantStaff(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!['tenant_admin', 'finans_admin', 'finans_operator', 'super_admin'].includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu endpoint tenant staff rolleri için geçerlidir.', 403)
  }
}

export async function requireSuperAdmin(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (request.user.role !== 'super_admin') {
    throw new AppError('FORBIDDEN', 'Bu endpoint yalnızca super_admin yetkisiyle erişilebilir.', 403)
  }
}

// finans veya merchant — işlem izleme gibi geniş görüntüleme endpointleri
export async function requireFinansOrMerchant(request: FastifyRequest, _reply: FastifyReply) {
  if (!request.user) throw new AppError('UNAUTHORIZED', 'Kimlik doğrulama gerekli.', 401)
  if (!['finans_admin', 'finans_operator', 'merchant', 'super_admin'].includes(request.user.role)) {
    throw new AppError('FORBIDDEN', 'Bu endpoint finans veya merchant rolleri için geçerlidir.', 403)
  }
}
