import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFieldArray, useForm, type DefaultValues, type Path } from 'react-hook-form'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, Notice } from '@/components/shared/ui'
import { Checkbox, ChipGroup, ChoiceGroup, Field, Select, TextArea, TextInput } from '@/components/forms/controls'
import { PageIntro } from '@/components/shared/page'
import { IntensityBadge, SportIcon } from '@/components/shared/workout-bits'
import { activateOnboarding, isError, previewPlan } from '@/domain/operations/app-ops'
import { emptyState } from '@/domain/models/state'
import { blankOnboardingValues, onboardingValuesFromState } from '@/domain/onboarding/defaults'
import { GOAL_LABELS, GOAL_TYPES, type GoalType } from '@/domain/models/common'
import { RACE_DISTANCES, DEFAULT_ENGINE_CONFIG } from '@/domain/training-engine/config'
import { ONBOARDING_STEP_KEYS, ONBOARDING_STEP_SCHEMAS, onboardingSchema, type OnboardingInput, type OnboardingValues } from '@/domain/validation/schemas'
import { DAY_NAMES, DAY_SHORT, formatDate } from '@/lib/dates'
import { formatDuration } from '@/lib/units'
import { cn } from '@/lib/utils'
import { TIME_LABELS } from '@/features/training/WorkoutActions'

