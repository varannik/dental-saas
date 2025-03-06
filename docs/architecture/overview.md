# Dental Care SaaS Platform Architecture

## System Overview

This document describes the high-level architecture of the Dental Care SaaS Platform, a multi-tenant system designed to provide agentic assistance in dental care offices.

## Architecture Principles

- **Microservices-based**: Independently deployable services with clear boundaries
- **API-first**: All functionality exposed through well-defined APIs
- **Multi-tenant**: Secure isolation between different dental practices
- **Cloud-native**: Designed for scalability and resilience in cloud environments
- **Security-focused**: HIPAA compliance and data protection by design

## Component Architecture

![Architecture Diagram](./architecture-diagram.png)

### 1. Frontend Applications

#### Web Application (Dental Staff Portal)
- **Technology**: React.js, Next.js
- **Purpose**: Primary interface for dentists and staff
- **Key Features**: 
  - Voice recording and transcription
  - Patient management
  - Treatment planning
  - Appointment scheduling

#### Mobile Applications
- **Technology**: React Native
- **Purpose**: On-the-go access for staff and patients
- **Key Features**:
  - Voice notes for staff
  - Appointment management for patients
  - Secure messaging

#### Admin Dashboard
- **Technology**: React.js with Material UI
- **Purpose**: Practice management and system administration
- **Key Features**:
  - Tenant management
  - User management
  - Subscription management
  - System configuration

### 2. API Gateway

- **Technology**: Kong or Traefik
- **Purpose**: Unified entry point for all client applications
- **Key Features**:
  - Request routing
  - Authentication
  - Rate limiting
  - Tenant isolation

### 3. Backend Services

#### Authentication Service
- **Technology**: Node.js with Express, Keycloak
- **Purpose**: User authentication and authorization
- **Key Features**:
  - OAuth 2.0/OpenID Connect
  - Role-based access control
  - Multi-factor authentication

#### Patient Management Service
- **Technology**: Node.js with Express
- **Purpose**: Patient data management
- **Key Features**:
  - Patient profiles
  - Medical history
  - Allergy tracking
  - Treatment history

#### Voice Processing Service
- **Technology**: Python with FastAPI
- **Purpose**: Process voice recordings from dentists
- **Key Features**:
  - Speech-to-text conversion
  - Medical terminology extraction
  - Structured data generation

#### AI Agent Service
- **Technology**: Python with LangChain/LlamaIndex
- **Purpose**: Intelligent assistance and analysis
- **Key Features**:
  - Drug interaction checking
  - Treatment recommendation
  - Patient risk assessment

#### Communication Service
- **Technology**: Node.js with Express
- **Purpose**: Patient communication management
- **Key Features**:
  - Appointment reminders
  - Treatment follow-ups
  - Automated messaging

#### Subscription Management Service
- **Technology**: Node.js with Express
- **Purpose**: Handle practice subscriptions and billing
- **Key Features**:
  - Subscription plans
  - Payment processing
  - Usage tracking

### 4. Data Layer

#### Operational Database
- **Technology**: PostgreSQL
- **Purpose**: Primary transactional database
- **Multi-tenancy Approach**: Schema-per-tenant

#### Document Database
- **Technology**: MongoDB
- **Purpose**: Flexible storage for unstructured data
- **Multi-tenancy Approach**: Collection-per-tenant

#### Object Storage
- **Technology**: MinIO (S3-compatible)
- **Purpose**: Storage for voice recordings and documents
- **Multi-tenancy Approach**: Path-based isolation

#### Vector Database
- **Technology**: Weaviate or Qdrant
- **Purpose**: Semantic search and AI embeddings
- **Multi-tenancy Approach**: Namespace isolation

### 5. Infrastructure

#### Containerization
- **Technology**: Docker
- **Purpose**: Application packaging and isolation

#### Orchestration
- **Technology**: Kubernetes
- **Purpose**: Container orchestration and scaling

#### Infrastructure as Code
- **Technology**: Terraform
- **Purpose**: Infrastructure provisioning and management

#### Monitoring and Logging
- **Technology**: Prometheus, Grafana, ELK Stack
- **Purpose**: System monitoring, alerting, and log management

## Security Architecture

### Data Protection
- End-to-end encryption for all PHI
- Encryption at rest for all databases
- TLS for all service communication

### Access Control
- Role-based access control
- Principle of least privilege
- Audit logging for all PHI access

### Compliance
- HIPAA-compliant data handling
- Regular security audits
- Penetration testing

## Deployment Architecture

### Development Environment
- Local Docker Compose setup
- Minikube for local Kubernetes testing

### Staging Environment
- Cloud-based Kubernetes cluster
- CI/CD pipeline integration
- Anonymized test data

### Production Environment
- Multi-zone Kubernetes deployment
- Database replication
- Regular backups
- Disaster recovery procedures 