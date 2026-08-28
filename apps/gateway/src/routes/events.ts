/**
 * SSE (Server-Sent Events) — /api/events/:userId
 * Panel webhook gelince APPROVED/REJECTED push'lar
 */
import type { FastifyInstance } from 'fastify';

// ─── SSE client store ────────────────────────────────────────────────────

interface SseClient {
  id:      string;
  userId:  string;
  send:    (data: object) => void;
  close:   () => void;
}

const sseClients = new Map<string, SseClient[]>();

export function sseNotify(userId: string, data: object) {
  const clients = sseClients.get(userId) ?? [];
  const dead: SseClient[] = [];
  for (const client of clients) {
    try {
      client.send(data);
    } catch {
      dead.push(client);
    }
  }
  for (const d of dead) {
    const arr = sseClients.get(userId);
    if (arr) {
      const idx = arr.indexOf(d);
      if (idx >= 0) arr.splice(idx, 1);
    }
  }
}

// ─── Route ───────────────────────────────────────────────────────────────

export async function eventsRoutes(app: FastifyInstance) {
  app.get<{ Params: { userId: string } }>(
    '/api/events/:userId',
    {
      schema: {
        params: {
          type: 'object',
          properties: { userId: { type: 'string' } },
          required: ['userId'],
        },
      },
    },
    async (request, reply) => {
      const { userId } = request.params;

      // Fastify SSE — raw response
      reply.raw.writeHead(200, {
        'Content-Type':               'text/event-stream',
        'Cache-Control':              'no-cache',
        'X-Accel-Buffering':          'no',
        'Access-Control-Allow-Origin':'*',
        Connection:                   'keep-alive',
      });

      // Connected message
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

      const client: SseClient = {
        id:     crypto.randomUUID(),
        userId,
        send:   (data) => {
          reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
        },
        close: () => {
          reply.raw.end();
        },
      };

      if (!sseClients.has(userId)) sseClients.set(userId, []);
      sseClients.get(userId)!.push(client);

      // Keep-alive ping every 25s
      const ping = setInterval(() => {
        try {
          reply.raw.write(': ping\n\n');
        } catch {
          clearInterval(ping);
        }
      }, 25000);

      // Cleanup on disconnect
      request.raw.on('close', () => {
        clearInterval(ping);
        const arr = sseClients.get(userId);
        if (arr) {
          const idx = arr.indexOf(client);
          if (idx >= 0) arr.splice(idx, 1);
        }
      });

      // Keep connection open
      await new Promise<void>(resolve => {
        request.raw.on('close', resolve);
      });
    },
  );
}
