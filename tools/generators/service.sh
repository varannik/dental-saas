#!/bin/bash
set -e

SERVICE_NAME=$1

if [ -z "$SERVICE_NAME" ]; then
    echo "Usage: ./service.sh <service-name>"
    exit 1
fi

SERVICE_DIR="services/$SERVICE_NAME"

if [ -d "$SERVICE_DIR" ]; then
    echo "Service $SERVICE_NAME already exists!"
    exit 1
fi

echo "Creating service: $SERVICE_NAME"

# Create directory structure
mkdir -p "$SERVICE_DIR/src/"{config,controllers,services,repositories,routes,middleware,types,utils}
mkdir -p "$SERVICE_DIR/tests/"{unit,integration}

# Create package.json
cat > "$SERVICE_DIR/package.json" << EOF
{
  "name": "@saas/$SERVICE_NAME-service",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/",
    "test": "vitest"
  },
  "dependencies": {
    "@saas/utils": "workspace:*",
    "@saas/types": "workspace:*",
    "fastify": "^4.26.0",
    "drizzle-orm": "^0.30.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0",
    "pino": "^8.19.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "vitest": "^1.5.0"
  }
}
EOF

# Create index.ts
cat > "$SERVICE_DIR/src/index.ts" << EOF
import Fastify from 'fastify';
import { config } from './config';
import { logger } from './utils/logger';

const app = Fastify({ logger: true });

async function bootstrap() {
  // Health check
  app.get('/health', async () => ({ status: 'ok' }));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    logger.info(\`$SERVICE_NAME service running on port \${config.port}\`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

bootstrap();
EOF

# Create config
cat > "$SERVICE_DIR/src/config/index.ts" << EOF
import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/$SERVICE_NAME',
};
EOF

# Create logger
cat > "$SERVICE_DIR/src/utils/logger.ts" << EOF
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});
EOF

# Create tsconfig.json
cat > "$SERVICE_DIR/tsconfig.json" << EOF
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF

# Create README
cat > "$SERVICE_DIR/README.md" << EOF
# $SERVICE_NAME Service

## Development

\`\`\`bash
pnpm dev
\`\`\`

## Testing

\`\`\`bash
pnpm test
\`\`\`
EOF

echo "✅ Service $SERVICE_NAME created at $SERVICE_DIR"

