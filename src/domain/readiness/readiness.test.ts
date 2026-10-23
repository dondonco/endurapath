import { beforeEach, describe, expect, it } from 'vitest'
import { assessReadiness, type ReadinessInput } from '@/domain/readiness/readiness'
import { DEFAULT_ENGINE_CONFIG } from '@/domain/training-engine/config'
import type { AppState } from '@/domain/models/state'
import type { RecoveryCheckIn, SymptomReport } from '@/domain/models/health'
import type { WorkoutResult } from '@/domain/models/training'
import { addDaysISO } from '@/lib/dates'
import { makeAthlete, makeAvailability, makeRestriction, makeState, NOW, resetIds, TODAY, testId } from '@/test/fixtures'

/** A stage-A athlete 8 weeks into the plan whose comfortable capacity already meets Stage B entry levels. */
function strongState(): AppState {
  const athlete = makeAthlete(
    { goal: { type: 'sprint', preferredFormat: 'no-preference', intent: 'finish-comfortably' } },
    { consistency: 'very-consistent', comfortableSwimM: 500, comfortableBikeMin: 60, comfortableRunMin: 30 },
  )
  const s = makeState({ athlete, planStart: '2026-01-05', startStage: 'A', availability: makeAvailability({ maxHoursPerWeek: 6 }) })
  const completed = s.workouts.map((w) => (w.sport !== 'rehab' && w.date < TODAY ? { ...w, status: 'completed' as const } : w))
  const results: WorkoutResult[] = completed
    .filter((w) => w.status === 'completed')
    .map((w) => ({ id: testId('res'), createdAt: NOW, updatedAt: NOW, workoutId: w.id, completedOn: w.date, actualDurationMin: w.durationMin, rpe: 4, symptomsNoted: false, planned: { title: w.title, sport: w.sport, durationMin: w.durationMin, intensity: w.intensity, date: w.date, stage: w.stage, kind: w.kind } }))
  return { ...s, workouts: completed, results, checkIns: [1, 2, 3, 4, 5].map((n) => checkIn(n, { fatigue: 2, readiness: 4, sleepHours: 8, soreness: 2 })) }
}

function checkIn(daysAgo: number, over: Partial<RecoveryCheckIn> = {}): RecoveryCheckIn {
  return { id: testId('ci'), createdAt: NOW, updatedAt: NOW, date: addDaysISO(TODAY, -daysAgo), sleepHours: 7.5, sleepQuality: 4, fatigue: 2, soreness: 2, mood: 4, readiness: 4, ...over }
}

function inputOf(s: AppState, over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    athlete: s.athlete!,
    availability: s.availability!,
    plan: s.plan!,
    workouts: s.workouts,
    results: s.results,
    checkIns: s.checkIns,
    fuelingLogs: s.fuelingLogs,
    events: s.events,
    restrictions: s.medical.restrictions,
    symptoms: s.medical.symptoms,
    today: TODAY,
    now: NOW,
    idFactory: testId,
    ...over,
  }
}

const symptom = (over: Partial<SymptomReport> = {}): SymptomReport => ({
  id: testId('sym'),
  createdAt: NOW,
  updatedAt: NOW,
  reportedAt: NOW,
  bodyArea: 'Knee',
  symptom: 'Ache',
  severity: 3,
  onset: 'today',
  trend: 'same',
  duringTraining: true,
  atRest: false,
  redFlags: [],
  triage: { level: 'monitor', reasons: [] },
  clinicianReviewed: false,
  ...over,
})

beforeEach(() => resetIds())

