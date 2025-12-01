'use client';

const activities = [
  { id: 1, user: 'John Doe', action: 'signed up', time: '2 minutes ago' },
  { id: 2, user: 'Jane Smith', action: 'upgraded to Pro', time: '15 minutes ago' },
  { id: 3, user: 'Bob Wilson', action: 'cancelled subscription', time: '1 hour ago' },
  { id: 4, user: 'Alice Brown', action: 'added team member', time: '3 hours ago' },
];

export function RecentActivity() {
  return (
    <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-gray-800">
      <h3 className="text-lg font-semibold">Recent Activity</h3>
      <div className="mt-4 space-y-4">
        {activities.map((activity) => (
          <div
            key={activity.id}
            className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0"
          >
            <div>
              <p className="font-medium">{activity.user}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {activity.action}
              </p>
            </div>
            <span className="text-sm text-gray-500">{activity.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

