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
    
    subgraph "Context Management Service"
        input[Receive Intent and Entity Events]
        cond1{Is intent "login"?}
        auth[Trigger Authentication Service]
        update_session[Update session in Session Cache]
        initial_state[Generate initial Dialog State Event]
        cond2{Is there an active session?}
        no_session[Generate error response (prompt login)]
        retrieve[Retrieve session data from Session Cache]
        auth_check[Perform authorization check]
        cond3{Authorized?}
        update_state[Update dialog state]
        error_response[Generate error response (access denied)]
        output[Output Dialog State Event]

        input --> cond1
        cond1 -- "Yes" --> auth
        auth --> update_session
        update_session --> initial_state
        initial_state --> output
        cond1 -- "No" --> cond2
        cond2 -- "No" --> no_session
        no_session --> output
        cond2 -- "Yes" --> retrieve
        retrieve --> auth_check
        auth_check --> cond3
        cond3 -- "Yes" --> update_state
        cond3 -- "No" --> error_response
        update_state --> output
        error_response --> output
    end
    
    subgraph "Dental Skill Services"
        L --> M[Skill Router]
        M --> N[Patient Intake Skill]
        M --> O[Medication Analysis Skill]
        M --> P[Patient Profiling Skill]
        N --> R[Response Event]
        O --> R
        P --> R
    end
    
    subgraph "Response Generation"
        R --> S[NLG Service]
        S --> T[Text Response Event]
        T --> U[Text-to-Speech Service]
        U --> V[Audio Response]
    end


    
    subgraph "Supporting Services"
        W[Patient Records Service]
        X[Medical Database Service]
        Y[Compliance Service]
        Z[Staff Alert Service]
        AA[Authentication Service]
        BB[Subscription Management Service]
        CC[Session Cache]
    end
    
    N --> W
    P --> W
    O --> X
    D --> Y
    R --> Z
    I <--> CC
    I --> AA
    AA --> BB
    AA --> CC
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
