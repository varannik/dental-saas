import websocket from '@fastify/websocket';
import type { FastifyPluginAsync } from 'fastify';

export const websocketPlugin: FastifyPluginAsync = async (app): Promise<void> => {
  await app.register(websocket);
};