describe('readiness: explainable outcomes', () => {
  it('recommends progression only when every gate passes and the score meets the threshold', () => {
    const a = assessReadiness(inputOf(strongState()))
    expect(a.outcome).toBe('progress')
    expect(a.nextStage).toBe('B')
    expect(a.gates.every((g) => g.passed)).toBe(true)
    expect(a.score).toBeGreaterThanOrEqual(DEFAULT_ENGINE_CONFIG.readiness.progressThreshold)
    expect(a.reasons.join(' ')).toMatch(/not medical clearance/i)
  })

  it('explains every factor with a label, weight and detail', () => {
    const a = assessReadiness(inputOf(strongState()))
    expect(a.factors.length).toBeGreaterThanOrEqual(8)
    for (const f of a.factors) {
      expect(f.label).toBeTruthy()
      expect(f.detail).toBeTruthy()
      expect(f.weight).toBeGreaterThan(0)
    }
  })

  it('does NOT progress on elapsed time alone', () => {
    const s = strongState()
    const nothingDone = { ...s, workouts: s.workouts.map((w) => ({ ...w, status: 'planned' as const })), results: [] }
    const a = assessReadiness(inputOf(nothingDone))
    expect(a.outcome).not.toBe('progress')
    expect(a.gates.find((g) => g.id === 'time-in-stage')?.passed).toBe(true)
    expect(a.gates.find((g) => g.id === 'completion')?.passed).toBe(false)
  })

  it('recommends continuing for a brand-new plan with no history, with low confidence', () => {
    const s = makeState()
    const a = assessReadiness(inputOf(s))
    expect(a.outcome).toBe('continue')
    expect(a.confidence).toBe('low')
    expect(a.nextSteps.length).toBeGreaterThan(0)
  })

  it('recommends reducing workload when fatigue is high and recovery is poor', () => {
    const s = strongState()
    const tired = { ...s, checkIns: [1, 2, 3, 4, 5].map((n) => checkIn(n, { fatigue: 5, readiness: 1, sleepHours: 5, soreness: 5 })) }
    const a = assessReadiness(inputOf(tired))
    expect(a.outcome).toBe('reduce')
    expect(a.reasons.join(' ')).toMatch(/fatigue|recovery/i)
  })

  it('recommends reducing workload when most due sessions were missed', () => {
    const s = strongState()
    const missed = { ...s, workouts: s.workouts.map((w) => ({ ...w, status: w.date < TODAY && w.sport !== 'rehab' ? ('planned' as const) : w.status })), results: [] }
    expect(assessReadiness(inputOf(missed)).outcome).toBe('reduce')
  })

  it('uses a configurable threshold', () => {
    const cfg = structuredClone(DEFAULT_ENGINE_CONFIG)
    cfg.readiness.progressThreshold = 101
    expect(assessReadiness(inputOf(strongState(), { config: cfg })).outcome).toBe('continue')
  })

  it('never progresses when the self-reported consistency is below "regular"', () => {
    const s = strongState()
    const weak = { ...s, athlete: { ...s.athlete!, baseline: { ...s.athlete!.baseline, consistency: 'occasional' as const } } }
    const a = assessReadiness(inputOf(weak))
    expect(a.outcome).not.toBe('progress')
    expect(a.gates.find((g) => g.id === 'consistency-level')?.passed).toBe(false)
  })
})

describe('readiness: clinical restrictions always take precedence', () => {
  it('returns clinical-review for an active restriction even when every performance measure is excellent', () => {
    const s = strongState()
    const baseline = assessReadiness(inputOf(s))
    expect(baseline.outcome).toBe('progress')

    const restricted = assessReadiness(inputOf(s, { restrictions: [makeRestriction({ effect: { blockedSports: [], maxIntensity: 'easy' } })] }))
    expect(restricted.outcome).toBe('clinical-review')
    expect(restricted.overrides.join(' ')).toMatch(/no fitness score can override/i)
    expect(restricted.gates.find((g) => g.id === 'clinical')?.passed).toBe(false)
  })

  it('returns clinical-review for a recent urgent symptom report', () => {
    const s = strongState()
    const a = assessReadiness(inputOf(s, { symptoms: [symptom({ triage: { level: 'urgent', reasons: ['x'] }, severity: 8 })] }))
    expect(a.outcome).toBe('clinical-review')
  })

  it('returns clinical-review for an unreviewed worsening symptom', () => {
    const a = assessReadiness(inputOf(strongState(), { symptoms: [symptom({ trend: 'worsening', severity: 5, triage: { level: 'professional-assessment', reasons: ['x'] } })] }))
    expect(a.outcome).toBe('clinical-review')
  })

  it('ignores resolved restrictions, but only because they were explicitly resolved', () => {
    const a = assessReadiness(inputOf(strongState(), { restrictions: [makeRestriction({ status: 'resolved' })] }))
    expect(a.outcome).toBe('progress')
  })

  it('never claims medical clearance', () => {
    const a = assessReadiness(inputOf(strongState()))
    const text = [...a.reasons, ...a.nextSteps].join(' ').toLowerCase()
    expect(text).not.toMatch(/you are (medically )?cleared|guarantee[sd]? (you|race)/)
  })
})
