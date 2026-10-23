import { useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, MessageSquareWarning, Repeat2, RotateCcw, SkipForward, Sparkles, Undo2 } from 'lucide-react'
import { useApp } from '@/app/store'
import { Button, Notice, Badge } from '@/components/shared/ui'
import { Dialog } from '@/components/shared/dialog'
import { Field, Select, TextArea, TextInput } from '@/components/forms/controls'
import {
  applyAdjustmentOp,
  completeWorkoutOp,
  editSchedulingOp,
  isError,
  proposeAdjustment,
  replaceWithRecoveryOp,
  requestAdjustmentOp,
  restoreSkippedOp,
  skipOp,
  swapOp,
} from '@/domain/operations/app-ops'
import { evaluateMove, evaluateSwap, type ScheduleContext } from '@/domain/training-engine/scheduling'
import { missedReasonSchema, type WorkoutResultInput } from '@/domain/validation/schemas'
import { TIMES_OF_DAY, type TimeOfDay } from '@/domain/models/common'
import type { Workout } from '@/domain/models/training'
import { addDaysISO, formatDate } from '@/lib/dates'
import { CompleteWorkoutForm } from './CompleteWorkoutForm'

export const TIME_LABELS: Record<TimeOfDay, string> = {
  'early-morning': 'Early morning',
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
  flexible: 'Flexible',
}

export function useScheduleContext(): ScheduleContext | null {
  const { state, today } = useApp()
  return useMemo(
    () => (state.availability ? { availability: state.availability, events: state.events, restrictions: state.medical.restrictions, workouts: state.workouts, today } : null),
    [state.availability, state.events, state.medical.restrictions, state.workouts, today],
  )
}

type Mode = null | 'complete' | 'skip' | 'recovery' | 'edit' | 'swap' | 'adjust'

/** Reason capture shared by skip / replace dialogs. Validates with Zod before dispatching. */
function ReasonForm({ label, submitLabel, onSubmit, onCancel, children }: { label: string; submitLabel: string; onSubmit: (reason: string) => void; onCancel: () => void; children?: React.ReactNode }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = missedReasonSchema.safeParse({ reason })
        if (!parsed.success) return setError(parsed.error.issues[0]?.message)
        onSubmit(parsed.data.reason)
      }}
    >
      {children}
      <Field label={label} required error={error}>
        {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} aria-invalid={invalid} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. work ran late, felt unwell, travel" />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

