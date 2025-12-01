'use client';

import { UsersTable } from '@/components/features/users/users-table';

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-gray-600">Manage platform users</p>
        </div>
        <button className="rounded-lg bg-blue-600 px-4 py-2 text-white">
          Add User
        </button>
      </div>
      <UsersTable />
    </div>
  );
}

