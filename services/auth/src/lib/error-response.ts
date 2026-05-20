import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

function formatErrorChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();
  let depth = 0;
  const maxDepth = 8;

  while (depth < maxDepth && current instanceof Error && !seen.has(current)) {
    seen.add(current);
    const msg = current.message?.trim();
    if (msg) parts.push(msg);
    current = current.cause;
    depth += 1;
  }

  return parts.length > 0 ? parts.join(' | ') : 'Unexpected error';
}

function resolveHttpStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const n = Number((error as { statusCode?: unknown }).statusCode);
    if (Number.isFinite(n) && n >= 400 && n < 600) return n;
  }

  const detail = formatErrorChain(error);
  if (/ECONNREFUSED|Redis is not reachable|ENOTFOUND.*6379/i.test(detail)) {
    return 503;
  }
  if (/relation ["']?sessions["']? does not exist|missing the sessions table/i.test(detail)) {
    return 503;
  }

  return 500;
}

/**
 * Fastify error handler: Zod → 400; non-production includes DB/driver detail from `error.cause`.
 */
export function registerAuthErrorHandler(app: {
  setErrorHandler: (
    handler: (error: unknown, request: FastifyRequest, reply: FastifyReply) => unknown
  ) => void;
}): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'Validation failed.',
        details: error.flatten(),
      });
    }

    const statusCode = resolveHttpStatus(error);
    const isProduction = process.env.NODE_ENV === 'production';
    const detail = formatErrorChain(error);

    request.log.error({ err: error }, 'Auth request failed');

    if (statusCode >= 500) {
      const clientError = statusCode === 503 ? 'Service Unavailable' : 'Internal Server Error';
      return reply.code(statusCode).send({
        statusCode,
        error: clientError,
        message: isProduction ? clientError : detail,
      });
    }

    return reply.code(statusCode).send({
      statusCode,
      error: detail,
      message: detail,
    });
  });
}
