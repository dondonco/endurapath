import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CalendarCheck, CheckCircle2, Flag, Info, Play, ShieldAlert, Target } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, LinkButton, Notice, ProgressBar, Stat } from '@/components/shared/ui'
import { Dialog } from '@/components/shared/dialog'
import { RequireOnboarded } from '@/components/shared/page'
import { WidgetBoundary } from '@/components/shared/route-error'
import { IntensityBadge, SportIcon, SPORT_META, StatusBadge, targetSummary, workoutMeta } from '@/components/shared/workout-bits'
import { CHART_COLORS, ChartCard, NoChartData, axisProps, legendStyle, tooltipStyle } from '@/components/charts/chart-kit'
import { PERSONAS } from '@/domain/safety/personas'
import { buildAlerts, buildTeamUpdates, todaysSessions, type DashboardAlert } from '@/domain/analytics/dashboard'
import { nextMilestone, recentWeekStats, stageProgress, weeklySportCounts } from '@/domain/analytics/selectors'
import { GOAL_LABELS, PHASE_LABELS } from '@/domain/models/common'
import { completeWorkoutOp, addCheckInOp, isError } from '@/domain/operations/app-ops'
import { formatDate, mondayOf, daysBetween } from '@/lib/dates'
import { formatDuration } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useUnits } from '@/hooks/use-units'
import { CheckInForm } from '@/features/recovery/CheckInForm'
import { CompleteWorkoutForm } from '@/features/training/CompleteWorkoutForm'

const ALERT_STYLE: Record<DashboardAlert['severity'], { box: string; icon: typeof Info }> = {
  critical: { box: 'border-danger/50 bg-danger/10', icon: ShieldAlert },
  warning: { box: 'border-warn/40 bg-warn/8', icon: AlertTriangle },
  info: { box: 'border-line bg-surface', icon: Info },
}

