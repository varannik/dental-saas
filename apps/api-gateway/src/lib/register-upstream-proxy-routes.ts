import type { FastifyInstance, RouteHandlerMethod } from 'fastify';

/** Forward these to upstream services only. OPTIONS must not be intercepted so @fastify/cors can answer preflight. */
/** `HEAD` is implied for `GET` routes in Fastify 5; listing it twice throws. */
export const UPSTREAM_PROXY_HTTP_METHODS = ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'] as const;

export function registerUpstreamProxyRoutes(
  app: FastifyInstance,
  urls: readonly string[],
  handler: RouteHandlerMethod
): void {
  for (const method of UPSTREAM_PROXY_HTTP_METHODS) {
    for (const url of urls) {
      app.route({ method, url, handler });
    }
  }
}
