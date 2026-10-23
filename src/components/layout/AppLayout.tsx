import { Bell, ChevronLeft, ChevronRight, Menu, ShieldAlert, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useApp } from '@/app/store'
import { markNotificationsReadOp } from '@/domain/operations/app-ops'
import { hasTrainingPause, activeRestrictions } from '@/domain/safety/restrictions'
import { PERSONAS, isPersonaId } from '@/domain/safety/personas'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/dates'
import { Wordmark } from '@/components/shared/logo'
import { Badge, Button } from '@/components/shared/ui'
import { Dialog } from '@/components/shared/dialog'
import { NAV_ITEMS, ROUTE_TITLES } from './nav'

const COLLAPSE_KEY = 'endurapath.ui.sidebar'

function useCollapsed(): [boolean, (v: boolean) => void] {
  const [c, setC] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const set = (v: boolean) => {
    setC(v)
    try {
      localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0')
    } catch {
      /* UI preference only */
    }
  }
  return [c, set]
}

function Breadcrumbs() {
  const { pathname } = useLocation()
  const { state } = useApp()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const base = `/${parts[0]}`
  let leaf = parts[1]
  if (parts[0] === 'training') leaf = state.workouts.find((w) => w.id === parts[1])?.title ?? 'Workout'
  if (parts[0] === 'experts' && isPersonaId(parts[1])) leaf = PERSONAS[parts[1]].name
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted">
      <Link to={base} className="hover:text-fg">
        {ROUTE_TITLES[base] ?? parts[0]}
      </Link>
      <ChevronRight className="size-3" aria-hidden />
      <span aria-current="page" className="max-w-[40vw] truncate text-fg">
        {leaf}
      </span>
    </nav>
  )
}

