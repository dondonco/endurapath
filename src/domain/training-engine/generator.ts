import type { AthleteAvailability, AthleteProfile } from '../models/athlete'
import { type GoalType, type IntensityLevel, type PhaseType, type StageId, type Timestamp } from '../models/common'
import type { RaceEvent } from '../models/events'
import type { ClinicalRestriction, FuelingTargets } from '../models/health'
import type { PlannedWeek, TrainingPhase, TrainingPlan, Workout } from '../models/training'
import { hasTrainingPause } from '../safety/restrictions'
import { checkDateAvailable } from './availability'
import { buildPathway, baselineWeeklyMinutes, type PathwayResult } from './pathway'
import {
  DEFAULT_ENGINE_CONFIG,
  GOAL_TO_STAGE,
  INTENSITY_RANK,
  PHASE_INTENSITY_CAP,
  RACE_DISTANCES,
  type EngineConfig,
} from './config'
import {
  adaptSpecToRestrictions,
  applyDateConstraint,
  capSpec,
  createWorkoutFromSpec,
  datesOfWeek,
  eventConstraintFor,
  KIND_INTENSITY,
  makeContentContext,
} from './sessions'
import { isLongKind, KIND_SPORT, slotTable, tableKindForPhase, type Slot } from './slot-tables'
import { placeSessions, type PlaceableSession } from './week-scheduler'
import type { SessionKind, SessionSpec } from './workout-library'
import { addDaysISO, dayIndex, mondayOf, weeksBetween, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { clamp, round5, sum } from '@/lib/utils'

export interface GenerateInput {
  athlete: AthleteProfile
  availability: AthleteAvailability
  events: RaceEvent[]
  restrictions: ClinicalRestriction[]
  fuelingTargets?: FuelingTargets
  /** Today's date (injected so generation stays deterministic and testable). */
  today: ISODate
  now: Timestamp
  config?: EngineConfig
  /** Stage to start from instead of the baseline-derived one (used after an approved progression). */
  startStageOverride?: StageId
  /** First Monday of the plan; defaults to the upcoming week. */
  planStart?: ISODate
  /** ID generator injection for deterministic tests. */
  idFactory?: (prefix: string) => string
}

export interface GeneratedPlan {
  plan: TrainingPlan
  workouts: Workout[]
  pathway: PathwayResult
}

/* ----------------------------------- Helpers ----------------------------------- */

export function resolvePlanStart(today: ISODate, config: EngineConfig = DEFAULT_ENGINE_CONFIG): ISODate {
  const monday = mondayOf(today)
  return dayIndex(today) >= config.nextWeekFromDayIndex ? addDaysISO(monday, 7) : monday
}

export function primaryEvent(events: RaceEvent[], goalType?: GoalType): RaceEvent | undefined {
  const planned = events.filter((e) => e.status === 'planned').sort((a, b) => (a.date < b.date ? -1 : 1))
  const aRaces = planned.filter((e) => e.priority === 'A')
  return aRaces.find((e) => !goalType || e.category === goalType) ?? aRaces[0]
}

/** Minimum sensible weeks before a race of this category, for the "your date may be too soon" warning. */
export function minWeeksForGoal(goal: GoalType, config: EngineConfig = DEFAULT_ENGINE_CONFIG): number {
  return config.stages[GOAL_TO_STAGE[goal]].minWeeks
}

function targetWeeklyMinutes(stage: StageId, startMinutes: number, progress: number, config: EngineConfig): number {
  const s = config.stages[stage]
  return round5(startMinutes + (s.peakMinutes - startMinutes) * progress)
}

/* ------------------------------ Phase & week layout ------------------------------ */

interface StageSpan {
  stage: StageId
  weeks: number
  startMinutes: number
}

function splitStageWeeks(total: number, taper: number, config: EngineConfig, hasTaper: boolean) {
  const t = hasTaper ? Math.min(taper, Math.max(0, total - 2)) : 0
  const body = Math.max(1, total - t)
  const race = Math.max(body >= 6 ? 1 : 0, Math.round(body * config.phaseSplit.race))
  const base = Math.max(1, Math.round(body * config.phaseSplit.base))
  const build = Math.max(0, body - base - race)
  return { base, build, race, taper: t }
}

/** Number of weeks to plan for a stage. Never more than the horizon allows or the time to the race. */
function plannedWeeksForStage(
  isStartStage: boolean,
  estimated: { min: number; max: number },
  weeksToRace: number | null,
  config: EngineConfig,
): number {
  const base = Math.round((estimated.min + estimated.max) / 2)
  const planned = isStartStage ? Math.max(estimated.min, base) : estimated.max
  let weeks = planned
  if (weeksToRace !== null) weeks = Math.min(weeks, Math.max(weeksToRace, config.minStageWeeks))
  return Math.max(config.minStageWeeks, weeks)
}

export interface WeekSkeleton {
  weekStart: ISODate
  stage: StageId
  phaseType: PhaseType
  tablePhase: PhaseType
  index: number
  weekInStage: number
  isRecoveryWeek: boolean
  isTaperWeek: boolean
  loadProgress: number
  volumeFactor: number
  phaseKey: string
}

interface LayoutResult {
  phases: Omit<TrainingPhase, 'planId' | 'id'>[]
  skeleton: WeekSkeleton[]
  note?: string
}

export function layoutWeeks(
  spans: StageSpan[],
  start: ISODate,
  goalType: GoalType,
  eventWeeksFromStart: number | null,
  config: EngineConfig,
  cautious: boolean,
): LayoutResult {
  const phases: Omit<TrainingPhase, 'planId' | 'id'>[] = []
  const skeleton: WeekSkeleton[] = []
  let weekCursor = 0
  const recoveryEvery = cautious ? config.recoveryEvery.cautious : config.recoveryEvery.default
  const lastSpan = spans[spans.length - 1]

  for (const span of spans) {
    const isLast = span === lastSpan
    const taperLen = isLast ? config.taperWeeks[goalType] : 1
    const split = splitStageWeeks(span.weeks, taperLen, config, true)
    const parts: [PhaseType, number][] = [
      ['base', split.base],
      ['build', split.build],
      ['race-specific', split.race],
      ['taper', split.taper],
    ]
    let weekInStage = 0
    let loadWeekCounter = 0
    const loadWeeks = split.base + split.build + split.race
    for (const [phaseType, count] of parts) {
      if (count <= 0) continue
      const phaseStartWeek = weekCursor
      for (let i = 0; i < count; i++) {
        loadWeekCounter += phaseType === 'taper' ? 0 : 1
        const isRecovery =
          phaseType !== 'taper' &&
          loadWeekCounter > 1 &&
          loadWeekCounter % recoveryEvery === 0 &&
          // never put a recovery week right before taper or at the very end of the load block
          loadWeekCounter < loadWeeks
        const progress = clamp(loadWeeks <= 1 ? 0 : (Math.max(loadWeekCounter, 1) - 1) / (loadWeeks - 1), 0, 1)
        let volumeFactor = 1
        if (isRecovery) volumeFactor = config.recoveryWeekFactor
        if (phaseType === 'taper') {
          const factors = config.taperFactors[Math.max(1, split.taper)] ?? [0.6]
          volumeFactor = factors[Math.min(i, factors.length - 1)]
        }
        skeleton.push({
          weekStart: addDaysISO(start, weekCursor * 7),
          stage: span.stage,
          phaseType: isRecovery ? 'recovery' : phaseType,
          tablePhase: phaseType,
          index: weekCursor,
          weekInStage: ++weekInStage,
          isRecoveryWeek: isRecovery,
          isTaperWeek: phaseType === 'taper',
          loadProgress: phaseType === 'taper' ? 1 : progress,
          volumeFactor,
          phaseKey: `${span.stage}-${phaseType}`,
        })
        weekCursor++
      }
      phases.push({
        stage: span.stage,
        type: phaseType,
        startDate: addDaysISO(start, phaseStartWeek * 7),
        endDate: addDaysISO(start, (phaseStartWeek + count) * 7 - 1),
        weekCount: count,
        focus: PHASE_FOCUS[phaseType],
      })
    }
  }

  const note =
    eventWeeksFromStart !== null && eventWeeksFromStart < skeleton.length
      ? `Plan is compressed to fit ${eventWeeksFromStart} weeks to your target event.`
      : undefined
  return { phases, skeleton, note }
}

const PHASE_FOCUS: Record<PhaseType, string> = {
  base: 'Build aerobic consistency, technique and routine',
  build: 'Extend durability and introduce controlled intensity',
  'race-specific': 'Rehearse race pacing, fueling and transitions',
  taper: 'Reduce volume, keep sharpness, arrive fresh',
  recovery: 'Absorb training and restore freshness',
}

/* --------------------------------- Week generation --------------------------------- */

export interface WeekBuildArgs {
  week: WeekSkeleton
  availability: AthleteAvailability
  events: RaceEvent[]
  restrictions: ClinicalRestriction[]
  config: EngineConfig
  startMinutes: number
  ctx: ReturnType<typeof makeContentContext>
}

export interface WeekBuild {
  specs: { spec: SessionSpec; date: ISODate; isKey: boolean; restrictionNote?: string }[]
  targetMinutes: number
  plannedMinutes: number
  dropped: string[]
  note?: string
}

function weeklyBudgetMinutes(a: AthleteAvailability, week: WeekSkeleton, targetMinutes: number): number {
  void week
  return Math.min(targetMinutes, Math.round(a.maxHoursPerWeek * 60))
}

function availableDatesForWeek(weekStart: ISODate, a: AthleteAvailability, events: RaceEvent[]): ISODate[] {
  return datesOfWeek(weekStart).filter((d) => checkDateAvailable(d, a, events).ok)
}

function sessionDurationCap(kind: SessionKind, stage: StageId, config: EngineConfig, progress: number): number {
  const s = config.stages[stage]
  const frac = 0.55 + 0.45 * progress
  if (kind === 'bike-long' || kind === 'bike-race-pace') return round5(s.longBikeMax * frac)
  if (kind === 'run-long') return round5(s.longRunMax * frac)
  if (kind === 'brick') return round5(s.sessionMax * 1.6 * frac)
  if (kind.startsWith('swim')) return round5(s.longSwimMax * (0.7 + 0.3 * progress))
  return s.sessionMax
}

function minDurationFor(kind: SessionKind): number {
  if (kind === 'strength') return 30
  if (kind === 'mobility') return 15
  if (kind.startsWith('swim')) return 25
  if (kind === 'brick') return 45
  if (isLongKind(kind)) return 50
  return 25
}

export function buildWeek(a: WeekBuildArgs): WeekBuild {
  const { week, availability, events, restrictions, config } = a
  const dropped: string[] = []
  const target = targetWeeklyMinutes(week.stage, a.startMinutes, week.loadProgress, config)
  let targetMinutes = round5(target * week.volumeFactor)
  const budget = weeklyBudgetMinutes(availability, week, targetMinutes)
  const days = availableDatesForWeek(week.weekStart, availability, events)

  if (hasTrainingPause(restrictions)) {
    return { specs: [], targetMinutes, plannedMinutes: 0, dropped, note: 'Training paused by an active clinical restriction.' }
  }
  if (!days.length) return { specs: [], targetMinutes, plannedMinutes: 0, dropped, note: 'No available training days this week.' }

  // One session per day is the baseline; a day may hold a short mobility add-on in the loop below.
  const table: Slot[] = slotTable(week.stage, tableKindForPhase(week.tablePhase))
  const maxByTime = Math.max(2, Math.floor(budget / config.avgSessionMinutes))
  const cap = Math.min(days.length, table.length, week.isRecoveryWeek ? Math.max(2, days.length - 1) : days.length, maxByTime + 1)
  let slots = table.slice(0, Math.max(2, cap))

  // Recovery and taper weeks: drop the least important slots first and soften intensity.
  if (week.isRecoveryWeek || week.isTaperWeek) {
    const keep = Math.max(2, Math.min(slots.length, Math.round(slots.length * (week.isTaperWeek ? 0.8 : 0.75))))
    slots = slots.slice(0, keep)
  }

  const totalShare = sum(slots.map((s) => s.share))
  const stageCfg = config.stages[week.stage]
  const phaseCap = week.isRecoveryWeek ? 'easy' : PHASE_INTENSITY_CAP[week.tablePhase]
  const stageCap: IntensityLevel = stageCfg.maxHardSessionsPerWeek === 0 ? 'moderate' : 'hard'
  const weekCap: IntensityLevel = INTENSITY_RANK[phaseCap] <= INTENSITY_RANK[stageCap] ? phaseCap : stageCap

  let hardCount = 0
  type Draft = { slot: Slot; spec: SessionSpec; isKey: boolean; restrictionNote?: string }
  const drafts: Draft[] = []

  for (const slot of slots) {
    let kind = slot.kind
    let intensity = KIND_INTENSITY[kind]
    const rawMinutes = (budget * slot.share) / totalShare
    const minutes = clamp(round5(rawMinutes), minDurationFor(kind), sessionDurationCap(kind, week.stage, config, week.loadProgress))
    let spec: SessionSpec = {
      sport: KIND_SPORT[kind],
      kind,
      durationMin: minutes,
      intensity,
      phase: week.phaseType,
      stage: week.stage,
    }
    // Stage and phase caps.
    spec = capSpec(spec, weekCap)
    kind = spec.kind
    intensity = spec.intensity
    // Limit hard sessions per week.
    if (intensity === 'hard') {
      if (hardCount >= stageCfg.maxHardSessionsPerWeek) {
        spec = capSpec(spec, 'moderate')
      } else hardCount++
    }
    drafts.push({ slot, spec, isKey: Boolean(slot.key) && !week.isRecoveryWeek })
  }

  // Never schedule two high-intensity sessions without enough recovery between: placement handles adjacency;
  // restriction adaptation happens after placement so a substituted sport is placed sensibly.
  const placeable: PlaceableSession[] = drafts.map((d) => ({
    sport: d.spec.sport,
    hard: d.spec.intensity === 'hard',
    demanding: d.spec.intensity === 'hard' || d.spec.kind === 'brick' || isLongKind(d.spec.kind) || d.spec.kind === 'bike-race-pace',
    long: isLongKind(d.spec.kind),
    strength: d.spec.kind === 'strength',
    gentle: d.spec.intensity === 'recovery' || d.spec.intensity === 'easy',
  }))

  const usable = days.slice()
  const count = Math.min(drafts.length, usable.length)
  const placedDates = placeSessions(placeable.slice(0, count), usable)
  const out: WeekBuild['specs'] = []

  for (let i = 0; i < count; i++) {
    const d = drafts[i]
    let spec = d.spec
    const date = placedDates[i]
    const constraint = eventConstraintFor(date, events)
    spec = applyDateConstraint(spec, constraint).spec
    const adapted = adaptSpecToRestrictions(spec, restrictions)
    if (!adapted.spec) {
      dropped.push(adapted.note ?? 'Session removed by restriction')
      continue
    }
    out.push({
      spec: adapted.spec,
      date,
      isKey: d.isKey && adapted.spec.kind === d.spec.kind,
      restrictionNote: adapted.note ?? (constraint.reason && constraint.maxIntensity ? constraint.reason : undefined),
    })
  }
  for (let i = count; i < drafts.length; i++) dropped.push(`${drafts[i].spec.kind} (no free day)`)

  out.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  // Fill leftover time with a short mobility session on a rest-ish day if we have capacity.
  if (
    week.tablePhase !== 'taper' &&
    out.length < days.length &&
    !restrictions.some((r) => r.status === 'active' && r.effect.pauseAllTraining) &&
    out.length < 7
  ) {
    const used = new Set(out.map((o) => o.date))
    const free = days.find((d) => !used.has(d))
    if (free) {
      const kind: SessionKind = week.isRecoveryWeek ? 'recovery' : 'mobility'
      out.push({
        spec: {
          sport: KIND_SPORT[kind],
          kind,
          durationMin: kind === 'mobility' ? config.mobilityMinutes : 30,
          intensity: 'recovery',
          phase: week.phaseType,
          stage: week.stage,
        },
        date: free,
        isKey: false,
      })
      out.sort((x, y) => (x.date < y.date ? -1 : 1))
    }
  }

  // Final guard: the stated weekly time limit is a hard cap. Minimum useful durations (and the mobility
  // add-on) can push a tight week over budget, so trim the longest sessions first, then drop optional ones.
  let over = sum(out.map((o) => o.spec.durationMin)) - budget
  for (let guard = 0; over > 0 && guard < 40; guard++) {
    const room = (o: (typeof out)[number]) => o.spec.durationMin - minDurationFor(o.spec.kind)
    const trimmable = out.reduce<(typeof out)[number] | null>((best, o) => (room(o) > 0 && (!best || room(o) > room(best)) ? o : best), null)
    if (trimmable) {
      const cut = Math.min(room(trimmable), Math.ceil(over / 5) * 5)
      trimmable.spec = { ...trimmable.spec, durationMin: trimmable.spec.durationMin - cut }
    } else {
      const optional = [...out].reverse().find((o) => !o.isKey && (o.spec.kind === 'mobility' || o.spec.kind === 'strength' || o.spec.kind === 'recovery'))
      if (!optional) break
      out.splice(out.indexOf(optional), 1)
      dropped.push(`${optional.spec.kind} (weekly time limit)`)
    }
    over = sum(out.map((o) => o.spec.durationMin)) - budget
  }

  const plannedMinutes = sum(out.map((o) => o.spec.durationMin))
  if (budget < targetMinutes) targetMinutes = budget
  const note = week.isRecoveryWeek
    ? 'Recovery week: lighter load to absorb recent training.'
    : week.isTaperWeek
      ? 'Taper week: lower volume, stay sharp.'
      : undefined
  return { specs: out, targetMinutes, plannedMinutes, dropped, note }
}

/* ------------------------------------- Generate ------------------------------------- */

export function generatePlan(input: GenerateInput): GeneratedPlan {
  const config = input.config ?? DEFAULT_ENGINE_CONFIG
  const { athlete, availability, events, restrictions } = input
  const mk = input.idFactory ?? newId
  const pathwayResult = buildPathway(athlete, availability, config, input.startStageOverride)
  const goalType = athlete.goal.type
  const { startStage, goalStage } = pathwayResult
  const planStart = input.planStart ?? resolvePlanStart(input.today, config)
  const goalEvent = primaryEvent(events, goalType) ?? primaryEvent(events)
  const eventDate = goalEvent?.date ?? athlete.goal.targetEventDate
  // Plan length in weeks, INCLUDING the race week itself (so the final taper week is the race week).
  const weeksToEvent = eventDate ? Math.max(0, weeksBetween(planStart, eventDate)) + 1 : null

  const warnings = [...pathwayResult.warnings]
  const stagesOnRoute = pathwayResult.pathway.filter((p) => p.status === 'current' || p.status === 'upcoming')

  // Weeks per stage, trimmed to the target event when there is one.
  let spans: StageSpan[] = stagesOnRoute.map((p) => ({
    stage: p.stage,
    weeks: plannedWeeksForStage(p.stage === startStage, { min: p.estimatedMinWeeks, max: p.estimatedMaxWeeks }, null, config),
    startMinutes: p.stage === startStage ? Math.max(config.stages[p.stage].startMinutes * 0.6, Math.min(baselineWeeklyMinutes(athlete.baseline), config.stages[p.stage].startMinutes * 1.4)) : config.stages[p.stage].startMinutes,
  }))

  const nonGoalSpans = spans.slice(0, -1)
  let compressed = false
  if (weeksToEvent !== null) {
    const goalSpan = spans[spans.length - 1]
    const minNeeded = minWeeksForGoal(goalType, config)
    if (spans.length === 1 && weeksToEvent < goalSpan.weeks) {
      goalSpan.weeks = Math.max(config.minStageWeeks + 2, weeksToEvent)
      compressed = true
    } else if (spans.length > 1) {
      // Reserve the goal stage's minimum, give the rest to earlier stages proportionally.
      const reserved = Math.min(minNeeded, Math.max(config.minStageWeeks + 2, weeksToEvent))
      let remaining = Math.max(0, weeksToEvent - reserved)
      for (const sp of nonGoalSpans) {
        const give = Math.min(sp.weeks, Math.max(0, remaining))
        if (give < sp.weeks) compressed = true
        sp.weeks = Math.max(0, give)
        remaining -= give
      }
      goalSpan.weeks = Math.max(config.minStageWeeks + 2, Math.min(goalSpan.weeks, weeksToEvent - sum(nonGoalSpans.map((s) => s.weeks))))
      spans = spans.filter((s) => s.weeks > 0)
      if (weeksToEvent < minNeeded) compressed = true
    }
    if (weeksToEvent < minNeeded)
      warnings.push(
        `Only ${weeksToEvent} weeks of preparation fit before your event (including race week); the illustrative preparation range for this goal is ${minNeeded}+ weeks. The plan has been compressed conservatively, but consider a later date or a shorter distance. Race readiness is never guaranteed.`,
      )
  }
  if (compressed && weeksToEvent !== null)
    warnings.push('Plan length was shortened to fit your event date. Progression between stages still depends on your readiness reviews.')

  const cautious = athlete.ageRange === '55-64' || athlete.ageRange === '65+' || athlete.baseline.consistency === 'none' || athlete.preferences.recoveryPattern === 'recover-slowly'
  const layout = layoutWeeks(spans, planStart, goalType, weeksToEvent, config, cautious)

  const planId = mk('plan')
  const phases: TrainingPhase[] = layout.phases.map((p) => ({ ...p, id: mk('phase'), planId }))
  const phaseIdFor = (stage: StageId, t: PhaseType) => phases.find((p) => p.stage === stage && p.type === t)?.id ?? phases[0]?.id ?? ''

  const ctx = makeContentContext(athlete, availability)
  const weeks: PlannedWeek[] = []
  const workouts: Workout[] = []
  const horizon = config.horizonWeeks

  for (const week of layout.skeleton) {
    const span = spans.find((s) => s.stage === week.stage)!
    const generate = week.weekStart <= addDaysISO(input.today, horizon * 7)
    let plannedMinutes = 0
    let note: string | undefined
    let targetMinutes = round5(targetWeeklyMinutes(week.stage, span.startMinutes, week.loadProgress, config) * week.volumeFactor)

    if (generate) {
      const built = buildWeek({
        week,
        availability,
        events,
        restrictions,
        config,
        startMinutes: span.startMinutes,
        ctx,
      })
      targetMinutes = built.targetMinutes
      plannedMinutes = built.plannedMinutes
      note = built.note
      if (built.dropped.length) note = [note, `Adjusted: ${built.dropped.join('; ')}`].filter(Boolean).join(' ')
      for (const s of built.specs) {
        workouts.push(
          createWorkoutFromSpec({
            id: mk('wo'),
            planId,
            phaseId: phaseIdFor(week.stage, week.tablePhase),
            weekStart: week.weekStart,
            date: s.date,
            spec: s.spec,
            ctx,
            targets: input.fuelingTargets,
            isKey: s.isKey,
            now: input.now,
            restrictionNote: s.restrictionNote,
          }),
        )
      }
    } else {
      plannedMinutes = targetMinutes
      note = 'Detailed sessions are generated closer to this week so they reflect your latest progress.'
    }

    weeks.push({
      index: week.index,
      weekInStage: week.weekInStage,
      weekStart: week.weekStart,
      stage: week.stage,
      phaseId: phaseIdFor(week.stage, week.tablePhase),
      phaseType: week.phaseType,
      tablePhase: week.tablePhase,
      startMinutes: span.startMinutes,
      isRecoveryWeek: week.isRecoveryWeek,
      targetMinutes,
      plannedMinutes,
      loadProgress: week.loadProgress,
      volumeFactor: week.volumeFactor,
      generated: generate,
      note,
    })
  }

  // Baseline assessment sessions in the first week, for athletes lacking established reference points.
  const baselineAssessments = baselineAssessmentList(athlete)
  addAssessmentWorkouts({ athlete, availability, events, restrictions, workouts, weeks, planId, phaseIdFor, planStart, ctx, now: input.now, startStage, mk, targets: input.fuelingTargets })

  const assumptions = buildAssumptions(athlete, availability, config)
  if (athlete.baseline.hasClinicianRestrictions && !restrictions.some((r) => r.status === 'active'))
    warnings.push('You reported clinician restrictions but none are recorded yet. Add them under Rehab so the plan can enforce them.')

  const now = input.now
  const plan: TrainingPlan = {
    id: planId,
    createdAt: now,
    updatedAt: now,
    athleteId: athlete.id,
    name: `${RACE_DISTANCES[goalType].label} pathway`,
    goalType,
    startStage,
    targetStage: goalStage,
    currentStage: startStage,
    startDate: planStart,
    primaryEventId: goalEvent?.id,
    pathway: pathwayResult.pathway,
    prerequisites: pathwayResult.prerequisites,
    phases,
    weeks,
    assumptions,
    warnings: Array.from(new Set(warnings)),
    baselineAssessments,
    estimatedTotalWeeks: pathwayResult.total,
    status: 'active',
    version: 1,
  }
  return { plan, workouts: workouts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)), pathway: pathwayResult }
}

