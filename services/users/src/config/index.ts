import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '4002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/users',
};

