import type { AppState } from '../models/state'
import type { OnboardingInput } from '../validation/schemas'
import { formatPaceInput } from './build'

type DeepPartial<T> = T extends (infer U)[] ? DeepPartial<U>[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T
export type OnboardingDefaults = DeepPartial<OnboardingInput>

/** Fresh-start values. Required choices are left unset so validation asks the athlete to make them. */
export function blankOnboardingValues(): OnboardingDefaults {
  return {
    profile: { displayName: '', units: 'metric', healthNotes: '' },
    baseline: {
      swimSessionsPerWeek: 0,
      swimMetersPerWeek: 0,
      comfortableSwimM: 0,
      bikeSessionsPerWeek: 0,
      bikeMinutesPerWeek: 0,
      comfortableBikeMin: 0,
      runSessionsPerWeek: 0,
      runMinutesPerWeek: 0,
      comfortableRunMin: 0,
      recentRaceName: '',
      recentRaceTime: '',
      runPace: '',
      injuryNote: '',
      hasClinicianRestrictions: false,
      restrictionDetail: '',
    },
    goal: { eventName: '', targetEventDate: '', intermediateEvents: '', preferredFormat: 'no-preference', intent: 'finish-comfortably', performanceTarget: '' },
    availability: {
      trainingDays: [1, 3, 5, 6],
      maxHoursPerWeek: 6,
      restDay: 0,
      constraints: '',
      access: { pool: true, bicycle: true, indoorTrainer: false, gym: false, safeRunRoutes: true },
      preferredTimes: ['morning'],
      unavailable: [],
    },
    preferences: { dietary: ['omnivore'], allergies: '', equipment: [], sleepHoursTypical: 7, recoveryPattern: 'average', fatigueNote: '', professionalSupport: [] },
  }
}

/** Pre-fills the wizard from a real (non-sample) saved profile so editing never starts from scratch. */
export function onboardingValuesFromState(s: AppState): OnboardingDefaults | null {
  const a = s.athlete
  const v = s.availability
  if (!a || !v || s.isSampleData) return null
  const b = a.baseline
  const restriction = s.medical.restrictions.find((r) => r.title === 'Restriction disclosed at onboarding' && r.status === 'active')
  return {
    profile: {
      displayName: a.displayName,
      ageRange: a.ageRange,
      units: a.units,
      generalExperience: a.generalExperience,
      swimConfidence: a.swimConfidence,
      openWater: a.openWater,
      bikeExperience: a.bikeExperience,
      runExperience: a.runExperience,
      healthNotes: a.healthNotes ?? '',
    },
    baseline: {
      swimSessionsPerWeek: b.swimSessionsPerWeek,
      swimMetersPerWeek: b.swimMetersPerWeek,
      comfortableSwimM: b.comfortableSwimM,
      bikeSessionsPerWeek: b.bikeSessionsPerWeek,
      bikeMinutesPerWeek: b.bikeMinutesPerWeek,
      comfortableBikeMin: b.comfortableBikeMin,
      runSessionsPerWeek: b.runSessionsPerWeek,
      runMinutesPerWeek: b.runMinutesPerWeek,
      comfortableRunMin: b.comfortableRunMin,
      consistency: b.consistency,
      recentRaceName: b.recentRaces[0]?.name ?? '',
      recentRaceCategory: b.recentRaces[0]?.category,
      recentRaceTime: b.recentRaces[0]?.finishTime ?? '',
      restingHr: b.restingHr,
      maxHr: b.maxHr,
      runPace: formatPaceInput(b.runThresholdPaceSecPerKm),
      bikeFtpWatts: b.bikeFtpWatts,
      injuryNote: b.injuryNote ?? '',
      hasClinicianRestrictions: b.hasClinicianRestrictions,
      restrictionDetail: restriction?.description ?? '',
    },
    goal: {
      type: a.goal.type,
      targetEventDate: a.goal.targetEventDate ?? '',
      eventName: s.events.find((e) => e.id === s.plan?.primaryEventId)?.name ?? '',
      intermediateEvents: a.goal.intermediateEvents ?? '',
      preferredFormat: a.goal.preferredFormat,
      intent: a.goal.intent,
      performanceTarget: a.goal.performanceTarget ?? '',
    },
    availability: {
      trainingDays: [...v.trainingDays],
      maxHoursPerWeek: v.maxHoursPerWeek,
      restDay: v.restDay ?? -1,
      constraints: v.constraints ?? '',
      access: { ...v.access },
      preferredTimes: [...v.preferredTimes],
      unavailable: v.unavailable.map((u) => ({ start: u.start, end: u.end, reason: u.reason ?? '' })),
    },
    preferences: {
      dietary: [...a.preferences.dietary],
      allergies: a.preferences.allergies.join(', '),
      equipment: [...a.preferences.equipment],
      sleepHoursTypical: a.preferences.sleepHoursTypical,
      recoveryPattern: a.preferences.recoveryPattern,
      fatigueNote: a.preferences.fatigueNote ?? '',
      professionalSupport: a.preferences.professionalSupport.filter((p) => p !== 'none'),
    },
  }
}