const STEPS = ['Athlete profile', 'Fitness baseline', 'Goal', 'Weekly availability', 'Preferences & recovery', 'Plan preview'] as const
const EXPERIENCE = [
  { value: 'none', label: 'None' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const
const DIETARY = ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free', 'halal', 'kosher'] as const
const EQUIPMENT = ['Pool access', 'Road or tri bike', 'Indoor trainer', 'Gym / weights', 'Resistance bands', 'Open-water access', 'Heart-rate monitor', 'GPS watch', 'Power meter']
const SUPPORT = [
  { value: 'coach', label: 'Coach' },
  { value: 'nutritionist', label: 'Nutritionist' },
  { value: 'physiotherapist', label: 'Physio / PT' },
  { value: 'physician', label: 'Physician' },
] as const

type Errors = Record<string, string>

function collectErrors(prefix: string, issues: { path: PropertyKey[]; message: string }[]): Errors {
  const out: Errors = {}
  for (const i of issues) {
    const key = [prefix, ...i.path.map(String)].join('.')
    if (!out[key]) out[key] = i.message
  }
  return out
}

export function OnboardingPage() {
  const { state, run, env, today } = useApp()
  const navigate = useNavigate()
  const existing = useMemo(() => onboardingValuesFromState(state), [state])
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<Errors>({})
  const [attempted, setAttempted] = useState(false)
  const [activating, setActivating] = useState(false)

  const form = useForm<OnboardingInput>({ defaultValues: (existing ?? blankOnboardingValues()) as DefaultValues<OnboardingInput> })
  const { register, watch, setValue, getValues, control } = form
  const unavailable = useFieldArray({ control, name: 'availability.unavailable' })
  const values = watch()

  const base = state.isSampleData || !state.athlete ? emptyState(env().now) : state
  const editingReal = Boolean(existing)

  const validateStep = (i: number): boolean => {
    if (i >= ONBOARDING_STEP_KEYS.length) return true
    const key = ONBOARDING_STEP_KEYS[i]
    const res = ONBOARDING_STEP_SCHEMAS[key].safeParse(getValues(key))
    const next = res.success ? {} : collectErrors(key, res.error.issues)
    if (key === 'goal') {
      const d = getValues('goal.targetEventDate')
      if (d && d < today) next['goal.targetEventDate'] = 'Choose a date that is today or later'
    }
    setErrors((prev) => {
      const keep = Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${key}.`)))
      return { ...keep, ...next }
    })
    return Object.keys(next).length === 0
  }

  // Once the athlete has tried to continue, keep validating live so errors clear as they fix them.
  useEffect(() => {
    if (!attempted) return
    const sub = watch(() => validateStep(step))
    return () => sub.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempted, step])

  const next = () => {
    setAttempted(true)
    if (validateStep(step)) {
      setAttempted(false)
      setStep((s) => Math.min(STEPS.length - 1, s + 1))
    }
  }
  const back = () => {
    setAttempted(false)
    setStep((s) => Math.max(0, s - 1))
  }
  const goTo = (i: number) => {
    setAttempted(false)
    setStep(i)
  }

  const err = (path: string) => errors[path]
  const num = (name: Path<OnboardingInput>, label: string, o: { hint?: string; required?: boolean; step?: string } = {}) => (
    <Field label={label} required={o.required ?? true} hint={o.hint} error={err(name)}>
      {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="decimal" step={o.step} aria-describedby={describedBy} aria-invalid={invalid} {...register(name, { valueAsNumber: true })} />}
    </Field>
  )
  const text = (name: Path<OnboardingInput>, label: string, o: { hint?: string; required?: boolean; placeholder?: string; type?: string } = {}) => (
    <Field label={label} required={o.required} hint={o.hint} error={err(name)}>
      {({ id, describedBy, invalid }) => <TextInput id={id} type={o.type} placeholder={o.placeholder} aria-describedby={describedBy} aria-invalid={invalid} {...register(name)} />}
    </Field>
  )
  const area = (name: Path<OnboardingInput>, label: string, o: { hint?: string; placeholder?: string } = {}) => (
    <Field label={label} hint={o.hint} error={err(name)}>
      {({ id, describedBy, invalid }) => <TextArea id={id} placeholder={o.placeholder} aria-describedby={describedBy} aria-invalid={invalid} {...register(name)} />}
    </Field>
  )

  /* ------------------------------ Preview ------------------------------ */
  const parsed = useMemo(() => (step === 5 ? onboardingSchema.safeParse(getValues()) : null), [step, getValues])
  const preview = useMemo(() => {
    if (!parsed?.success) return null
    return previewPlan(parsed.data, base.athlete ? base : null, env())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed])

  const failedSteps = useMemo(() => {
    if (step !== 5 || !parsed || parsed.success) return []
    const seen = new Set<number>()
    for (const i of parsed.error.issues) seen.add(ONBOARDING_STEP_KEYS.indexOf(i.path[0] as (typeof ONBOARDING_STEP_KEYS)[number]))
    return [...seen].filter((i) => i >= 0).sort()
  }, [step, parsed])

  const activate = (v: OnboardingValues) => {
    setActivating(true)
    const res = run((_s, e) => activateOnboarding(base, v, e), { success: 'Plan activated. Welcome to EnduraPath.' })
    setActivating(false)
    if (!isError(res)) navigate('/dashboard')
  }

  const hasPace = Boolean(values.baseline?.runPace)
  const goalType = values.goal?.type as GoalType | undefined

  return (
    <div className="mx-auto max-w-4xl">
      <PageIntro title={editingReal ? 'Update your profile & plan' : 'Build your plan'}>
        Six short steps. Nothing requires lab testing or special equipment — beginners with no watch or power meter are fully supported. Your answers stay on this device.
      </PageIntro>

      {state.isSampleData && (
        <Notice tone="info" className="mb-4" title="You are viewing sample data">
          <p>Activating your own plan replaces the fictional sample athlete on this device. Nothing from the sample is carried over.</p>
        </Notice>
      )}
      {editingReal && (
        <Notice tone="info" className="mb-4" title="Editing an existing profile">
          <p>Activating again rebuilds your future sessions. Completed sessions, results, check-ins and medical records are kept.</p>
        </Notice>
      )}

      <nav aria-label="Onboarding progress" className="mb-6">
        <ol className="flex gap-1.5 overflow-x-auto pb-1">
          {STEPS.map((label, i) => {
            const done = i < step
            const current = i === step
            return (
              <li key={label} className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => goTo(i)}
                  aria-current={current ? 'step' : undefined}
                  className={cn('flex w-full min-w-[110px] flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors', current ? 'border-accent bg-accent/10' : done ? 'border-line bg-surface hover:border-line-strong' : 'border-line bg-surface opacity-60')}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                    {done ? <Check className="size-3 text-accent" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}
                    <span className="sr-only">Step {i + 1}: </span>
                  </span>
                  <span className={cn('truncate text-xs font-medium', current ? 'text-fg' : 'text-muted')}>{label}</span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <Card>
        <CardHeader title={`Step ${step + 1} of ${STEPS.length} — ${STEPS[step]}`} />
        <CardBody className="space-y-6">
          {Object.keys(errors).some((k) => k.startsWith(`${ONBOARDING_STEP_KEYS[step] ?? '-'}.`)) && attempted && (
            <Notice tone="danger" title="Please fix the highlighted fields to continue.">
              <p>Required fields are marked with *.</p>
            </Notice>
          )}

          {/* ----------------------------- Step 1 ----------------------------- */}
          {step === 0 && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {text('profile.displayName', 'Preferred name', { required: true, placeholder: 'What should we call you?' })}
                <Field label="Age range" required error={err('profile.ageRange')} hint="Used for conservative load pacing only.">
                  {({ id, describedBy, invalid }) => (
                    <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('profile.ageRange')}>
                      <option value="">Choose…</option>
                      {['18-24', '25-34', '35-44', '45-54', '55-64', '65+'].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <ChoiceGroup name="units" legend="Units" columns={2} value={values.profile?.units} onChange={(v) => setValue('profile.units', v)} options={[{ value: 'metric', label: 'Metric', hint: 'km, m, min/km' }, { value: 'imperial', label: 'Imperial', hint: 'mi, yd, min/mi' }]} />
              <ChoiceGroup name="exp" legend="General training experience *" columns={4} value={values.profile?.generalExperience} onChange={(v) => setValue('profile.generalExperience', v)} options={[...EXPERIENCE]} error={err('profile.generalExperience')} />
              <ChoiceGroup
                name="swimconf"
                legend="Swimming confidence *"
                columns={4}
                value={values.profile?.swimConfidence}
                onChange={(v) => setValue('profile.swimConfidence', v)}
                options={[{ value: 'learning', label: 'Learning', hint: 'Still building basics' }, { value: 'basic', label: 'Basic', hint: 'Can swim short distances' }, { value: 'comfortable', label: 'Comfortable', hint: 'Steady laps' }, { value: 'strong', label: 'Strong' }]}
                error={err('profile.swimConfidence')}
              />
              <ChoiceGroup name="ow" legend="Open-water experience *" columns={3} value={values.profile?.openWater} onChange={(v) => setValue('profile.openWater', v)} options={[{ value: 'none', label: 'None' }, { value: 'some', label: 'Some' }, { value: 'regular', label: 'Regular' }]} error={err('profile.openWater')} />
              <div className="grid gap-5 sm:grid-cols-2">
                <ChoiceGroup name="bikeexp" legend="Cycling experience *" columns={2} value={values.profile?.bikeExperience} onChange={(v) => setValue('profile.bikeExperience', v)} options={[...EXPERIENCE]} error={err('profile.bikeExperience')} />
                <ChoiceGroup name="runexp" legend="Running experience *" columns={2} value={values.profile?.runExperience} onChange={(v) => setValue('profile.runExperience', v)} options={[...EXPERIENCE]} error={err('profile.runExperience')} />
              </div>
              {area('profile.healthNotes', 'Health information you choose to share (optional)', { hint: 'Only share what you are comfortable with and what helps shape training. We do not interpret this as a diagnosis.', placeholder: 'Leave blank if none' })}
            </div>
          )}

          {/* ----------------------------- Step 2 ----------------------------- */}
          {step === 1 && (
            <div className="space-y-6">
              <Notice tone="accent">
                <p>Rough numbers are fine. If you’re new to a sport, enter 0 — we’ll start gently.</p>
              </Notice>
              {(
                [
                  ['Swimming', 'swimSessionsPerWeek', 'swimMetersPerWeek', 'comfortableSwimM', 'Weekly volume (metres)', 'Longest swim that feels comfortable (m)'],
                  ['Cycling', 'bikeSessionsPerWeek', 'bikeMinutesPerWeek', 'comfortableBikeMin', 'Weekly duration (minutes)', 'Longest ride that feels comfortable (min)'],
                  ['Running', 'runSessionsPerWeek', 'runMinutesPerWeek', 'comfortableRunMin', 'Weekly duration (minutes)', 'Longest run that feels comfortable (min)'],
                ] as const
              ).map(([title, s, v, c, vLabel, cLabel]) => (
                <fieldset key={title} className="space-y-3">
                  <legend className="text-sm font-semibold text-fg">{title}</legend>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {num(`baseline.${s}`, 'Sessions per week')}
                    {num(`baseline.${v}`, vLabel)}
                    {num(`baseline.${c}`, cLabel)}
                  </div>
                </fieldset>
              ))}
              <ChoiceGroup
                name="consistency"
                legend="Training consistency over the last 8 weeks *"
                columns={4}
                value={values.baseline?.consistency}
                onChange={(v) => setValue('baseline.consistency', v)}
                options={[{ value: 'none', label: 'Not training' }, { value: 'occasional', label: 'Occasional' }, { value: 'regular', label: 'Regular' }, { value: 'very-consistent', label: 'Very consistent' }]}
                error={err('baseline.consistency')}
              />
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-fg">Recent race (optional)</legend>
                <div className="grid gap-4 sm:grid-cols-3">
                  {text('baseline.recentRaceName', 'Race name')}
                  <Field label="Distance category">
                    {({ id }) => (
                      <Select id={id} {...register('baseline.recentRaceCategory')}>
                        <option value="">—</option>
                        {GOAL_TYPES.map((g) => (
                          <option key={g} value={g}>
                            {GOAL_LABELS[g]}
                          </option>
                        ))}
                        <option value="other">Other</option>
                      </Select>
                    )}
                  </Field>
                  {text('baseline.recentRaceTime', 'Finish time', { placeholder: 'h:mm:ss' })}
                </div>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-fg">Optional data — skip anything you don’t have</legend>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {num('baseline.restingHr', 'Resting heart rate (bpm)', { required: false })}
                  {num('baseline.maxHr', 'Max heart rate (bpm)', { required: false })}
                  {text('baseline.runPace', 'Comfortable-hard run pace (min/km)', { placeholder: 'mm:ss' })}
                  {num('baseline.bikeFtpWatts', 'Cycling power (W, FTP)', { required: false })}
                </div>
                {!hasPace && <p className="text-xs text-muted">Without pace or power data, sessions are guided by effort (RPE) and the talk test.</p>}
              </fieldset>
              {area('baseline.injuryNote', 'Current injuries or niggles (optional)', { placeholder: 'e.g. mild calf tightness after long runs' })}
              <div className="space-y-3 rounded-lg border border-line p-4">
                <Checkbox
                  checked={Boolean(values.baseline?.hasClinicianRestrictions)}
                  onChange={(v) => setValue('baseline.hasClinicianRestrictions', v, { shouldDirty: true })}
                  label="A clinician has given me restrictions on training"
                  hint="They will be applied conservatively and shown everywhere. Only a clinician’s decision can lift them."
                />
                {values.baseline?.hasClinicianRestrictions && area('baseline.restrictionDetail', 'What did your clinician advise? *', { placeholder: 'e.g. no running for 4 weeks; easy cycling only' })}
              </div>
            </div>
          )}

          {/* ----------------------------- Step 3 ----------------------------- */}
          {step === 2 && (
            <div className="space-y-5">
              <ChoiceGroup
                name="goal"
                legend="Your goal *"
                columns={2}
                value={goalType}
                onChange={(v) => setValue('goal.type', v)}
                error={err('goal.type')}
                options={GOAL_TYPES.map((g) => ({ value: g, label: GOAL_LABELS[g], hint: `${RACE_DISTANCES[g].swimM} m swim · ${RACE_DISTANCES[g].bikeKm} km bike · ${RACE_DISTANCES[g].runKm} km run` }))}
              />
              {(goalType === 'half-ironman' || goalType === 'ironman') && (
                <Notice tone="warn" title="Ambitious goals are welcome — and earned">
                  <p>You can aim straight at this goal. EnduraPath will still check your baseline and may start you in an earlier stage with clear milestones to reach first. Readiness reviews, not the calendar, decide when you progress.</p>
                </Notice>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {text('goal.targetEventDate', 'Target event date (if known)', { type: 'date', hint: 'Leave blank if undecided — the plan will use illustrative preparation ranges.' })}
                {text('goal.eventName', 'Event name (optional)')}
              </div>
              {area('goal.intermediateEvents', 'Intermediate or preparatory events (optional)', { placeholder: 'e.g. local sprint in June, 10k in April. You can add details later under Events.' })}
              <ChoiceGroup
                name="fmt"
                legend="Preferred race format"
                columns={3}
                value={values.goal?.preferredFormat}
                onChange={(v) => setValue('goal.preferredFormat', v)}
                options={[{ value: 'open-water', label: 'Open water' }, { value: 'pool-swim', label: 'Pool swim' }, { value: 'no-preference', label: 'No preference' }]}
              />
              <ChoiceGroup
                name="intent"
                legend="What does success look like?"
                columns={2}
                value={values.goal?.intent}
                onChange={(v) => setValue('goal.intent', v)}
                options={[{ value: 'finish-comfortably', label: 'Finish comfortably', hint: 'Enjoy it and cross the line strong' }, { value: 'performance', label: 'Pursue a performance target', hint: 'A time or placing goal' }]}
              />
              {values.goal?.intent === 'performance' && text('goal.performanceTarget', 'Performance target *', { placeholder: 'e.g. sub 2:45 Olympic' })}
            </div>
          )}

          {/* ----------------------------- Step 4 ----------------------------- */}
          {step === 3 && (
            <div className="space-y-5">
              <ChipGroup
                legend="Days you can train *"
                values={(values.availability?.trainingDays ?? []) as number[]}
                onChange={(v) => setValue('availability.trainingDays', [...v].sort(), { shouldDirty: true })}
                options={DAY_SHORT.map((d, i) => ({ value: i, label: d }))}
                error={err('availability.trainingDays')}
                hint="At least 2. Rest and recovery are part of the plan, so you do not need to choose every day."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                {num('availability.maxHoursPerWeek', 'Maximum practical hours per week', { step: '0.5', hint: 'A ceiling, not a target. Weeks are often lighter.' })}
                <Field label="Preferred rest day" error={err('availability.restDay')}>
                  {({ id }) => (
                    <Select id={id} value={String(values.availability?.restDay ?? -1)} onChange={(e) => setValue('availability.restDay', Number(e.target.value))}>
                      <option value="-1">No fixed rest day</option>
                      {DAY_NAMES.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              {area('availability.constraints', 'Work or family scheduling constraints (optional)', { placeholder: 'e.g. school run Tue/Thu mornings; late shifts on Wednesday' })}
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-fg">What do you have access to?</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['pool', 'A pool for swimming'],
                      ['bicycle', 'A bicycle'],
                      ['indoorTrainer', 'An indoor trainer'],
                      ['gym', 'A gym or weights'],
                      ['safeRunRoutes', 'Safe running routes'],
                    ] as const
                  ).map(([k, label]) => (
                    <Checkbox key={k} label={label} checked={Boolean(values.availability?.access?.[k])} onChange={(v) => setValue(`availability.access.${k}`, v, { shouldDirty: true })} />
                  ))}
                </div>
                {!values.availability?.access?.pool && <p className="text-xs text-muted">Without a pool, swim sessions are replaced with dry-land alternatives and open-water guidance.</p>}
              </fieldset>
              <ChipGroup
                legend="Preferred workout times *"
                values={(values.availability?.preferredTimes ?? []) as never[]}
                onChange={(v) => setValue('availability.preferredTimes', v as never, { shouldDirty: true })}
                options={Object.entries(TIME_LABELS).map(([value, label]) => ({ value: value as never, label }))}
                error={err('availability.preferredTimes')}
              />
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-fg">Travel or unavailable dates</legend>
                {unavailable.fields.length === 0 && <p className="text-xs text-muted">None added. The plan avoids these dates when you add them.</p>}
                {unavailable.fields.map((f, i) => (
                  <div key={f.id} className="grid items-end gap-3 rounded-lg border border-line p-3 sm:grid-cols-[1fr_1fr_1.2fr_auto]">
                    {text(`availability.unavailable.${i}.start`, 'From', { type: 'date' })}
                    {text(`availability.unavailable.${i}.end`, 'To', { type: 'date' })}
                    {text(`availability.unavailable.${i}.reason`, 'Reason (optional)')}
                    <Button variant="ghost" size="icon" aria-label={`Remove unavailable range ${i + 1}`} onClick={() => unavailable.remove(i)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                {unavailable.fields.length < 10 && (
                  <Button variant="outline" size="sm" onClick={() => unavailable.append({ start: today, end: today, reason: '' })}>
                    <Plus className="size-4" /> Add dates
                  </Button>
                )}
              </fieldset>
            </div>
          )}

          {/* ----------------------------- Step 5 ----------------------------- */}
          {step === 4 && (
            <div className="space-y-5">
              <ChipGroup legend="Dietary preferences" values={(values.preferences?.dietary ?? []) as never[]} onChange={(v) => setValue('preferences.dietary', v as never, { shouldDirty: true })} options={DIETARY.map((d) => ({ value: d as never, label: d }))} />
              {text('preferences.allergies', 'Allergies or intolerances (comma-separated)', { hint: 'Used only to filter meal suggestions. Always check labels yourself.', placeholder: 'e.g. peanuts, shellfish' })}
              <ChipGroup legend="Exercise equipment you have" values={values.preferences?.equipment ?? []} onChange={(v) => setValue('preferences.equipment', v, { shouldDirty: true })} options={EQUIPMENT.map((e) => ({ value: e, label: e }))} />
              <div className="grid gap-4 sm:grid-cols-2">
                {num('preferences.sleepHoursTypical', 'Typical sleep (hours per night)', { step: '0.25' })}
                <ChoiceGroup
                  name="recpat"
                  legend="How do you usually recover?"
                  columns={1}
                  value={values.preferences?.recoveryPattern}
                  onChange={(v) => setValue('preferences.recoveryPattern', v)}
                  options={[{ value: 'recover-quickly', label: 'Quickly' }, { value: 'average', label: 'About average' }, { value: 'recover-slowly', label: 'Slowly' }]}
                />
              </div>
              {area('preferences.fatigueNote', 'Fatigue or recovery patterns (optional)', { placeholder: 'e.g. very tired after back-to-back hard days' })}
              <ChipGroup legend="Professional support you already have" values={(values.preferences?.professionalSupport ?? []) as never[]} onChange={(v) => setValue('preferences.professionalSupport', v as never, { shouldDirty: true })} options={SUPPORT.map((s) => ({ value: s.value as never, label: s.label }))} hint="Optional. Nothing here is interpreted as a medical diagnosis." />
            </div>
          )}

          {/* ----------------------------- Step 6 ----------------------------- */}
          {step === 5 && (
            <div className="space-y-6">
              {failedSteps.length > 0 && (
                <Notice tone="danger" title="Some answers need attention before we can build your plan">
                  <p>
                    Go back to:{' '}
                    {failedSteps.map((i) => (
                      <button key={i} type="button" className="mr-3 text-accent underline underline-offset-2" onClick={() => goTo(i)}>
                        {STEPS[i]}
                      </button>
                    ))}
                  </p>
                </Notice>
              )}
              {preview && parsed?.success && (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-lg border border-line bg-base p-4">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Starting stage</p>
                      <p className="mt-1 text-2xl font-semibold text-accent">Stage {preview.generated.plan.currentStage}</p>
                      <p className="mt-1 text-xs text-muted">{DEFAULT_ENGINE_CONFIG.stages[preview.generated.plan.currentStage].label}</p>
                    </div>
                    <div className="rounded-lg border border-line bg-base p-4">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Estimated preparation</p>
                      <p className="mt-1 text-2xl font-semibold">
                        {preview.generated.plan.estimatedTotalWeeks.min}–{preview.generated.plan.estimatedTotalWeeks.max}+ weeks
                      </p>
                      <p className="mt-1 text-xs text-muted">A range, not a promise. You may need longer.</p>
                    </div>
                    <div className="rounded-lg border border-line bg-base p-4">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Goal</p>
                      <p className="mt-1 text-lg font-semibold">{GOAL_LABELS[parsed.data.goal.type]}</p>
                      <p className="mt-1 text-xs text-muted">{parsed.data.goal.targetEventDate ? `Target ${formatDate(parsed.data.goal.targetEventDate, 'd MMM yyyy')}` : 'No target date'}</p>
                    </div>
                  </div>

                  {preview.generated.plan.warnings.length > 0 && (
                    <Notice tone="warn" title="Important notes about this plan">
                      <ul className="list-disc space-y-1 pl-5">
                        {preview.generated.plan.warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </Notice>
                  )}

                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Proposed progression roadmap</h3>
                      <button type="button" className="text-xs text-accent hover:underline" onClick={() => goTo(2)}>
                        Edit goal
                      </button>
                    </div>
                    <ol className="space-y-2">
                      {preview.generated.plan.pathway.map((p) => (
                        <li key={p.stage} className={cn('rounded-lg border p-3', p.status === 'current' ? 'border-accent/60 bg-accent/8' : 'border-line bg-base')}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium">
                              Stage {p.stage} · {p.label}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <span>
                                {p.estimatedMinWeeks}–{p.estimatedMaxWeeks}+ wks
                              </span>
                              <Badge tone={p.status === 'current' ? 'accent' : p.status === 'upcoming' ? 'secondary' : 'neutral'}>{p.status.replace('-', ' ')}</Badge>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-muted">{p.reason}</p>
                        </li>
                      ))}
                    </ol>
                  </section>

                  <WeeklyStructure preview={preview} />

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <section className="rounded-lg border border-line bg-base p-4">
                      <h3 className="text-sm font-semibold">Suggested baseline assessment sessions</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                        {preview.generated.plan.baselineAssessments.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-muted">Done by feel — no lab testing required.</p>
                    </section>
                    <section className="rounded-lg border border-line bg-base p-4">
                      <h3 className="text-sm font-semibold">Key assumptions & limitations</h3>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                        {preview.generated.plan.assumptions.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                        <li>This is a general educational plan, not medical advice. It cannot clear you to train or guarantee race completion.</li>
                      </ul>
                    </section>
                  </div>

                  <section className="rounded-lg border border-line bg-base p-4">
                    <h3 className="text-sm font-semibold">Review before activating</h3>
                    <p className="mt-1 text-sm text-muted">Change anything by returning to its step — your answers are kept. After activation you can still edit scheduling on individual sessions.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {STEPS.slice(0, 5).map((s, i) => (
                        <Button key={s} variant="outline" size="sm" onClick={() => goTo(i)}>
                          Edit: {s}
                        </Button>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-line pt-4">
            <Button variant="ghost" onClick={back} disabled={step === 0}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button variant="primary" onClick={next}>
                {step === STEPS.length - 2 ? 'Preview plan' : 'Continue'} <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button variant="primary" disabled={!parsed?.success || activating} onClick={() => parsed?.success && activate(parsed.data)}>
                <Check className="size-4" /> Activate this plan
              </Button>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}

function WeeklyStructure({ preview }: { preview: ReturnType<typeof previewPlan> }) {
  const weeks = useMemo(() => {
    const starts = [...new Set(preview.generated.workouts.filter((w) => w.sport !== 'rehab').map((w) => w.weekStart))].sort()
    return starts
  }, [preview])
  const typical = weeks[1] ?? weeks[0]
  const sessions = preview.generated.workouts.filter((w) => w.weekStart === typical && w.sport !== 'rehab').sort((a, b) => (a.date < b.date ? -1 : 1))
  const total = sessions.reduce((s, w) => s + w.durationMin, 0)
  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Typical weekly structure</h3>
        {typical && <span className="text-xs text-muted">Example: week of {formatDate(typical, 'd MMM')} · {formatDuration(total)} total</span>}
      </div>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted">No sessions could be scheduled with the days and access you selected. Add training days or equipment access.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-base">
          {sessions.map((w) => (
            <li key={w.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="w-10 shrink-0 text-xs font-medium text-muted">{formatDate(w.date, 'EEE')}</span>
              <SportIcon sport={w.sport} />
              <span className="min-w-0 flex-1 truncate">{w.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">{formatDuration(w.durationMin)}</span>
              <IntensityBadge intensity={w.intensity} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
