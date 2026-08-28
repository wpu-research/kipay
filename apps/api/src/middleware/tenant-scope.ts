import { FastifyRequest, FastifyReply } from 'fastify';

// İskelet: Story 2.1'de tenant_id request'e enjekte edilecek
// Aktif değil — şimdilik no-op
export async function tenantScope(
  _request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // TODO (Story 2.1): JWT token'dan tenant_id çıkar ve request context'e ekle
}
