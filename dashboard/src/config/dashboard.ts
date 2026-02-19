import { LayoutDashboard, ListTodo, Phone, Settings, Bell, MessageSquareText } from 'lucide-react';

export const dashboardConfig = {
  name: 'Gloura Dashboard',
  description: 'Gloura — AI Operations',
  agent: {
    name: 'Bob',
    phoneIdentity: 'Mr. Ermakov',
  },
  nav: {
    main: [
      { title: 'Dashboard', href: '/', icon: LayoutDashboard },
      { title: 'Tasks', href: '/tasks', icon: ListTodo, badgeKey: 'pending_tasks' as const },
      { title: 'Agent', href: '/agent', icon: MessageSquareText },
      { title: 'Calls', href: '/calls', icon: Phone },
      { title: 'Notifications', href: '/notifications', icon: Bell, badgeKey: 'unread_notifications' as const },
      { title: 'Settings', href: '/settings', icon: Settings },
    ],
  },
  theme: {
    defaultMode: 'system' as const,
  },
  polling: {
    stats: 30000,
    approvals: 5000,
    calls: 10000,
    tasks: 10000,
    notifications: 15000,
    agentLogs: 15000,
  },
};
