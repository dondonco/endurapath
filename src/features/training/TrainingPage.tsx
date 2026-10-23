import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { addMonths, format } from 'date-fns'
import { ChevronLeft, ChevronRight, History } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Notice } from '@/components/shared/ui'
import { Dialog } from '@/components/shared/dialog'
import { PageIntro, RequireOnboarded } from '@/components/shared/page'
import { DayChip, MonthView, WeekView } from '@/components/calendar/calendar-views'
import { SportIcon } from '@/components/shared/workout-bits'
import { weekStats } from '@/domain/analytics/selectors'
import { missedWorkouts } from '@/domain/analytics/selectors'
import { PHASE_LABELS } from '@/domain/models/common'
import type { PlanChange } from '@/domain/models/training'
import { addDaysISO, formatDate, formatDateTime, mondayOf, parseDate, toISODate } from '@/lib/dates'
import { formatDuration } from '@/lib/units'
import { WorkoutActions } from './WorkoutActions'

const KIND_LABEL: Record<PlanChange['kind'], string> = {
  'plan-created': 'Plan created',
  'plan-regenerated': 'Plan rebuilt',
  reschedule: 'Rescheduled',
  swap: 'Swapped',
  skip: 'Skipped',
  'replace-with-recovery': 'Replaced with recovery',
  edit: 'Edited',
  'restriction-adjustment': 'Restriction adjustment',
  'symptom-adjustment': 'Symptom adjustment',
  'adjustment-applied': 'Adjustment applied',
  'adjustment-requested': 'Adjustment requested',
  'stage-progression': 'Stage progression',
  'rehab-scheduled': 'Rehab scheduled',
}
const BY_LABEL = { athlete: 'You', 'plan-engine': 'Plan engine', 'safety-rule': 'Safety rule' } as const

