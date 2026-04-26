import type { FastifyPluginAsync } from 'fastify';

export const voiceProxyRoute: FastifyPluginAsync = async (app): Promise<void> => {
  app.get('/voice/ws', { websocket: true }, (socket) => {
    socket.send(
      JSON.stringify({
        message: 'Voice websocket proxy not implemented yet.',
      })
    );
    socket.close();
  });
};
