import type { AthleteAvailability, AthleteProfile } from '../models/athlete'
import type { IntensityLevel, Sport, Timestamp, TimeOfDay } from '../models/common'
import type { RaceEvent } from '../models/events'
import type { ClinicalRestriction, FuelingTargets } from '../models/health'
import type { Workout, WorkoutSnapshot } from '../models/training'
import { activeRestrictions, combinedEffect, isSportBlocked } from '../safety/restrictions'
import { INTENSITY_RANK } from './config'
import { buildFueling } from './fueling'
import { buildContent, type ContentContext, type SessionKind, type SessionSpec } from './workout-library'
import { addDaysISO, daysBetween, type ISODate } from '@/lib/dates'

export const KIND_INTENSITY: Record<SessionKind, IntensityLevel> = {
  'swim-technique': 'easy',
  'swim-endurance': 'easy',
  'swim-intervals': 'hard',
  'swim-openwater': 'easy',
  'bike-easy': 'easy',
  'bike-long': 'easy',
  'bike-tempo': 'moderate',
  'bike-intervals': 'hard',
  'bike-race-pace': 'moderate',
  'run-easy': 'easy',
  'run-walk': 'easy',
  'run-long': 'easy',
  'run-tempo': 'moderate',
  'run-intervals': 'hard',
  brick: 'moderate',
  strength: 'moderate',
  mobility: 'recovery',
  recovery: 'recovery',
  rehab: 'easy',
  'assess-swim': 'easy',
  'assess-bike': 'easy',
  'assess-run': 'easy',
}

const DOWNGRADE: Partial<Record<SessionKind, SessionKind>> = {
  'bike-intervals': 'bike-tempo',
  'bike-tempo': 'bike-easy',
  'bike-race-pace': 'bike-tempo',
  'run-intervals': 'run-tempo',
  'run-tempo': 'run-easy',
  'swim-intervals': 'swim-endurance',
}

export function minIntensity(a: IntensityLevel, b: IntensityLevel): IntensityLevel {
  return INTENSITY_RANK[a] <= INTENSITY_RANK[b] ? a : b
}

/**
 * Lower a session until it satisfies an intensity ceiling. Never raises intensity.
 * Strength below "moderate" becomes mobility so the session content always matches its label.
 */
export function capSpec(spec: SessionSpec, max: IntensityLevel): SessionSpec {
  if (INTENSITY_RANK[spec.intensity] <= INTENSITY_RANK[max]) return spec
  if (spec.kind === 'strength') return { ...spec, sport: 'mobility', kind: 'mobility', intensity: 'recovery' }
  if (spec.kind === 'brick') return { ...spec, intensity: max }
  let kind: SessionKind = spec.kind
  let intensity = spec.intensity
  while (INTENSITY_RANK[intensity] > INTENSITY_RANK[max]) {
    const d: SessionKind | undefined = DOWNGRADE[kind]
    if (!d) {
      intensity = max
      break
    }
    kind = d
    intensity = KIND_INTENSITY[kind]
  }
  return { ...spec, kind, intensity }
}

/* ------------------------- Restriction adaptation ------------------------- */

const SUBSTITUTES: Partial<Record<Sport, { sport: Sport; kind: SessionKind }[]>> = {
  run: [
    { sport: 'swim', kind: 'swim-endurance' },
    { sport: 'bike', kind: 'bike-easy' },
  ],
  bike: [
    { sport: 'swim', kind: 'swim-endurance' },
    { sport: 'run', kind: 'run-easy' },
  ],
  swim: [
    { sport: 'bike', kind: 'bike-easy' },
    { sport: 'run', kind: 'run-easy' },
  ],
  brick: [
    { sport: 'swim', kind: 'swim-endurance' },
    { sport: 'bike', kind: 'bike-easy' },
  ],
  strength: [{ sport: 'mobility', kind: 'mobility' }],
}

export interface AdaptResult {
  spec: SessionSpec | null
  note?: string
  changed: boolean
}

/**
 * Applies every ACTIVE restriction to a session. Restrictions always win over performance goals.
 * The result is the most conservative combination: substitute blocked sports, cap intensity and duration,
 * or remove the session entirely while training is paused.
 */
export function adaptSpecToRestrictions(spec: SessionSpec, restrictions: ClinicalRestriction[]): AdaptResult {
  const active = activeRestrictions(restrictions)
  if (!active.length || spec.sport === 'rehab') return { spec, changed: false }
  const eff = combinedEffect(restrictions)
  const titles = active.map((r) => r.title).join('; ')

  if (eff.pauseAllTraining) return { spec: null, note: `Training paused by restriction: ${titles}`, changed: true }

  let s: SessionSpec = { ...spec }
  const notes: string[] = []

  if (isSportBlocked(s.sport, restrictions)) {
    const options = SUBSTITUTES[s.sport] ?? []
    const sub = options.find((o) => !isSportBlocked(o.sport, restrictions))
    if (!sub) return { spec: null, note: `${s.sport} removed — no permitted alternative under: ${titles}`, changed: true }
    notes.push(`${s.sport} replaced with ${sub.sport}`)
    s = { ...s, sport: sub.sport, kind: sub.kind, intensity: KIND_INTENSITY[sub.kind] }
  }

  if (eff.maxIntensity) {
    const capped = capSpec(s, eff.maxIntensity)
    if (capped !== s) notes.push(`intensity limited to ${eff.maxIntensity}`)
    s = capped
  }

  if (eff.maxDurationMin !== undefined && s.durationMin > eff.maxDurationMin) {
    s = { ...s, durationMin: Math.max(10, eff.maxDurationMin) }
    notes.push(`duration limited to ${eff.maxDurationMin} min`)
  }

  const changed = notes.length > 0
  return { spec: s, changed, note: changed ? `${notes.join(', ')} (restriction: ${titles})` : undefined }
}

