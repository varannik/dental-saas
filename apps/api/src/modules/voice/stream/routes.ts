import { VOICE_PROTOCOL, VOICE_TICKET_PREFIX, type VoiceTicketResponse } from '@dental/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { authenticate, requirePermission } from '../../../platform/auth.js';
import type { Pool } from '../../../platform/db.js';
import { HttpProblem } from '../../../platform/http-problem.js';
import type { TokenService } from '../../identity/tokens.js';
import { StreamRegistry, type Emit, type StreamSink, type StreamTimings } from './streams.js';
import { consumeTicket, issueTicket, type TicketHolder } from './tickets.js';

/**
 * POST /v1/voice/tickets   a single-use ticket for the socket (voice.use)
 * WS   /v1/voice/stream    audio in, events out; refused before the upgrade without a ticket
 */

declare module 'fastify' {
  interface FastifyRequest {
    voiceHolder?: TicketHolder;
  }
}

/** The subprotocols the WebSocket server accepts: ours, and never the ticket. */
export function selectVoiceProtocol(protocols: Set<string>): string | false {
  return protocols.has(VOICE_PROTOCOL) ? VOICE_PROTOCOL : false;
}

function ticketFrom(request: FastifyRequest): string | null {
  const header = request.headers['sec-websocket-protocol'];
  if (typeof header !== 'string') return null;
  const offered = header.split(',').map((value) => value.trim());
  if (!offered.includes(VOICE_PROTOCOL)) return null;
  const ticket = offered.find((value) => value.startsWith(VOICE_TICKET_PREFIX));
  return ticket ? ticket.slice(VOICE_TICKET_PREFIX.length) : null;
}

export async function registerVoiceStream(
  app: FastifyInstance,
  options: {
    pool: Pool;
    tokens: TokenService;
    /** The web app's origin; a socket opened from any other page is refused. */
    allowedOrigin: string;
    timings?: Partial<StreamTimings>;
    createSink?: (owner: TicketHolder, emit: Emit) => StreamSink;
  }
) {
  const { pool, tokens } = options;
  const registry = new StreamRegistry({
    log: app.log,
    timings: options.timings,
    createSink: options.createSink,
  });
  app.decorate('voiceStreams', registry);
  app.addHook('onClose', async () => registry.closeAll());

  app.post(
    '/v1/voice/tickets',
    {
      preHandler: [authenticate(tokens), requirePermission('voice.use')],
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (request, reply): Promise<VoiceTicketResponse> => {
      const { ticket, expiresAt } = await issueTicket(pool, request.auth!);
      reply.status(201).header('cache-control', 'no-store');
      return { ticket, expiresAt: expiresAt.toISOString() };
    }
  );

  app.get(
    '/v1/voice/stream',
    {
      websocket: true,
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
      preValidation: async (request) => {
        const origin = request.headers.origin;
        if (origin !== undefined && origin !== options.allowedOrigin) {
          throw new HttpProblem(403, 'forbidden', 'This page may not open the voice stream.');
        }
        const ticket = ticketFrom(request);
        const holder = ticket ? await consumeTicket(pool, ticket) : null;
        if (!holder) {
          throw new HttpProblem(401, 'unauthenticated', 'A valid voice ticket is required.');
        }
        request.voiceHolder = holder;
      },
    },
    (socket, request) => {
      registry.accept(socket, request.voiceHolder!);
    }
  );
}

declare module 'fastify' {
  interface FastifyInstance {
    voiceStreams?: StreamRegistry;
  }
}
