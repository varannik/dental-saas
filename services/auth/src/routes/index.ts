import type { FastifyPluginAsync } from 'fastify';

import { loginRoute } from './login.js';
import { logoutRoute } from './logout.js';
import { meRoute } from './me.js';
import { refreshRoute } from './refresh.js';
import { registerRoute } from './register.js';
import { sessionsRoute } from './sessions.js';

export const registerAuthRoutes: FastifyPluginAsync = async (app): Promise<void> => {
  await app.register(registerRoute);
  await app.register(loginRoute);
  await app.register(logoutRoute);
  await app.register(refreshRoute);
  await app.register(meRoute);
  await app.register(sessionsRoute);
};
