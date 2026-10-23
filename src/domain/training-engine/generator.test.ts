import { beforeEach, describe, expect, it } from 'vitest'
import { generatePlan } from '@/domain/training-engine/generator'
import { DEFAULT_ENGINE_CONFIG } from '@/domain/training-engine/config'
import { dayIndex, mondayOf } from '@/lib/dates'
import { makeAthlete, makeAvailability, makeEvent, makeRestriction, NOW, resetIds, TODAY, testId } from '@/test/fixtures'

function gen(over: Partial<Parameters<typeof generatePlan>[0]> = {}) {
  return generatePlan({
    athlete: makeAthlete(),
    availability: makeAvailability(),
    events: [],
    restrictions: [],
    today: TODAY,
    now: NOW,
    idFactory: testId,
    ...over,
  })
}

beforeEach(() => resetIds())

describe('plan generation', () => {
  it('is deterministic for identical input', () => {
    resetIds()
    const a = gen()
    resetIds()
    const b = gen()
    expect(b).toEqual(a)
  })

  it('creates a plan and detailed workouts with every required field', () => {
    const { plan, workouts } = gen()
    expect(plan.weeks.length).toBeGreaterThan(0)
    expect(workouts.length).toBeGreaterThan(0)
    for (const w of workouts) {
      expect(w.title).toBeTruthy()
      expect(w.sport).toBeTruthy()
      expect(w.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(w.durationMin).toBeGreaterThan(0)
      expect(w.target.rpe).toHaveLength(2)
      expect(w.warmup).toBeTruthy()
      expect(w.mainSet).toBeTruthy()
      expect(w.cooldown).toBeTruthy()
      expect(w.purpose).toBeTruthy()
      expect(w.coachingNotes).toBeTruthy()
      expect(w.status).toBe('planned')
    }
  })

  it('starts a beginner with a first-triathlon goal in Stage A', () => {
    const { plan } = gen()
    expect(plan.currentStage).toBe('A')
    expect(plan.goalType).toBe('first-tri')
  })

  it('starts a beginner with an IRONMAN goal in Stage A and records prerequisites rather than skipping stages', () => {
    const { plan, pathway } = gen({ athlete: makeAthlete({ goal: { type: 'ironman', preferredFormat: 'no-preference', intent: 'finish-comfortably' } }) })
    expect(plan.currentStage).toBe('A')
    expect(plan.targetStage).toBe('D')
    expect(plan.prerequisites.length).toBeGreaterThan(0)
    expect(pathway.pathway.length).toBeGreaterThanOrEqual(4)
  })

  it('uses configurable (not fixed) preparation ranges', () => {
    const cfg = structuredClone(DEFAULT_ENGINE_CONFIG)
    cfg.stages.A.minWeeks = 4
    cfg.stages.A.maxWeeks = 6
    const { plan } = gen({ config: cfg })
    const a = plan.pathway.find((p) => p.stage === 'A')
    expect(a?.minWeeks).toBe(4)
    expect(a?.maxWeeks).toBe(6)
  })

  it('never builds more than the planned horizon of detailed weeks', () => {
    const { workouts } = gen()
    const weeks = new Set(workouts.map((w) => w.weekStart))
    expect(weeks.size).toBeLessThanOrEqual(DEFAULT_ENGINE_CONFIG.horizonWeeks)
  })

  it('does not make every session high intensity', () => {
    const { workouts } = gen()
    const byWeek = new Map<string, typeof workouts>()
    workouts.forEach((w) => byWeek.set(w.weekStart, [...(byWeek.get(w.weekStart) ?? []), w]))
    for (const [, ws] of byWeek) {
      const hard = ws.filter((w) => w.intensity === 'hard').length
      expect(hard).toBeLessThanOrEqual(DEFAULT_ENGINE_CONFIG.stages.A.maxHardSessionsPerWeek)
      expect(hard).toBeLessThan(ws.length)
    }
  })
})

describe('schedule availability constraints', () => {
  it('only schedules training sessions on available training days and never on the rest day', () => {
    const availability = makeAvailability({ trainingDays: [1, 3, 5, 6], restDay: 6 })
    const { workouts } = gen({ availability })
    for (const w of workouts.filter((x) => x.sport !== 'rehab')) {
      const d = dayIndex(w.date)
      expect(availability.trainingDays).toContain(d)
      expect(d).not.toBe(6)
    }
  })

  it('avoids unavailable date ranges', () => {
    const availability = makeAvailability({ unavailable: [{ id: 'u1', start: '2026-03-09', end: '2026-03-15' }] })
    const { workouts } = gen({ availability })
    expect(workouts.some((w) => w.date >= '2026-03-09' && w.date <= '2026-03-15')).toBe(false)
  })

  it('respects the maximum weekly hours', () => {
    const availability = makeAvailability({ maxHoursPerWeek: 4 })
    const { workouts } = gen({ availability })
    const totals = new Map<string, number>()
    workouts.filter((w) => w.sport !== 'rehab').forEach((w) => totals.set(w.weekStart, (totals.get(w.weekStart) ?? 0) + w.durationMin))
    for (const [, mins] of totals) expect(mins).toBeLessThanOrEqual(4 * 60 + 5)
  })

  it('keeps swimming in the plan without a pool but flags the missing access in the guidance', () => {
    const availability = makeAvailability({ access: { pool: false, bicycle: true, indoorTrainer: true, gym: true, safeRunRoutes: true } })
    const { workouts } = gen({ availability })
    const swims = workouts.filter((w) => w.sport === 'swim')
    expect(swims.length).toBeGreaterThan(0)
    expect(swims.some((w) => /no pool access/i.test(w.coachingNotes))).toBe(true)
  })

  it('does not schedule training on race day', () => {
    const race = makeEvent({ date: '2026-03-14', priority: 'A', category: 'sprint' })
    const { workouts } = gen({ events: [race], athlete: makeAthlete({ goal: { type: 'sprint', targetEventDate: race.date, preferredFormat: 'no-preference', intent: 'finish-comfortably' } }) })
    expect(workouts.filter((w) => w.date === race.date && w.sport !== 'rehab')).toHaveLength(0)
  })
})

describe('recovery-week behaviour', () => {
  it('inserts recovery weeks with lower volume than the surrounding load weeks', () => {
    const { plan } = gen({ athlete: makeAthlete({ goal: { type: 'half-ironman', preferredFormat: 'no-preference', intent: 'finish-comfortably' } }, { consistency: 'very-consistent' }) })
    const recovery = plan.weeks.filter((w) => w.isRecoveryWeek)
    expect(recovery.length).toBeGreaterThan(0)
    for (const r of recovery) {
      const prev = plan.weeks[r.index - 1]
      if (prev && !prev.isRecoveryWeek) expect(r.targetMinutes).toBeLessThan(prev.targetMinutes)
      expect(r.volumeFactor).toBeLessThan(1)
    }
  })

  it('never ramps weekly minutes beyond the configured soft ceiling', () => {
    const { plan } = gen()
    const loads = plan.weeks.filter((w) => !w.isRecoveryWeek)
    for (let i = 1; i < loads.length; i++) {
      const prev = loads[i - 1]
      const cur = loads[i]
      if (prev.stage !== cur.stage) continue
      const limit = Math.max(prev.targetMinutes * (1 + DEFAULT_ENGINE_CONFIG.maxWeeklyIncrease), prev.targetMinutes + DEFAULT_ENGINE_CONFIG.maxWeeklyIncreaseMin) + 5
      expect(cur.targetMinutes).toBeLessThanOrEqual(limit)
    }
  })

  it('tapers before an A race', () => {
    const race = makeEvent({ date: '2026-05-10', priority: 'A', category: 'sprint' })
    const { plan } = gen({ events: [race], athlete: makeAthlete({ goal: { type: 'sprint', targetEventDate: race.date, preferredFormat: 'no-preference', intent: 'finish-comfortably' } }) })
    expect(plan.weeks.some((w) => w.phaseType === 'taper')).toBe(true)
    const raceWeek = plan.weeks.find((w) => w.weekStart === mondayOf(race.date))
    expect(raceWeek).toBeDefined()
  })
})

describe('clinical restriction enforcement in generation', () => {
  it('never schedules a blocked sport while a restriction is active', () => {
    const { workouts } = gen({ restrictions: [makeRestriction({ effect: { blockedSports: ['run'] } })] })
    expect(workouts.some((w) => w.sport === 'run' || w.sport === 'brick')).toBe(false)
  })

  it('caps intensity at the restriction limit', () => {
    const { workouts } = gen({ restrictions: [makeRestriction({ effect: { blockedSports: [], maxIntensity: 'easy' } })] })
    expect(workouts.some((w) => w.intensity === 'hard' || w.intensity === 'moderate')).toBe(false)
  })

  it('schedules no training at all when training is paused', () => {
    const { workouts } = gen({ restrictions: [makeRestriction({ severity: 'pause', effect: { blockedSports: [], pauseAllTraining: true } })] })
    expect(workouts.filter((w) => w.sport !== 'rehab')).toHaveLength(0)
  })

  it('ignores resolved restrictions only because they are explicitly resolved', () => {
    const { workouts } = gen({ restrictions: [makeRestriction({ status: 'resolved' })] })
    expect(workouts.some((w) => w.sport === 'run')).toBe(true)
  })
})
