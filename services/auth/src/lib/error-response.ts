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
    const message = isProduction ? 'Internal Server Error' : formatErrorChain(error);

    request.log.error({ err: error }, 'Auth request failed');

    return reply.code(statusCode).send({
      statusCode,
      error: 'Internal Server Error',
      message,
    });
  });
}
