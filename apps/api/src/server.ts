import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerAuditRoutes } from './modules/audit/routes.js';
import { registerClinicCommands } from './modules/clinic/commands.js';
import { registerClinicRoutes } from './modules/clinic/routes.js';
import { CommandBus } from './modules/commands/bus.js';
import { registerDiagnosisCommands } from './modules/diagnoses/commands.js';
import { registerDiagnosisRoutes } from './modules/diagnoses/routes.js';
import { registerHistoryCommands } from './modules/history/commands.js';
import { registerHistoryRoutes } from './modules/history/routes.js';
import { CSRF_HEADER, registerIdentityRoutes } from './modules/identity/routes.js';
import { registerPatientCommands } from './modules/patients/commands.js';
import { registerPlanCommands } from './modules/plans/commands.js';
import { registerProcedureCommands } from './modules/procedures/commands.js';
import { registerProcedureRoutes } from './modules/procedures/routes.js';
import { registerPlanRoutes } from './modules/plans/routes.js';
import { registerPatientRoutes } from './modules/patients/routes.js';
import { registerSessionCommands } from './modules/sessions/commands.js';
import { registerSessionRoutes } from './modules/sessions/routes.js';
import { registerWorkspaceRoutes } from './modules/workspace/routes.js';
import { registerVoiceStream, selectVoiceProtocol } from './modules/voice/stream/routes.js';
import type { Emit, StreamSink, StreamTimings } from './modules/voice/stream/streams.js';
import type { TicketHolder } from './modules/voice/stream/tickets.js';
import { registerVoiceContextRoutes } from './modules/voice/context/routes.js';
import { VoiceContextService } from './modules/voice/context/service.js';
import { MemoryContextStore, type ContextStore } from './modules/voice/context/store.js';
import { registerInterpretRoutes } from './modules/voice/interpreter/routes.js';
import { ProposalService } from './modules/voice/confirm/proposals.js';
import { registerProposalRoutes } from './modules/voice/confirm/routes.js';
import { InterpretationService } from './modules/voice/interpreter/service.js';
import type { InterpreterRegistry } from './modules/voice/interpreters.js';
import type { SecretBox } from './platform/secret-box.js';
import type { IdentityService } from './modules/identity/service.js';
import type { TokenService } from './modules/identity/tokens.js';
import type { Pool } from './platform/db.js';
import { HttpProblem } from './platform/http-problem.js';
import { problem } from './platform/problems.js';
import { registerVoiceSpike, type VoiceSpikeDeps } from './spikes/voice/route.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Present when the server has a database (identity deps). */
    commandBus?: CommandBus;
  }
}

export interface IdentityDeps {
  pool: Pool;
  service: IdentityService;
  tokens: TokenService;
  cookie: { secure: boolean; sameSite: 'lax' | 'strict' | 'none' };
  loginRateLimit?: number;
  /** Encrypts patient identifiers such as national IDs. */
  dataBox: SecretBox;
}

