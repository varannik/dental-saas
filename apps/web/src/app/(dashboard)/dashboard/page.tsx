import { DashboardStats } from '@/components/features/dashboard/stats';
import { RecentActivity } from '@/components/features/dashboard/recent-activity';

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-gray-600">Welcome back! Here's what's happening.</p>
      </div>
      <DashboardStats />
      <RecentActivity />
    </div>
  );
}

