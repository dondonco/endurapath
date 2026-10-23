import type { AthleteAvailability, AthleteProfile } from '../models/athlete'
import type { Timestamp } from '../models/common'
import type { RaceEvent } from '../models/events'
import type { ClinicalRestriction, FuelingTargets, RehabilitationPlan } from '../models/health'
import type { PlanChange, PlannedWeek, TrainingPlan, Workout } from '../models/training'
import { adaptSpecToRestrictions, createWorkoutFromSpec, makeContentContext, snapshotOf, specFromWorkout } from './sessions'
import { buildWeek, type WeekSkeleton } from './generator'
import { DEFAULT_ENGINE_CONFIG, type EngineConfig } from './config'
import { checkDateAvailable } from './availability'
import { makeChange } from './scheduling'
import { spreadDays } from './week-scheduler'
import { addDaysISO, datesOfWeekISO, dayIndex, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { sum } from '@/lib/utils'

type IdFactory = (prefix: string) => string

export interface MaintenanceContext {
  athlete: AthleteProfile
  availability: AthleteAvailability
  events: RaceEvent[]
  restrictions: ClinicalRestriction[]
  fuelingTargets?: FuelingTargets
  today: ISODate
  now: Timestamp
  config?: EngineConfig
  mk?: IdFactory
}

function skeletonOf(w: PlannedWeek): WeekSkeleton {
  return {
    weekStart: w.weekStart,
    stage: w.stage,
    phaseType: w.phaseType,
    tablePhase: w.tablePhase,
    index: w.index,
    weekInStage: w.weekInStage,
    isRecoveryWeek: w.isRecoveryWeek,
    isTaperWeek: w.tablePhase === 'taper',
    loadProgress: w.loadProgress,
    volumeFactor: w.volumeFactor,
    phaseKey: `${w.stage}-${w.tablePhase}`,
  }
}

function buildWeekWorkouts(plan: TrainingPlan, week: PlannedWeek, c: MaintenanceContext): { workouts: Workout[]; week: PlannedWeek } {
  const config = c.config ?? DEFAULT_ENGINE_CONFIG
  const mk = c.mk ?? newId
  const ctx = makeContentContext(c.athlete, c.availability)
  const built = buildWeek({
    week: skeletonOf(week),
    availability: c.availability,
    events: c.events,
    restrictions: c.restrictions,
    config,
    startMinutes: week.startMinutes,
    ctx,
  })
  const workouts = built.specs
    // Only plan future dates when regenerating a partial week.
    .filter((s) => s.date >= c.today)
    .map((s) =>
      createWorkoutFromSpec({
        id: mk('wo'),
        planId: plan.id,
        phaseId: week.phaseId,
        weekStart: week.weekStart,
        date: s.date,
        spec: s.spec,
        ctx,
        targets: c.fuelingTargets,
        isKey: s.isKey,
        now: c.now,
        restrictionNote: s.restrictionNote,
      }),
    )
  let note = built.note
  if (built.dropped.length) note = [note, `Adjusted: ${built.dropped.join('; ')}`].filter(Boolean).join(' ')
  return { workouts, week: { ...week, targetMinutes: built.targetMinutes, plannedMinutes: built.plannedMinutes, generated: true, note } }
}

/** Generates detailed sessions for weeks that are inside the rolling horizon but still skeletons. */
export function extendHorizon(
  plan: TrainingPlan,
  workouts: Workout[],
  c: MaintenanceContext,
): { plan: TrainingPlan; workouts: Workout[]; added: number } {
  const config = c.config ?? DEFAULT_ENGINE_CONFIG
  const limit = addDaysISO(c.today, config.horizonWeeks * 7)
  let added = 0
  const newWorkouts: Workout[] = []
  const weeks = plan.weeks.map((w) => {
    if (w.generated || w.weekStart > limit || addDaysISO(w.weekStart, 6) < c.today) return w
    const res = buildWeekWorkouts(plan, w, c)
    newWorkouts.push(...res.workouts)
    added += res.workouts.length
    return res.week
  })
  if (!added && weeks.every((w, i) => w === plan.weeks[i])) return { plan, workouts, added: 0 }
  return { plan: { ...plan, weeks, updatedAt: c.now }, workouts: [...workouts, ...newWorkouts], added }
}

export interface RestrictionImpact {
  adapted: { workoutId: string; before: string; after: string; note: string }[]
  removed: { workoutId: string; title: string; reason: string }[]
  unchanged: number
}

/**
 * Applies active restrictions to every FUTURE planned session in place. Completed sessions and the past are
 * never touched. Sessions that must be removed become `skipped` with a restriction reason, so the record stays.
 */
export function applyRestrictionsToFuture(
  workouts: Workout[],
  restrictions: ClinicalRestriction[],
  c: Pick<MaintenanceContext, 'today' | 'now' | 'athlete' | 'availability' | 'fuelingTargets' | 'mk'>,
  preview = false,
): { workouts: Workout[]; impact: RestrictionImpact; changes: PlanChange[] } {
  const mk = c.mk ?? newId
  const ctx = makeContentContext(c.athlete, c.availability)
  const impact: RestrictionImpact = { adapted: [], removed: [], unchanged: 0 }
  const changes: PlanChange[] = []
  const out = workouts.map((w) => {
    if (w.status !== 'planned' || w.date < c.today || w.sport === 'rehab') return w
    const res = adaptSpecToRestrictions(specFromWorkout(w), restrictions)
    if (!res.changed) {
      impact.unchanged++
      return w
    }
    if (!res.spec) {
      impact.removed.push({ workoutId: w.id, title: w.title, reason: res.note ?? 'Restriction' })
      return { ...w, status: 'skipped' as const, statusReason: res.note ?? 'Removed by clinical restriction', modified: true, updatedAt: c.now, originalSnapshot: w.originalSnapshot ?? snapshotOf(w) }
    }
    const rebuilt = createWorkoutFromSpec({
      id: w.id,
      planId: w.planId,
      phaseId: w.phaseId,
      weekStart: w.weekStart,
      date: w.date,
      spec: res.spec,
      ctx,
      targets: c.fuelingTargets,
      isKey: false,
      now: c.now,
      timeOfDay: w.timeOfDay,
      restrictionNote: res.note,
      originalSnapshot: w.originalSnapshot ?? snapshotOf(w),
      originalDate: w.originalDate,
      modified: true,
    })
    impact.adapted.push({ workoutId: w.id, before: `${w.title} · ${w.durationMin} min · ${w.intensity}`, after: `${rebuilt.title} · ${rebuilt.durationMin} min · ${rebuilt.intensity}`, note: res.note ?? '' })
    return { ...rebuilt, createdAt: w.createdAt }
  })

  if (!preview && (impact.adapted.length || impact.removed.length)) {
    const first = workouts[0]
    if (first) {
      changes.push(
        makeChange(
          first.planId,
          'restriction-adjustment',
          `Clinical restriction applied to ${impact.adapted.length + impact.removed.length} upcoming session(s)`,
          restrictions.filter((r) => r.status === 'active').map((r) => r.title).join('; ') || 'Clinical restriction',
          'safety-rule',
          [...impact.adapted.map((a) => a.workoutId), ...impact.removed.map((r) => r.workoutId)],
          [
            ...impact.adapted.map((a) => ({ workoutId: a.workoutId, field: 'session', from: a.before, to: a.after })),
            ...impact.removed.map((r) => ({ workoutId: r.workoutId, field: 'status', from: 'planned', to: 'skipped (restriction)' })),
          ],
          c.now,
          mk,
        ),
      )
    }
  }
  return { workouts: out, impact, changes }
}

/**
 * Regenerates all future planned sessions (e.g. after changed availability, a new event or a lifted restriction).
 * Completed, skipped and past sessions are preserved untouched. Rehab sessions are preserved.
 */
export function regenerateFuture(
  plan: TrainingPlan,
  workouts: Workout[],
  c: MaintenanceContext,
  reason: string,
): { plan: TrainingPlan; workouts: Workout[]; change: PlanChange } {
  const mk = c.mk ?? newId
  const kept = workouts.filter((w) => !(w.status === 'planned' && w.date >= c.today && w.sport !== 'rehab'))
  const removed = workouts.length - kept.length
  const weeks = plan.weeks.map((w) => ({ ...w, generated: false }))
  const base: TrainingPlan = { ...plan, weeks, version: plan.version + 1 }
  const extended = extendHorizon(base, kept, c)
  const change = makeChange(
    plan.id,
    'plan-regenerated',
    `Regenerated ${removed} upcoming session(s); history preserved`,
    reason,
    'plan-engine',
    [],
    [],
    c.now,
    mk,
  )
  // Past weeks keep their previous "generated" flag so history views stay accurate.
  const mergedWeeks = extended.plan.weeks.map((w, i) => (addDaysISO(w.weekStart, 6) < c.today ? plan.weeks[i] : w))
  return { plan: { ...extended.plan, weeks: mergedWeeks }, workouts: extended.workouts, change }
}

/** Schedules the approved rehab exercises as distinct `rehab` sessions on training days. */
export function scheduleRehabSessions(
  rehab: RehabilitationPlan,
  planId: string,
  existing: Workout[],
  c: MaintenanceContext,
  weeksAhead = 4,
): Workout[] {
  const mk = c.mk ?? newId
  const ctx = makeContentContext(c.athlete, c.availability)
  const out: Workout[] = []
  if (rehab.status !== 'active') return out
  const perWeek = Math.max(1, Math.max(...rehab.exercises.map((e) => e.frequencyPerWeek), 1))
  for (let wk = 0; wk < weeksAhead; wk++) {
    const monday = addDaysISO(c.today, wk * 7)
    const weekDates = datesOfWeekISO(monday).filter(
      (d) => d >= c.today && checkDateAvailable(d, c.availability, c.events, { allowNonTrainingDay: true }).ok,
    )
    const trainingDates = weekDates.filter((d) => c.availability.trainingDays.includes(dayIndex(d)))
    const pool = trainingDates.length >= perWeek ? trainingDates : weekDates
    for (const date of spreadDays(pool, Math.min(perWeek, pool.length))) {
      if (existing.some((w) => w.rehabPlanId === rehab.id && w.date === date)) continue
      const weekStart = datesOfWeekISO(date)[0]
      const minutes = Math.max(15, Math.min(40, rehab.exercises.length * 6))
      const w = createWorkoutFromSpec({
        id: mk('wo'),
        planId,
        phaseId: '',
        weekStart,
        date,
        spec: { sport: 'rehab', kind: 'rehab', durationMin: minutes, intensity: 'easy', phase: 'recovery', stage: 'A' },
        ctx,
        isKey: false,
        now: c.now,
        rehabPlanId: rehab.id,
      })
      out.push({ ...w, title: rehab.title, mainSet: rehab.exercises.map((e) => `${e.name}: ${e.sets} × ${e.reps ?? `${e.holdSeconds}s hold`}`).join(' · ') })
    }
  }
  return out
}

export function weekPlannedMinutes(workouts: Workout[], weekStart: ISODate): number {
  return sum(workouts.filter((w) => w.weekStart === weekStart && w.status !== 'skipped' && w.sport !== 'rehab').map((w) => w.durationMin))
}
