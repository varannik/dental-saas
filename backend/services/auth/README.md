# Authentication Service

This service handles authentication, authorization, and user management for the Dental SaaS platform.

## Features

- Multi-tenant authentication
- JWT-based authentication with refresh tokens
- Role-based access control
- Email verification
- Password reset functionality
- Rate limiting
- Token blacklisting for logout
- CSRF protection
- Structured logging
- Database migrations
- API documentation with Swagger

## Getting Started

### Prerequisites

- Node.js 14+
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
npm run migrate
```

7. Start the development server:

```bash
npm run dev
```

### Docker

To run the service using Docker:

```bash
docker build -t dental-saas-auth -f Dockerfile.dev .
docker run -p 3001:3001 dental-saas-auth
```

## API Documentation

When running in development mode, API documentation is available at:

```
http://localhost:3001/api/auth/docs
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

## Project Structure

```
src/
├── config/         # Configuration files
├── controllers/    # Request handlers
├── middlewares/    # Express middlewares
├── models/         # Database models and migrations
├── routes/         # API routes
├── services/       # Business logic
└── utils/          # Utility functions
```

## Environment Variables

See `.env.example` for all required environment variables.

## License

This project is proprietary and confidential.