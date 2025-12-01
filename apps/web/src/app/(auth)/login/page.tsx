'use client';

import { LoginForm } from '@/components/features/auth/login-form';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Sign in to your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Or create a new account to get started
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}

