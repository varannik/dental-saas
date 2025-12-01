# @saas/ui

Shared UI component library built with React and TailwindCSS.

## Structure

```
ui/
├── src/
│   ├── components/
│   │   ├── Button/
│   │   ├── Input/
│   │   ├── Modal/
│   │   ├── Card/
│   │   ├── Table/
│   │   └── ...
│   ├── hooks/
│   ├── utils/
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Usage

```tsx
import { Button, Input, Modal } from '@saas/ui';

function MyComponent() {
  return (
    <Button variant="primary" size="lg">
      Click me
    </Button>
  );
}
```

## Development

```bash
# Run Storybook
pnpm storybook

# Build package
pnpm build
```

