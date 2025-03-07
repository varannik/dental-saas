# Subscription Management Service

This microservice handles subscription and plan management for the Dental Care SaaS Platform.

## Features

- Plan management (create, update, delete plans)
- Subscription management (create, update, cancel subscriptions)
- Stripe integration for payment processing
- Webhook handling for subscription events

## API Endpoints

### Plans

- `GET /api/plans` - Get all active plans
- `GET /api/plans/:id` - Get plan by ID
- `POST /api/plans` - Create a new plan
- `PATCH /api/plans/:id` - Update a plan
- `DELETE /api/plans/:id` - Delete a plan (soft delete)

### Subscriptions

- `GET /api/subscriptions/:id` - Get subscription by ID
- `GET /api/subscriptions/tenant/:tenantId` - Get tenant's subscription
- `POST /api/subscriptions` - Create a new subscription
- `PATCH /api/subscriptions/:id` - Update a subscription
- `DELETE /api/subscriptions/:id` - Cancel a subscription immediately
- `POST /api/subscriptions/webhook` - Stripe webhook handler

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file based on `.env.example`

3. Run the service:
   ```
   npm run dev
   ```

## Development

- `npm run build` - Build the service
- `npm run test` - Run tests
- `npm run lint` - Run linting

## Deployment

This service can be deployed using Docker:

```
docker build -t subscription-service .
docker run -p 3003:3003 --env-file .env subscription-service
``` 