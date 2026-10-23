import type { OnboardingValues } from '../validation/schemas'
import type { AppState } from '../models/state'
import { DEFAULT_SETTINGS, emptyState, SCHEMA_VERSION } from '../models/state'
import type { IntensityLevel, StageId, Timestamp } from '../models/common'
import type { RaceEvent } from '../models/events'
import type {
  ClinicalRestriction,
  FuelingLog,
  Notification,
  PersonaMessage,
  RecoveryCheckIn,
  RehabLog,
  RehabilitationPlan,
  SymptomReport,
} from '../models/health'
import type { AdjustmentProposal, PlanChange, Workout } from '../models/training'
import type {
  FuelingLogInput,
  FuelingTargetsInput,
  RaceEventInput,
  RecoveryCheckInInput,
  RehabLogInput,
  RestrictionInput,
  SymptomReportInput,
  WorkoutResultInput,
} from '../validation/schemas'
import { defaultChecklist } from '../events/checklist'
import { athleteFromValues, availabilityFromValues, goalEventFromValues, restrictionFromOnboarding } from '../onboarding/build'
import { assessReadiness } from '../readiness/readiness'
import { triageSymptom } from '../safety/triage'
import { validateRestrictionResolution } from '../safety/restrictions'
import { GENERAL_FUELING_TARGETS } from '../training-engine/fueling'
import { generatePlan } from '../training-engine/generator'
import {
  applyRestrictionsToFuture,
  extendHorizon,
  regenerateFuture,
  scheduleRehabSessions,
  type MaintenanceContext,
} from '../training-engine/maintenance'
import {
  applyProposal,
  completeWorkout,
  editSchedulingFields,
  makeChange,
  proposeMissedAdjustment,
  replaceWithRecovery,
  rescheduleWorkout,
  skipWorkout,
  swapWorkouts,
  type ScheduleContext,
  type SchedulingFieldEdit,
} from '../training-engine/scheduling'
import { capSpec, createWorkoutFromSpec, makeContentContext, specFromWorkout } from '../training-engine/sessions'
import { KIND_SPORT } from '../training-engine/slot-tables'
import { stageRank } from '../training-engine/config'
import { addDaysISO, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'

export interface Env {
  now: Timestamp
  today: ISODate
  mk?: (prefix: string) => string
}

export type OpError = { error: string }
export type OpResult = AppState | OpError
export const isError = (r: unknown): r is OpError => typeof r === 'object' && r !== null && 'error' in r

const mkOf = (env: Env) => env.mk ?? newId

function stamp(s: AppState, env: Env): AppState {
  return { ...s, updatedAt: env.now }
}

function notify(s: AppState, n: Omit<Notification, 'id' | 'createdAt' | 'updatedAt'>, env: Env): AppState {
  const note: Notification = { ...n, id: mkOf(env)('ntf'), createdAt: env.now, updatedAt: env.now }
  return { ...s, notifications: [note, ...s.notifications].slice(0, 100) }
}

function maintenance(s: AppState, env: Env): MaintenanceContext | null {
  if (!s.athlete || !s.availability) return null
  return {
    athlete: s.athlete,
    availability: s.availability,
    events: s.events,
    restrictions: s.medical.restrictions,
    fuelingTargets: s.nutrition?.targets,
    today: env.today,
    now: env.now,
    mk: env.mk,
  }
}

function scheduleCtx(s: AppState, env: Env): ScheduleContext | null {
  if (!s.availability) return null
  return { availability: s.availability, events: s.events, restrictions: s.medical.restrictions, workouts: s.workouts, today: env.today }
}

const addChange = (s: AppState, c: PlanChange | PlanChange[]): AppState => ({
  ...s,
  changes: [...(Array.isArray(c) ? c : [c]), ...s.changes],
})

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                  */
/* -------------------------------------------------------------------------- */

export function previewPlan(values: OnboardingValues, base: AppState | null, env: Env) {
  const mk = mkOf(env)
  const athlete = athleteFromValues(values, { now: env.now, mk, existingAthleteId: base?.athlete?.id })
  const availability = availabilityFromValues(values, athlete.id, { now: env.now, mk })
  const goalEvent = goalEventFromValues(values, { now: env.now, mk })
  const keepEvents = (base?.events ?? []).filter((e) => e.priority !== 'A' || !goalEvent)
  const events = goalEvent ? [...keepEvents, goalEvent] : keepEvents
  const onboardingRestriction = restrictionFromOnboarding(values, { now: env.now, mk })
  const restrictions = [...(base?.medical.restrictions ?? []), ...(onboardingRestriction ? [onboardingRestriction] : [])]
  const generated = generatePlan({
    athlete,
    availability,
    events,
    restrictions,
    fuelingTargets: base?.nutrition?.targets,
    today: env.today,
    now: env.now,
    idFactory: mk,
  })
  return { athlete, availability, events, restrictions, generated, goalEvent, onboardingRestriction }
}

/** Activates an onboarding result. History (results, check-ins, medical records) is preserved on re-onboarding. */
export function activateOnboarding(base: AppState, values: OnboardingValues, env: Env): AppState {
  const mk = mkOf(env)
  const p = previewPlan(values, base.athlete ? base : null, env)
  const plan = { ...p.generated.plan, primaryEventId: p.events.find((e) => e.priority === 'A' && e.status === 'planned')?.id }
  // A re-activated plan must not erase history: keep completed/skipped sessions, drop only planned future ones.
  const keptWorkouts = base.workouts.filter((w) => w.status !== 'planned' || w.date < env.today)
  const kept = keptWorkouts.map((w) => (base.plan ? { ...w, planId: plan.id } : w))
  const nutrition = base.nutrition ?? {
    id: mk('nut'),
    createdAt: env.now,
    updatedAt: env.now,
    athleteId: p.athlete.id,
    targets: { ...GENERAL_FUELING_TARGETS, effectiveFrom: env.today },
    hydrationReminders: true,
  }
  let s: AppState = {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    onboarded: true,
    isSampleData: false,
    athlete: p.athlete,
    availability: p.availability,
    events: p.events,
    medical: { ...base.medical, restrictions: p.restrictions },
    nutrition: { ...nutrition, athleteId: p.athlete.id },
    plan,
    workouts: [...kept, ...p.generated.workouts],
    changes: base.changes,
  }
  s = addChange(
    s,
    makeChange(
      plan.id,
      base.plan ? 'plan-regenerated' : 'plan-created',
      base.plan ? 'Plan rebuilt from updated profile' : 'Initial plan created from onboarding',
      base.plan ? 'Athlete updated their profile; past results were kept.' : `Starting in Stage ${plan.startStage} toward ${plan.goalType}`,
      'plan-engine',
      [],
      [],
      env.now,
      mk,
    ),
  )
  s = notify(s, { kind: 'plan-change', severity: 'info', title: 'Your plan is ready', body: `Stage ${plan.currentStage} plan generated. Review the roadmap to see what comes next.`, link: '/roadmap' }, env)
  return stamp(s, env)
}

/* -------------------------------------------------------------------------- */
/* Workouts                                                                    */
/* -------------------------------------------------------------------------- */

export function completeWorkoutOp(s: AppState, id: string, input: WorkoutResultInput, env: Env): OpResult {
  const res = completeWorkout(
    s.workouts,
    s.results,
    id,
    {
      actualDurationMin: Number(input.actualDurationMin),
      actualDistanceM: input.actualDistanceM,
      rpe: Number(input.rpe),
      feeling: input.feeling,
      notes: input.notes,
      symptomsNoted: input.symptomsNoted,
    },
    env.today,
    env.now,
    env.mk,
  )
  if ('error' in res) return res
  let next: AppState = { ...s, workouts: res.workouts, results: res.results }
  if (input.symptomsNoted)
    next = notify(
      next,
      { kind: 'safety', severity: 'warning', title: 'You noted symptoms during a session', body: 'Report them in Rehab so they can be triaged and logged. EnduraPath cannot assess what they mean.', link: '/rehab' },
      env,
    )
  return stamp(next, env)
}

export function rescheduleOp(s: AppState, id: string, toDate: ISODate, reason: string, env: Env): OpResult {
  const ctx = scheduleCtx(s, env)
  if (!ctx) return { error: 'No availability on file.' }
  const res = rescheduleWorkout(s.workouts, id, toDate, reason, ctx, env.now, env.mk)
  if ('error' in res) return res
  return stamp(addChange({ ...s, workouts: res.workouts }, res.change), env)
}

export function swapOp(s: AppState, a: string, b: string, reason: string, env: Env): OpResult {
  const ctx = scheduleCtx(s, env)
  if (!ctx) return { error: 'No availability on file.' }
  const res = swapWorkouts(s.workouts, a, b, reason, ctx, env.now, env.mk)
  if ('error' in res) return res
  return stamp(addChange({ ...s, workouts: res.workouts }, res.change), env)
}

export function skipOp(s: AppState, id: string, reason: string, env: Env): OpResult {
  const res = skipWorkout(s.workouts, id, reason, env.now, env.mk)
  if ('error' in res) return res
  return stamp(addChange({ ...s, workouts: res.workouts }, res.change), env)
}

export function restoreSkippedOp(s: AppState, id: string, env: Env): OpResult {
  const w = s.workouts.find((x) => x.id === id)
  if (!w || w.status !== 'skipped') return { error: 'Only skipped sessions can be restored.' }
  if (w.date < env.today) return { error: 'Past sessions stay in your history as skipped.' }
  if (s.medical.restrictions.some((r) => r.status === 'active' && r.effect.pauseAllTraining) && w.sport !== 'rehab')
    return { error: 'Training is paused by an active restriction.' }
  const restored: Workout = { ...w, status: 'planned', statusReason: undefined, updatedAt: env.now }
  const c = makeChange(w.planId, 'edit', `Restored “${w.title}”`, 'Athlete restored a skipped session', 'athlete', [id], [{ workoutId: id, field: 'status', from: 'skipped', to: 'planned' }], env.now, mkOf(env))
  return stamp(addChange({ ...s, workouts: s.workouts.map((x) => (x.id === id ? restored : x)) }, c), env)
}

export function replaceWithRecoveryOp(s: AppState, id: string, reason: string, env: Env): OpResult {
  if (!s.athlete || !s.availability) return { error: 'No athlete on file.' }
  const ctx = makeContentContext(s.athlete, s.availability)
  const res = replaceWithRecovery(
    s.workouts,
    id,
    reason,
    (w) =>
      createWorkoutFromSpec({
        id: w.id,
        planId: w.planId,
        phaseId: w.phaseId,
        weekStart: w.weekStart,
        date: w.date,
        spec: { sport: KIND_SPORT.recovery, kind: 'recovery', durationMin: Math.min(30, Math.max(20, Math.round(w.durationMin * 0.4))), intensity: 'recovery', phase: w.phaseType, stage: w.stage },
        ctx,
        isKey: false,
        now: env.now,
        timeOfDay: w.timeOfDay,
        originalDate: w.originalDate,
      }),
    env.now,
    env.mk,
  )
  if ('error' in res) return res
  return stamp(addChange({ ...s, workouts: res.workouts }, res.change), env)
}

export function editSchedulingOp(s: AppState, id: string, edit: SchedulingFieldEdit, reason: string, env: Env): OpResult {
  const ctx = scheduleCtx(s, env)
  if (!ctx) return { error: 'No availability on file.' }
  const res = editSchedulingFields(s.workouts, id, edit, reason, ctx, env.now, env.mk)
  if ('error' in res) return res
  return stamp(addChange({ ...s, workouts: res.workouts }, res.change), env)
}

export function proposeAdjustment(s: AppState, workoutId: string, env: Env): AdjustmentProposal | OpError {
  const w = s.workouts.find((x) => x.id === workoutId)
  const ctx = scheduleCtx(s, env)
  if (!w || !ctx) return { error: 'Workout not found.' }
  return proposeMissedAdjustment(w, ctx)
}

export function applyAdjustmentOp(s: AppState, proposal: AdjustmentProposal, reason: string, env: Env): OpResult {
  const ctx = scheduleCtx(s, env)
  if (!ctx || !s.athlete || !s.availability) return { error: 'No athlete on file.' }
  const cc = makeContentContext(s.athlete, s.availability)
  const res = applyProposal(
    s.workouts,
    proposal,
    reason,
    ctx,
    (w, to: IntensityLevel, durationMin) => {
      const spec = capSpec({ ...specFromWorkout(w), durationMin: durationMin ?? w.durationMin }, to)
      return createWorkoutFromSpec({
        id: w.id,
        planId: w.planId,
        phaseId: w.phaseId,
        weekStart: w.weekStart,
        date: w.date,
        spec,
        ctx: cc,
        targets: s.nutrition?.targets,
        isKey: w.isKey,
        now: env.now,
        timeOfDay: w.timeOfDay,
        originalSnapshot: w.originalSnapshot,
        originalDate: w.originalDate,
        modified: true,
      })
    },
    env.now,
    env.mk,
  )
  if ('error' in res) return res
  return stamp(addChange({ ...s, workouts: res.workouts }, res.changes), env)
}

export function requestAdjustmentOp(s: AppState, workoutId: string, env: Env): OpResult {
  const w = s.workouts.find((x) => x.id === workoutId)
  if (!w) return { error: 'Workout not found.' }
  const c = makeChange(w.planId, 'adjustment-requested', `Asked Coach Atlas to review “${w.title}”`, 'Athlete requested a plan adjustment (no change applied yet)', 'athlete', [workoutId], [], env.now, mkOf(env))
  return stamp(addChange(s, c), env)
}

/* -------------------------------------------------------------------------- */
/* Recovery, nutrition                                                         */
/* -------------------------------------------------------------------------- */

export function addCheckInOp(s: AppState, input: RecoveryCheckInInput, env: Env): OpResult {
  const existing = s.checkIns.find((c) => c.date === input.date)
  const entry: RecoveryCheckIn = {
    id: existing?.id ?? mkOf(env)('ci'),
    createdAt: existing?.createdAt ?? env.now,
    updatedAt: env.now,
    date: input.date,
    sleepHours: Number(input.sleepHours),
    sleepQuality: Number(input.sleepQuality),
    fatigue: Number(input.fatigue),
    soreness: Number(input.soreness),
    mood: Number(input.mood),
    readiness: Number(input.readiness),
    restingHr: input.restingHr,
    notes: input.notes,
  }
  const list = existing ? s.checkIns.map((c) => (c.id === existing.id ? entry : c)) : [...s.checkIns, entry]
  return stamp({ ...s, checkIns: list.sort((a, b) => (a.date < b.date ? -1 : 1)) }, env)
}

export function addFuelingLogOp(s: AppState, input: FuelingLogInput, env: Env): OpResult {
  const log: FuelingLog = {
    id: mkOf(env)('fl'),
    createdAt: env.now,
    updatedAt: env.now,
    date: input.date,
    kind: input.kind,
    workoutId: input.workoutId || undefined,
    eventId: input.eventId || undefined,
    plannedCarbsG: input.plannedCarbsG,
    actualCarbsG: input.actualCarbsG,
    plannedFluidMl: input.plannedFluidMl,
    actualFluidMl: input.actualFluidMl,
    products: input.products,
    tolerance: Number(input.tolerance),
    giSymptoms: input.giSymptoms,
    notes: input.notes,
  }
  return stamp({ ...s, fuelingLogs: [log, ...s.fuelingLogs] }, env)
}

export function deleteFuelingLogOp(s: AppState, id: string, env: Env): OpResult {
  return stamp({ ...s, fuelingLogs: s.fuelingLogs.filter((l) => l.id !== id) }, env)
}

export function setFuelingTargetsOp(s: AppState, input: FuelingTargetsInput, env: Env): OpResult {
  if (!s.nutrition) return { error: 'No nutrition plan on file.' }
  const professional = input.source === 'professional'
  const nutrition = {
    ...s.nutrition,
    updatedAt: env.now,
    targets: {
      carbsPerHour: { min: Number(input.carbsMin), max: Number(input.carbsMax) },
      fluidMlPerHour: { min: Number(input.fluidMin), max: Number(input.fluidMax) },
      sodiumNote: input.sodiumNote || undefined,
      source: input.source,
      setBy: professional ? input.setBy : undefined,
      effectiveFrom: env.today,
    },
  }
  return stamp({ ...s, nutrition }, env)
}

/* -------------------------------------------------------------------------- */
/* Medical: symptoms, restrictions, rehab                                      */
/* -------------------------------------------------------------------------- */

export function reportSymptomOp(s: AppState, input: SymptomReportInput, env: Env): { state: AppState; report: SymptomReport } | OpError {
  const mk = mkOf(env)
  const triage = triageSymptom({
    severity: Number(input.severity),
    trend: input.trend,
    atRest: input.atRest,
    duringTraining: input.duringTraining,
    onset: input.onset,
    redFlags: input.redFlags,
  })
  const report: SymptomReport = {
    id: mk('sym'),
    createdAt: env.now,
    updatedAt: env.now,
    reportedAt: env.now,
    bodyArea: input.bodyArea,
    symptom: input.symptom,
    severity: Number(input.severity),
    onset: input.onset,
    trend: input.trend,
    duringTraining: input.duringTraining,
    atRest: input.atRest,
    redFlags: input.redFlags,
    notes: input.notes,
    triage: { level: triage.level, reasons: triage.reasons },
    clinicianReviewed: false,
  }
  let next: AppState = { ...s, medical: { ...s.medical, symptoms: [report, ...s.medical.symptoms] } }

  if (triage.holdTraining) {
    // Hold training until a clinician reviews: an athlete-reported pause. It is never auto-removed.
    const already = next.medical.restrictions.some((r) => r.status === 'active' && r.effect.pauseAllTraining)
    if (!already) {
      const restriction: ClinicalRestriction = {
        id: mk('res'),
        createdAt: env.now,
        updatedAt: env.now,
        title: `Training hold — ${input.bodyArea}`,
        description: `Automatic safety hold after a symptom report triaged as "${triage.level}". Remains until you record that a clinician has reviewed it.`,
        source: 'athlete-reported',
        severity: 'pause',
        effect: { blockedSports: [], pauseAllTraining: true },
        status: 'active',
      }
      next = { ...next, medical: { ...next.medical, restrictions: [restriction, ...next.medical.restrictions] } }
    }
  } else if (triage.level === 'professional-assessment') {
    const already = next.medical.restrictions.some((r) => r.status === 'active' && r.title.startsWith('Precaution'))
    if (!already) {
      const restriction: ClinicalRestriction = {
        id: mk('res'),
        createdAt: env.now,
        updatedAt: env.now,
        title: `Precaution — ${input.bodyArea}`,
        description: 'Easy-intensity precaution while a professional assessment is arranged.',
        source: 'athlete-reported',
        severity: 'modify',
        effect: { blockedSports: [], maxIntensity: 'easy' },
        status: 'active',
      }
      next = { ...next, medical: { ...next.medical, restrictions: [restriction, ...next.medical.restrictions] } }
    }
  }

  const mctx = maintenance(next, env)
  if (mctx && (triage.holdTraining || triage.level === 'professional-assessment')) {
    const res = applyRestrictionsToFuture(next.workouts, next.medical.restrictions, mctx)
    next = addChange({ ...next, workouts: res.workouts }, res.changes.map((c) => ({ ...c, kind: 'symptom-adjustment' as const, reason: `Symptom report: ${input.bodyArea} — ${input.symptom}` })))
  }
  next = notify(
    next,
    {
      kind: 'safety',
      severity: triage.level === 'monitor' ? 'info' : triage.level === 'professional-assessment' ? 'warning' : 'critical',
      title: triage.headline,
      body: `${input.bodyArea}: ${input.symptom}`,
      link: '/rehab',
    },
    env,
  )
  return { state: stamp(next, env), report }
}

export function markSymptomReviewedOp(s: AppState, id: string, env: Env): OpResult {
  return stamp({ ...s, medical: { ...s.medical, symptoms: s.medical.symptoms.map((r) => (r.id === id ? { ...r, clinicianReviewed: true, updatedAt: env.now } : r)) } }, env)
}

export function addRestrictionOp(s: AppState, input: RestrictionInput, env: Env): OpResult {
  const mk = mkOf(env)
  const r: ClinicalRestriction = {
    id: mk('res'),
    createdAt: env.now,
    updatedAt: env.now,
    title: input.title,
    description: input.description,
    source: input.source,
    clinicianName: input.source === 'clinician' ? input.clinicianName : undefined,
    severity: input.severity,
    effect: {
      blockedSports: input.blockedSports as ClinicalRestriction['effect']['blockedSports'],
      maxIntensity: input.maxIntensity === 'none' ? undefined : input.maxIntensity,
      maxDurationMin: input.maxDurationMin,
      pauseAllTraining: input.severity === 'pause' || undefined,
    },
    status: 'active',
    reviewDate: input.reviewDate || undefined,
  }
  let next: AppState = { ...s, medical: { ...s.medical, restrictions: [r, ...s.medical.restrictions] } }
  const mctx = maintenance(next, env)
  if (mctx) {
    const res = applyRestrictionsToFuture(next.workouts, next.medical.restrictions, mctx)
    next = addChange({ ...next, workouts: res.workouts }, res.changes)
  }
  next = notify(next, { kind: 'safety', severity: 'warning', title: 'New restriction applied', body: `${r.title} now takes precedence over your training goals.`, link: '/rehab' }, env)
  return stamp(next, env)
}

export interface RestrictionImpactPreview {
  adapted: number
  removed: number
}

export function previewRestriction(s: AppState, input: RestrictionInput, env: Env) {
  const r: ClinicalRestriction = {
    id: 'preview',
    createdAt: env.now,
    updatedAt: env.now,
    title: input.title,
    description: input.description,
    source: input.source,
    severity: input.severity,
    effect: {
      blockedSports: input.blockedSports as ClinicalRestriction['effect']['blockedSports'],
      maxIntensity: input.maxIntensity === 'none' ? undefined : input.maxIntensity,
      maxDurationMin: input.maxDurationMin,
      pauseAllTraining: input.severity === 'pause' || undefined,
    },
    status: 'active',
  }
  if (!s.athlete || !s.availability) return null
  return applyRestrictionsToFuture(s.workouts, [...s.medical.restrictions, r], { today: env.today, now: env.now, athlete: s.athlete, availability: s.availability, fuelingTargets: s.nutrition?.targets, mk: env.mk }, true).impact
}

/**
 * Records that the athlete says a named clinician lifted a restriction. Restrictions are never removed
 * automatically. The record is flagged unverified, the change is logged, and future training is regenerated.
 */
export function resolveRestrictionOp(s: AppState, id: string, clinicianName: string, note: string, env: Env): OpResult {
  const check = validateRestrictionResolution({ restrictionId: id, clinicianName, note })
  if (!check.ok) return { error: check.error }
  const r = s.medical.restrictions.find((x) => x.id === id)
  if (!r || r.status !== 'active') return { error: 'Restriction not found or already resolved.' }
  const restrictions = s.medical.restrictions.map((x) =>
    x.id === id ? { ...x, status: 'resolved' as const, updatedAt: env.now, resolution: { at: env.now, clinicianName: clinicianName.trim(), note: note.trim(), verified: false as const } } : x,
  )
  let next: AppState = { ...s, medical: { ...s.medical, restrictions } }
  const mctx = maintenance(next, env)
  if (mctx && next.plan) {
    const regen = regenerateFuture(next.plan, next.workouts, { ...mctx, restrictions }, `Restriction “${r.title}” recorded as lifted by ${clinicianName.trim()} (unverified by EnduraPath)`)
    next = addChange({ ...next, plan: regen.plan, workouts: regen.workouts }, regen.change)
  }
  return stamp(next, env)
}

export function logRehabOp(s: AppState, planId: string, input: RehabLogInput, env: Env): OpResult {
  const plan = s.medical.rehabPlans.find((p) => p.id === planId)
  if (!plan) return { error: 'Rehabilitation plan not found.' }
  const ex = plan.exercises.find((e) => e.id === input.exerciseId)
  if (!ex) return { error: 'Exercise not found in this plan.' }
  const log: RehabLog = {
    id: mkOf(env)('rl'),
    createdAt: env.now,
    updatedAt: env.now,
    planId,
    exerciseId: input.exerciseId,
    date: env.today,
    setsDone: Number(input.setsDone),
    symptomBefore: Number(input.symptomBefore),
    symptomDuring: Number(input.symptomDuring),
    symptomAfter: Number(input.symptomAfter),
    notes: input.notes,
  }
  let next: AppState = { ...s, medical: { ...s.medical, rehabLogs: [log, ...s.medical.rehabLogs] } }
  const rise = Math.max(log.symptomDuring, log.symptomAfter) - log.symptomBefore
  if (rise >= 3 || log.symptomAfter >= 7)
    next = notify(next, { kind: 'safety', severity: 'warning', title: `Symptoms rose during “${ex.name}”`, body: `${ex.stopIf} — contact the clinician who approved this plan. EnduraPath cannot adjust a rehab protocol.`, link: '/rehab' }, env)
  return stamp(next, env)
}

export function updateReferralOp(s: AppState, planId: string, referral: RehabilitationPlan['referral'], env: Env): OpResult {
  return stamp(
    { ...s, medical: { ...s.medical, rehabPlans: s.medical.rehabPlans.map((p) => (p.id === planId ? { ...p, referral, updatedAt: env.now } : p)) } },
    env,
  )
}

export function reviewMilestoneOp(s: AppState, planId: string, milestoneId: string, env: Env): OpResult {
  return stamp(
    {
      ...s,
      medical: {
        ...s.medical,
        rehabPlans: s.medical.rehabPlans.map((p) =>
          p.id === planId ? { ...p, updatedAt: env.now, milestones: p.milestones.map((m) => (m.id === milestoneId ? { ...m, status: 'reviewed' as const, reviewDate: env.today } : m)) } : p,
        ),
      },
    },
    env,
  )
}

export function scheduleRehabOp(s: AppState, planId: string, env: Env): OpResult {
  const plan = s.medical.rehabPlans.find((p) => p.id === planId)
  const mctx = maintenance(s, env)
  if (!plan || !mctx || !s.plan) return { error: 'Cannot schedule rehab sessions without a plan.' }
  const added = scheduleRehabSessions(plan, s.plan.id, s.workouts, mctx)
  if (!added.length) return { error: 'No new rehab sessions to schedule in the next 4 weeks.' }
  const c = makeChange(s.plan.id, 'rehab-scheduled', `Scheduled ${added.length} clinician-approved rehab session(s)`, plan.title, 'athlete', added.map((w) => w.id), [], env.now, mkOf(env))
  return stamp(addChange({ ...s, workouts: [...s.workouts, ...added] }, c), env)
}

/* -------------------------------------------------------------------------- */
/* Events                                                                      */
/* -------------------------------------------------------------------------- */

export function saveEventOp(s: AppState, input: RaceEventInput, env: Env, id?: string): OpResult {
  const mk = mkOf(env)
  const existing = id ? s.events.find((e) => e.id === id) : undefined
  const event: RaceEvent = {
    id: existing?.id ?? mk('evt'),
    createdAt: existing?.createdAt ?? env.now,
    updatedAt: env.now,
    name: input.name,
    date: input.date,
    location: input.location,
    category: input.category,
    swimM: Number(input.swimM),
    bikeKm: Number(input.bikeKm),
    runKm: Number(input.runKm),
    priority: input.priority,
    targetOutcome: input.targetOutcome ?? '',
    notes: input.notes,
    checklist: existing?.checklist ?? defaultChecklist(input.category, mk),
    result: existing?.result,
    status: existing?.status ?? 'planned',
  }
  let events = existing ? s.events.map((e) => (e.id === existing.id ? event : e)) : [...s.events, event]
  // Only one primary (A) race at a time: demote others to B so the engine has a single goal race.
  if (event.priority === 'A' && event.status === 'planned')
    events = events.map((e) => (e.id !== event.id && e.priority === 'A' && e.status === 'planned' ? { ...e, priority: 'B' as const, updatedAt: env.now } : e))
  let next: AppState = { ...s, events }
  const mctx = maintenance(next, env)
  if (mctx && next.plan) {
    const primary = events.find((e) => e.priority === 'A' && e.status === 'planned')
    const regen = regenerateFuture({ ...next.plan, primaryEventId: primary?.id }, next.workouts, { ...mctx, events }, existing ? `Event “${event.name}” updated` : `Event “${event.name}” added`)
    next = addChange({ ...next, plan: regen.plan, workouts: regen.workouts }, regen.change)
  }
  return stamp(next, env)
}

export function deleteEventOp(s: AppState, id: string, env: Env): OpResult {
  const events = s.events.filter((e) => e.id !== id)
  let next: AppState = { ...s, events }
  const mctx = maintenance(next, env)
  if (mctx && next.plan) {
    const primary = events.find((e) => e.priority === 'A' && e.status === 'planned')
    const regen = regenerateFuture({ ...next.plan, primaryEventId: primary?.id }, next.workouts, { ...mctx, events }, 'Event removed')
    next = addChange({ ...next, plan: regen.plan, workouts: regen.workouts }, regen.change)
  }
  return stamp(next, env)
}

export function toggleChecklistOp(s: AppState, eventId: string, itemId: string, env: Env): OpResult {
  return stamp({ ...s, events: s.events.map((e) => (e.id === eventId ? { ...e, updatedAt: env.now, checklist: e.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c)) } : e)) }, env)
}

