import { Greeting } from '@/components/dashboard/Greeting';
import { ActionCenter } from '@/components/dashboard/ActionCenter';
import { QuickStats } from '@/components/dashboard/QuickStats';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { RecentCalls } from '@/components/dashboard/RecentCalls';
import { RecentTasks } from '@/components/dashboard/RecentTasks';
import { AgentActivity } from '@/components/dashboard/AgentActivity';

export default function DashboardPage() {
  return (
    <div className="space-y-6 stagger-children">
      {/* Layer 1: Greeting + DND — no card wrapper */}
      <Greeting />

      {/* Layer 2: Action Center — only renders when pending items exist */}
      <ActionCenter />

      {/* Layer 3: Quick Stats — 4 metrics, F-pattern row */}
      <QuickStats />

      {/* Layer 4: Connection Status — ghost card, unified section */}
      <ConnectionStatus />

      {/* Layer 5: Recent Activity — two columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTasks />
        <RecentCalls />
      </div>

      {/* Agent Activity — full width below */}
      <AgentActivity />
    </div>
  );
}
