import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
) {
  logger.error({
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method,
  });

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.message,
      code: error.code,
    });
  }

  // Handle Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      details: error.validation,
    });
  }

  // Default error response
  return reply.status(500).send({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}

