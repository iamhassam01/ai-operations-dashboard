import { LayoutDashboard, ListTodo, Phone, Settings, Bell, MessageSquareText, Search, Mail, Brain, BookOpen } from 'lucide-react';

export const dashboardConfig = {
  name: 'Gloura Dashboard',
  description: 'Gloura — AI Operations',
  agent: {
    name: 'Bob',
    phoneIdentity: 'Mr. Ermakov',
  },
  nav: {
    main: [
      { title: 'Agent', href: '/agent', icon: MessageSquareText },
      { title: 'Memory Bank', href: '/agent/memory', icon: Brain, parent: '/agent' as const },
      { title: 'Knowledge', href: '/agent/knowledge', icon: BookOpen, parent: '/agent' as const },
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Tasks', href: '/tasks', icon: ListTodo, badgeKey: 'pending_tasks' as const },
      { title: 'Research', href: '/research', icon: Search },
      { title: 'Calls', href: '/calls', icon: Phone },
      { title: 'Emails', href: '/emails', icon: Mail, badgeKey: 'pending_emails' as const },
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
