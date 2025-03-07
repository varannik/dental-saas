feat: Implement Subscription Management Service

- Set up complete subscription management microservice architecture
- Create data models for subscription plans and user subscriptions
- Implement PostgreSQL repositories with CRUD operations
- Add REST API controllers for plans and subscriptions management
- Integrate Stripe for payment processing and subscription management
- Add webhook handlers for Stripe events (payments, subscription updates)
- Implement proper error handling and logging
- Add Docker configuration for containerized deployment
- Create documentation with API endpoint descriptions

This commit completes the subscription management service requirement 
from Phase 1, Milestone 2 of our roadmap. The service enables multi-tenant 
subscription functionality with different pricing plans and automatic 
billing through Stripe. 