# Contributing Guide

Thank you for your interest in contributing to the SaaS Platform!

## Getting Started

1. Fork the repository
2. Clone your fork
3. Set up the development environment
4. Create a feature branch

## Development Setup

```bash
# Install dependencies
pnpm install

# Copy environment files
cp config/development/.env.example .env.local

# Start infrastructure
docker-compose up -d

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

## Branch Naming

Use the following format:
- `feature/short-description` - New features
- `fix/short-description` - Bug fixes
- `docs/short-description` - Documentation
- `refactor/short-description` - Refactoring

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user profile editing
fix: resolve login redirect issue
docs: update API documentation
chore: update dependencies
```

## Pull Request Process

1. Ensure tests pass: `pnpm test`
2. Ensure linting passes: `pnpm lint`
3. Update documentation if needed
4. Create a PR with a clear description
5. Request review from maintainers

## Code Style

- Use TypeScript for all code
- Follow ESLint and Prettier configurations
- Write meaningful comments
- Keep functions small and focused

## Testing Requirements

- Write unit tests for new features
- Maintain test coverage above 80%
- Include integration tests for API changes

## Review Process

- All PRs require at least one approval
- CI must pass before merging
- Squash commits when merging

## Questions?

- Open a GitHub issue
- Contact the maintainers