function NotificationMenu() {
  const { state, run } = useApp()
  const [open, setOpen] = useState(false)
  const unread = state.notifications.filter((n) => !n.readAt).length
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative rounded-lg p-2 text-muted hover:bg-elevated hover:text-fg"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
      >
        <Bell className="size-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-ink">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen} title="Notifications" description="Plan changes, safety messages and reminders generated inside this app.">
        {state.notifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing here yet.</p>
        ) : (
          <ul className="space-y-2">
            {state.notifications.slice(0, 20).map((n) => (
              <li key={n.id} className={cn('rounded-lg border px-3 py-2.5', n.severity === 'critical' ? 'border-danger/50' : n.severity === 'warning' ? 'border-warn/40' : 'border-line')}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-fg">{n.title}</p>
                  <Badge tone={n.severity === 'critical' ? 'danger' : n.severity === 'warning' ? 'warn' : 'neutral'}>{n.kind}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
                  <span>{formatDateTime(n.createdAt)}</span>
                  {n.link && (
                    <Link to={n.link} onClick={() => setOpen(false)} className="text-accent hover:underline">
                      Open
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {unread > 0 && (
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="outline" onClick={() => run((s, e) => markNotificationsReadOp(s, e))}>
              Mark all as read
            </Button>
          </div>
        )}
      </Dialog>
    </>
  )
}

function SidebarLink({ item, collapsed }: { item: (typeof NAV_ITEMS)[number]; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-accent/12 text-accent' : 'text-muted hover:bg-elevated hover:text-fg',
        )
      }
    >
      <item.icon className="size-[18px] shrink-0" aria-hidden />
      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
    </NavLink>
  )
}

function SafetyStrip() {
  const { state } = useApp()
  const active = activeRestrictions(state.medical.restrictions)
  if (!active.length) return null
  const paused = hasTrainingPause(state.medical.restrictions)
  return (
    <div role="status" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-xs lg:px-8', paused ? 'border-danger/40 bg-danger/10 text-danger' : 'border-warn/30 bg-warn/8 text-warn')}>
      <ShieldAlert className="size-4 shrink-0" aria-hidden />
      <span className="font-medium">{paused ? 'Training is paused by an active restriction.' : `${active.length} active clinical restriction${active.length > 1 ? 's' : ''} shape your plan.`}</span>
      <Link to="/rehab" className="underline underline-offset-2 hover:text-fg">
        Review restrictions
      </Link>
    </div>
  )
}

function SampleBanner() {
  const { state } = useApp()
  if (!state.isSampleData || !state.settings.showSampleDataBanner) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-info/30 bg-info/8 px-4 py-2 text-xs text-info lg:px-8">
      <span className="font-semibold">Sample data</span>
      <span className="text-muted">Everything shown is fictional demo data for a sample athlete. No real athlete, clinician, race or device is connected.</span>
      <Link to="/onboarding" className="ml-auto font-medium underline underline-offset-2 hover:text-fg">
        Build my own plan
      </Link>
    </div>
  )
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useCollapsed()
  const [moreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const { state, storageError } = useApp()
  const base = `/${pathname.split('/')[1] ?? ''}`
  const title = ROUTE_TITLES[base] ?? 'EnduraPath'

  useEffect(() => {
    document.title = `${title} · EnduraPath`
    mainRef.current?.focus({ preventScroll: true })
    window.scrollTo({ top: 0 })
    setMoreOpen(false)
  }, [pathname, title])

  const primary = NAV_ITEMS.filter((n) => n.primary)

  return (
    <div className="min-h-dvh bg-base text-fg">
      <a href="#main" className="sr-only z-[200] rounded-md bg-accent px-3 py-2 text-accent-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-surface transition-[width] lg:flex', collapsed ? 'w-[68px]' : 'w-60')}>
        <div className={cn('flex h-16 items-center border-b border-line', collapsed ? 'justify-center' : 'px-4')}>
          <Link to="/dashboard" aria-label="EnduraPath home">
            <Wordmark collapsed={collapsed} />
          </Link>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto p-3">
          {NAV_ITEMS.map((i) => (
            <SidebarLink key={i.to} item={i} collapsed={collapsed} />
          ))}
        </nav>
        <div className="border-t border-line p-3">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted hover:bg-elevated hover:text-fg', collapsed && 'justify-center px-0')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-pressed={collapsed}
          >
            {collapsed ? <ChevronRight className="size-[18px]" /> : <ChevronLeft className="size-[18px]" />}
            <span className={cn(collapsed && 'sr-only')}>Collapse</span>
          </button>
        </div>
      </aside>

      <div className={cn('transition-[padding]', collapsed ? 'lg:pl-[68px]' : 'lg:pl-60')}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-base/95 px-4 backdrop-blur lg:h-16 lg:px-8">
          <Link to="/dashboard" className="lg:hidden" aria-label="EnduraPath home">
            <Wordmark collapsed />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold lg:text-lg">{title}</h1>
            <Breadcrumbs />
          </div>
          {state.athlete && <span className="hidden text-sm text-muted sm:inline">{state.athlete.displayName}</span>}
          <NotificationMenu />
          <button type="button" onClick={() => setMoreOpen(true)} className="rounded-lg p-2 text-muted hover:bg-elevated hover:text-fg lg:hidden" aria-label="Open full menu">
            <Menu className="size-5" />
          </button>
        </header>

        <SampleBanner />
        <SafetyStrip />
        {storageError && (
          <div role="alert" className="border-b border-danger/40 bg-danger/10 px-4 py-2 text-xs text-danger lg:px-8">
            {storageError}
          </div>
        )}

        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 outline-none lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      <nav aria-label="Primary mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/98 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {primary.map((i) => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => cn('flex flex-col items-center gap-1 py-2.5 text-[11px]', isActive ? 'text-accent' : 'text-muted')}>
            <i.icon className="size-5" aria-hidden />
            {i.label}
          </NavLink>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 py-2.5 text-[11px] text-muted">
          <Menu className="size-5" aria-hidden />
          More
        </button>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title="Menu" description="All EnduraPath sections">
        <ul className="grid grid-cols-2 gap-2">
          {NAV_ITEMS.map((i) => (
            <li key={i.to}>
              <NavLink
                to={i.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) => cn('flex items-center gap-3 rounded-lg border px-3 py-3 text-sm', isActive ? 'border-accent/50 bg-accent/10 text-accent' : 'border-line text-fg hover:bg-elevated')}
              >
                <i.icon className="size-5" aria-hidden />
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setMoreOpen(false)}>
            <X className="size-4" /> Close menu
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