/* ------------------------------ Assumptions & assessments ------------------------------ */

export function buildAssumptions(athlete: AthleteProfile, availability: AthleteAvailability, config: EngineConfig): string[] {
  return [
    'Preparation ranges (e.g. 8–16+ weeks for Foundation) are illustrative defaults and are configurable — you may need more time.',
    `Weekly load is capped at your stated ${availability.maxHoursPerWeek} h/week and training is placed only on your chosen days.`,
    `Every ${config.recoveryEvery[athlete.preferences.recoveryPattern === 'recover-slowly' ? 'cautious' : 'default']}–${config.recoveryEvery.default}th load week is a lighter recovery week; recovery is part of the plan.`,
    athlete.baseline.maxHr || athlete.baseline.bikeFtpWatts || athlete.baseline.runThresholdPaceSecPerKm
      ? 'Heart-rate, pace and power targets use the numbers you provided; effort (RPE) and the talk test remain the primary guides.'
      : 'No heart-rate, pace or power data provided: all sessions use effort (RPE) and the talk test — no extra equipment needed.',
    'Progression between stages is decided by readiness reviews, not by completing a fixed number of weeks.',
    'Missed sessions are not stacked onto later days. The plan adapts instead of "making up" lost training.',
    'This plan is educational planning support. It is not medical advice and cannot guarantee race completion.',
  ]
}