export function recordRaceResultOp(s: AppState, eventId: string, finishTime: string, notes: string | undefined, env: Env): OpResult {
  return stamp({ ...s, events: s.events.map((e) => (e.id === eventId ? { ...e, status: 'completed' as const, result: { finishTime, notes }, updatedAt: env.now } : e)) }, env)
}

/* -------------------------------------------------------------------------- */
/* Readiness & progression                                                     */
/* -------------------------------------------------------------------------- */

export function runReadinessOp(s: AppState, env: Env): { state: AppState; assessment: ReturnType<typeof assessReadiness> } | OpError {
  if (!s.athlete || !s.availability || !s.plan) return { error: 'Complete onboarding first.' }
  const assessment = assessReadiness({
    athlete: s.athlete,
    availability: s.availability,
    plan: s.plan,
    workouts: s.workouts,
    results: s.results,
    checkIns: s.checkIns,
    fuelingLogs: s.fuelingLogs,
    events: s.events,
    restrictions: s.medical.restrictions,
    symptoms: s.medical.symptoms,
    today: env.today,
    now: env.now,
    idFactory: env.mk,
  })
  const state = stamp({ ...s, assessments: [assessment, ...s.assessments].slice(0, 30) }, env)
  return { state, assessment }
}

/** Athlete-confirmed progression. Only allowed when the most recent assessment recommends it and nothing blocks it. */
export function acceptProgressionOp(s: AppState, env: Env): OpResult {
  const latest = s.assessments[0]
  if (!s.plan || !s.athlete || !s.availability) return { error: 'No plan to progress.' }
  if (!latest || latest.outcome !== 'progress' || !latest.nextStage) return { error: 'A fresh readiness review must recommend progression first.' }
  if (s.medical.restrictions.some((r) => r.status === 'active')) return { error: 'An active clinical restriction blocks progression.' }
  const to = latest.nextStage as StageId
  if (stageRank(to) <= stageRank(s.plan.currentStage)) return { error: 'Already at or beyond that stage.' }
  const mctx = maintenance(s, env)
  if (!mctx) return { error: 'No availability on file.' }
  const generated = generatePlan({
    athlete: s.athlete,
    availability: s.availability,
    events: s.events,
    restrictions: s.medical.restrictions,
    fuelingTargets: s.nutrition?.targets,
    today: env.today,
    now: env.now,
    startStageOverride: to,
    idFactory: env.mk,
  })
  const plan = { ...generated.plan, version: s.plan.version + 1, id: s.plan.id, createdAt: s.plan.createdAt, currentStage: to }
  const kept = s.workouts.filter((w) => w.status !== 'planned' || w.date < env.today)
  const fresh = generated.workouts.map((w) => ({ ...w, planId: plan.id }))
  const c = makeChange(plan.id, 'stage-progression', `Progressed from Stage ${s.plan.currentStage} to Stage ${to}`, `Readiness review ${latest.asOf}: ${latest.reasons[0] ?? 'gates passed'}`, 'athlete', [], [], env.now, mkOf(env))
  let next: AppState = { ...s, plan, workouts: [...kept, ...fresh] }
  next = addChange(next, c)
  next = notify(next, { kind: 'readiness', severity: 'info', title: `Moved to Stage ${to}`, body: 'Your plan was rebuilt. Past sessions and results were kept.', link: '/roadmap' }, env)
  return stamp(next, env)
}

