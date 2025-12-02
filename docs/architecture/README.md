# Architecture Documentation

## Overview

This SaaS platform follows a microservices architecture designed for scalability, maintainability, and high availability.

## Documentation Index

### 📊 Core Database Schema (Required)

The foundational clinical and operational data model for the dental SaaS platform.

- **[schema-core.md](./schema-core.md)** - Core schema documentation (human-readable)
  - Multi-tenancy & identity management
  - Patient & clinical data
  - Imaging & AI predictions
  - Voice sessions & utterances
  - Billing & subscriptions
  - Audit & compliance

- **[schema-core.yaml](./schema-core.yaml)** - Core schema specification (machine-readable)
  - Used for code generation, migrations, and DDL creation
  - Single source of truth for core tables

### 🤖 AI Agent Extensions (Optional)

Advanced AI agent infrastructure that extends the core schema. Deploy only if using AI agent features (LangGraph, AutoGen, CrewAI, etc.).

- **[schema-agent-extensions.yaml](./schema-agent-extensions.yaml)** - Agent schema specification
  - Workflow orchestration (state graphs)
  - Tool registry & execution tracking
  - Multi-agent collaboration
  - Memory & context management
  - Human-in-the-loop (HITL) approvals
  - Observability & metrics

- **[agent-implementation-guide.md](./agent-implementation-guide.md)** - Implementation guide
  - Complete workflow examples
  - Integration patterns
  - Query patterns & analytics
  - Security & performance best practices

### 📐 Architecture Relationship

```
┌─────────────────────────────────────┐
│   Core Schema (schema-core.yaml)    │
│   ✓ Patients, encounters, imaging   │
│   ✓ Voice sessions & utterances     │
│   ✓ API clients (authentication)    │
│   ✓ Audit events                    │
└─────────────────┬───────────────────┘
                  │ extends
                  ↓
┌─────────────────────────────────────┐
│  Agent Extensions (optional)        │
│  ✓ Workflow orchestration           │
│  ✓ Tool execution                   │
│  ✓ Multi-agent collaboration        │
│  ✓ Memory & HITL                    │
└─────────────────────────────────────┘
```

## System Architecture

```
                    ┌─────────────────┐
                    │   CDN (Edge)    │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Load Balancer  │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │  Web App    │   │  Admin App  │   │  Mobile App │
    │  (Next.js)  │   │  (Next.js)  │   │   (RN)      │
    └──────┬──────┘   └──────┬──────┘   └──────┬──────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │
                    ┌────────▼────────┐
                    │   API Gateway   │
                    │   (Rate Limit)  │
                    └────────┬────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     │           │           │           │           │
┌────▼────┐ ┌────▼────┐ ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
│  Auth   │ │  Users  │ │ Billing │ │  Notif  │ │  Files  │
│ Service │ │ Service │ │ Service │ │ Service │ │ Service │
└────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘
     │           │           │           │           │
     └───────────┴───────────┴───────────┴───────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
     ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐
     │  PostgreSQL │  │    Redis    │  │  S3/MinIO   │
     │  (Primary)  │  │   (Cache)   │  │  (Storage)  │
     └─────────────┘  └─────────────┘  └─────────────┘
```

## Key Design Decisions

### 1. Microservices Architecture
- Each service owns its domain and data
- Services communicate via REST/gRPC
- Enables independent scaling and deployment

### 2. API Gateway Pattern
- Single entry point for all client requests
- Handles authentication, rate limiting, logging
- Routes requests to appropriate services

### 3. Event-Driven Communication
- Async communication via message queues
- Eventual consistency for non-critical operations
- Better resilience and decoupling

### 4. Database per Service
- Each service has its own database
- Prevents tight coupling between services
- Enables independent schema evolution

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Frontend | Next.js | SSR, great DX, React ecosystem |
| Backend | Node.js/Fastify | Performance, TypeScript support |
| Database | PostgreSQL | ACID, JSON support, reliability |
| Cache | Redis | Speed, pub/sub, sessions |
| Queue | BullMQ | Redis-based, reliable, monitoring |
| Storage | S3/MinIO | Scalable, cost-effective |

## Scaling Strategy

1. **Horizontal Scaling**: Services scale independently
2. **Database Scaling**: Read replicas, connection pooling
3. **Caching**: Multi-layer caching (Redis, CDN)
4. **Load Balancing**: Kubernetes with HPA

## Security Considerations

- All traffic over HTTPS
- JWT for authentication
- RBAC for authorization
- Secrets in secure vault
- Regular security audits

