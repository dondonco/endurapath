import { describe, expect, it } from 'vitest'
import { allergensFrom, loadLevelFor, mealSuggestions, MEALS, POST_WORKOUT_GUIDANCE } from '@/domain/nutrition/meals'
import { buildAlerts, buildTeamUpdates, todaysSessions } from '@/domain/analytics/dashboard'
import { weekStats, missedWorkouts, nextWorkout } from '@/domain/analytics/selectors'
import { defaultChecklist } from '@/domain/events/checklist'
import { blankOnboardingValues } from '@/domain/onboarding/defaults'
import { onboardingSchema } from '@/domain/validation/schemas'
import { addRestrictionOp, completeWorkoutOp, isError } from '@/domain/operations/app-ops'
import { buildPathway } from '@/domain/training-engine/pathway'
import { addDaysISO } from '@/lib/dates'
import { env, makeAthlete, makeAvailability, makeEvent, makeState, TODAY, testId } from '@/test/fixtures'

describe('meal suggestions', () => {
  const names = (o: Parameters<typeof mealSuggestions>[0]) => mealSuggestions(o).map((m) => m.name.toLowerCase())

  it('excludes meals that contain a stated allergen', () => {
    const list = names({ dietary: ['omnivore'], allergies: ['Peanuts', 'shellfish', 'egg'], load: 'moderate', perSlot: 10 })
    expect(list.length).toBeGreaterThan(0)
    expect(list.some((n) => /egg/.test(n))).toBe(false)
    expect(list.some((n) => /apple slices with nut butter/.test(n))).toBe(false)
  })

  it('applies every selected dietary pattern strictly', () => {
    const vegan = mealSuggestions({ dietary: ['vegan'], allergies: [], load: 'heavy', perSlot: 10 })
    expect(vegan.length).toBeGreaterThan(0)
    for (const m of vegan) expect(MEALS.find((x) => x.name === m.name)?.diets).toContain('vegan')
    const gf = mealSuggestions({ dietary: ['gluten-free'], allergies: [], load: 'moderate', perSlot: 10 })
    for (const m of gf) expect(MEALS.find((x) => x.name === m.name)?.contains).not.toContain('gluten')
  })

  it('always offers something for each meal slot with a typical profile', () => {
    const slots = new Set(mealSuggestions({ dietary: ['omnivore'], allergies: [], load: 'light' }).map((m) => m.slot))
    expect(slots).toEqual(new Set(['breakfast', 'lunch', 'dinner', 'snack']))
  })

  it('maps free-text allergy lists to tracked allergens', () => {
    expect(allergensFrom(['Tree nuts, dairy'])).toEqual(expect.arrayContaining(['nuts', 'dairy']))
    expect(allergensFrom([])).toEqual([])
  })

  it('scales load by duration and intensity, and never gives a forced-hydration instruction', () => {
    expect(loadLevelFor(0, false)).toBe('rest')
    expect(loadLevelFor(30, false)).toBe('light')
    expect(loadLevelFor(75, false)).toBe('moderate')
    expect(loadLevelFor(80, true)).toBe('heavy')
    expect(loadLevelFor(150, false)).toBe('heavy')
    const text = Object.values(POST_WORKOUT_GUIDANCE).flat().join(' ').toLowerCase()
    expect(text).not.toMatch(/drink as much as|force fluids|\d+\s?(litres|liters|l)\b/)
  })
})

