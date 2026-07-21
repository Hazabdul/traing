import type { UserRole } from '@/lib/database-types';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  FileText,
  ScrollText,
  Settings,
  Award,
  Bell,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[] | 'all';
}

export const NAV_ITEMS: NavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: 'all',
  },
  {
    href: '/drivers',
    label: 'Drivers',
    icon: Users,
    roles: ['system_admin', 'ehss_manager', 'ehss_officer', 'hr', 'training_coordinator', 'branch_manager'],
  },
  {
    href: '/training',
    label: 'Training Library',
    icon: BookOpen,
    roles: ['system_admin', 'ehss_manager', 'ehss_officer', 'training_coordinator', 'branch_manager'],
  },
  {
    href: '/assignments',
    label: 'Assignments',
    icon: GraduationCap,
    roles: ['system_admin', 'ehss_manager', 'ehss_officer', 'training_coordinator'],
  },
  {
    href: '/exams',
    label: 'Examinations',
    icon: ClipboardCheck,
    roles: ['system_admin', 'ehss_manager', 'ehss_officer', 'training_coordinator'],
  },
  {
    href: '/awards',
    label: 'Safety Awards',
    icon: Award,
    roles: ['system_admin', 'ehss_manager', 'ehss_officer', 'hr'],
  },
  {
    href: '/reports',
    label: 'Reports',
    icon: FileText,
    roles: ['system_admin', 'ehss_manager', 'ehss_officer', 'hr', 'training_coordinator', 'branch_manager'],
  },
  {
    href: '/audit',
    label: 'Audit Logs',
    icon: ScrollText,
    roles: ['system_admin', 'ehss_manager'],
  },
  {
    href: '/notifications',
    label: 'Notifications',
    icon: Bell,
    roles: 'all',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    roles: ['system_admin'],
  },
];

export const ALL_NAV_ITEMS = NAV_ITEMS;