/* -------------------------------------------------------------------------- */
/* Misc                                                                        */
/* -------------------------------------------------------------------------- */

export function ensureHorizonOp(s: AppState, env: Env): AppState {
  const mctx = maintenance(s, env)
  if (!mctx || !s.plan) return s
  const ext = extendHorizon(s.plan, s.workouts, mctx)
  if (!ext.added && ext.plan === s.plan) return s
  return { ...s, plan: ext.plan, workouts: ext.workouts }
}

export function addMessagesOp(s: AppState, messages: PersonaMessage[], env: Env): AppState {
  return stamp({ ...s, messages: [...s.messages, ...messages].slice(-400) }, env)
}

export function clearConversationOp(s: AppState, personaId: PersonaMessage['personaId'], env: Env): AppState {
  return stamp({ ...s, messages: s.messages.filter((m) => m.personaId !== personaId) }, env)
}

export function markNotificationsReadOp(s: AppState, env: Env): AppState {
  return { ...s, notifications: s.notifications.map((n) => (n.readAt ? n : { ...n, readAt: env.now })), updatedAt: env.now }
}

export function updateUnitsOp(s: AppState, units: 'metric' | 'imperial', env: Env): AppState {
  if (!s.athlete) return s
  return stamp({ ...s, athlete: { ...s.athlete, units, updatedAt: env.now } }, env)
}