export interface ServerOptions {
  logger?: boolean | { level: string };
  corsOrigin?: string;
  /** Registers sign-in, the command bus and every route that needs the database when set. */
  identity?: IdentityDeps;
  /** Lets tests register extra commands on the bus the server builds. */
  onCommandBus?: (bus: CommandBus) => void;
  /** Registers the development-only voice spike endpoint when set. */
  voiceSpike?: VoiceSpikeDeps;
  /** The interpreters for voice commands (V4); interpretation is off without them. */
  interpreters?: InterpreterRegistry;
  /** Where voice contexts live (V3): Valkey in the running API; in memory when unset. */
  contextStore?: ContextStore;
  /** Voice stream tuning, for tests; speech-to-text plugs in as the sink (V2). */
  voiceStream?: {
    timings?: Partial<StreamTimings>;
    createSink?: (owner: TicketHolder, emit: Emit) => StreamSink;
  };
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? false,
    genReqId: (request) => {
      const header = request.headers['x-request-id'];
      return typeof header === 'string' && header.length > 0 ? header : crypto.randomUUID();
    },
    requestIdHeader: 'x-request-id',
  });

  app.setNotFoundHandler((request, reply) => {
    reply
      .status(404)
      .type('application/problem+json')
      .send(
        problem({
          status: 404,
          title: 'Not found',
          instance: request.url,
          requestId: request.id,
        })
      );
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpProblem) {
      reply
        .status(error.statusCode)
        .headers(error.headers)
        .type('application/problem+json')
        .send({
          ...problem({
            status: error.statusCode,
            code: error.code,
            title: error.title,
            instance: request.url,
            requestId: request.id,
          }),
          ...error.extra,
        });
      return;
    }
    const statusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (statusCode >= 500) request.log.error({ err: error }, 'request failed');
    const message = error instanceof Error ? error.message : 'Internal server error';
    const title = statusCode === 500 ? 'Internal server error' : message;
    reply
      .status(statusCode)
      .type('application/problem+json')
      .send(
        problem({
          status: statusCode,
          title,
          detail: statusCode === 500 ? undefined : message,
          instance: request.url,
          requestId: request.id,
        })
      );
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: options.corsOrigin ?? 'http://localhost:3000',
    // The refresh cookie travels with credentialed requests from the web app only.
    credentials: true,
    // The default allows only GET, HEAD and POST; updates use PATCH.
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key', CSRF_HEADER],
    exposedHeaders: ['command-id', 'idempotent-replayed', 'retry-after', 'x-request-id'],
  });
  // Per address. A clinic's workstations usually share one public address, and a clinician
  // clicking through a session makes several requests a second. CORS answers preflights before
  // this runs, so they do not count; sign-in has its own, much lower limits.
  await app.register(rateLimit, {
    max: 1200,
    timeWindow: '1 minute',
  });
  await app.register(cookie);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/readyz', async (request, reply) => {
    if (options.identity) {
      try {
        await options.identity.pool.query('SELECT 1');
      } catch (error) {
        request.log.warn({ err: error }, 'database not ready');
        return reply.status(503).send({ status: 'unavailable', database: 'down' });
      }
    }
    if (options.contextStore?.ping && !(await options.contextStore.ping())) {
      request.log.warn('valkey not ready');
      return reply.status(503).send({ status: 'unavailable', valkey: 'down' });
    }
    return { status: 'ok' };
  });

  if (options.identity || options.voiceSpike) {
    await app.register(websocket, {
      // 20 ms frames are 645 bytes; anything near this is not audio from our client.
      options: { maxPayload: 64 * 1024, handleProtocols: selectVoiceProtocol },
    });
  }

  if (options.identity) {
    const { pool, tokens, dataBox } = options.identity;
    await registerIdentityRoutes(app, options.identity);

    const bus = new CommandBus(pool);
    registerClinicCommands(bus);
    registerPatientCommands(bus, dataBox);
    registerHistoryCommands(bus);
    registerSessionCommands(bus);
    registerDiagnosisCommands(bus);
    registerPlanCommands(bus);
    registerProcedureCommands(bus);
    options.onCommandBus?.(bus);
    app.decorate('commandBus', bus);
    await registerClinicRoutes(app, { bus, tokens });
    await registerAuditRoutes(app, { pool, tokens });
    await registerPatientRoutes(app, { pool, bus, tokens, secrets: dataBox });
    await registerHistoryRoutes(app, { pool, bus, tokens });
    await registerSessionRoutes(app, { pool, bus, tokens });
    await registerDiagnosisRoutes(app, { pool, bus, tokens });
    await registerPlanRoutes(app, { pool, bus, tokens });
    await registerProcedureRoutes(app, { bus, tokens });
    await registerWorkspaceRoutes(app, { pool, tokens });
    const contextStore = options.contextStore ?? new MemoryContextStore();
    const voiceContext = new VoiceContextService(contextStore, pool);
    app.decorate('voiceContext', voiceContext);
    app.addHook('onClose', async () => contextStore.close());
    await registerVoiceContextRoutes(app, { tokens, context: voiceContext });
    const proposals = new ProposalService({ pool, bus, context: voiceContext });
    app.decorate('proposals', proposals);
    await registerProposalRoutes(app, { tokens, proposals });
    const interpretation = options.interpreters
      ? new InterpretationService({
          pool,
          context: voiceContext,
          proposals,
          interpreters: options.interpreters,
          log: app.log,
        })
      : null;
    app.decorate('interpretation', interpretation);
    await registerInterpretRoutes(app, { tokens, interpretation });
    await registerVoiceStream(app, {
      pool,
      tokens,
      allowedOrigin: options.corsOrigin ?? 'http://localhost:3000',
      ...options.voiceStream,
    });
  }

  if (options.voiceSpike) {
    await registerVoiceSpike(app, options.voiceSpike);
  }

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    voiceContext?: VoiceContextService;
    interpretation?: InterpretationService | null;
    proposals?: ProposalService;
  }
}