function Alerts() {
  const { state, today } = useApp()
  const alerts = useMemo(() => buildAlerts(state, today), [state, today])
  return (
    <section aria-labelledby="alerts-h">
      <h2 id="alerts-h" className="sr-only">
        Alerts
      </h2>
      {alerts.length === 0 ? (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-muted">
            <CheckCircle2 className="size-5 text-accent" aria-hidden /> No alerts — your schedule, check-in and restrictions are all up to date.
          </CardBody>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {alerts.map((a) => {
            const st = ALERT_STYLE[a.severity]
            return (
              <li key={a.id} className={cn('flex gap-3 rounded-lg border px-4 py-3', st.box)}>
                <st.icon className={cn('mt-0.5 size-4 shrink-0', a.severity === 'critical' ? 'text-danger' : a.severity === 'warning' ? 'text-warn' : 'text-muted')} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{a.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{a.body}</p>
                  {a.link && (
                    <Link to={a.link.to} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                      {a.link.label} <ArrowRight className="size-3" aria-hidden />
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Welcome() {
  const { state, today } = useApp()
  const { athlete, plan } = state
  if (!athlete || !plan) return null
  const monday = mondayOf(today)
  const wk = plan.weeks.find((w) => w.weekStart === monday)
  const race = state.events.filter((e) => e.status === 'planned' && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  const primary = state.events.find((e) => e.id === plan.primaryEventId)
  const message = wk?.isRecoveryWeek
    ? 'This is a recovery week. Absorbing training is what makes you stronger — keep sessions easy and sleep well.'
    : wk
      ? `${PHASE_LABELS[wk.phaseType]} phase, week ${wk.weekInStage} of Stage ${plan.currentStage}. Stay consistent, keep easy days easy, and report anything that feels off.`
      : `Stage ${plan.currentStage}. Stay consistent and keep easy days easy.`
  return (
    <Card>
      <CardBody className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">{formatDate(today, 'EEEE d MMMM')}</p>
          <h2 className="text-2xl font-semibold tracking-tight">Welcome back, {athlete.displayName}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">Stage {plan.currentStage}</Badge>
            <Badge tone="neutral">Goal: {GOAL_LABELS[athlete.goal.type]}</Badge>
            {primary ? <Badge tone="secondary">A-race: {primary.name} · {formatDate(primary.date, 'd MMM yyyy')}</Badge> : race ? <Badge tone="secondary">Next: {race.name}</Badge> : <Badge tone="neutral">No race date set</Badge>}
          </div>
          <p className="max-w-2xl text-sm text-muted">
            <span className="font-medium text-fg">Coach Atlas (simulated): </span>
            {message}
          </p>
        </div>
        {primary && (
          <div className="shrink-0 text-right">
            <p className="text-4xl font-semibold tabular-nums text-accent">{Math.max(0, daysBetween(today, primary.date))}</p>
            <p className="text-xs text-muted">days to {primary.name}</p>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

function Milestone() {
  const { state, today } = useApp()
  const m = useMemo(() => nextMilestone(state), [state])
  const prog = useMemo(() => stageProgress(state, today), [state, today])
  const latest = state.assessments[0]
  if (!state.plan || !prog) return null
  return (
    <Card>
      <CardHeader title="Next milestone" subtitle={`Stage ${state.plan.currentStage} progress`} icon={<Target className="size-4" />} action={<LinkButton to="/roadmap" size="sm" variant="ghost">Roadmap</LinkButton>} />
      <CardBody className="space-y-4">
        <div>
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>
              {prog.elapsedWeeks} of {prog.totalWeeks} weeks of this stage
            </span>
            <span>{prog.pct}%</span>
          </div>
          <ProgressBar value={prog.pct} label="Progress through current stage" />
          <p className="mt-1.5 text-xs text-muted">
            Key sessions completed: {prog.keyDone} of {prog.keyDue} due. Time in a stage never advances you on its own.
          </p>
        </div>
        {m ? (
          <div className="rounded-lg border border-line bg-base p-3">
            <p className="text-sm font-medium text-fg">{m.label}</p>
            <p className="mt-0.5 text-xs text-muted">{m.detail}</p>
          </div>
        ) : (
          <p className="text-sm text-muted">No outstanding capacity milestones for the next stage.</p>
        )}
        <div className="text-xs text-muted">
          <p className="font-medium text-fg">Conditions to progress</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            <li>Capacity milestones above are comfortably met</li>
            <li>Consistent training and manageable fatigue</li>
            <li>No active clinical restriction</li>
          </ul>
          <p className="mt-2">{latest ? `Last readiness review: ${formatDate(latest.asOf)}.` : 'No readiness review run yet.'}</p>
        </div>
      </CardBody>
    </Card>
  )
}

function TodaysWorkout() {
  const { state, today, run } = useApp()
  const units = useUnits()
  const [logging, setLogging] = useState<string | null>(null)
  const { list, next } = useMemo(() => todaysSessions(state, today), [state, today])
  const shown = list.length ? list : next ? [next] : []
  const logWorkout = shown.find((w) => w.id === logging)
  return (
    <Card>
      <CardHeader title={list.length ? "Today's workout" : next ? 'Next workout' : "Today's workout"} subtitle={list.length ? formatDate(today) : next ? `Nothing scheduled today — next is ${formatDate(next.date)}` : undefined} icon={<CalendarCheck className="size-4" />} />
      <CardBody className="space-y-4">
        {shown.length === 0 && <EmptyState title="Nothing planned" body="Rest is part of the plan. Check the calendar for upcoming sessions." action={<LinkButton to="/training" size="sm" variant="outline">Open calendar</LinkButton>} />}
        {shown.map((w) => (
          <div key={w.id} className="space-y-3 rounded-lg border border-line bg-base p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <SportIcon sport={w.sport} className="size-5" />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{w.title}</h3>
                  <p className="text-xs text-muted">
                    {workoutMeta(w, units)} · {targetSummary(w, units)}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <IntensityBadge intensity={w.intensity} />
                <StatusBadge w={w} today={today} />
              </div>
            </div>
            <p className="text-sm text-muted">
              <span className="font-medium text-fg">Objective: </span>
              {w.purpose}
            </p>
            {w.restrictionNote && <Notice tone="warn">{w.restrictionNote}</Notice>}
            <div className="flex flex-wrap gap-2">
              <LinkButton to={`/training/${w.id}`} variant={w.status === 'planned' ? 'primary' : 'outline'} size="sm">
                <Play className="size-3.5" /> {w.status === 'planned' ? 'Start / view workout' : 'View workout'}
              </LinkButton>
              {w.status === 'planned' && (
                <Button size="sm" variant="outline" onClick={() => setLogging(w.id)}>
                  <CheckCircle2 className="size-3.5" /> Mark complete
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardBody>
      <Dialog open={Boolean(logWorkout)} onOpenChange={(o) => !o && setLogging(null)} title={`Record result — ${logWorkout?.title ?? ''}`} description="Saved separately from the plan so future changes never erase it.">
        {logWorkout && (
          <CompleteWorkoutForm
            workout={logWorkout}
            onCancel={() => setLogging(null)}
            onSubmit={(v) => {
              const res = run((s, e) => completeWorkoutOp(s, logWorkout.id, v, e), { success: 'Result saved. Dashboard updated.' })
              if (!isError(res)) setLogging(null)
            }}
          />
        )}
      </Dialog>
    </Card>
  )
}

function WeeklyTraining() {
  const { state, today } = useApp()
  const monday = mondayOf(today)
  const counts = useMemo(() => weeklySportCounts(state.workouts, monday), [state.workouts, monday])
  const total = counts.reduce((a, c) => ({ planned: a.planned + c.planned, completed: a.completed + c.completed }), { planned: 0, completed: 0 })
  return (
    <Card>
      <CardHeader title="This week" subtitle={`Week of ${formatDate(monday, 'd MMM')} · planned vs completed`} action={<span className="text-sm tabular-nums text-fg">{total.completed}/{total.planned}</span>} />
      <CardBody className="space-y-3">
        {total.planned === 0 && <p className="text-sm text-muted">No sessions this week.</p>}
        {counts.filter((c) => c.planned > 0).map((c) => {
          const meta = SPORT_META[c.sport]
          return (
            <div key={c.sport}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-fg">
                  <meta.icon className={cn('size-4', meta.color)} aria-hidden /> {meta.label}
                </span>
                <span className="tabular-nums text-muted">
                  {c.completed} of {c.planned}
                </span>
              </div>
              <ProgressBar value={c.planned ? (c.completed / c.planned) * 100 : 0} label={`${meta.label} sessions completed`} tone="secondary" />
            </div>
          )
        })}
        <p className="text-[11px] text-muted">Brick sessions count under bike; mobility and rehab under recovery. Skipped sessions are excluded.</p>
      </CardBody>
    </Card>
  )
}

function Analytics() {
  const { state, today } = useApp()
  const stats = useMemo(() => recentWeekStats(state, today, 8), [state, today])
  const cur = stats[stats.length - 1]
  const done = stats.filter((s) => s.completionRate !== null)
  const avgRate = done.length ? Math.round((done.reduce((a, s) => a + (s.completionRate ?? 0), 0) / done.length) * 100) : null
  const data = stats.map((s) => ({ week: s.label, Swim: +(s.minutesBySport.swim / 60).toFixed(1), Bike: +(s.minutesBySport.bike / 60).toFixed(1), Run: +(s.minutesBySport.run / 60).toFixed(1) }))
  const hasData = data.some((d) => d.Swim + d.Bike + d.Run > 0)
  return (
    <ChartCard
      title="Training analytics"
      description="Completed hours by sport, last 8 weeks (strength and recovery not shown)."
      period={`${stats[0]?.label} – ${cur?.label} (current week)`}
      sample={state.isSampleData}
      limitation="Based only on sessions you logged. Hours use your recorded durations; brick sessions are split 70/30 bike/run."
      summary={`Weekly completed hours for swim, bike and run over the last 8 weeks. This week: ${cur ? (cur.completedMin / 60).toFixed(1) : 0} hours completed.`}
    >
      <div className="mb-3 grid grid-cols-3 gap-4 px-2 sm:px-0">
        <Stat label="This week" value={`${((cur?.completedMin ?? 0) / 60).toFixed(1)} h`} hint={`of ${((cur?.plannedMin ?? 0) / 60).toFixed(1)} h planned`} tone="accent" />
        <Stat label="Sessions" value={`${cur?.completedSessions ?? 0}/${cur?.plannedSessions ?? 0}`} hint="done / planned" />
        <Stat label="8-wk completion" value={avgRate === null ? '—' : `${avgRate}%`} hint="of due sessions" />
      </div>
      {hasData ? (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="week" {...axisProps} />
              <YAxis {...axisProps} unit=" h" />
              <Tooltip {...tooltipStyle} />
              <Legend {...legendStyle} />
              <Bar dataKey="Swim" stackId="a" fill={CHART_COLORS.swim} />
              <Bar dataKey="Bike" stackId="a" fill={CHART_COLORS.bike} />
              <Bar dataKey="Run" stackId="a" fill={CHART_COLORS.run} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <NoChartData message="Complete a session to see your weekly hours." />
      )}
    </ChartCard>
  )
}

function QuickCheckIn() {
  const { state, today, run } = useApp()
  const existing = state.checkIns.find((c) => c.date === today)
  const [open, setOpen] = useState(false)
  const last = state.checkIns[state.checkIns.length - 1]
  return (
    <Card>
      <CardHeader title="Recovery check-in" subtitle={existing ? 'Logged today' : 'Not logged today'} action={existing && <Badge tone="accent">Done</Badge>} />
      <CardBody className="space-y-3">
        {existing ? (
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat label="Sleep" value={`${existing.sleepHours} h`} />
            <Stat label="Fatigue" value={`${existing.fatigue}/5`} />
            <Stat label="Readiness" value={`${existing.readiness}/5`} />
          </div>
        ) : (
          <p className="text-sm text-muted">{last ? `Last check-in was ${formatDate(last.date)}.` : 'No check-ins yet.'} Sleep, fatigue, soreness, mood and readiness take about 30 seconds.</p>
        )}
        <Button variant={existing ? 'outline' : 'primary'} size="sm" onClick={() => setOpen(true)}>
          {existing ? 'Update check-in' : 'Check in now'}
        </Button>
      </CardBody>
      <Dialog open={open} onOpenChange={setOpen} title="Recovery check-in" description="Self-reported. Used for trends and readiness reviews — never as a diagnosis." size="lg">
        <CheckInForm
          date={today}
          existing={existing}
          compact
          onSubmit={(v) => {
            const res = run((s, e) => addCheckInOp(s, v, e), { success: 'Check-in saved.' })
            if (!isError(res)) setOpen(false)
          }}
        />
      </Dialog>
    </Card>
  )
}

function TeamUpdates() {
  const { state, today } = useApp()
  const updates = useMemo(() => buildTeamUpdates(state, today), [state, today])
  return (
    <Card>
      <CardHeader title="Team updates" subtitle="Simulated notes generated from your logged data" icon={<Flag className="size-4" />} />
      <ul className="divide-y divide-line">
        {updates.map((u) => {
          const p = PERSONAS[u.persona]
          return (
            <li key={u.persona} className="flex gap-3 px-4 py-3 sm:px-5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated text-[11px] font-bold" style={{ color: p.color }} aria-hidden>
                {p.initials}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-fg">
                  {p.name} <span className="text-xs font-normal text-muted">· {p.role}</span>
                </p>
                <p className="mt-0.5 text-sm text-muted">{u.text}</p>
                <div className="mt-1 flex gap-3 text-xs">
                  {u.link && (
                    <Link to={u.link.to} className="font-medium text-accent hover:underline">
                      {u.link.label}
                    </Link>
                  )}
                  <Link to={`/experts/${u.persona}`} className="text-muted hover:text-fg">
                    Ask {p.name.split(' ').pop()}
                  </Link>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

export function DashboardPage() {
  const { state } = useApp()
  return (
    <RequireOnboarded>
      <div className="space-y-6">
        <Welcome />
        <Alerts />
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <TodaysWorkout />
            <WidgetBoundary label="Training analytics">
              <Analytics />
            </WidgetBoundary>
            <TeamUpdates />
          </div>
          <div className="space-y-6">
            <Milestone />
            <WeeklyTraining />
            <QuickCheckIn />
          </div>
        </div>
        <p className="text-xs text-muted">
          {state.isSampleData ? 'All figures are derived from the clearly labelled sample athlete’s records.' : 'All figures are derived from the sessions and check-ins you have logged.'} Total sessions on record: {state.results.length}. Time recorded: {formatDuration(state.results.reduce((a, r) => a + r.actualDurationMin, 0))}.
        </p>
      </div>
    </RequireOnboarded>
  )
}
