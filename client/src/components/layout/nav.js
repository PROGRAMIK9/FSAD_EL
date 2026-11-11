import {
  Bell,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  ClipboardList,
  FileStack,
  GraduationCap,
  Landmark,
  LayoutDashboard,
  Megaphone,
  NotebookPen,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';

/** Navigation groups. `roles` omitted = visible to every signed-in role. */
export const navGroups = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', to: '/', icon: LayoutDashboard },
      { label: 'Calendar', to: '/calendar', icon: CalendarDays },
      { label: 'Notifications', to: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'Academics',
    items: [
      { label: 'Subjects', to: '/subjects', icon: BookOpen },
      { label: 'Assessments', to: '/assessments', icon: ClipboardList },
      { label: 'Question bank', to: '/questions', icon: FileStack, roles: ['teacher', 'admin'] },
      { label: 'Evaluation', to: '/evaluation', icon: ClipboardCheck, roles: ['teacher', 'admin'] },
      { label: 'My grades', to: '/grades', icon: ChartNoAxesCombined, roles: ['student'] },
      { label: 'Assignments', to: '/assignments', icon: NotebookPen },
      { label: 'Announcements', to: '/announcements', icon: Megaphone },
    ],
  },
  {
    label: 'Administration',
    roles: ['admin'],
    items: [
      { label: 'Students', to: '/students', icon: Users },
      { label: 'Teachers', to: '/teachers', icon: GraduationCap },
      { label: 'Academic structure', to: '/structure', icon: Landmark },
      { label: 'Audit logs', to: '/audit', icon: ShieldCheck },
      { label: 'Settings', to: '/settings', icon: Settings },
    ],
  },
];

export const visibleGroups = (role) =>
  navGroups
    .filter((g) => !g.roles || g.roles.includes(role))
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) }))
    .filter((g) => g.items.length);

export const titleFor = (pathname) => {
  for (const g of navGroups) for (const i of g.items) if (i.to === pathname) return i.label;
  if (pathname.startsWith('/assessments/new')) return 'New quiz';
  if (pathname.includes('/monitor')) return 'Live monitor';
  if (pathname.includes('/attempts/')) return 'Attempt review';
  if (pathname.startsWith('/results/')) return 'Result';
  if (pathname.startsWith('/subjects/')) return 'Subject';
  if (pathname.startsWith('/assessments/')) return 'Assessments';
  if (pathname.startsWith('/rooms/')) return 'Exam room';
  return 'Academic Hub';
};