describe('dashboard metrics derive from state', () => {
  it('counts planned versus completed sessions for the week', () => {
    const s = makeState()
    const monday = s.workouts[0].weekStart
    const before = weekStats(s, monday, TODAY)
    expect(before.completedSessions).toBe(0)
    expect(before.plannedSessions).toBeGreaterThan(0)
    const first = s.workouts.find((w) => w.weekStart === monday && w.sport !== 'rehab')!
    const done = completeWorkoutOp(s, first.id, { actualDurationMin: first.durationMin, rpe: 4, symptomsNoted: false }, env())
    if (isError(done)) throw new Error(done.error)
    const after = weekStats(done, monday, TODAY)
    expect(after.completedSessions).toBe(1)
    expect(after.completedMin).toBe(first.durationMin)
  })

  it('finds the next workout and today’s sessions', () => {
    const s = makeState()
    const next = nextWorkout(s.workouts, TODAY)
    expect(next).toBeDefined()
    expect(next!.date >= TODAY).toBe(true)
    expect(todaysSessions(s, TODAY).list.every((w) => w.date === TODAY)).toBe(true)
  })

  it('identifies missed sessions only when a past planned session is unlogged', () => {
    const s = makeState()
    expect(missedWorkouts(s.workouts, TODAY, 7)).toHaveLength(0)
    expect(missedWorkouts(s.workouts, addDaysISO(TODAY, 3), 7).length).toBeGreaterThan(0)
  })

  it('alerts for incomplete check-ins, an upcoming race and clinical restrictions', () => {
    let s = makeState({ events: [makeEvent({ date: addDaysISO(TODAY, 20) })] })
    const ids = buildAlerts(s, TODAY).map((a) => a.id)
    expect(ids).toContain('checkin')
    expect(ids.some((id) => id.startsWith('race-'))).toBe(true)

    const res = addRestrictionOp(s, { title: 'Pause', description: 'Rest', source: 'clinician', clinicianName: 'Dr Lee', severity: 'pause', blockedSports: [], maxIntensity: 'none' }, env())
    if (isError(res)) throw new Error(res.error)
    s = res
    const alerts = buildAlerts(s, TODAY)
    expect(alerts.find((a) => a.id === 'pause')?.severity).toBe('critical')
  })

  it('produces at most one data-derived update per persona', () => {
    const updates = buildTeamUpdates(makeState(), TODAY)
    const personas = updates.map((u) => u.persona)
    expect(new Set(personas).size).toBe(personas.length)
  })
})

describe('events', () => {
  it('provides a race-preparation checklist across all four categories', () => {
    const items = defaultChecklist('sprint', testId)
    expect(new Set(items.map((i) => i.category))).toEqual(new Set(['equipment', 'nutrition', 'travel', 'transition']))
    expect(items.every((i) => !i.done)).toBe(true)
    expect(defaultChecklist('ironman', testId).length).toBeGreaterThan(items.length)
  })
})

describe('pathway: later goals evaluate the baseline and surface prerequisites', () => {
  const avail = makeAvailability()

  it('starts a novice with an IRONMAN goal at Stage A and lists unmet prerequisites for later stages', () => {
    const p = buildPathway(makeAthlete({ goal: { type: 'ironman', preferredFormat: 'no-preference', intent: 'finish-comfortably' } }), avail)
    expect(p.startStage).toBe('A')
    expect(p.goalStage).toBe('D')
    expect(p.prerequisites.some((x) => !x.met)).toBe(true)
    expect(p.total.min).toBeGreaterThan(0)
    expect(p.total.max).toBeGreaterThanOrEqual(p.total.min)
  })

  it('starts a strong, experienced athlete beyond Stage A, never earlier than the baseline supports', () => {
    const strong = makeAthlete(
      { generalExperience: 'advanced', goal: { type: 'half-ironman', preferredFormat: 'open-water', intent: 'finish-comfortably' } },
      { consistency: 'very-consistent', comfortableSwimM: 2000, comfortableBikeMin: 150, comfortableRunMin: 80, swimMetersPerWeek: 4000, swimSessionsPerWeek: 3, bikeMinutesPerWeek: 300, bikeSessionsPerWeek: 3, runMinutesPerWeek: 200, runSessionsPerWeek: 3, recentRaces: [{ id: 'r', name: 'Olympic', category: 'olympic' }] },
    )
    const p = buildPathway(strong, makeAvailability({ maxHoursPerWeek: 10 }))
    expect(['B', 'C']).toContain(p.startStage)
  })

  it('warns when the weekly time available is below what the goal typically needs', () => {
    const p = buildPathway(makeAthlete({ goal: { type: 'ironman', preferredFormat: 'no-preference', intent: 'finish-comfortably' } }), makeAvailability({ maxHoursPerWeek: 4 }))
    expect(p.warnings.join(' ')).toMatch(/h\/week/)
  })
})

describe('onboarding defaults', () => {
  it('blank values fail validation (so required inputs are enforced)', () => {
    expect(onboardingSchema.safeParse(blankOnboardingValues()).success).toBe(false)
  })
})
