# Authentication Service

This service handles authentication, authorization, and user management for the Dental SaaS platform.

## Features

- Multi-tenant authentication
- JWT-based authentication with refresh tokens
- Role-based access control
- Email verification
- Password reset functionality
- Social authentication (Google)
- Rate limiting
- Token blacklisting for logout
- CSRF protection
- Structured logging
- Database migrations
- API documentation with Swagger

## Technology Stack

- TypeScript
- Node.js
- Express
- PostgreSQL
- Redis
- JWT
- Passport.js (for social auth)
- Jest (for testing)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL
- Redis

### Installation

1. Clone the repository
2. Navigate to the auth service directory
3. Install dependencies:

```bash
npm install
```

4. Copy the example environment file:

```bash
cp .env.example .env
```

5. Update the environment variables in the `.env` file
6. Run database migrations:

```bash
npm run migrate:up
```

7. Start the development server:

```bash
npm run dev
```

### Docker

To run the service using Docker:

```bash
docker build -t dental-saas-auth .
docker run -p 3001:3001 dental-saas-auth
```

Or using docker-compose:

```bash
docker-compose up
```

## Development

### Testing

This service follows Test-Driven Development (TDD) principles. To run tests:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Linting

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

### Building

```bash
npm run build
```

## API Documentation

When running in development mode, API documentation is available at:

```
http://localhost:3001/api/auth/docs
```

## Project Structure

```
src/
├── config/         # Configuration files
├── controllers/    # Request handlers
├── middleware/     # Express middlewares
├── models/         # Database models
├── repositories/   # Data access layer
├── routes/         # API routes
├── services/       # Business logic
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
tests/
├── integration/    # Integration tests
├── unit/           # Unit tests
├── setup.ts        # Test setup
└── helpers.ts      # Test helpers
migrations/         # Database migrations
```

## Security Features

- JWT tokens with short expiration (15 minutes)
- Refresh tokens for session management
- Token blacklisting for logout
- Rate limiting to prevent brute force attacks
- CSRF protection
- Password hashing with bcrypt
- Input validation and sanitization
- Secure HTTP headers with Helmet

## Environment Variables

See `.env.example` for all required environment variables.

## License

This project is proprietary and confidential. 