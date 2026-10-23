import { Link } from 'react-router-dom'
import { addDays, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import { cn } from '@/lib/utils'
import { DAY_SHORT, formatDate, parseDate, toISODate, type ISODate } from '@/lib/dates'
import { formatDuration } from '@/lib/units'
import type { Workout } from '@/domain/models/training'
import { SportIcon, SPORT_BG } from '@/components/shared/workout-bits'

function statusClass(w: Workout, today: ISODate) {
  if (w.status === 'completed') return 'border-accent/40 bg-accent/8'
  if (w.status === 'skipped') return 'border-line bg-base opacity-60 line-through decoration-muted/60'
  if (w.date < today) return 'border-warn/50 bg-warn/8'
  return 'border-line bg-base hover:border-line-strong'
}

function statusWord(w: Workout, today: ISODate) {
  if (w.status === 'completed') return 'completed'
  if (w.status === 'skipped') return 'skipped'
  return w.date < today ? 'not logged' : 'planned'
}

export function DayChip({ w, today }: { w: Workout; today: ISODate }) {
  return (
    <Link
      to={`/training/${w.id}`}
      aria-label={`${w.title}, ${formatDate(w.date)}, ${formatDuration(w.durationMin)}, ${statusWord(w, today)}`}
      className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs transition-colors', statusClass(w, today))}
    >
      <SportIcon sport={w.sport} className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-fg">{w.title}</span>
      <span className="shrink-0 tabular-nums text-muted">{formatDuration(w.durationMin)}</span>
    </Link>
  )
}

export function WeekView({ weekStart, workouts, today, eventsByDate }: { weekStart: ISODate; workouts: Workout[]; today: ISODate; eventsByDate: Map<string, string[]> }) {
  const days = Array.from({ length: 7 }, (_, i) => toISODate(addDays(parseDate(weekStart), i)))
  return (
    <ol className="grid grid-cols-1 gap-2 md:grid-cols-7" aria-label="Week view">
      {days.map((d, i) => {
        const list = workouts.filter((w) => w.date === d)
        const ev = eventsByDate.get(d) ?? []
        return (
          <li key={d} className={cn('min-h-[88px] rounded-lg border bg-surface p-2 md:min-h-[150px]', d === today ? 'border-accent/60' : 'border-line')}>
            <div className="mb-2 flex items-baseline justify-between">
              <span className={cn('text-xs font-semibold', d === today ? 'text-accent' : 'text-muted')}>
                {DAY_SHORT[i]} <span className="tabular-nums">{format(parseDate(d), 'd')}</span>
              </span>
              {d === today && <span className="text-[10px] font-medium uppercase text-accent">Today</span>}
            </div>
            <div className="space-y-1.5">
              {ev.map((e) => (
                <p key={e} className="rounded-md border border-secondary/40 bg-secondary/10 px-2 py-1 text-[11px] font-medium text-secondary">
                  Race: {e}
                </p>
              ))}
              {list.map((w) => (
                <DayChip key={w.id} w={w} today={today} />
              ))}
              {list.length === 0 && ev.length === 0 && <p className="text-[11px] text-muted">Rest</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function MonthView({
  month,
  workouts,
  today,
  selected,
  onSelect,
  eventsByDate,
}: {
  month: ISODate
  workouts: Workout[]
  today: ISODate
  selected: ISODate
  onSelect: (d: ISODate) => void
  eventsByDate: Map<string, string[]>
}) {
  const first = startOfMonth(parseDate(month))
  const start = startOfWeek(first, { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(first), { weekStartsOn: 1 })
  const days: ISODate[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(toISODate(d))
  const byDate = new Map<string, Workout[]>()
  for (const w of workouts) byDate.set(w.date, [...(byDate.get(w.date) ?? []), w])
  return (
    <div role="grid" aria-label={`Month view, ${format(first, 'MMMM yyyy')}`} className="rounded-lg border border-line bg-surface p-1.5 sm:p-2">
      <div role="row" className="grid grid-cols-7 pb-1">
        {DAY_SHORT.map((d) => (
          <div key={d} role="columnheader" className="py-1 text-center text-[11px] font-medium uppercase text-muted">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const list = byDate.get(d) ?? []
          const inMonth = d.slice(0, 7) === month.slice(0, 7)
          const ev = eventsByDate.get(d) ?? []
          const hasMissed = list.some((w) => w.status === 'planned' && w.date < today)
          return (
            <button
              key={d}
              type="button"
              role="gridcell"
              aria-label={`${formatDate(d, 'EEEE d MMMM')}: ${list.length} session${list.length === 1 ? '' : 's'}${ev.length ? `, race: ${ev.join(', ')}` : ''}`}
              aria-selected={d === selected}
              onClick={() => onSelect(d)}
              className={cn(
                'flex min-h-[56px] flex-col items-center gap-1 rounded-md border p-1 text-xs transition-colors sm:min-h-[84px] sm:items-stretch',
                d === selected ? 'border-accent bg-accent/10' : 'border-transparent hover:border-line-strong hover:bg-elevated',
                !inMonth && 'opacity-40',
                d === today && d !== selected && 'border-accent/40',
              )}
            >
              <span className={cn('tabular-nums', d === today ? 'font-bold text-accent' : 'text-fg')}>{format(parseDate(d), 'd')}</span>
              <span className="flex flex-wrap justify-center gap-0.5 sm:justify-start" aria-hidden>
                {list.slice(0, 4).map((w) => (
                  <span key={w.id} className={cn('size-2 rounded-full', SPORT_BG[w.sport], w.status === 'skipped' && 'opacity-30', w.status === 'completed' && 'ring-1 ring-accent')} />
                ))}
                {ev.length > 0 && <span className="size-2 rounded-sm bg-secondary" />}
                {hasMissed && <span className="size-2 rounded-full bg-warn" />}
              </span>
              {list.length > 0 && <span className="hidden truncate text-[10px] text-muted sm:block">{list.length} · {formatDuration(list.reduce((s, w) => s + w.durationMin, 0))}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
