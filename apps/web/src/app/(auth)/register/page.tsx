'use client';

import { RegisterForm } from '@/components/features/auth/register-form';

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-8 px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight">
            Create your account
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Already have an account? Sign in instead
          </p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}

