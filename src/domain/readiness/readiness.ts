import type { AthleteAvailability, AthleteProfile } from '../models/athlete'
import type { StageId, Timestamp } from '../models/common'
import type { RaceEvent } from '../models/events'
import type {
  ClinicalRestriction,
  FuelingLog,
  ReadinessAssessment,
  ReadinessFactor,
  ReadinessGate,
  ReadinessOutcome,
  RecoveryCheckIn,
  SymptomReport,
} from '../models/health'
import type { TrainingPlan, Workout, WorkoutResult } from '../models/training'
import { activeRestrictions } from '../safety/restrictions'
import { CONSISTENCY_RANK, DEFAULT_ENGINE_CONFIG, nextStage, type EngineConfig } from '../training-engine/config'
import { addDaysISO, daysBetween, type ISODate } from '@/lib/dates'
import { newId } from '@/lib/ids'
import { avg, clamp, sum } from '@/lib/utils'

export interface ReadinessInput {
  athlete: AthleteProfile
  availability: AthleteAvailability
  plan: TrainingPlan
  workouts: Workout[]
  results: WorkoutResult[]
  checkIns: RecoveryCheckIn[]
  fuelingLogs: FuelingLog[]
  events: RaceEvent[]
  /** Medical data enters ONLY here, through the dedicated safety path. */
  restrictions: ClinicalRestriction[]
  symptoms: SymptomReport[]
  today: ISODate
  now: Timestamp
  config?: EngineConfig
  idFactory?: (prefix: string) => string
}

const pct = (n: number) => Math.round(clamp(n, 0, 1) * 100)

function within(date: string, today: ISODate, days: number): boolean {
  return date <= today && date >= addDaysISO(today, -days)
}

/** Planned sessions that were due in the window and could reasonably have been completed. */
function dueWorkouts(workouts: Workout[], today: ISODate, days: number): Workout[] {
  return workouts.filter((w) => w.sport !== 'rehab' && w.date < today && within(w.date, today, days))
}

/** The athlete's best completed capacity, from recorded results and the self-reported baseline. */
function observedCapacity(input: ReadinessInput) {
  const { athlete, results, workouts } = input
  const byId = new Map(workouts.map((w) => [w.id, w]))
  let swimM = athlete.baseline.comfortableSwimM
  let bikeMin = athlete.baseline.comfortableBikeMin
  let runMin = athlete.baseline.comfortableRunMin
  for (const r of results) {
    const w = byId.get(r.workoutId)
    if (!w || r.rpe > 7) continue
    // Only count sessions that felt manageable — comfortable capacity, not maximal effort.
    if (w.sport === 'swim' && r.actualDistanceM) swimM = Math.max(swimM, r.actualDistanceM)
    if (w.sport === 'bike') bikeMin = Math.max(bikeMin, r.actualDurationMin)
    if (w.sport === 'run') runMin = Math.max(runMin, r.actualDurationMin)
    if (w.sport === 'brick') {
      bikeMin = Math.max(bikeMin, Math.round(r.actualDurationMin * 0.7))
      runMin = Math.max(runMin, Math.round(r.actualDurationMin * 0.3))
    }
  }
  return { swimM, bikeMin, runMin }
}