function History_({ changes, limit = 12 }: { changes: PlanChange[]; limit?: number }) {
  const [all, setAll] = useState(false)
  const list = all ? changes : changes.slice(0, limit)
  if (!changes.length) return <p className="px-5 py-6 text-center text-sm text-muted">No changes yet. Every reschedule, skip, adjustment and restriction change will be recorded here with its reason.</p>
  return (
    <>
      <ol className="divide-y divide-line">
        {list.map((c) => (
          <li key={c.id} className="space-y-1 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={c.initiatedBy === 'safety-rule' ? 'danger' : c.initiatedBy === 'plan-engine' ? 'secondary' : 'neutral'}>{KIND_LABEL[c.kind]}</Badge>
              <span className="text-[11px] text-muted">
                {BY_LABEL[c.initiatedBy]} · {formatDateTime(c.at)}
              </span>
            </div>
            <p className="text-sm text-fg">{c.summary}</p>
            <p className="text-xs text-muted">Reason: {c.reason}</p>
            {c.workoutIds.length === 1 && (
              <Link to={`/training/${c.workoutIds[0]}`} className="text-xs text-accent hover:underline">
                Open workout
              </Link>
            )}
          </li>
        ))}
      </ol>
      {changes.length > limit && (
        <div className="border-t border-line p-3 text-center">
          <Button size="sm" variant="ghost" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show all ${changes.length}`}
          </Button>
        </div>
      )}
    </>
  )
}
export { History_ as ChangeHistory }

function TrainingContent() {
  const { state, today } = useApp()
  const [view, setView] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(today)
  const [selected, setSelected] = useState(today)
  const [attention, setAttention] = useState<string | null>(null)

  const weekStart = mondayOf(anchor)
  const month = `${anchor.slice(0, 7)}-01`
  const plan = state.plan!
  const week = plan.weeks.find((w) => w.weekStart === weekStart)
  const stats = useMemo(() => weekStats(state, weekStart, today), [state, weekStart, today])
  const missed = useMemo(() => missedWorkouts(state.workouts, today, 7), [state.workouts, today])
  const eventsByDate = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const e of state.events.filter((x) => x.status !== 'cancelled')) m.set(e.date, [...(m.get(e.date) ?? []), `${e.name} (${e.priority})`])
    return m
  }, [state.events])

  const shift = (dir: -1 | 1) => {
    if (view === 'week') setAnchor(addDaysISO(anchor, dir * 7))
    else {
      const next = toISODate(addMonths(parseDate(month), dir))
      setAnchor(next)
      setSelected(next)
    }
  }
  const label = view === 'week' ? `${formatDate(weekStart, 'd MMM')} – ${formatDate(addDaysISO(weekStart, 6), 'd MMM yyyy')}` : format(parseDate(month), 'MMMM yyyy')
  const dayList = state.workouts.filter((w) => w.date === selected).sort((a, b) => (a.sport === 'rehab' ? 1 : 0) - (b.sport === 'rehab' ? 1 : 0))
  const attentionWorkout = state.workouts.find((w) => w.id === attention)
  const visible = view === 'week' ? state.workouts.filter((w) => w.weekStart === weekStart) : state.workouts

  return (
    <div className="space-y-6">
      <PageIntro title="Training calendar">
        Open any session to read it, record your result, or adjust its schedule. Completed sessions are kept as history even if the plan around them changes.
      </PageIntro>

      {missed.length > 0 && (
        <Notice tone="warn" title={`${missed.length} session${missed.length > 1 ? 's' : ''} from the last week not logged`}>
          <p>Missed sessions are never stacked onto later days. Choose what to do with each:</p>
          <ul className="mt-2 space-y-1.5">
            {missed.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-base px-3 py-2">
                <span className="flex min-w-0 items-center gap-2 text-fg">
                  <SportIcon sport={w.sport} />
                  <span className="truncate">{w.title}</span>
                  <span className="text-xs text-muted">{formatDate(w.date)}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => setAttention(w.id)}>
                  Handle
                </Button>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="flex items-center gap-1" role="group" aria-label="Change period">
            <Button size="icon" variant="ghost" onClick={() => shift(-1)} aria-label={view === 'week' ? 'Previous week' : 'Previous month'}>
              <ChevronLeft className="size-5" />
            </Button>
            <h2 className="min-w-[120px] text-center text-sm font-semibold sm:min-w-[180px]" aria-live="polite">
              {label}
            </h2>
            <Button size="icon" variant="ghost" onClick={() => shift(1)} aria-label={view === 'week' ? 'Next week' : 'Next month'}>
              <ChevronRight className="size-5" />
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setAnchor(today); setSelected(today) }}>
              Today
            </Button>
          </div>
          <div className="inline-flex rounded-lg border border-line p-0.5" role="group" aria-label="Calendar view">
            {(['week', 'month'] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize ${view === v ? 'bg-accent text-accent-ink' : 'text-muted hover:text-fg'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <CardBody className="space-y-4">
          {view === 'week' && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                {week && (
                  <span>
                    Stage {week.stage} · {PHASE_LABELS[week.phaseType]}
                    {week.isRecoveryWeek ? ' · recovery week' : ''}
                  </span>
                )}
                <span>
                  Planned {formatDuration(stats.plannedMin)} · completed {formatDuration(stats.completedMin)}
                </span>
                <span>
                  {stats.completedSessions}/{stats.plannedSessions} sessions
                </span>
              </div>
              {week?.note && <p className="text-xs text-muted">{week.note}</p>}
              {state.workouts.some((w) => w.weekStart === weekStart) ? (
                <WeekView weekStart={weekStart} workouts={visible} today={today} eventsByDate={eventsByDate} />
              ) : (
                <EmptyState title="No sessions planned this week" body="Detailed sessions are generated a few weeks ahead. Browse to a nearer week, or review your roadmap." />
              )}
            </>
          )}
          {view === 'month' && (
            <>
              <MonthView month={month} workouts={visible} today={today} selected={selected} onSelect={setSelected} eventsByDate={eventsByDate} />
              <section aria-live="polite" className="rounded-lg border border-line bg-base p-3">
                <h3 className="mb-2 text-sm font-semibold">{formatDate(selected, 'EEEE d MMMM')}</h3>
                {dayList.length === 0 ? <p className="text-sm text-muted">Rest day — nothing planned.</p> : <div className="space-y-1.5">{dayList.map((w) => <DayChip key={w.id} w={w} today={today} />)}</div>}
              </section>
              <p className="text-[11px] text-muted">Dots: coloured by sport; ringed = completed; amber = not logged; square = race.</p>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Change history" subtitle="Every plan change with its reason. Completed results are never rewritten." icon={<History className="size-4" />} />
        <History_ changes={state.changes} />
      </Card>

      <Dialog open={Boolean(attentionWorkout)} onOpenChange={(o) => !o && setAttention(null)} title={attentionWorkout ? `Handle: ${attentionWorkout.title}` : ''} description={attentionWorkout ? `${formatDate(attentionWorkout.date)} · ${formatDuration(attentionWorkout.durationMin)}` : undefined}>
        {attentionWorkout && <WorkoutActions workout={attentionWorkout} onDone={() => setAttention(null)} />}
      </Dialog>
    </div>
  )
}

export function TrainingPage() {
  return (
    <RequireOnboarded>
      <TrainingContent />
    </RequireOnboarded>
  )
}
