# Code Style Guide

## TypeScript

### General Rules

- Use `const` by default, `let` when necessary
- Avoid `any` - use proper types or `unknown`
- Use interface for object shapes, type for unions
- Export types alongside functions

### Naming Conventions

```typescript
// Variables and functions: camelCase
const userName = 'John';
function getUserById(id: string) {}

// Classes and interfaces: PascalCase
class UserService {}
interface UserProfile {}

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Files: kebab-case
// user-service.ts, auth-controller.ts

// Components: PascalCase
// UserProfile.tsx, LoginForm.tsx
```

### Functions

```typescript
// Prefer arrow functions for callbacks
const users = data.map((user) => user.name);

// Use explicit return types for public APIs
export function createUser(data: CreateUserDto): Promise<User> {
  // ...
}

// Early returns for guard clauses
function processUser(user: User | null) {
  if (!user) return null;
  // Process user...
}
```

### Error Handling

```typescript
// Use custom error classes
throw new NotFoundError('User not found');

// Prefer try-catch with specific error types
try {
  await someOperation();
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation error
  }
  throw error;
}
```

## React

### Components

```tsx
// Use function components with TypeScript
interface ButtonProps {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
  onClick?: () => void;
}

export function Button({ variant = 'primary', children, onClick }: ButtonProps) {
  return (
    <button className={`btn-${variant}`} onClick={onClick}>
      {children}
    </button>
  );
}
```

### Hooks

```tsx
// Custom hooks start with "use"
function useUser(id: string) {
  const [user, setUser] = useState<User | null>(null);
  // ...
  return { user, isLoading };
}
```

### File Structure

```
components/
  Button/
    Button.tsx
    Button.test.tsx
    index.ts
```

## CSS / Tailwind

```tsx
// Use cn() for conditional classes
<div className={cn(
  'base-class',
  isActive && 'active-class',
  variant === 'large' && 'large-class'
)}>

// Group related classes
<div className="
  flex items-center justify-between
  p-4 rounded-lg
  bg-white shadow-sm
  hover:shadow-md transition-shadow
">
```

## API Design

```typescript
// RESTful endpoints
GET    /api/users         // List users
GET    /api/users/:id     // Get user by ID
POST   /api/users         // Create user
PUT    /api/users/:id     // Update user
DELETE /api/users/:id     // Delete user

// Consistent response format
{
  "data": {},
  "message": "Success"
}
```

## Documentation

```typescript
/**
 * Creates a new user in the system.
 * 
 * @param data - User creation data
 * @returns The created user
 * @throws {ValidationError} If data is invalid
 */
export async function createUser(data: CreateUserDto): Promise<User> {
  // ...
}
```

