# Dental Care SaaS Platform

A multi-tenant subscription-based platform providing agentic assistance for dental care offices.

## Features

- Voice recognition for capturing dentist notes and advice
- Patient profile management with allergy tracking
- Automated notifications for drug allergies and contraindications
- Patient communication automation
- Multi-tenant architecture with subscription management

# AI Voice Assistant Architecture

```mermaid
flowchart TB
    subgraph "User Interface"
        A[Audio Capture Service] --> B[Audio Stream]
    end
    
    subgraph "Speech Processing"
        B --> C[Speech-to-Text Service]
        C --> D[Text Utterance Event]
    end
    
    subgraph "Language Understanding"
        D --> E[NLU Service]
        E --> F[Intent Event]
        E --> G[Entity Extraction Service]
        G --> H[Entity Event]
    end
    
    subgraph "Dialog Management"
        F --> I[Context Management Service]
        H --> I
        I --> J[Dialog State Event]
        J --> K[Dialog Policy Service]
        K --> L[Action Event]
    end
    
    subgraph "Skill Services"
        L --> M[Skill Router]
        M --> N[Weather Skill]
        M --> O[Music Skill]
        M --> P[Q&A Skill]
        M --> Q[Home Control Skill]
        N --> R[Response Event]
        O --> R
        P --> R
        Q --> R
    end
    
    subgraph "Response Generation"
        R --> S[NLG Service]
        S --> T[Text Response Event]
        T --> U[Text-to-Speech Service]
        U --> V[Audio Response]
    end
    
    subgraph "Supporting Services"
        W[User Profile Service]
        X[Analytics Service]
        Y[Monitoring Service]
        Z[Feedback Learning Service]
    end
    
    J --> W
    D --> X
    V --> X
    V --> Y
    R --> Z
```

## Architecture Overview

This platform follows a microservices architecture with the following components:

- **Frontend**: React/Next.js web application, React Native mobile apps
- **Backend Services**: Node.js/Express microservices
- **AI Components**: Voice processing, NLP, and agentic assistance
- **Data Storage**: PostgreSQL, MongoDB, and object storage
- **Infrastructure**: Docker, Kubernetes, CI/CD pipelines

## Project Structure

```
dental-saas/
├── frontend/         # Frontend applications
│   ├── web/          # Web application for dental staff
│   ├── mobile/       # Mobile apps for staff and patients
│   └── admin/        # Admin dashboard
├── backend/          # Backend services
│   ├── services/     # Microservices
│   ├── shared/       # Shared libraries and utilities
│   └── database/     # Database schemas and migrations
├── infrastructure/   # Infrastructure as code
│   ├── kubernetes/   # K8s configuration
│   ├── docker/       # Docker configurations
│   └── terraform/    # Infrastructure provisioning
└── docs/             # Documentation
    ├── architecture/ # Architecture diagrams and decisions
    ├── api/          # API documentation
    └── deployment/   # Deployment guides
```

## Getting Started

1. Clone this repository
2. Set up development environment (see docs/development-setup.md)
3. Run the development environment with Docker Compose

## Development Roadmap

See [ROADMAP.md](./ROADMAP.md) for the current development plan and milestones.

## License

[Specify your license]
