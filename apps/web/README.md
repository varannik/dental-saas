# Web Application

Next.js web application with App Router.

## Structure

```
web/
├── src/
│   ├── app/                    # App Router pages & layouts
│   │   ├── (auth)/             # Auth route group
│   │   ├── (dashboard)/        # Dashboard route group
│   │   ├── api/                # API routes
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Home page
│   ├── components/             # React components
│   │   ├── ui/                 # Base UI components
│   │   ├── forms/              # Form components
│   │   ├── layouts/            # Layout components
│   │   └── features/           # Feature-specific components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utility functions & configs
│   ├── services/               # API service layer
│   ├── stores/                 # State management (Zustand)
│   ├── styles/                 # Global styles
│   └── types/                  # TypeScript types
├── public/                     # Static assets
├── tests/                      # Test files
└── next.config.ts              # Next.js configuration
```

## Getting Started

```bash
pnpm dev
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_API_URL` - Backend API URL
- `NEXT_PUBLIC_APP_URL` - Application URL
- `NEXTAUTH_SECRET` - NextAuth.js secret