function baselineAssessmentList(athlete: AthleteProfile): string[] {
  const list = [
    'Comfortable swim: 15 min continuous easy swim — record distance and rests (no watch needed).',
    'Steady ride: 30 min at RPE 5 — record distance and comfort.',
    'Talk-test run: 20 min run or run-walk — record minutes without walking.',
  ]
  if (athlete.openWater === 'none') list.push('Open-water comfort check: supervised, calm-water entry and 5–10 min of easy swimming.')
  return list
}

interface AssessmentArgs {
  athlete: AthleteProfile
  availability: AthleteAvailability
  events: RaceEvent[]
  restrictions: ClinicalRestriction[]
  workouts: Workout[]
  weeks: PlannedWeek[]
  planId: string
  phaseIdFor: (stage: StageId, t: PhaseType) => string
  planStart: ISODate
  ctx: ReturnType<typeof makeContentContext>
  now: Timestamp
  startStage: StageId
  mk: (prefix: string) => string
  targets?: FuelingTargets
}

/** Converts the first week's three easiest-matching sessions into baseline assessments (no extra load). */
function addAssessmentWorkouts(a: AssessmentArgs): void {
  const first = a.weeks[0]
  if (!first) return
  const map: [SessionKind[], SessionKind][] = [
    [['swim-technique', 'swim-endurance'], 'assess-swim'],
    [['bike-easy'], 'assess-bike'],
    [['run-walk', 'run-easy'], 'assess-run'],
  ]
  for (const [from, to] of map) {
    const w = a.workouts.find((x) => x.weekStart === first.weekStart && from.includes(x.kind as SessionKind))
    if (!w) continue
    const spec: SessionSpec = {
      sport: KIND_SPORT[to],
      kind: to,
      durationMin: to === 'assess-swim' ? Math.max(w.durationMin, 30) : to === 'assess-bike' ? Math.max(w.durationMin, 45) : Math.max(w.durationMin, 30),
      intensity: 'easy',
      phase: w.phaseType,
      stage: w.stage,
    }
    const adapted = adaptSpecToRestrictions(spec, a.restrictions)
    if (!adapted.spec) continue
    const replacement = createWorkoutFromSpec({
      id: w.id,
      planId: a.planId,
      phaseId: w.phaseId,
      weekStart: w.weekStart,
      date: w.date,
      spec: adapted.spec,
      ctx: a.ctx,
      targets: a.targets,
      isKey: false,
      now: a.now,
      restrictionNote: adapted.note ?? w.restrictionNote,
    })
    const idx = a.workouts.indexOf(w)
    a.workouts[idx] = replacement
  }
  first.plannedMinutes = sum(a.workouts.filter((w) => w.weekStart === first.weekStart).map((w) => w.durationMin))
  first.note = [first.note, 'Includes baseline check sessions — effort-based, no special equipment.'].filter(Boolean).join(' ')
}
