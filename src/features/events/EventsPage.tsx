import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Flag, MapPin, Pencil, Trash2 } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Notice, ProgressBar } from '@/components/shared/ui'
import { Dialog, useConfirm } from '@/components/shared/dialog'
import { PageIntro, RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { Field, Select, TextArea, TextInput } from '@/components/forms/controls'
import { deleteEventOp, isError, recordRaceResultOp, saveEventOp, toggleChecklistOp } from '@/domain/operations/app-ops'
import { raceEventSchema, raceResultSchema, type RaceEventInput } from '@/domain/validation/schemas'
import { RACE_DISTANCES } from '@/domain/training-engine/config'
import { GOAL_LABELS, GOAL_TYPES } from '@/domain/models/common'
import type { RaceEvent } from '@/domain/models/events'
import { daysBetween, formatDate } from '@/lib/dates'
import { useUnits } from '@/hooks/use-units'
import { formatBikeRunDistance, formatSwimDistance } from '@/lib/units'

const CATEGORY_LABEL: Record<RaceEvent['checklist'][number]['category'], string> = {
  equipment: 'Equipment',
  nutrition: 'Nutrition practice',
  travel: 'Travel & logistics',
  transition: 'Transition',
}

const PRIORITY_HINT = { A: 'Primary goal race — the plan peaks and tapers for it', B: 'Important preparatory race — light mini-taper', C: 'Training race — no special taper' } as const

function EventForm({ event, onDone }: { event?: RaceEvent; onDone: () => void }) {
  const { state, run, today } = useApp()
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RaceEventInput>({
    resolver: zodResolver(raceEventSchema),
    defaultValues: event
      ? { name: event.name, date: event.date, location: event.location, category: event.category, swimM: event.swimM, bikeKm: event.bikeKm, runKm: event.runKm, priority: event.priority, targetOutcome: event.targetOutcome, notes: event.notes ?? '' }
      : { name: '', date: '', location: '', category: state.athlete?.goal.type ?? 'sprint', ...pick(state.athlete?.goal.type ?? 'sprint'), priority: state.events.some((e) => e.priority === 'A' && e.status === 'planned') ? 'B' : 'A', targetOutcome: '', notes: '' },
  })
  const priority = watch('priority')
  const otherA = state.events.find((e) => e.id !== event?.id && e.priority === 'A' && e.status === 'planned')

  return (
    <form
      noValidate
      aria-label={event ? 'Edit race' : 'Add race'}
      className="space-y-4"
      onSubmit={handleSubmit((v) => {
        const res = run((s, e) => saveEventOp(s, v, e, event?.id), { success: event ? 'Race updated. Your plan was re-checked.' : 'Race added. Your plan was re-checked.' })
        if (!isError(res)) onDone()
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Race name" required error={errors.name?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('name')} />}
        </Field>
        <Field label="Date" required error={errors.date?.message} hint={event ? undefined : `Today is ${formatDate(today, 'd MMM yyyy')}`}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="date" aria-describedby={describedBy} aria-invalid={invalid} {...register('date')} />}
        </Field>
      </div>
      <Field label="Location" required error={errors.location?.message}>
        {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('location')} />}
      </Field>
      <Field label="Distance category" hint="Choosing a category fills typical distances. Edit them to match your actual race.">
        {({ id }) => (
          <Select
            id={id}
            {...register('category', {
              onChange: (e) => {
                const d = RACE_DISTANCES[e.target.value as keyof typeof RACE_DISTANCES]
                setValue('swimM', d.swimM)
                setValue('bikeKm', d.bikeKm)
                setValue('runKm', d.runKm)
              },
            })}
          >
            {GOAL_TYPES.map((g) => (
              <option key={g} value={g}>
                {GOAL_LABELS[g]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Swim (m)" required error={errors.swimM?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" step="any" inputMode="decimal" aria-describedby={describedBy} aria-invalid={invalid} {...register('swimM', { valueAsNumber: true })} />}
        </Field>
        <Field label="Bike (km)" required error={errors.bikeKm?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" step="any" inputMode="decimal" aria-describedby={describedBy} aria-invalid={invalid} {...register('bikeKm', { valueAsNumber: true })} />}
        </Field>
        <Field label="Run (km)" required error={errors.runKm?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" step="any" inputMode="decimal" aria-describedby={describedBy} aria-invalid={invalid} {...register('runKm', { valueAsNumber: true })} />}
        </Field>
      </div>
      <Field label="Priority" hint={PRIORITY_HINT[priority]}>
        {({ id }) => (
          <Select id={id} {...register('priority')}>
            <option value="A">A — primary goal race</option>
            <option value="B">B — preparatory race</option>
            <option value="C">C — training race</option>
          </Select>
        )}
      </Field>
      {priority === 'A' && otherA && (
        <Notice tone="info">
          <p>
            Only one primary race is active at a time. Saving will change <strong>{otherA.name}</strong> to priority B.
          </p>
        </Notice>
      )}
      <Field label="Target outcome (optional)" error={errors.targetOutcome?.message} hint="For example: finish comfortably, or a time goal.">
        {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('targetOutcome')} />}
      </Field>
      <Field label="Notes & logistics (optional)" error={errors.notes?.message}>
        {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('notes')} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          {event ? 'Save changes' : 'Add race'}
        </Button>
      </div>
    </form>
  )
}

function pick(c: keyof typeof RACE_DISTANCES) {
  const d = RACE_DISTANCES[c]
  return { swimM: d.swimM, bikeKm: d.bikeKm, runKm: d.runKm }
}

function ResultForm({ event, onDone }: { event: RaceEvent; onDone: () => void }) {
  const { run } = useApp()
  const [time, setTime] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | undefined>()
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = raceResultSchema.safeParse({ finishTime: time, notes: notes || undefined })
        if (!parsed.success) return setError(parsed.error.issues[0]?.message)
        const res = run((s, env) => recordRaceResultOp(s, event.id, parsed.data.finishTime, parsed.data.notes, env), { success: 'Result recorded.' })
        if (!isError(res)) onDone()
      }}
    >
      <Notice tone="info">
        <p>Results are entered by you. EnduraPath does not fetch official race results.</p>
      </Notice>
      <Field label="Finish time (h:mm:ss)" required error={error}>
        {({ id, describedBy, invalid }) => <TextInput id={id} placeholder="2:34:10" value={time} aria-describedby={describedBy} aria-invalid={invalid} onChange={(e) => setTime(e.target.value)} />}
      </Field>
      <Field label="Notes (optional)">{({ id }) => <TextArea id={id} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save result
        </Button>
      </div>
    </form>
  )
}

function EventCard({ event, onEdit, onResult }: { event: RaceEvent; onEdit: () => void; onResult: () => void }) {
  const { today, run } = useApp()
  const confirm = useConfirm()
  const u = useUnits()
  const days = daysBetween(today, event.date)
  const done = event.checklist.filter((c) => c.done).length
  const pct = event.checklist.length ? (done / event.checklist.length) * 100 : 0
  const categories = Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]

  async function remove() {
    const ok = await confirm({
      title: `Delete “${event.name}”?`,
      body: event.priority === 'A' ? 'This is your primary race. Deleting it re-plans your future sessions without a goal-race date. Completed history is kept.' : 'The race and its checklist will be removed. Your future plan will be re-checked.',
      confirmLabel: 'Delete race',
    })
    if (ok) run((s, e) => deleteEventOp(s, event.id, e), { success: 'Race deleted.' })
  }

  return (
    <Card>
      <CardHeader
        title={event.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{formatDate(event.date, 'EEE d MMM yyyy')}</span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" aria-hidden />
              {event.location}
            </span>
          </span>
        }
        action={
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${event.name}`}>
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button size="sm" variant="ghost" onClick={remove} aria-label={`Delete ${event.name}`}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={event.priority === 'A' ? 'accent' : event.priority === 'B' ? 'secondary' : 'neutral'}>Priority {event.priority}</Badge>
          <Badge>{GOAL_LABELS[event.category]}</Badge>
          {event.status === 'completed' && <Badge tone="accent">Completed</Badge>}
          {event.status === 'planned' && days >= 0 && <Badge tone="info">{days === 0 ? 'Race day' : `${days} day${days === 1 ? '' : 's'} to go`}</Badge>}
          {event.status === 'planned' && days < 0 && <Badge tone="warn">Date passed — record the result</Badge>}
        </div>
        <p className="text-sm text-muted">
          Swim {formatSwimDistance(event.swimM, u)} · Bike {formatBikeRunDistance(event.bikeKm * 1000, u)} · Run {formatBikeRunDistance(event.runKm * 1000, u)}
        </p>
        {event.targetOutcome && <p className="text-sm text-muted">Target: <span className="text-fg">{event.targetOutcome}</span></p>}
        {event.notes && <p className="text-sm text-muted">{event.notes}</p>}

        {event.result ? (
          <div className="rounded-lg border border-line p-3 text-sm">
            <p className="text-fg">
              Finish time <strong>{event.result.finishTime}</strong> <span className="text-xs text-muted">(self-entered)</span>
            </p>
            {event.result.notes && <p className="mt-1 text-muted">{event.result.notes}</p>}
          </div>
        ) : (
          days <= 0 &&
          event.status === 'planned' && (
            <Button size="sm" variant="outline" onClick={onResult}>
              Record result
            </Button>
          )
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Race-preparation checklist</h3>
            <span className="text-xs text-muted tabular-nums">
              {done}/{event.checklist.length}
            </span>
          </div>
          <ProgressBar value={pct} label={`${event.name} checklist progress`} />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {categories.map((cat) => {
              const items = event.checklist.filter((c) => c.category === cat)
              if (!items.length) return null
              return (
                <fieldset key={cat} className="space-y-2">
                  <legend className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">{CATEGORY_LABEL[cat]}</legend>
                  {items.map((item) => (
                    <label key={item.id} className="flex cursor-pointer items-start gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={item.done}
                        onChange={() => run((s, e) => toggleChecklistOp(s, event.id, item.id, e), { toastError: true })}
                        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-line-strong bg-base accent-[#C7F36B]"
                      />
                      <span className={item.done ? 'text-muted line-through' : 'text-fg'}>{item.label}</span>
                    </label>
                  ))}
                </fieldset>
              )
            })}
          </div>
        </div>
      </CardBody>
    </Card>
  )
}

function EventsContent() {
  const { state, today } = useApp()
  const [editing, setEditing] = useState<RaceEvent | 'new' | null>(null)
  const [resulting, setResulting] = useState<RaceEvent | null>(null)
  const upcoming = state.events.filter((e) => e.status === 'planned' && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))
  const past = state.events.filter((e) => !(e.status === 'planned' && e.date >= today)).sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <div className="space-y-6">
      <PageIntro
        title="Events & race planning"
        actions={
          <Button variant="primary" onClick={() => setEditing('new')}>
            <Flag className="size-4" aria-hidden /> Add race
          </Button>
        }
      >
        Add the races in your season. The A-priority race is the plan’s goal; B and C races are scheduled around with lighter mini-tapers.
      </PageIntro>

      <Notice tone="info" title="Manual entries only">
        <p>Race details are entered by you. EnduraPath is not connected to race registration or official results, and nothing here confirms that you are registered. Always check the race organiser’s official information.</p>
      </Notice>

      <section aria-labelledby="upcoming" className="space-y-4">
        <h2 id="upcoming" className="text-base font-semibold">
          Upcoming ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState icon={<Flag className="size-6" aria-hidden />} title="No upcoming races" body="Add a race so your plan can build toward it and taper at the right time." action={<Button variant="primary" onClick={() => setEditing('new')}>Add your first race</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {upcoming.map((e) => (
              <EventCard key={e.id} event={e} onEdit={() => setEditing(e)} onResult={() => setResulting(e)} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section aria-labelledby="past" className="space-y-4">
          <h2 id="past" className="text-base font-semibold">
            Past & other ({past.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {past.map((e) => (
              <EventCard key={e.id} event={e} onEdit={() => setEditing(e)} onResult={() => setResulting(e)} />
            ))}
          </div>
        </section>
      )}

      <SafetyFooter />

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} title={editing === 'new' ? 'Add a race' : 'Edit race'} description="Saving re-checks your future sessions. Completed workouts are never changed." size="lg">
        {editing && <EventForm key={editing === 'new' ? 'new' : editing.id} event={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={Boolean(resulting)} onOpenChange={(o) => !o && setResulting(null)} title="Record race result" description={resulting?.name}>
        {resulting && <ResultForm event={resulting} onDone={() => setResulting(null)} />}
      </Dialog>
    </div>
  )
}

export function EventsPage() {
  return (
    <RequireOnboarded>
      <EventsContent />
    </RequireOnboarded>
  )
}
