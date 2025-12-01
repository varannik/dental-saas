# Mobile Application

React Native mobile application with Expo.

## Structure

```
mobile/
├── src/
│   ├── app/                    # Expo Router screens
│   │   ├── (auth)/             # Auth screens
│   │   ├── (tabs)/             # Tab-based navigation
│   │   └── _layout.tsx         # Root layout
│   ├── components/             # React Native components
│   │   ├── ui/                 # Base UI components
│   │   └── features/           # Feature-specific components
│   ├── hooks/                  # Custom hooks
│   ├── lib/                    # Utilities
│   ├── services/               # API services
│   ├── stores/                 # State management
│   └── types/                  # TypeScript types
├── assets/                     # Images, fonts, etc.
├── app.json                    # Expo configuration
└── package.json
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm start

# Run on iOS
pnpm ios

# Run on Android
pnpm android
```

## Building

```bash
# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

