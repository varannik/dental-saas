-- init-db.sql
-- PostgreSQL initialization script for local development

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- Create vector extension for AI embeddings (if available)
-- Uncomment if you have pgvector installed
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- Set timezone
SET timezone = 'UTC';

-- Create schemas (if needed for multi-tenancy)
-- CREATE SCHEMA IF NOT EXISTS tenant_1;
-- CREATE SCHEMA IF NOT EXISTS tenant_2;

-- Log successful initialization
DO $$
BEGIN
  RAISE NOTICE 'Database initialized successfully';
  RAISE NOTICE 'Extensions enabled: uuid-ossp, pgcrypto, citext';
END $$;