/* ------------------------- Race-event constraints ------------------------- */

export interface DateConstraint {
  blocked: boolean
  maxIntensity?: IntensityLevel
  maxDurationMin?: number
  reason?: string
}

/** Race days are never training days; the days around an event are kept light. */
export function eventConstraintFor(date: ISODate, events: RaceEvent[]): DateConstraint {
  let result: DateConstraint = { blocked: false }
  for (const e of events) {
    if (e.status !== 'planned') continue
    const diff = daysBetween(date, e.date)
    if (diff === 0) return { blocked: true, reason: `Race day: ${e.name}` }
    if (diff === 1 || diff === 2) result = { blocked: false, maxIntensity: 'easy', maxDurationMin: 40, reason: `Pre-race: ${e.name}` }
    if (diff === -1 && !result.maxIntensity) result = { blocked: false, maxIntensity: 'recovery', maxDurationMin: 30, reason: `Post-race recovery: ${e.name}` }
  }
  return result
}

export function applyDateConstraint(spec: SessionSpec, c: DateConstraint): { spec: SessionSpec; changed: boolean } {
  if (!c.maxIntensity && !c.maxDurationMin) return { spec, changed: false }
  let s = spec
  let changed = false
  if (c.maxIntensity) {
    const capped = capSpec(s, c.maxIntensity)
    if (capped !== s) {
      s = capped
      changed = true
    }
  }
  if (c.maxDurationMin && s.durationMin > c.maxDurationMin) {
    s = { ...s, durationMin: c.maxDurationMin }
    changed = true
  }
  return { spec: s, changed }
}

/* ------------------------------ Content context ------------------------------ */

export function makeContentContext(athlete: AthleteProfile, availability: Pick<AthleteAvailability, 'access'>): ContentContext {
  const b = athlete.baseline
  const swim = { learning: 22, basic: 28, comfortable: 33, strong: 40 }[athlete.swimConfidence]
  const bike = { none: 18, beginner: 20, intermediate: 24, advanced: 28 }[athlete.bikeExperience]
  let run = { none: 7, beginner: 8, intermediate: 9.5, advanced: 11 }[athlete.runExperience]
  if (b.runThresholdPaceSecPerKm) run = 3600 / (b.runThresholdPaceSecPerKm * 1.15)
  return {
    swimMPerMin: swim,
    bikeKmPerHour: bike,
    runKmPerHour: run,
    maxHr: b.maxHr,
    runThresholdSecPerKm: b.runThresholdPaceSecPerKm,
    bikeFtpWatts: b.bikeFtpWatts,
    hasPool: availability.access.pool,
    hasGym: availability.access.gym,
  }
}

/* -------------------------------- Workout factory -------------------------------- */

export interface CreateWorkoutArgs {
  id: string
  planId: string
  phaseId: string
  weekStart: ISODate
  date: ISODate
  spec: SessionSpec
  ctx: ContentContext
  targets?: FuelingTargets
  isKey: boolean
  now: Timestamp
  timeOfDay?: TimeOfDay
  restrictionNote?: string
  rehabPlanId?: string
  originalSnapshot?: WorkoutSnapshot
  originalDate?: ISODate
  modified?: boolean
}

export function createWorkoutFromSpec(a: CreateWorkoutArgs): Workout {
  const content = buildContent(a.spec, a.ctx)
  const fueling = buildFueling(a.spec.sport, a.spec.durationMin, a.spec.intensity, a.targets)
  const w: Workout = {
    id: a.id,
    createdAt: a.now,
    updatedAt: a.now,
    planId: a.planId,
    phaseId: a.phaseId,
    phaseType: a.spec.phase,
    stage: a.spec.stage,
    weekStart: a.weekStart,
    date: a.date,
    originalDate: a.originalDate ?? a.date,
    timeOfDay: a.timeOfDay,
    sport: a.spec.sport,
    kind: a.spec.kind,
    title: content.title,
    durationMin: a.spec.durationMin,
    distanceM: content.distanceM,
    intensity: a.spec.intensity,
    target: content.target,
    warmup: content.warmup,
    mainSet: content.mainSet,
    cooldown: content.cooldown,
    purpose: content.purpose,
    coachingNotes: content.coachingNotes,
    fueling,
    isKey: a.isKey,
    status: 'planned',
    modified: a.modified ?? false,
    rehabPlanId: a.rehabPlanId,
    restrictionNote: a.restrictionNote,
    originalSnapshot: a.originalSnapshot,
  }
  return w
}

export function specFromWorkout(w: Workout): SessionSpec {
  return { sport: w.sport, kind: w.kind as SessionKind, durationMin: w.durationMin, intensity: w.intensity, phase: w.phaseType, stage: w.stage }
}

export function snapshotOf(w: Workout): WorkoutSnapshot {
  return { title: w.title, sport: w.sport, durationMin: w.durationMin, intensity: w.intensity, date: w.date }
}

export function datesOfWeek(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))
}
