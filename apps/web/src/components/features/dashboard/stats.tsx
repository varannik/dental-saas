'use client';

const stats = [
  { name: 'Total Users', value: '12,345', change: '+12%' },
  { name: 'Active Subscriptions', value: '8,234', change: '+8%' },
  { name: 'Monthly Revenue', value: '$45,678', change: '+23%' },
  { name: 'Conversion Rate', value: '3.2%', change: '+0.5%' },
];

export function DashboardStats() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.name}
          className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-800"
        >
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {stat.name}
          </p>
          <p className="mt-2 text-3xl font-bold">{stat.value}</p>
          <p className="mt-1 text-sm text-green-600">{stat.change}</p>
        </div>
      ))}
    </div>
  );
}

