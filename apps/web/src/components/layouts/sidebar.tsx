'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: 'home' },
  { name: 'Users', href: '/users', icon: 'users' },
  { name: 'Billing', href: '/billing', icon: 'credit-card' },
  { name: 'Settings', href: '/settings', icon: 'settings' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 border-r bg-gray-50 dark:bg-gray-900 lg:block">
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/" className="text-xl font-bold">
            SaaS App
          </Link>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === item.href
                  ? 'bg-gray-200 text-gray-900 dark:bg-gray-800 dark:text-white'
                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </div>
    </aside>
  );
}

