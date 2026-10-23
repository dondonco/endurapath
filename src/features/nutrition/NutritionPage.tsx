import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { Droplets, Salad, Trash2, UtensilsCrossed } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Notice, Stat } from '@/components/shared/ui'
import { Dialog, useConfirm } from '@/components/shared/dialog'
import { PageIntro, RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { Checkbox, ChipGroup, Field, Select, TextArea, TextInput, ScaleInput } from '@/components/forms/controls'
import { SportIcon } from '@/components/shared/workout-bits'
import { addFuelingLogOp, deleteFuelingLogOp, isError, setFuelingTargetsOp, updatePreferencesOp } from '@/domain/operations/app-ops'
import { allergensFrom, loadLevelFor, mealSuggestions, POST_WORKOUT_GUIDANCE, type LoadLevel } from '@/domain/nutrition/meals'
import { fuelingLogSchema, fuelingTargetsSchema, type FuelingLogInput, type FuelingTargetsInput } from '@/domain/validation/schemas'
import type { DietaryPattern } from '@/domain/models/athlete'
import { GENERAL_FUELING_TARGETS } from '@/domain/training-engine/fueling'
import { addDaysISO, daysBetween, formatDate } from '@/lib/dates'
import { formatDuration } from '@/lib/units'

const DIETARY: DietaryPattern[] = ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free', 'halal', 'kosher']
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as const

function SourceBadge({ source, setBy }: { source: 'general-education' | 'professional'; setBy?: string }) {
  return source === 'professional' ? <Badge tone="secondary">Set by {setBy ?? 'a professional'}</Badge> : <Badge tone="neutral">General education — not individualised</Badge>
}

function FuelingLogForm({ onDone, defaults }: { onDone: () => void; defaults?: Partial<FuelingLogInput> }) {
  const { state, today, run } = useApp()
  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<FuelingLogInput>({
    resolver: zodResolver(fuelingLogSchema),
    defaultValues: { date: today, kind: 'training', giSymptoms: false, products: '', notes: '', ...defaults },
  })
  const kind = watch('kind')
  const recent = state.workouts.filter((w) => w.status !== 'skipped' && w.fueling && w.fueling.level !== 'none' && w.date <= addDaysISO(today, 1) && w.date >= addDaysISO(today, -14)).sort((a, b) => (a.date < b.date ? 1 : -1))
  const upcomingEvents = state.events.filter((e) => e.status === 'planned' && e.date >= today)
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => {
        const res = run((s, e) => addFuelingLogOp(s, v, e), { success: 'Fueling log saved.' })
        if (!isError(res)) onDone()
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required error={errors.date?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="date" max={today} aria-describedby={describedBy} aria-invalid={invalid} {...register('date')} />}
        </Field>
        <Field label="Type">
          {({ id }) => (
            <Select id={id} {...register('kind')}>
              <option value="training">Training session</option>
              <option value="race-rehearsal">Race-day rehearsal</option>
            </Select>
          )}
        </Field>
        {kind === 'training' ? (
          <Field label="Linked session (optional)" className="sm:col-span-2">
            {({ id }) => (
              <Select id={id} {...register('workoutId')}>
                <option value="">Not linked</option>
                {recent.map((w) => (
                  <option key={w.id} value={w.id}>
                    {formatDate(w.date)} — {w.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          <Field label="Target race (optional)" className="sm:col-span-2">
            {({ id }) => (
              <Select id={id} {...register('eventId')}>
                <option value="">Not linked</option>
                {upcomingEvents.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {formatDate(e.date, 'd MMM yyyy')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {(
          [
            ['plannedCarbsG', 'Planned carbs (g)'],
            ['actualCarbsG', 'Actual carbs (g)'],
            ['plannedFluidMl', 'Planned fluid (ml)'],
            ['actualFluidMl', 'Actual fluid (ml)'],
          ] as const
        ).map(([name, label]) => (
          <Field key={name} label={label} error={errors[name]?.message}>
            {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register(name, { valueAsNumber: true })} />}
          </Field>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted">All intake fields are optional — log only what you tracked. Fluid is what you drank, not a target to hit.</p>
      <Field label="Products / foods used (optional)" error={errors.products?.message}>
        {({ id }) => <TextInput id={id} placeholder="e.g. gel, banana, electrolyte mix" {...register('products')} />}
      </Field>
      <Controller control={control} name="tolerance" render={({ field }) => <ScaleInput name="tolerance" legend="Tolerance — how did your stomach feel?" low="Poor" high="Tolerated well" value={field.value} onChange={field.onChange} error={errors.tolerance?.message} />} />
      <Controller control={control} name="giSymptoms" render={({ field }) => <Checkbox checked={Boolean(field.value)} onChange={field.onChange} label="I had stomach / gut discomfort" hint="Useful for rehearsing. Persistent or severe symptoms are worth discussing with a clinician or dietitian." />} />
      <Field label="Notes (optional)" error={errors.notes?.message}>
        {({ id }) => <TextArea id={id} {...register('notes')} />}
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save log
        </Button>
      </div>
    </form>
  )
}

function TargetsForm({ onDone }: { onDone: () => void }) {
  const { state, run } = useApp()
  const t = state.nutrition!.targets
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<FuelingTargetsInput>({
    resolver: zodResolver(fuelingTargetsSchema),
    defaultValues: { carbsMin: t.carbsPerHour.min, carbsMax: t.carbsPerHour.max, fluidMin: t.fluidMlPerHour.min, fluidMax: t.fluidMlPerHour.max, source: t.source, setBy: t.setBy ?? '', sodiumNote: t.sodiumNote ?? '' },
  })
  const source = watch('source')
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((v) => {
        const res = run((s, e) => setFuelingTargetsOp(s, v, e), { success: 'Fueling reference ranges updated.' })
        if (!isError(res)) onDone()
      })}
    >
      <Field label="Source of these numbers" required>
        {({ id }) => (
          <Select id={id} {...register('source')}>
            <option value="general-education">General educational template</option>
            <option value="professional">Provided by a qualified professional (dietitian / physician)</option>
          </Select>
        )}
      </Field>
      {source === 'professional' && (
        <Field label="Professional’s name" required error={errors.setBy?.message} hint="EnduraPath cannot verify this — it is shown as entered by you.">
          {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('setBy')} />}
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {(
          [
            ['carbsMin', 'Carbohydrate min (g/h)'],
            ['carbsMax', 'Carbohydrate max (g/h)'],
            ['fluidMin', 'Fluid reference min (ml/h)'],
            ['fluidMax', 'Fluid reference max (ml/h)'],
          ] as const
        ).map(([name, label]) => (
          <Field key={name} label={label} required error={errors[name]?.message}>
            {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register(name, { valueAsNumber: true })} />}
          </Field>
        ))}
      </div>
      <Field label="Sodium / electrolyte note (optional)">{({ id }) => <TextInput id={id} {...register('sodiumNote')} />}</Field>
      <Notice tone="info">
        <p>Fluid numbers are a reference only. Always drink to thirst and conditions — never force fluids.</p>
      </Notice>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Save ranges
        </Button>
      </div>
    </form>
  )
}

function NutritionContent() {
  const { state, today, run } = useApp()
  const confirm = useConfirm()
  const athlete = state.athlete!
  const nutrition = state.nutrition
  const [logOpen, setLogOpen] = useState<null | Partial<FuelingLogInput>>(null)
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [load, setLoad] = useState<LoadLevel | 'auto'>('auto')

  const todays = state.workouts.filter((w) => w.date === today && w.status !== 'skipped' && w.sport !== 'rehab')
  const autoLoad = loadLevelFor(todays.reduce((s, w) => s + w.durationMin, 0), todays.some((w) => w.intensity === 'hard'))
  const activeLoad = load === 'auto' ? autoLoad : load
  const prefs = athlete.preferences
  const meals = useMemo(() => mealSuggestions({ dietary: prefs.dietary, allergies: prefs.allergies, load: activeLoad }), [prefs.dietary, prefs.allergies, activeLoad])
  const blocked = allergensFrom(prefs.allergies)

  const upcoming = state.workouts
    .filter((w) => w.status === 'planned' && w.date >= today && w.fueling && w.fueling.level !== 'none' && w.fueling.level !== 'minimal')
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 6)
  const todayFueled = todays.filter((w) => w.fueling && w.fueling.level !== 'none')

  const race = state.events.filter((e) => e.status === 'planned' && e.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
  const rehearsals = state.fuelingLogs.filter((l) => l.kind === 'race-rehearsal')
  const longPractice = state.workouts.filter((w) => w.status === 'planned' && w.date >= today && w.fueling?.level === 'structured').slice(0, 3)

  const logs = state.fuelingLogs.slice(0, 40)
  const withTolerance = logs.slice(0, 10)
  const avgTol = withTolerance.length ? withTolerance.reduce((s, l) => s + l.tolerance, 0) / withTolerance.length : null
  const adherent = logs.filter((l) => l.plannedCarbsG && l.actualCarbsG !== undefined)
  const adherence = adherent.length ? Math.round((adherent.reduce((s, l) => s + Math.min(1.25, (l.actualCarbsG ?? 0) / (l.plannedCarbsG ?? 1)), 0) / adherent.length) * 100) : null
  const giCount = logs.filter((l) => l.giSymptoms).length

  const t = nutrition?.targets ?? { ...GENERAL_FUELING_TARGETS, effectiveFrom: today }

  const delLog = async (id: string) => {
    if (await confirm({ title: 'Delete this fueling log?', body: <p>This removes the log permanently from this device.</p>, confirmLabel: 'Delete log' })) run((s, e) => deleteFuelingLogOp(s, id, e), { success: 'Log deleted.' })
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Nutrition & fueling">
        Fuel to train well, recover, and rehearse race day. Everything here is <strong className="text-fg">general educational guidance</strong> — individual prescriptions come from a qualified dietitian or physician.
      </PageIntro>

      <Notice tone="info" title="General education vs professional advice">
        <p>
          Ranges and meal ideas on this page are labelled <Badge>General education</Badge>. If a professional gives you numbers, enter them under “Edit reference ranges” and they will be labelled with their name.
        </p>
      </Notice>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Today’s meal ideas" subtitle={`Matched to ${activeLoad} training load${load === 'auto' ? ' (from today’s plan)' : ''}`} icon={<Salad className="size-4" />} action={
            <Select aria-label="Training load" className="h-8 w-auto text-xs" value={load} onChange={(e) => setLoad(e.target.value as LoadLevel | 'auto')}>
              <option value="auto">From today’s plan</option>
              <option value="rest">Rest day</option>
              <option value="light">Light day</option>
              <option value="moderate">Moderate day</option>
              <option value="heavy">Heavy day</option>
            </Select>
          } />
          <CardBody className="space-y-4">
            {prefs.allergies.length > 0 && <p className="text-xs text-muted">Excluding anything matching: <strong className="text-fg">{prefs.allergies.join(', ')}</strong>{blocked.length ? '' : ' (no known allergen groups matched — always check labels)'}.</p>}
            {meals.length === 0 ? (
              <EmptyState title="No suggestions match your preferences" body="Your dietary choices and allergies exclude every built-in idea. A dietitian can tailor options for you." />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((slot) => {
                  const items = meals.filter((m) => m.slot === slot)
                  if (!items.length) return null
                  return (
                    <section key={slot} className="rounded-lg border border-line bg-base p-3">
                      <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                        <UtensilsCrossed className="size-3.5" aria-hidden /> {SLOT_LABEL[slot]}
                      </h3>
                      <ul className="mt-2 space-y-2">
                        {items.map((m) => (
                          <li key={m.name}>
                            <p className="text-sm font-medium text-fg">{m.name}</p>
                            <p className="text-xs text-muted">{m.note}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )
                })}
              </div>
            )}
            <p className="text-[11px] text-muted">Ideas only — not a meal plan, and no calorie or macro targets are implied. Eat to appetite and enjoy your food.</p>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Reference ranges" action={<Button size="sm" variant="outline" onClick={() => setTargetsOpen(true)}>Edit</Button>} />
            <CardBody className="space-y-3">
              <SourceBadge source={t.source} setBy={t.setBy} />
              <div className="grid grid-cols-2 gap-4">
                <Stat label="Carbs (long sessions)" value={`${t.carbsPerHour.min}–${t.carbsPerHour.max}`} hint="g per hour" />
                <Stat label="Fluid reference" value={`${t.fluidMlPerHour.min}–${t.fluidMlPerHour.max}`} hint="ml per hour, if thirsty" />
              </div>
              {t.sodiumNote && <p className="text-xs text-muted">{t.sodiumNote}</p>}
              <p className="text-xs text-muted">Used for sessions of about an hour or more. Shorter sessions rarely need in-session fuel.</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Hydration" icon={<Droplets className="size-4" />} />
            <CardBody className="space-y-3">
              <Checkbox
                checked={state.settings.hydrationReminders}
                onChange={(v) => run((s, e) => ({ ...s, settings: { ...s.settings, hydrationReminders: v }, updatedAt: e.now }), { success: v ? 'Hydration reminders on.' : 'Hydration reminders off.' })}
                label="Show hydration reminders"
                hint="In-app reminders only — no push notifications are sent."
              />
              {state.settings.hydrationReminders && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  <li>Drink regularly through the day; let thirst and urine colour guide you.</li>
                  <li>Before long sessions: have a drink with your meal, not a large volume right before.</li>
                  <li>During: sip to thirst. Needs change with heat, sweat rate and intensity. Do not force fluids.</li>
                  <li>Unusual confusion, nausea or swelling after heavy drinking needs medical attention.</li>
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader title="Session fueling plans" subtitle="Upcoming sessions that benefit from a fueling plan" />
        {todayFueled.length > 0 && (
          <div className="border-b border-line px-5 py-3 text-sm">
            <p className="font-medium text-fg">Today</p>
            <ul className="mt-1 space-y-1 text-muted">
              {todayFueled.map((w) => (
                <li key={w.id}>
                  <SportIcon sport={w.sport} className="mr-1.5 inline" />
                  {w.title}: {w.fueling?.summary}
                </li>
              ))}
            </ul>
          </div>
        )}
        {upcoming.length === 0 ? (
          <p className="p-5 text-sm text-muted">No upcoming sessions need a fueling plan. Normal meals and drinking to thirst are enough for shorter sessions.</p>
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((w) => (
              <li key={w.id} className="space-y-2 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-medium text-fg">
                    <SportIcon sport={w.sport} /> {w.title}
                  </p>
                  <span className="text-xs text-muted">
                    {formatDate(w.date)} · {formatDuration(w.durationMin)}
                  </span>
                </div>
                <p className="text-sm text-muted">{w.fueling?.summary}</p>
                <div className="grid gap-2 text-xs text-muted sm:grid-cols-3">
                  <p><strong className="text-fg">Before:</strong> {w.fueling?.before}</p>
                  <p><strong className="text-fg">During:</strong> {w.fueling?.during}</p>
                  <p><strong className="text-fg">After:</strong> {w.fueling?.after}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {w.fueling && <SourceBadge source={w.fueling.source} setBy={state.nutrition?.targets.setBy} />}
                  {w.fueling?.carbsPerHour && <Badge tone="accent">{w.fueling.carbsPerHour.min}–{w.fueling.carbsPerHour.max} g carbs/h reference</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Post-workout recovery" subtitle={`For a ${activeLoad} day`} />
        <CardBody>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {POST_WORKOUT_GUIDANCE[activeLoad].map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Race-day fueling rehearsal" subtitle={race ? `Preparing for ${race.name} · ${formatDate(race.date, 'd MMM yyyy')} (${Math.max(0, daysBetween(today, race.date))} days)` : 'Add a race under Events to anchor your rehearsal plan'} action={<Button size="sm" variant="primary" onClick={() => setLogOpen({ kind: 'race-rehearsal', eventId: race?.id })}>Log a rehearsal</Button>} />
        <CardBody className="space-y-4">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
            <li>Find out what is provided on course (from the <em>official</em> race information) and train with those products.</li>
            <li>Practise your exact race-morning breakfast and timing in at least two key sessions.</li>
            <li>In your longest sessions, rehearse the full plan: breakfast, pre-start snack, in-session fuel at planned intervals, and recovery.</li>
            <li>Log how it felt. Change one thing at a time and test again — never try something new on race day.</li>
            <li>If gut problems persist, speak with a sports dietitian or clinician.</li>
          </ol>
          {longPractice.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Upcoming rehearsal-ready sessions</p>
              <ul className="space-y-1 text-sm">
                {longPractice.map((w) => (
                  <li key={w.id} className="text-muted">
                    <span className="text-fg">{w.title}</span> — {formatDate(w.date)}, {formatDuration(w.durationMin)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">
            {rehearsals.length} rehearsal{rehearsals.length === 1 ? '' : 's'} logged{rehearsals.length ? `; last on ${formatDate(rehearsals[0].date)}` : ''}.
          </p>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Fueling log" subtitle="Planned vs actual intake, tolerance and adherence" action={<Button size="sm" variant="primary" onClick={() => setLogOpen({})}>Add log</Button>} />
          <div className="grid grid-cols-3 gap-4 border-b border-line px-5 py-4">
            <Stat label="Avg tolerance" value={avgTol === null ? '—' : `${avgTol.toFixed(1)}/5`} hint="last 10 logs" />
            <Stat label="Carb adherence" value={adherence === null ? '—' : `${adherence}%`} hint="actual vs planned" />
            <Stat label="Gut symptoms" value={`${giCount}`} hint={`of ${logs.length} logs`} tone={giCount > 3 ? 'warn' : undefined} />
          </div>
          {logs.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No fueling logs yet" body="Logging is optional. A few notes on long sessions help you refine what works for your stomach." action={<Button size="sm" variant="outline" onClick={() => setLogOpen({})}>Add your first log</Button>} />
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">Fueling logs, newest first</caption>
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="px-5 py-2 font-medium">Date</th>
                    <th scope="col" className="px-2 py-2 font-medium">Type</th>
                    <th scope="col" className="px-2 py-2 font-medium">Carbs (plan → actual)</th>
                    <th scope="col" className="px-2 py-2 font-medium">Fluid (plan → actual)</th>
                    <th scope="col" className="px-2 py-2 font-medium">Tolerance</th>
                    <th scope="col" className="px-5 py-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="px-5 py-2.5 text-fg">{formatDate(l.date, 'd MMM')}</td>
                      <td className="px-2 py-2.5 text-muted">{l.kind === 'race-rehearsal' ? 'Rehearsal' : 'Training'}</td>
                      <td className="px-2 py-2.5 tabular-nums text-muted">{l.plannedCarbsG ?? '—'} → {l.actualCarbsG ?? '—'} g</td>
                      <td className="px-2 py-2.5 tabular-nums text-muted">{l.plannedFluidMl ?? '—'} → {l.actualFluidMl ?? '—'} ml</td>
                      <td className="px-2 py-2.5">
                        <span className="tabular-nums text-fg">{l.tolerance}/5</span>
                        {l.giSymptoms && <Badge tone="warn" className="ml-2">gut</Badge>}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <Button size="icon" variant="ghost" className="size-8" aria-label={`Delete log from ${formatDate(l.date)}`} onClick={() => delLog(l.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Food preferences & allergies" />
          <CardBody className="space-y-4">
            <ChipGroup legend="Dietary pattern" values={prefs.dietary} onChange={(v) => run((s, e) => updatePreferencesOp(s, { dietary: v }, e))} options={DIETARY.map((d) => ({ value: d, label: d }))} />
            <AllergyEditor current={prefs.allergies} />
          </CardBody>
        </Card>
      </div>

      <Dialog open={logOpen !== null} onOpenChange={(o) => !o && setLogOpen(null)} title="Add fueling log" description="Optional. Used only to show your own trends." size="lg">
        {logOpen !== null && <FuelingLogForm defaults={logOpen} onDone={() => setLogOpen(null)} />}
      </Dialog>
      <Dialog open={targetsOpen} onOpenChange={setTargetsOpen} title="Edit reference ranges" description="Set by you, or by a qualified professional.">
        {targetsOpen && <TargetsForm onDone={() => setTargetsOpen(false)} />}
      </Dialog>
      <SafetyFooter>
        <p>FuelWise (simulated) gives general sports-nutrition education. It avoids restrictive dieting and supplement claims. For individual needs, medical conditions or disordered-eating concerns, please see a registered dietitian or physician.</p>
      </SafetyFooter>
    </div>
  )
}

function AllergyEditor({ current }: { current: string[] }) {
  const { run } = useApp()
  const [text, setText] = useState(current.join(', '))
  const [err, setErr] = useState<string>()
  return (
    <form
      noValidate
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.length > 200) return setErr('Keep this under 200 characters')
        setErr(undefined)
        const list = text.split(',').map((s) => s.trim()).filter(Boolean)
        run((s, env) => updatePreferencesOp(s, { allergies: list }, env), { success: 'Allergies updated.' })
      }}
    >
      <Field label="Allergies / intolerances (comma-separated)" error={err} hint="Meal ideas matching these are hidden. Always check labels.">
        {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
      <Button type="submit" size="sm" variant="outline">
        Save allergies
      </Button>
    </form>
  )
}

export function NutritionPage() {
  return (
    <RequireOnboarded>
      <NutritionContent />
    </RequireOnboarded>
  )
}