export function updatePreferencesOp(s: AppState, prefs: Partial<NonNullable<AppState['athlete']>['preferences']>, env: Env): AppState {
  if (!s.athlete) return s
  return stamp({ ...s, athlete: { ...s.athlete, preferences: { ...s.athlete.preferences, ...prefs }, updatedAt: env.now } }, env)
}

export function updateSettingsOp(s: AppState, settings: Partial<AppState['settings']>, env: Env): AppState {
  return stamp({ ...s, settings: { ...s.settings, ...settings } }, env)
}

/** Deletes all personal data held by the app. Returns a clean, un-onboarded state. */
export function eraseAllDataOp(env: Env): AppState {
  return { ...emptyState(env.now), settings: { ...DEFAULT_SETTINGS } }
}

/** Deletes only the medical subtree (restrictions, symptoms, rehab). Future sessions are regenerated without restrictions. */
export function eraseMedicalDataOp(s: AppState, env: Env): AppState {
  let next: AppState = { ...s, medical: { restrictions: [], symptoms: [], rehabPlans: [], rehabLogs: [] }, assessments: s.assessments }
  const mctx = maintenance(next, env)
  if (mctx && next.plan) {
    const regen = regenerateFuture(next.plan, next.workouts, { ...mctx, restrictions: [] }, 'Medical records deleted by the athlete')
    next = addChange({ ...next, plan: regen.plan, workouts: regen.workouts }, regen.change)
  }
  return stamp(next, env)
}

export function keepWithin(date: ISODate, today: ISODate, days: number): boolean {
  return date >= addDaysISO(today, -days) && date <= today
}
