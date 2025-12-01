'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';

const settingsSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  notifications: z.object({
    email: z.boolean(),
    push: z.boolean(),
    marketing: z.boolean(),
  }),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export function SettingsForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: '',
      email: '',
      notifications: {
        email: true,
        push: true,
        marketing: false,
      },
    },
  });

  const onSubmit = async (data: SettingsFormData) => {
    setIsLoading(true);
    setMessage(null);

    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      setMessage('Settings saved successfully');
    } catch {
      setMessage('Failed to save settings');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
      {message && (
        <div className="rounded-lg bg-green-50 p-4 text-sm text-green-600">
          {message}
        </div>
      )}

      <div className="space-y-4 rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-800">
        <h3 className="text-lg font-semibold">Profile</h3>

        <div>
          <label htmlFor="name" className="block text-sm font-medium">
            Name
          </label>
          <input
            {...register('name')}
            type="text"
            id="name"
            className="mt-1 block w-full rounded-lg border px-3 py-2"
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium">
            Email
          </label>
          <input
            {...register('email')}
            type="email"
            id="email"
            className="mt-1 block w-full rounded-lg border px-3 py-2"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-800">
        <h3 className="text-lg font-semibold">Notifications</h3>

        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              {...register('notifications.email')}
              type="checkbox"
              className="h-4 w-4 rounded border"
            />
            <span className="text-sm">Email notifications</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              {...register('notifications.push')}
              type="checkbox"
              className="h-4 w-4 rounded border"
            />
            <span className="text-sm">Push notifications</span>
          </label>

          <label className="flex items-center gap-3">
            <input
              {...register('notifications.marketing')}
              type="checkbox"
              className="h-4 w-4 rounded border"
            />
            <span className="text-sm">Marketing emails</span>
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isLoading ? 'Saving...' : 'Save changes'}
      </button>
    </form>
  );
}

