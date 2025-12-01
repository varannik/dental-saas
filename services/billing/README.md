# Billing Service

Handles subscriptions, payments, and invoicing with Stripe integration.

## Structure

```
billing/
├── src/
│   ├── index.ts
│   ├── config/
│   ├── controllers/
│   │   ├── subscription.controller.ts
│   │   ├── payment.controller.ts
│   │   └── invoice.controller.ts
│   ├── services/
│   │   ├── stripe.service.ts
│   │   ├── subscription.service.ts
│   │   └── invoice.service.ts
│   ├── webhooks/
│   │   └── stripe.webhook.ts
│   └── types/
├── tests/
└── Dockerfile
```

## Features

- Subscription management
- Stripe payment integration
- Plan creation and management
- Usage-based billing
- Invoice generation
- Payment method management
- Webhook handling

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/billing/plans` | List available plans |
| POST | `/billing/subscriptions` | Create subscription |
| GET | `/billing/subscriptions/:id` | Get subscription |
| PUT | `/billing/subscriptions/:id` | Update subscription |
| DELETE | `/billing/subscriptions/:id` | Cancel subscription |
| GET | `/billing/invoices` | List invoices |
| POST | `/billing/payment-methods` | Add payment method |
| POST | `/billing/webhooks/stripe` | Stripe webhook |

