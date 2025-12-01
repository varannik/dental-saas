# @saas/utils

Shared utility functions and helpers.

## Installation

This package is used internally as a workspace dependency.

## Usage

```typescript
import { formatDate, formatCurrency, sleep, debounce } from '@saas/utils';

// Date formatting
formatDate(new Date()); // "Jan 1, 2024"

// Currency formatting
formatCurrency(1234.56); // "$1,234.56"

// Async utilities
await sleep(1000); // Wait 1 second

// Function utilities
const debouncedFn = debounce(myFunction, 300);
```

## Available Utilities

- **Date utilities**: `formatDate`, `formatRelativeTime`, `parseDate`
- **Number utilities**: `formatCurrency`, `formatNumber`, `formatPercentage`
- **String utilities**: `slugify`, `truncate`, `capitalize`
- **Async utilities**: `sleep`, `retry`, `timeout`
- **Function utilities**: `debounce`, `throttle`, `memoize`
- **Validation utilities**: `isEmail`, `isUrl`, `isEmpty`