function EditScheduleForm({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const { run, today } = useApp()
  const ctx = useScheduleContext()
  const [date, setDate] = useState(workout.date)
  const [time, setTime] = useState<TimeOfDay | ''>(workout.timeOfDay ?? '')
  const [duration, setDuration] = useState(String(workout.durationMin))
  const [reason, setReason] = useState('')
  const dur = Number(duration)
  const evaluation = ctx && date !== workout.date ? evaluateMove(workout, date, ctx) : null
  const durError = !Number.isFinite(dur) || dur < 10 ? 'Enter at least 10 minutes' : dur > workout.durationMin * 1.25 + 5 ? 'Can only be extended by about 25% — ask Coach Atlas for bigger changes' : undefined
  const nothing = date === workout.date && (time || undefined) === (workout.timeOfDay ?? undefined) && dur === workout.durationMin
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (durError || (evaluation && !evaluation.ok)) return
        const res = run((s, env) => editSchedulingOp(s, workout.id, { date: date !== workout.date ? date : undefined, timeOfDay: time || undefined, durationMin: dur !== workout.durationMin ? dur : undefined }, reason, env), { success: 'Schedule updated and logged in the change history.' })
        if (!isError(res)) onClose()
      }}
    >
      <p className="text-sm text-muted">Only scheduling fields can be edited. Session content and intensity are managed by the plan engine.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">{({ id }) => <TextInput id={id} type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <Field label="Time of day">
          {({ id }) => (
            <Select id={id} value={time} onChange={(e) => setTime(e.target.value as TimeOfDay | '')}>
              <option value="">Not set</option>
              {TIMES_OF_DAY.map((t) => (
                <option key={t} value={t}>
                  {TIME_LABELS[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Duration (minutes)" error={durError} className="sm:col-span-2">
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} value={duration} onChange={(e) => setDuration(e.target.value)} />}
        </Field>
      </div>
      {evaluation && (
        <div className="space-y-2" aria-live="polite">
          {evaluation.blockers.map((b) => (
            <Notice key={b} tone="danger">
              {b}
            </Notice>
          ))}
          {evaluation.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
          {evaluation.ok && evaluation.warnings.length === 0 && <Notice tone="accent">This move keeps recovery around surrounding sessions.</Notice>}
        </div>
      )}
      <Field label="Reason (optional)">{({ id }) => <TextInput id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the change history" />}</Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={nothing || Boolean(durError) || Boolean(evaluation && !evaluation.ok)}>
          Save schedule
        </Button>
      </div>
    </form>
  )
}

function SwapForm({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const { state, run, today } = useApp()
  const ctx = useScheduleContext()
  const candidates = state.workouts
    .filter((w) => w.id !== workout.id && w.status === 'planned' && w.sport !== 'rehab' && w.date >= today && w.date !== workout.date && w.date <= addDaysISO(workout.date, 7) && w.date >= addDaysISO(workout.date, -7))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const [otherId, setOtherId] = useState(candidates[0]?.id ?? '')
  const [reason, setReason] = useState('')
  const other = candidates.find((c) => c.id === otherId)
  const evaluation = ctx && other ? evaluateSwap(workout, other, ctx) : null
  if (workout.sport === 'rehab') return <p className="text-sm text-muted">Clinician-approved rehab sessions can’t be swapped; edit their schedule instead.</p>
  if (!candidates.length) return <p className="text-sm text-muted">No other planned sessions within a week to swap with.</p>
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!other || !evaluation?.ok) return
        const res = run((s, env) => swapOp(s, workout.id, other.id, reason, env), { success: 'Sessions swapped and logged.' })
        if (!isError(res)) onClose()
      }}
    >
      <Field label={`Swap “${workout.title}” (${formatDate(workout.date)}) with`}>
        {({ id }) => (
          <Select id={id} value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {formatDate(c.date)} — {c.title}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {evaluation && (
        <div className="space-y-2" aria-live="polite">
          {evaluation.blockers.map((b) => (
            <Notice key={b} tone="danger">
              {b}
            </Notice>
          ))}
          {evaluation.warnings.map((w) => (
            <Notice key={w} tone="warn">
              {w}
            </Notice>
          ))}
          {evaluation.ok && evaluation.warnings.length === 0 && <Notice tone="accent">This swap keeps your hard and long sessions properly spaced.</Notice>}
        </div>
      )}
      <Field label="Reason (optional)">{({ id }) => <TextInput id={id} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!evaluation?.ok}>
          Swap sessions
        </Button>
      </div>
    </form>
  )
}

function AdjustPanel({ workout, onClose }: { workout: Workout; onClose: () => void }) {
  const { state, run, env } = useApp()
  const proposal = useMemo(() => proposeAdjustment(state, workout.id, env()), [state, workout.id, env])
  if (isError(proposal)) return <Notice tone="danger">{proposal.error}</Notice>
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-fg">{proposal.trigger}</p>
        <p className="mt-1 text-sm text-muted">This is a proposal only — nothing changes until you apply it.</p>
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Proposed changes</h4>
        <ul className="mt-2 space-y-2">
          {proposal.changes.map((c) => (
            <li key={c.workoutId + c.kind} className="rounded-lg border border-line bg-base px-3 py-2 text-sm">
              <Badge tone="secondary" className="mr-2">
                {c.kind}
              </Badge>
              {c.description}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Why</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          {proposal.rationale.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted">
        Weekly load change: <strong className="text-fg">{proposal.weeklyMinutesDelta === 0 ? 'none' : `${proposal.weeklyMinutesDelta} min`}</strong>
      </p>
      <Notice tone={proposal.progression.affected ? 'warn' : 'info'} title="Effect on your progression">
        <p>{proposal.progression.note}</p>
      </Notice>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            run((s, e) => requestAdjustmentOp(s, workout.id, e), { success: 'Request logged. No change was applied to your plan.' })
            onClose()
          }}
        >
          Only log a request
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            const res = run((s, e) => applyAdjustmentOp(s, proposal, `Applied proposal: ${proposal.trigger}`, e), { success: 'Adjustment applied and logged in the change history.' })
            if (!isError(res)) onClose()
          }}
        >
          Apply proposal
        </Button>
      </div>
    </div>
  )
}

/** All the ways an athlete can act on a planned workout. Every action goes through a domain operation and is logged. */
export function WorkoutActions({ workout, onDone }: { workout: Workout; onDone?: () => void }) {
  const { run, today } = useApp()
  const [mode, setMode] = useState<Mode>(null)
  const close = () => {
    setMode(null)
    onDone?.()
  }
  const planned = workout.status === 'planned'
  const missed = planned && workout.date < today && workout.sport !== 'rehab'

  return (
    <div className="space-y-3">
      {missed && (
        <Notice tone="warn" title="This session wasn’t logged">
          <p>Log it if you did it, or choose how to handle it. Missed work is never stacked onto later days.</p>
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {planned && (
          <Button variant="primary" onClick={() => setMode('complete')}>
            <CheckCircle2 className="size-4" /> Record result
          </Button>
        )}
        {planned && (
          <Button variant="outline" onClick={() => setMode('edit')}>
            <CalendarClock className="size-4" /> Edit schedule
          </Button>
        )}
        {planned && workout.sport !== 'rehab' && (
          <Button variant="outline" onClick={() => setMode('swap')}>
            <Repeat2 className="size-4" /> Swap
          </Button>
        )}
        {planned && (
          <Button variant="outline" onClick={() => setMode('skip')}>
            <SkipForward className="size-4" /> Skip
          </Button>
        )}
        {planned && workout.sport !== 'rehab' && workout.sport !== 'recovery' && workout.sport !== 'mobility' && (
          <Button variant="outline" onClick={() => setMode('recovery')}>
            <Sparkles className="size-4" /> Replace with recovery
          </Button>
        )}
        {planned && workout.sport !== 'rehab' && (
          <Button variant="outline" onClick={() => setMode('adjust')}>
            <MessageSquareWarning className="size-4" /> {missed ? 'Request plan adjustment' : 'Preview adjustment'}
          </Button>
        )}
        {workout.status === 'skipped' && workout.date >= today && (
          <Button variant="outline" onClick={() => run((s, e) => restoreSkippedOp(s, workout.id, e), { success: 'Session restored.' })}>
            <Undo2 className="size-4" /> Restore session
          </Button>
        )}
        {workout.status === 'completed' && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <RotateCcw className="size-4" aria-hidden /> Completed sessions are part of your history and can’t be edited or moved.
          </p>
        )}
      </div>

      <Dialog open={mode === 'complete'} onOpenChange={(o) => !o && setMode(null)} title={`Record result — ${workout.title}`} description="Your result is stored separately from the plan, so rescheduling later never erases it.">
        <CompleteWorkoutForm
          workout={workout}
          onCancel={() => setMode(null)}
          onSubmit={(v: WorkoutResultInput) => {
            const res = run((s, e) => completeWorkoutOp(s, workout.id, v, e), { success: 'Result saved. Your dashboard and analytics have been updated.' })
            if (!isError(res)) close()
          }}
        />
      </Dialog>
      <Dialog open={mode === 'skip'} onOpenChange={(o) => !o && setMode(null)} title={`Skip — ${workout.title}`} description="The session stays in your history as skipped. It will not be moved onto another day automatically.">
        <ReasonForm
          label="Reason for skipping"
          submitLabel="Skip session"
          onCancel={() => setMode(null)}
          onSubmit={(reason) => {
            const res = run((s, e) => skipOp(s, workout.id, reason, e), { success: 'Session skipped and logged.' })
            if (!isError(res)) close()
          }}
        />
      </Dialog>
      <Dialog open={mode === 'recovery'} onOpenChange={(o) => !o && setMode(null)} title={`Replace with recovery — ${workout.title}`} description="Swaps this session for a short, easy recovery session. The original is kept on the record.">
        <ReasonForm
          label="Reason"
          submitLabel="Replace with recovery"
          onCancel={() => setMode(null)}
          onSubmit={(reason) => {
            const res = run((s, e) => replaceWithRecoveryOp(s, workout.id, reason, e), { success: 'Replaced with a recovery session and logged.' })
            if (!isError(res)) close()
          }}
        />
      </Dialog>
      <Dialog open={mode === 'edit'} onOpenChange={(o) => !o && setMode(null)} title={`Edit schedule — ${workout.title}`} size="md">
        {mode === 'edit' && <EditScheduleForm workout={workout} onClose={close} />}
      </Dialog>
      <Dialog open={mode === 'swap'} onOpenChange={(o) => !o && setMode(null)} title="Swap with another session" description="Swaps are checked against hard-day spacing, availability and any clinical restriction.">
        {mode === 'swap' && <SwapForm workout={workout} onClose={close} />}
      </Dialog>
      <Dialog open={mode === 'adjust'} onOpenChange={(o) => !o && setMode(null)} title="Plan adjustment preview" size="md">
        {mode === 'adjust' && <AdjustPanel workout={workout} onClose={close} />}
      </Dialog>
    </div>
  )
}