export function assessReadiness(input: ReadinessInput): ReadinessAssessment {
  const config = input.config ?? DEFAULT_ENGINE_CONFIG
  const rc = config.readiness
  const mk = input.idFactory ?? newId
  const { plan, today } = input
  const stage: StageId = plan.currentStage
  const next = nextStage(stage)
  const factors: ReadinessFactor[] = []
  const gates: ReadinessGate[] = []
  const overrides: string[] = []
  const reasons: string[] = []
  const nextSteps: string[] = []

  /* ------------------------------ Medical path (highest precedence) ------------------------------ */
  const activeRes = activeRestrictions(input.restrictions)
  const recentSymptoms = input.symptoms.filter((s) => within(s.reportedAt.slice(0, 10), today, rc.windows.symptoms))
  const severeSymptom = recentSymptoms.find((s) => s.triage.level === 'emergency' || s.triage.level === 'urgent')
  const unreviewedConcerning = recentSymptoms.filter((s) => s.triage.level === 'professional-assessment' && !s.clinicianReviewed)
  const worseningSymptom = recentSymptoms.find((s) => s.trend === 'worsening' && s.severity >= 4 && !s.clinicianReviewed)

  /* ------------------------------ Factors ------------------------------ */
  // 1. Training consistency (completion of what was due)
  const due = dueWorkouts(input.workouts, today, rc.windows.consistency)
  const done = due.filter((w) => w.status === 'completed')
  const rate = due.length ? done.length / due.length : null
  factors.push({
    id: 'consistency',
    label: 'Training consistency',
    weight: rc.weights.consistency,
    score: due.length >= rc.minSessionsForConsistency && rate !== null ? pct(rate) : null,
    detail: due.length
      ? `${done.length} of ${due.length} sessions due in the last ${rc.windows.consistency} days were completed.`
      : 'No sessions have come due yet.',
  })

  // 2. Completion of key preparation sessions for the current stage
  const keyDue = due.filter((w) => w.isKey)
  const keyDone = keyDue.filter((w) => w.status === 'completed')
  factors.push({
    id: 'keySessions',
    label: 'Key preparation sessions',
    weight: rc.weights.keySessions,
    score: keyDue.length >= 2 ? pct(keyDone.length / keyDue.length) : null,
    detail: keyDue.length ? `${keyDone.length} of ${keyDue.length} key sessions (long ride/run, bricks) completed.` : 'No key sessions due in the window yet.',
  })

  // 3. Comfortable sport-specific capacity relative to the NEXT stage's entry requirements
  const cap = observedCapacity(input)
  const target = next ? config.entry[next] : config.entry[stage]
  const swimF = clamp(cap.swimM / Math.max(target.comfortableSwimM, 1), 0, 1.2)
  const bikeF = clamp(cap.bikeMin / Math.max(target.comfortableBikeMin, 1), 0, 1.2)
  const runF = clamp(cap.runMin / Math.max(target.comfortableRunMin, 1), 0, 1.2)
  const capacityScore = pct((Math.min(swimF, 1) + Math.min(bikeF, 1) + Math.min(runF, 1)) / 3)
  const capacityMin = Math.min(swimF, bikeF, runF)
  factors.push({
    id: 'capacity',
    label: 'Comfortable sport-specific capacity',
    weight: rc.weights.capacity,
    score: capacityScore,
    detail: `Swim ${cap.swimM} m · Bike ${cap.bikeMin} min · Run ${cap.runMin} min comfortable, vs ${target.comfortableSwimM} m / ${target.comfortableBikeMin} min / ${target.comfortableRunMin} min typical for ${next ? `Stage ${next}` : 'this stage'}.`,
  })

  // 4. Subjective fatigue & recovery
  const recent = input.checkIns.filter((c) => within(c.date, today, rc.windows.recovery))
  let recoveryScore: number | null = null
  let avgFatigue: number | null = null
  if (recent.length >= rc.minCheckIns) {
    avgFatigue = avg(recent.map((c) => c.fatigue))
    const readinessAvg = avg(recent.map((c) => c.readiness)) ?? 3
    const sleepAvg = avg(recent.map((c) => c.sleepHours)) ?? 7
    const sore = avg(recent.map((c) => c.soreness)) ?? 3
    const raw = ((readinessAvg - 1) / 4) * 0.4 + ((5 - (avgFatigue ?? 3)) / 4) * 0.3 + ((5 - sore) / 4) * 0.15 + clamp((sleepAvg - 5) / 3, 0, 1) * 0.15
    recoveryScore = pct(raw)
  }
  factors.push({
    id: 'recovery',
    label: 'Fatigue & recovery (self-reported)',
    weight: rc.weights.recovery,
    score: recoveryScore,
    detail:
      recoveryScore === null
        ? `Needs at least ${rc.minCheckIns} check-ins in the last ${rc.windows.recovery} days (have ${recent.length}).`
        : `Across ${recent.length} check-ins: fatigue ${(avgFatigue ?? 0).toFixed(1)}/5. Self-reported only — not a medical measure.`,
  })

  // 5. Reported symptoms & restrictions
  let symptomScore = 100
  if (activeRes.length) symptomScore = 0
  else if (severeSymptom) symptomScore = 0
  else if (worseningSymptom) symptomScore = 20
  else if (unreviewedConcerning.length) symptomScore = 45
  else if (recentSymptoms.length) symptomScore = 80
  factors.push({
    id: 'symptoms',
    label: 'Reported symptoms & restrictions',
    weight: rc.weights.symptoms,
    score: symptomScore,
    detail: activeRes.length
      ? `${activeRes.length} active clinical restriction(s).`
      : recentSymptoms.length
        ? `${recentSymptoms.length} symptom report(s) in the last ${rc.windows.symptoms} days.`
        : 'No recent symptom reports or active restrictions.',
  })

  // 6. Nutrition & fueling practice (relevant for longer-course stages)
  const longDue = due.filter((w) => w.fueling && (w.fueling.level === 'practice' || w.fueling.level === 'structured') && w.status === 'completed')
  const logs = input.fuelingLogs.filter((l) => within(l.date, today, rc.windows.fueling))
  const needsFuelPractice = stage === 'C' || stage === 'D' || next === 'C' || next === 'D'
  let fuelScore: number | null = null
  if (needsFuelPractice) {
    if (longDue.length) fuelScore = pct(Math.min(1, logs.length / Math.max(1, Math.ceil(longDue.length * 0.6))) * (logs.length ? (avg(logs.map((l) => l.tolerance)) ?? 3) / 5 : 0.4))
  } else fuelScore = longDue.length ? pct(Math.min(1, logs.length / Math.max(1, longDue.length))) : null
  factors.push({
    id: 'fueling',
    label: 'Fueling practice',
    weight: rc.weights.fueling,
    score: fuelScore,
    detail: longDue.length
      ? `${logs.length} fueling log(s) across ${longDue.length} long/practice session(s).`
      : 'Not enough long sessions yet to judge fueling practice.',
  })

  // 7. Available training time vs the next stage's typical need
  const needHours = next ? config.entry[next].hoursAvailable : config.entry[stage].hoursAvailable
  const timeScore = pct(input.availability.maxHoursPerWeek / needHours)
  factors.push({
    id: 'time',
    label: 'Available training time',
    weight: rc.weights.time,
    score: timeScore,
    detail: `${input.availability.maxHoursPerWeek} h/week available vs roughly ${needHours}+ h/week typical for ${next ? `Stage ${next}` : 'this stage'}.`,
  })

  // 8. Upcoming race requirements
  const primary = input.events.find((e) => e.id === plan.primaryEventId) ?? input.events.find((e) => e.priority === 'A' && e.status === 'planned')
  let raceScore: number | null = null
  let raceDetail = 'No primary race set.'
  if (primary) {
    const weeksLeft = Math.max(0, Math.floor(daysBetween(today, primary.date) / 7))
    const goalStageMin = config.stages[plan.targetStage].minWeeks
    raceScore = pct(weeksLeft / Math.max(goalStageMin, 1))
    raceDetail = `${weeksLeft} week(s) to ${primary.name}; illustrative preparation for this goal is ${goalStageMin}+ weeks.`
  }
  factors.push({ id: 'race', label: 'Upcoming race requirements', weight: rc.weights.race, score: raceScore, detail: raceDetail })

  /* ------------------------------ Weighted score (only known factors) ------------------------------ */
  const known = factors.filter((f) => f.score !== null)
  const weightSum = sum(known.map((f) => f.weight))
  const score = weightSum ? Math.round(sum(known.map((f) => (f.score as number) * f.weight)) / weightSum) : 0
  const coverage = weightSum / sum(factors.map((f) => f.weight))
  const confidence: ReadinessAssessment['confidence'] = coverage >= 0.9 ? 'high' : coverage >= 0.65 ? 'medium' : 'low'

  /* ------------------------------ Gates (all must pass to progress) ------------------------------ */
  const stageStart = plan.weeks.find((w) => w.stage === stage)?.weekStart
  const weeksInStage = stageStart ? Math.max(0, Math.floor(daysBetween(stageStart, today) / 7)) : 0
  const minWeeks = Math.ceil(config.stages[stage].minWeeks * rc.minStageFraction)

  gates.push({
    id: 'next-stage',
    label: 'A later stage exists on your pathway',
    passed: Boolean(next) && plan.pathway.some((p) => p.stage === next && (p.status === 'upcoming' || p.status === 'current')),
    detail: next ? `Next: Stage ${next}.` : 'You are on the final stage.',
  })
  gates.push({
    id: 'clinical',
    label: 'No active clinical restriction or unresolved urgent symptom',
    passed: activeRes.length === 0 && !severeSymptom && !worseningSymptom,
    detail: activeRes.length ? `Active: ${activeRes.map((r) => r.title).join('; ')}.` : severeSymptom ? 'An urgent symptom report needs professional review.' : worseningSymptom ? 'A worsening symptom is not yet reviewed.' : 'None active.',
  })
  gates.push({
    id: 'time-in-stage',
    label: `At least ${minWeeks} week(s) in this stage (necessary, never sufficient)`,
    passed: weeksInStage >= minWeeks,
    detail: `${weeksInStage} week(s) so far. Time alone never advances you.`,
  })
  gates.push({
    id: 'completion',
    label: `Completed at least ${Math.round(rc.minCompletionRate * 100)}% of due sessions`,
    passed: rate !== null && due.length >= rc.minSessionsForConsistency && rate >= rc.minCompletionRate,
    detail: rate === null ? 'Not enough sessions due yet.' : `${pct(rate)}% completed.`,
  })
  gates.push({
    id: 'capacity',
    label: `Comfortable capacity reaches ${Math.round(rc.capacityGate * 100)}% of the next stage’s typical entry level`,
    passed: capacityMin >= rc.capacityGate,
    detail: `Lowest discipline reaches ${pct(capacityMin)}%.`,
  })
  gates.push({
    id: 'recovery',
    label: 'Recovery check-ins available and fatigue manageable',
    passed: recoveryScore !== null && (avgFatigue ?? 5) <= rc.maxAvgFatigue,
    detail: recoveryScore === null ? 'Not enough recent check-ins.' : `Average fatigue ${(avgFatigue ?? 0).toFixed(1)}/5 (limit ${rc.maxAvgFatigue}).`,
  })
  gates.push({
    id: 'consistency-level',
    label: 'Self-reported consistency at least "regular"',
    passed: CONSISTENCY_RANK[input.athlete.baseline.consistency] >= CONSISTENCY_RANK['regular'],
    detail: `Reported: ${input.athlete.baseline.consistency.replace('-', ' ')}.`,
  })

  /* ------------------------------ Outcome (transparent precedence) ------------------------------ */
  let outcome: ReadinessOutcome

  if (activeRes.length || severeSymptom || worseningSymptom) {
    outcome = 'clinical-review'
    if (activeRes.length) overrides.push(`Active clinical restriction(s): ${activeRes.map((r) => r.title).join('; ')}. No fitness score can override a restriction.`)
    if (severeSymptom) overrides.push('A recent symptom report was triaged as urgent or emergency.')
    if (worseningSymptom) overrides.push('A worsening symptom has not been reviewed by a clinician.')
    reasons.push('Clinical review takes precedence over every performance measure. Progression is not considered while this is active.')
    nextSteps.push('Follow the guidance from your clinician and keep your restriction up to date in Rehab.')
    nextSteps.push('Ask Dr. Meridian to help organise your information for the assessment (a simulated assistant, not a clinician).')
  } else if (
    (recoveryScore !== null && recoveryScore < rc.reduceBelowRecoveryScore) ||
    (avgFatigue !== null && avgFatigue >= 4.2) ||
    (rate !== null && due.length >= rc.minSessionsForConsistency && rate < 0.4) ||
    unreviewedConcerning.length >= 2
  ) {
    outcome = 'reduce'
    if (recoveryScore !== null && recoveryScore < rc.reduceBelowRecoveryScore) reasons.push(`Recovery score ${recoveryScore} is low (below ${rc.reduceBelowRecoveryScore}).`)
    if (avgFatigue !== null && avgFatigue >= 4.2) reasons.push(`Average fatigue is high at ${avgFatigue.toFixed(1)}/5.`)
    if (rate !== null && rate < 0.4) reasons.push(`Only ${pct(rate)}% of due sessions were completed — the current load may not fit your life right now.`)
    if (unreviewedConcerning.length >= 2) reasons.push('Multiple unreviewed symptom reports — consider a professional assessment.')
    nextSteps.push('Reduce volume for 1–2 weeks and prioritise sleep and easy movement.')
    nextSteps.push('Reassess after at least three more recovery check-ins.')
  } else if (gates.every((g) => g.passed) && score >= rc.progressThreshold) {
    outcome = 'progress'
    reasons.push(`Every gate passed and the overall score (${score}) meets the ${rc.progressThreshold} threshold.`)
    reasons.push(`Next: Stage ${next}. This is a recommendation — not medical clearance, and not a guarantee of race completion.`)
    nextSteps.push('Accept progression to rebuild your plan for the next stage, or stay in your current stage if you prefer to consolidate.')
  } else {
    outcome = 'continue'
    const failed = gates.filter((g) => !g.passed && g.id !== 'next-stage')
    if (!next) reasons.push('You are on the final stage. Continue building and keep recovery weeks.')
    else if (failed.length) reasons.push(`Not yet ready to progress: ${failed.map((g) => g.label.replace(/ \(.*\)/, '')).join('; ')}.`)
    else reasons.push(`Gates are met but the overall score (${score}) is below ${rc.progressThreshold}. Keep building consistency.`)
    for (const g of failed) nextSteps.push(`${g.label}: ${g.detail}`)
    if (!nextSteps.length) nextSteps.push('Keep completing key sessions and logging recovery check-ins.')
  }

  return {
    id: mk('rdy'),
    createdAt: input.now,
    updatedAt: input.now,
    stage,
    nextStage: next,
    outcome,
    score,
    confidence,
    factors,
    gates,
    overrides,
    reasons,
    nextSteps,
    asOf: today,
  }
}

export const OUTCOME_LABELS: Record<ReadinessOutcome, string> = {
  progress: 'Progression recommended',
  continue: 'Continue current stage',
  reduce: 'Reduce workload and reassess',
  'clinical-review': 'Clinical review required',
}

export const READINESS_DISCLAIMER =
  'This review is an explainable planning aid built from your own logs. It is not a medical assessment, cannot clear you to train or race, and does not guarantee race completion.'
