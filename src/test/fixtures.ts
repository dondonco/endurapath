import type { AthleteAvailability, AthleteProfile } from '@/domain/models/athlete'
import type { ClinicalRestriction } from '@/domain/models/health'
import type { RaceEvent } from '@/domain/models/events'
import type { AppState } from '@/domain/models/state'
import { emptyState } from '@/domain/models/state'
import { generatePlan } from '@/domain/training-engine/generator'

export const NOW = '2026-03-02T08:00:00.000Z'
/** A Monday. */
export const TODAY = '2026-03-02'

let n = 0
export const testId = (prefix: string) => `${prefix}_t${String(++n).padStart(4, '0')}`
export const resetIds = () => {
  n = 0
}

export function makeAthlete(over: Partial<AthleteProfile> = {}, baseline: Partial<AthleteProfile['baseline']> = {}): AthleteProfile {
  return {
    id: 'ath_test',
    createdAt: NOW,
    updatedAt: NOW,
    displayName: 'Test Athlete',
    ageRange: '35-44',
    units: 'metric',
    generalExperience: 'beginner',
    swimConfidence: 'basic',
    openWater: 'none',
    bikeExperience: 'beginner',
    runExperience: 'beginner',
    baseline: {
      swimSessionsPerWeek: 1,
      swimMetersPerWeek: 600,
      comfortableSwimM: 200,
      bikeSessionsPerWeek: 1,
      bikeMinutesPerWeek: 60,
      comfortableBikeMin: 40,
      runSessionsPerWeek: 2,
      runMinutesPerWeek: 60,
      comfortableRunMin: 15,
      consistency: 'occasional',
      recentRaces: [],
      hasClinicianRestrictions: false,
      ...baseline,
    },
    goal: { type: 'first-tri', preferredFormat: 'no-preference', intent: 'finish-comfortably' },
    preferences: {
      dietary: ['omnivore'],
      allergies: [],
      equipment: [],
      sleepHoursTypical: 7.5,
      recoveryPattern: 'average',
      professionalSupport: ['none'],
    },
    isDemo: false,
    ...over,
  }
}

export function makeAvailability(over: Partial<AthleteAvailability> = {}): AthleteAvailability {
  return {
    id: 'avl_test',
    createdAt: NOW,
    updatedAt: NOW,
    athleteId: 'ath_test',
    trainingDays: [0, 1, 2, 3, 5, 6],
    maxHoursPerWeek: 6,
    restDay: 4,
    access: { pool: true, bicycle: true, indoorTrainer: true, gym: true, safeRunRoutes: true },
    preferredTimes: ['morning'],
    unavailable: [],
    ...over,
  }
}

export function makeRestriction(over: Partial<ClinicalRestriction> = {}): ClinicalRestriction {
  return {
    id: 'res_test',
    createdAt: NOW,
    updatedAt: NOW,
    title: 'No running',
    description: 'Test restriction',
    source: 'clinician',
    clinicianName: 'Dr. Test',
    severity: 'modify',
    effect: { blockedSports: ['run'], maxIntensity: 'easy' },
    status: 'active',
    ...over,
  }
}

/** A fully onboarded state with a generated plan. Dates are injected so tests are deterministic. */
export function makeState(opts: { athlete?: AthleteProfile; availability?: AthleteAvailability; events?: RaceEvent[]; restrictions?: ClinicalRestriction[]; planStart?: string; startStage?: 'A' | 'B' | 'C' | 'D' } = {}): AppState {
  const athlete = opts.athlete ?? makeAthlete()
  const availability = opts.availability ?? makeAvailability()
  const events = opts.events ?? []
  const restrictions = opts.restrictions ?? []
  const g = generatePlan({ athlete, availability, events, restrictions, today: TODAY, now: NOW, idFactory: testId, planStart: opts.planStart, startStageOverride: opts.startStage })
  return {
    ...emptyState(NOW),
    onboarded: true,
    athlete,
    availability,
    plan: g.plan,
    workouts: g.workouts,
    events,
    medical: { restrictions, symptoms: [], rehabPlans: [], rehabLogs: [] },
  }
}

export const env = (over: { today?: string; now?: string } = {}) => ({ now: over.now ?? NOW, today: over.today ?? TODAY, mk: testId })

export function makeEvent(over: Partial<RaceEvent> = {}): RaceEvent {
  return {
    id: 'evt_test',
    createdAt: NOW,
    updatedAt: NOW,
    name: 'Test Race',
    date: '2026-09-06',
    location: 'Somewhere',
    category: 'sprint',
    swimM: 750,
    bikeKm: 20,
    runKm: 5,
    priority: 'A',
    targetOutcome: 'Finish',
    checklist: [],
    status: 'planned',
    ...over,
  }
}
