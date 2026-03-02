'use client';

import { useState } from 'react';
import {
  LayoutGrid, MessageSquare, Wrench, Clock
} from 'lucide-react';
import AgentOverviewTab, { AgentToolsTab, AgentSessionsTab } from '@/components/dashboard/AgentTabs';
import { AgentChatTab } from '@/components/dashboard/AgentChatTab';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'tools', label: 'Tools', icon: Wrench },
  { id: 'sessions', label: 'Sessions', icon: Clock },
] as const;

type TabId = typeof TABS[number]['id'];

export default function AgentPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide border-b border-[var(--border-default)] -mx-3 px-3 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6">
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-[var(--interactive-primary)] text-[var(--text-accent)]'
                  : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-default)]'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <AgentOverviewTab />}
      {activeTab === 'chat' && (
        <div className="min-h-[calc(100vh-220px)]">
          <AgentChatTab />
        </div>
      )}
      {activeTab === 'tools' && <AgentToolsTab />}
      {activeTab === 'sessions' && <AgentSessionsTab />}
    </div>
  );
}
