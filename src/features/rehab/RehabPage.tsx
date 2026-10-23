import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Notice } from '@/components/shared/ui'
import { Dialog } from '@/components/shared/dialog'
import { PageIntro, RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { Checkbox, ChipGroup, Field, Select, TextArea, TextInput } from '@/components/forms/controls'
import {
  addRestrictionOp,
  isError,
  logRehabOp,
  markSymptomReviewedOp,
  previewRestriction,
  reportSymptomOp,
  resolveRestrictionOp,
  reviewMilestoneOp,
  scheduleRehabOp,
  updateReferralOp,
} from '@/domain/operations/app-ops'
import { rehabLogSchema, restrictionSchema, symptomReportSchema, type RehabLogInput, type RestrictionInput, type SymptomReportInput } from '@/domain/validation/schemas'
import { EMERGENCY_RED_FLAGS, TRIAGE_LABELS, URGENT_RED_FLAGS, triageSymptom } from '@/domain/safety/triage'
import { CLINICAL_DISCLAIMER, RESTRICTION_SPORT_OPTIONS, activeRestrictions, describeEffect, validateRestrictionResolution } from '@/domain/safety/restrictions'
import type { ClinicalRestriction, RehabilitationExercise, RehabilitationPlan, SymptomReport, TriageLevel } from '@/domain/models/health'
import { SPORT_LABELS } from '@/domain/models/common'
import { formatDate, formatDateTime, mondayOf } from '@/lib/dates'

const TRIAGE_TONE: Record<TriageLevel, 'danger' | 'warn' | 'info' | 'neutral'> = { emergency: 'danger', urgent: 'danger', 'professional-assessment': 'warn', monitor: 'neutral' }

/* ------------------------------ Triage result ------------------------------ */

function TriageResult({ report }: { report: Pick<SymptomReport, 'severity' | 'trend' | 'atRest' | 'duringTraining' | 'onset' | 'redFlags'> }) {
  const t = triageSymptom(report)
  const tone = t.level === 'emergency' || t.level === 'urgent' ? 'danger' : t.level === 'professional-assessment' ? 'warn' : 'info'
  return (
    <Notice tone={tone} title={t.headline}>
      <p>
        <strong>{TRIAGE_LABELS[t.level]}.</strong> This is a rule-based safety screen, not a diagnosis.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {t.guidance.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      {t.reasons.length > 0 && <p className="pt-1 text-xs">Why: {t.reasons.join('; ')}.</p>}
      {t.holdTraining && <p className="pt-1">A training hold has been added to your plan. It stays in place until you record that a clinician has reviewed it.</p>}
    </Notice>
  )
}

/* ------------------------------ Symptom report ------------------------------ */

function SymptomForm({ onReported }: { onReported: (r: SymptomReport) => void }) {
  const { runWith } = useApp()
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SymptomReportInput>({
    resolver: zodResolver(symptomReportSchema),
    defaultValues: { bodyArea: '', symptom: '', onset: 'today', trend: 'same', duringTraining: false, atRest: false, redFlags: [], notes: '' },
  })
  return (
    <form
      noValidate
      aria-label="Symptom report"
      className="space-y-4"
      onSubmit={handleSubmit((v) => {
        const res = runWith((s, e) => reportSymptomOp(s, v, e), { toastError: true })
        if (!isError(res)) {
          onReported(res.report)
          reset()
        }
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Body area" required error={errors.bodyArea?.message} hint="For example: right knee, lower back, chest.">
          {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('bodyArea')} />}
        </Field>
        <Field label="Severity right now (0–10)" required error={errors.severity?.message} hint="0 = none, 10 = worst imaginable.">
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" min={0} max={10} inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register('severity', { valueAsNumber: true })} />}
        </Field>
      </div>
      <Field label="What are you noticing?" required error={errors.symptom?.message}>
        {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('symptom')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="When did it start?">
          {({ id }) => (
            <Select id={id} {...register('onset')}>
              <option value="today">Today</option>
              <option value="few-days">A few days ago</option>
              <option value="week-plus">A week or more ago</option>
            </Select>
          )}
        </Field>
        <Field label="Is it changing?">
          {({ id }) => (
            <Select id={id} {...register('trend')}>
              <option value="improving">Improving</option>
              <option value="same">About the same</option>
              <option value="worsening">Getting worse</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Controller control={control} name="duringTraining" render={({ field }) => <Checkbox label="It appears during training" checked={field.value} onChange={field.onChange} />} />
        <Controller control={control} name="atRest" render={({ field }) => <Checkbox label="It is present at rest" checked={field.value} onChange={field.onChange} />} />
      </div>

      <Controller
        control={control}
        name="redFlags"
        render={({ field }) => (
          <div className="space-y-4 rounded-lg border border-line p-3">
            <ChipGroup
              legend="Emergency warning signs — tick any that apply now"
              hint="These need emergency care. Do not wait for an app."
              values={field.value}
              onChange={field.onChange}
              options={EMERGENCY_RED_FLAGS.map((f) => ({ value: f as string, label: f }))}
            />
            <ChipGroup
              legend="Urgent warning signs — tick any that apply"
              values={field.value}
              onChange={field.onChange}
              options={URGENT_RED_FLAGS.map((f) => ({ value: f as string, label: f }))}
            />
          </div>
        )}
      />

      <Field label="Notes for your clinician (optional)" error={errors.notes?.message} hint="What makes it better or worse? Keep it brief — only share what you are comfortable recording.">
        {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('notes')} />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary">
          Submit symptom report
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------- Restrictions ------------------------------- */

function RestrictionForm({ onDone }: { onDone: () => void }) {
  const { state, run, env } = useApp()
  const [pending, setPending] = useState<RestrictionInput | null>(null)
  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RestrictionInput>({
    resolver: zodResolver(restrictionSchema),
    defaultValues: { title: '', description: '', source: 'clinician', clinicianName: '', severity: 'modify', blockedSports: [], maxIntensity: 'none', reviewDate: '' },
  })
  const source = watch('source')
  const impact = useMemo(() => (pending ? previewRestriction(state, pending, env()) : null), [pending, state, env])

  if (pending) {
    return (
      <div className="space-y-4">
        <Notice tone="warn" title="Review before applying">
          <p>
            <strong>{pending.title}</strong> — {pending.description}
          </p>
          {impact ? (
            <p>
              Applying this will adapt <strong>{impact.adapted.length}</strong> and remove <strong>{impact.removed.length}</strong> upcoming session(s). Completed history is kept, and the change is logged in your plan history.
            </p>
          ) : (
            <p>No upcoming sessions are affected.</p>
          )}
          <p>The restriction will take precedence over performance goals and cannot be removed automatically.</p>
        </Notice>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPending(null)}>
            Back
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const res = run((s, e) => addRestrictionOp(s, pending, e), { success: 'Restriction applied. Your plan was adapted.' })
              if (!isError(res)) onDone()
            }}
          >
            Apply restriction
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form noValidate aria-label="Add restriction" className="space-y-4" onSubmit={handleSubmit((v) => setPending(v))}>
      <Field label="Title" required error={errors.title?.message}>
        {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('title')} />}
      </Field>
      <Field label="What does the restriction say?" required error={errors.description?.message}>
        {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('description')} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where does it come from?">
          {({ id }) => (
            <Select id={id} {...register('source')}>
              <option value="clinician">A clinician told me</option>
              <option value="athlete-reported">My own precaution</option>
            </Select>
          )}
        </Field>
        {source === 'clinician' && (
          <Field label="Clinician name" required error={errors.clinicianName?.message} hint="Recorded as you enter it. EnduraPath cannot verify it.">
            {({ id, describedBy, invalid }) => <TextInput id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('clinicianName')} />}
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Severity">
          {({ id }) => (
            <Select id={id} {...register('severity')}>
              <option value="monitor">Monitor only</option>
              <option value="modify">Modify training</option>
              <option value="pause">Pause all training (rehab only)</option>
            </Select>
          )}
        </Field>
        <Field label="Highest intensity allowed">
          {({ id }) => (
            <Select id={id} {...register('maxIntensity')}>
              <option value="none">No intensity limit</option>
              <option value="recovery">Recovery only</option>
              <option value="easy">Easy</option>
              <option value="moderate">Moderate</option>
            </Select>
          )}
        </Field>
      </div>
      <Controller
        control={control}
        name="blockedSports"
        render={({ field }) => (
          <ChipGroup legend="Activities that must not be scheduled" values={field.value} onChange={field.onChange} options={RESTRICTION_SPORT_OPTIONS.map((s) => ({ value: s as string, label: SPORT_LABELS[s] }))} />
        )}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Maximum session length (min, optional)" error={errors.maxDurationMin?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register('maxDurationMin', { valueAsNumber: true })} />}
        </Field>
        <Field label="Review date (optional)" error={errors.reviewDate?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="date" aria-describedby={describedBy} aria-invalid={invalid} {...register('reviewDate')} />}
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary">
          Preview impact
        </Button>
      </div>
    </form>
  )
}

function ResolveForm({ restriction, onDone }: { restriction: ClinicalRestriction; onDone: () => void }) {
  const { run } = useApp()
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        const check = validateRestrictionResolution({ restrictionId: restriction.id, clinicianName: name, note })
        if (!check.ok) return setError(check.error)
        const res = run((s, env) => resolveRestrictionOp(s, restriction.id, name, note, env), { success: 'Restriction recorded as lifted. Future sessions were rebuilt.' })
        if (!isError(res)) onDone()
      }}
    >
      <Notice tone="warn" title="EnduraPath cannot clear you">
        <p>Restrictions are never removed automatically. Only record this if a named clinician has told you the restriction is lifted. The record is stored as <strong>unverified</strong> and logged in your plan history.</p>
      </Notice>
      <Field label="Clinician name" required>
        {({ id }) => <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="What did they advise?" required>
        {({ id }) => <TextArea id={id} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Record as lifted
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------ Rehab plan ------------------------------ */

function RehabLogForm({ plan, exercise, onDone }: { plan: RehabilitationPlan; exercise: RehabilitationExercise; onDone: () => void }) {
  const { run } = useApp()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RehabLogInput>({
    resolver: zodResolver(rehabLogSchema),
    defaultValues: { exerciseId: exercise.id, setsDone: exercise.sets, symptomBefore: 0, symptomDuring: 0, symptomAfter: 0, notes: '' },
  })
  return (
    <form
      noValidate
      aria-label={`Log ${exercise.name}`}
      className="space-y-4"
      onSubmit={handleSubmit((v) => {
        const res = run((s, e) => logRehabOp(s, plan.id, v, e), { success: 'Exercise logged.' })
        if (!isError(res)) onDone()
      })}
    >
      <Notice tone="info" title="Prescribed by your clinician">
        <p>
          {exercise.sets} sets × {exercise.reps ? `${exercise.reps} reps` : `${exercise.holdSeconds}s hold`}. {exercise.notes}
        </p>
        <p>
          <strong>Stop if:</strong> {exercise.stopIf}
        </p>
      </Notice>
      <input type="hidden" {...register('exerciseId')} />
      <Field label="Sets completed" required error={errors.setsDone?.message}>
        {({ id, describedBy, invalid }) => <TextInput id={id} type="number" min={0} inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register('setsDone', { valueAsNumber: true })} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Symptoms before (0–10)" required error={errors.symptomBefore?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" min={0} max={10} inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register('symptomBefore', { valueAsNumber: true })} />}
        </Field>
        <Field label="During (0–10)" required error={errors.symptomDuring?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" min={0} max={10} inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register('symptomDuring', { valueAsNumber: true })} />}
        </Field>
        <Field label="After (0–10)" required error={errors.symptomAfter?.message}>
          {({ id, describedBy, invalid }) => <TextInput id={id} type="number" min={0} max={10} inputMode="numeric" aria-describedby={describedBy} aria-invalid={invalid} {...register('symptomAfter', { valueAsNumber: true })} />}
        </Field>
      </div>
      <Field label="Notes (optional)" error={errors.notes?.message}>
        {({ id, describedBy, invalid }) => <TextArea id={id} aria-describedby={describedBy} aria-invalid={invalid} {...register('notes')} />}
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

function ReferralEditor({ plan }: { plan: RehabilitationPlan }) {
  const { run } = useApp()
  const [status, setStatus] = useState(plan.referral.status)
  const [provider, setProvider] = useState(plan.referral.provider ?? '')
  const [date, setDate] = useState(plan.referral.date ?? '')
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      aria-label="Referral status"
      onSubmit={(e) => {
        e.preventDefault()
        run((s, env) => updateReferralOp(s, plan.id, { status, provider: provider.trim() || undefined, date: date || undefined }, env), { success: 'Referral status updated.' })
      }}
    >
      <Field label="Referral status">
        {({ id }) => (
          <Select id={id} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="none">No referral</option>
            <option value="recommended">Recommended</option>
            <option value="booked">Booked</option>
            <option value="attended">Attended</option>
          </Select>
        )}
      </Field>
      <Field label="Provider (optional)">{({ id }) => <TextInput id={id} value={provider} maxLength={80} onChange={(e) => setProvider(e.target.value)} />}</Field>
      <Field label="Date (optional)">{({ id }) => <TextInput id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
      <div className="flex items-end">
        <Button type="submit" variant="outline">
          Save referral
        </Button>
      </div>
    </form>
  )
}

function RehabPlanCard({ plan }: { plan: RehabilitationPlan }) {
  const { state, today, run } = useApp()
  const [logging, setLogging] = useState<RehabilitationExercise | null>(null)
  const monday = mondayOf(today)
  const logs = state.medical.rehabLogs.filter((l) => l.planId === plan.id)
  const weekLogs = logs.filter((l) => l.date >= monday)
  const recent = logs.slice(0, 6)
  const reviewed = plan.milestones.filter((m) => m.status === 'reviewed').length
  const nameOf = (id: string) => plan.exercises.find((e) => e.id === id)?.name ?? 'Exercise'

  return (
    <Card>
      <CardHeader
        title={plan.title}
        subtitle={`Approved by ${plan.approvedBy} on ${formatDate(plan.approvedOn, 'd MMM yyyy')} · next review ${formatDate(plan.reviewDate, 'd MMM yyyy')}`}
        action={<Badge tone={plan.status === 'active' ? 'accent' : 'neutral'}>{plan.status}</Badge>}
      />
      <CardBody className="space-y-6">
        {plan.isSample && (
          <Notice tone="warn" title="Sample plan — not real clinical advice">
            <p>This plan is part of the labelled demo data so you can try the tracking workflow. EnduraPath does not create or modify rehabilitation protocols.</p>
          </Notice>
        )}

        <section aria-labelledby={`ex-${plan.id}`} className="space-y-3">
          <h3 id={`ex-${plan.id}`} className="text-sm font-semibold">
            Approved exercises
          </h3>
          <ul className="space-y-3">
            {plan.exercises.map((ex) => {
              const done = weekLogs.filter((l) => l.exerciseId === ex.id).length
              return (
                <li key={ex.id} className="rounded-lg border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-fg">{ex.name}</p>
                      <p className="text-xs text-muted">
                        {ex.sets} sets × {ex.reps ? `${ex.reps} reps` : `${ex.holdSeconds}s hold`} · {ex.frequencyPerWeek}× per week · this week {done}/{ex.frequencyPerWeek}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setLogging(ex)} disabled={plan.status !== 'active'} aria-label={`Log ${ex.name}`}>
                      Log session
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-muted">{ex.notes}</p>
                  {ex.cues.length > 0 && <p className="mt-1 text-xs text-muted">Cues: {ex.cues.join(' · ')}</p>}
                  {ex.approvedModification && <p className="mt-1 text-xs text-secondary">Clinician-approved modification: {ex.approvedModification}</p>}
                  <p className="mt-1 text-xs text-warn">Stop if: {ex.stopIf}</p>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => run((s, e) => scheduleRehabOp(s, plan.id, e), { success: 'Rehab sessions added to your calendar.' })}
              disabled={plan.status !== 'active'}
            >
              Schedule rehab sessions (next 4 weeks)
            </Button>
            <span className="text-xs text-muted">Adds the approved frequency to the calendar. Sessions are logged in plan history.</span>
          </div>
        </section>

        <section aria-labelledby={`log-${plan.id}`} className="space-y-2">
          <h3 id={`log-${plan.id}`} className="text-sm font-semibold">
            Recent exercise logs
          </h3>
          {recent.length === 0 ? (
            <EmptyState title="No logs yet" body="Log each session with symptoms before, during and after. Your clinician can review the trend." />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">Recent rehabilitation exercise logs</caption>
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-1.5 pr-2 font-medium">Date</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">Exercise</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">Sets</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">Symptoms b / d / a</th>
                    <th scope="col" className="px-2 py-1.5 font-medium">Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recent.map((l) => {
                    const rise = Math.max(l.symptomDuring, l.symptomAfter) - l.symptomBefore
                    const flagged = rise >= 3 || l.symptomAfter >= 7
                    return (
                      <tr key={l.id}>
                        <td className="py-2 pr-2 text-fg">{formatDate(l.date)}</td>
                        <td className="px-2 py-2 text-muted">{nameOf(l.exerciseId)}</td>
                        <td className="px-2 py-2 tabular-nums text-muted">{l.setsDone}</td>
                        <td className="px-2 py-2 tabular-nums text-muted">
                          {l.symptomBefore} / {l.symptomDuring} / {l.symptomAfter}
                        </td>
                        <td className="px-2 py-2">{flagged ? <Badge tone="warn">Symptoms rose — tell your clinician</Badge> : <span className="text-muted">—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby={`ref-${plan.id}`} className="space-y-3">
          <h3 id={`ref-${plan.id}`} className="text-sm font-semibold">
            Referral
          </h3>
          <ReferralEditor key={plan.updatedAt} plan={plan} />
        </section>

        <section aria-labelledby={`ms-${plan.id}`} className="space-y-3">
          <h3 id={`ms-${plan.id}`} className="text-sm font-semibold">
            Return-to-training review milestones ({reviewed}/{plan.milestones.length})
          </h3>
          <p className="text-xs text-muted">These are review checkpoints with your care team. Marking one records that the review took place — it is not clearance from EnduraPath.</p>
          <ul className="space-y-2">
            {plan.milestones.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <div>
                  <p className="text-sm text-fg">{m.label}</p>
                  {m.reviewDate && <p className="text-xs text-muted">Reviewed {formatDate(m.reviewDate, 'd MMM yyyy')}</p>}
                </div>
                {m.status === 'reviewed' ? (
                  <Badge tone="accent">Review recorded</Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => run((s, e) => reviewMilestoneOp(s, plan.id, m.id, e), { success: 'Review recorded.' })}>
                    Record that review happened
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </CardBody>

      <Dialog open={Boolean(logging)} onOpenChange={(o) => !o && setLogging(null)} title={logging ? `Log: ${logging.name}` : 'Log exercise'} description="Record what you did and how symptoms felt.">
        {logging && <RehabLogForm plan={plan} exercise={logging} onDone={() => setLogging(null)} />}
      </Dialog>
    </Card>
  )
}

/* ---------------------------------- Page ---------------------------------- */

function RehabContent() {
  const { state, run } = useApp()
  const [lastReport, setLastReport] = useState<SymptomReport | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [resolving, setResolving] = useState<ClinicalRestriction | null>(null)
  const active = activeRestrictions(state.medical.restrictions)
  const resolved = state.medical.restrictions.filter((r) => r.status === 'resolved')
  const symptoms = state.medical.symptoms.slice(0, 8)
  const plans = state.medical.rehabPlans

  return (
    <div className="space-y-6">
      <PageIntro title="Rehab & restrictions">
        Report symptoms, see clinician restrictions that shape your plan, and track a clinician-approved rehabilitation program. EnduraPath is not medical care and never diagnoses.
      </PageIntro>

      <Notice tone="danger" title="Emergency symptoms need emergency care">
        <p>
          Chest pain, fainting, severe breathlessness, a racing heartbeat that won’t settle, sudden severe headache, confusion, or one-sided weakness: <strong>stop and call your local emergency number</strong> (for example 911, 999 or 112). If you are having thoughts of harming yourself, contact a crisis line or emergency services now.
        </p>
      </Notice>

      <Card>
        <CardHeader
          icon={<ShieldAlert className="size-4" aria-hidden />}
          title="Active restrictions"
          subtitle="These override performance goals in every plan change."
          action={
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
              Add restriction
            </Button>
          }
        />
        <CardBody className="space-y-3">
          {active.length === 0 ? (
            <EmptyState title="No active restrictions" body="If a clinician gives you training limits, add them here so every future session respects them." />
          ) : (
            <ul className="space-y-3">
              {active.map((r) => (
                <li key={r.id} className="rounded-lg border border-warn/40 bg-warn/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
                        {r.title}
                        <Badge tone={r.source === 'clinician' ? 'secondary' : 'neutral'}>{r.source === 'clinician' ? `Clinician: ${r.clinicianName ?? 'unnamed'}` : 'Athlete-reported precaution'}</Badge>
                      </p>
                      <p className="mt-1 text-sm text-muted">{r.description}</p>
                      <p className="mt-1 text-xs text-warn">{describeEffect(r.effect)}</p>
                      {r.reviewDate && <p className="text-xs text-muted">Review {formatDate(r.reviewDate, 'd MMM yyyy')}</p>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setResolving(r)}>
                      Record as lifted
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {resolved.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted hover:text-fg">Resolved restrictions ({resolved.length})</summary>
              <ul className="mt-2 space-y-2">
                {resolved.map((r) => (
                  <li key={r.id} className="rounded-lg border border-line p-3 text-xs text-muted">
                    <p className="text-sm text-fg">{r.title}</p>
                    <p>
                      Recorded as lifted by {r.resolution?.clinicianName} — “{r.resolution?.note}” <Badge>Unverified</Badge>
                    </p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader icon={<AlertTriangle className="size-4" aria-hidden />} title="Report a symptom" subtitle="Organises what you tell us for a professional. It does not diagnose." />
          <CardBody className="space-y-4">
            {lastReport && <TriageResult report={lastReport} />}
            <SymptomForm onReported={setLastReport} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Symptom history" subtitle="Most recent first" />
          <CardBody>
            {symptoms.length === 0 ? (
              <EmptyState title="No symptom reports" body="Reports you submit will appear here so you can share them with a clinician." />
            ) : (
              <ul className="space-y-3">
                {symptoms.map((s) => (
                  <li key={s.id} className="rounded-lg border border-line p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-fg">
                          {s.bodyArea} — {s.symptom}
                        </p>
                        <p className="text-xs text-muted">
                          {formatDateTime(s.reportedAt)} · severity {s.severity}/10 · {s.trend}
                        </p>
                      </div>
                      <Badge tone={TRIAGE_TONE[s.triage.level]}>{TRIAGE_LABELS[s.triage.level]}</Badge>
                    </div>
                    {s.triage.reasons.length > 0 && <p className="mt-1 text-xs text-muted">{s.triage.reasons.join('; ')}</p>}
                    <div className="mt-2">
                      {s.clinicianReviewed ? (
                        <Badge tone="accent">You recorded a clinician review</Badge>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => run((st, e) => markSymptomReviewedOp(st, s.id, e), { success: 'Recorded that a clinician reviewed this report.' })}>
                          A clinician has reviewed this
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="rehab-plans" className="space-y-4">
        <h2 id="rehab-plans" className="text-base font-semibold">
          Rehabilitation plan
        </h2>
        {plans.length === 0 ? (
          <EmptyState
            title="No rehabilitation plan"
            body="Rehab programs must come from your clinician or physical therapist. EnduraPath will not invent a protocol for an undiagnosed problem. Ask your care team for an exercise plan and recorded restrictions."
          />
        ) : (
          plans.map((p) => <RehabPlanCard key={p.id} plan={p} />)
        )}
      </section>

      <SafetyFooter>
        <p>{CLINICAL_DISCLAIMER} Medical entries are stored only in this browser — see Settings for how to review or delete them.</p>
      </SafetyFooter>

      <Dialog open={addOpen} onOpenChange={setAddOpen} title="Add a restriction" description="Record limits from a clinician (or your own precaution). They are applied to every future session." size="lg">
        {addOpen && <RestrictionForm onDone={() => setAddOpen(false)} />}
      </Dialog>
      <Dialog open={Boolean(resolving)} onOpenChange={(o) => !o && setResolving(null)} title="Record restriction as lifted" description={resolving?.title}>
        {resolving && <ResolveForm restriction={resolving} onDone={() => setResolving(null)} />}
      </Dialog>
    </div>
  )
}

export function RehabPage() {
  return (
    <RequireOnboarded>
      <RehabContent />
    </RequireOnboarded>
  )
}
