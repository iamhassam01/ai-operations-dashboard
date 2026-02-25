import { Greeting } from '@/components/dashboard/Greeting';
import { ActionCenter } from '@/components/dashboard/ActionCenter';
import { QuickStats } from '@/components/dashboard/QuickStats';
import { ConnectionStatus } from '@/components/dashboard/ConnectionStatus';
import { RecentCalls } from '@/components/dashboard/RecentCalls';
import { RecentTasks } from '@/components/dashboard/RecentTasks';
import { AgentActivity } from '@/components/dashboard/AgentActivity';

export default function DashboardRoutePage() {
  return (
    <div className="space-y-6 stagger-children">
      <Greeting />
      <ActionCenter />
      <QuickStats />
      <ConnectionStatus />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentTasks />
        <RecentCalls />
      </div>
      <AgentActivity />
    </div>
  );
}
