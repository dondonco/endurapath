import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Flag,
  HeartPulse,
  LayoutDashboard,
  Map,
  Salad,
  Settings,
  Stethoscope,
  Users,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shown in the mobile bottom bar. */
  primary?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, primary: true },
  { to: '/training', label: 'Training', icon: CalendarDays, primary: true },
  { to: '/roadmap', label: 'Roadmap', icon: Map, primary: true },
  { to: '/performance', label: 'Performance', icon: BarChart3 },
  { to: '/nutrition', label: 'Nutrition', icon: Salad, primary: true },
  { to: '/recovery', label: 'Recovery', icon: HeartPulse },
  { to: '/rehab', label: 'Rehab', icon: Stethoscope },
  { to: '/experts', label: 'Experts', icon: Users },
  { to: '/events', label: 'Events', icon: Flag },
  { to: '/onboarding', label: 'Onboarding', icon: ClipboardList },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export const ROUTE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/onboarding': 'Onboarding',
  '/roadmap': 'Roadmap & readiness',
  '/training': 'Training',
  '/performance': 'Performance',
  '/nutrition': 'Nutrition',
  '/recovery': 'Recovery',
  '/rehab': 'Rehab & restrictions',
  '/experts': 'Expert team',
  '/events': 'Events',
  '/settings': 'Settings',
}

export const SPORT_ICON = Activity
