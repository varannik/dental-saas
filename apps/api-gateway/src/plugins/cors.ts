import cors from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';

function getAllowedOrigins(): (string | RegExp)[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw) return ['http://localhost:3000', 'http://localhost:5173'];

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const corsPlugin: FastifyPluginAsync = async (app): Promise<void> => {
  await app.register(cors, {
    origin: getAllowedOrigins(),
    credentials: true,
  });
};
