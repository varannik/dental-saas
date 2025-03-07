# Dental Care SaaS Web Application

This is the web frontend for the Dental Care SaaS Platform, built with Next.js, TypeScript, and Tailwind CSS.

## Features

- User authentication and authorization
- Dashboard for dental practice management
- Patient management interface
- Appointment scheduling
- Voice note recording and viewing
- Subscription management

## Tech Stack

- **Framework**: Next.js 13
- **Auth**: NextAuth.js
- **Styling**: Tailwind CSS
- **State Management**: React Hooks and Context API
- **Form Handling**: React Hook Form
- **API Requests**: Axios, SWR
- **Validation**: Zod

## Getting Started

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env.local` file based on `.env.example`

3. Run the development server:
   ```
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Project Structure

```
src/
├── components/        # Reusable UI components
├── contexts/          # React context providers
├── hooks/             # Custom React hooks
├── pages/             # Next.js pages and API routes
├── styles/            # Global styles and Tailwind config
└── utils/             # Utility functions
```

## Available Scripts

- `npm run dev` - Run the development server
- `npm run build` - Build the application for production
- `npm start` - Start the production server
- `npm run lint` - Lint the codebase

## Authentication

The application uses NextAuth.js for authentication. It's set up to work with the backend authentication service, providing:

- Credential-based login
- Protected routes
- JWT-based sessions
- User role management

## Deployment

This application can be deployed to any hosting service that supports Next.js, such as Vercel, Netlify, or a custom server. 