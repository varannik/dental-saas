# Code Generators

Templates and scripts for generating boilerplate code.

## Available Generators

### Service Generator

Generate a new microservice with standard structure:

```bash
./tools/generators/service.sh my-service
```

Creates:
```
services/my-service/
├── src/
│   ├── index.ts
│   ├── config/
│   ├── controllers/
│   ├── services/
│   ├── repositories/
│   └── routes/
├── tests/
├── Dockerfile
└── package.json
```

### Component Generator

Generate a new React component:

```bash
./tools/generators/component.sh Button packages/ui
```

Creates:
```
packages/ui/src/components/Button/
├── Button.tsx
├── Button.test.tsx
└── index.ts
```

### API Route Generator

Generate a new API route with controller, service, and repository:

```bash
./tools/generators/api-route.sh products services/catalog
```

## Custom Templates

Templates are located in `tools/generators/templates/`.

Modify these templates to match your project's conventions.

