import { describe, expect, it } from 'vitest'
import {
  availabilityStepSchema,
  baselineStepSchema,
  goalStepSchema,
  profileStepSchema,
  raceEventSchema,
  raceResultSchema,
  recoveryCheckInSchema,
  restrictionSchema,
  symptomReportSchema,
  fuelingTargetsSchema,
  fuelingLogSchema,
  rehabLogSchema,
  workoutResultSchema,
  missedReasonSchema,
} from '@/domain/validation/schemas'

const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) => (r.success ? [] : (r.error?.issues ?? []))
const pathsOf = (r: Parameters<typeof issues>[0]) => issues(r).map((i) => i.path.join('.'))

const baseline = {
  swimSessionsPerWeek: 1, swimMetersPerWeek: 600, comfortableSwimM: 200,
  bikeSessionsPerWeek: 1, bikeMinutesPerWeek: 60, comfortableBikeMin: 40,
  runSessionsPerWeek: 2, runMinutesPerWeek: 60, comfortableRunMin: 15,
  consistency: 'occasional', hasClinicianRestrictions: false,
}

describe('onboarding validation', () => {
  it('requires a display name and enumerated choices', () => {
    const r = profileStepSchema.safeParse({ displayName: '  ', units: 'metric' })
    expect(r.success).toBe(false)
    expect(pathsOf(r)).toEqual(expect.arrayContaining(['displayName', 'ageRange', 'generalExperience', 'swimConfidence', 'openWater', 'bikeExperience', 'runExperience']))
  })

  it('accepts a complete profile and trims text', () => {
    const r = profileStepSchema.safeParse({ displayName: ' Sam ', ageRange: '35-44', units: 'metric', generalExperience: 'beginner', swimConfidence: 'basic', openWater: 'none', bikeExperience: 'beginner', runExperience: 'beginner' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.displayName).toBe('Sam')
  })

  it('accepts a beginner with no optional metrics (no power meter, GPS watch or zones)', () => {
    const r = baselineStepSchema.safeParse(baseline)
    expect(r.success).toBe(true)
  })

  it('treats blank optional numeric fields (NaN from empty inputs) as undefined, not as errors', () => {
    const r = baselineStepSchema.safeParse({ ...baseline, restingHr: NaN, maxHr: NaN, bikeFtpWatts: NaN })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.restingHr).toBeUndefined()
      expect(r.data.bikeFtpWatts).toBeUndefined()
    }
  })

  it('rejects out-of-range optional metrics and an impossible HR pairing', () => {
    expect(baselineStepSchema.safeParse({ ...baseline, restingHr: 5 }).success).toBe(false)
    expect(pathsOf(baselineStepSchema.safeParse({ ...baseline, restingHr: 80, maxHr: 70 }))).toContain('maxHr')
  })

  it('rejects required numbers that are blank (NaN) or negative', () => {
    expect(pathsOf(baselineStepSchema.safeParse({ ...baseline, swimSessionsPerWeek: NaN }))).toContain('swimSessionsPerWeek')
    expect(pathsOf(baselineStepSchema.safeParse({ ...baseline, comfortableRunMin: -5 }))).toContain('comfortableRunMin')
  })

  it('flags inconsistent volume vs frequency', () => {
    expect(pathsOf(baselineStepSchema.safeParse({ ...baseline, swimSessionsPerWeek: 0, swimMetersPerWeek: 500 }))).toContain('swimMetersPerWeek')
  })

  it('requires detail when the athlete reports clinician restrictions', () => {
    expect(pathsOf(baselineStepSchema.safeParse({ ...baseline, hasClinicianRestrictions: true }))).toContain('restrictionDetail')
    expect(baselineStepSchema.safeParse({ ...baseline, hasClinicianRestrictions: true, restrictionDetail: 'No running for 4 weeks' }).success).toBe(true)
  })

  it('requires a performance target only when the intent is performance', () => {
    const goal = { type: 'half-ironman', preferredFormat: 'open-water', intent: 'performance' }
    expect(pathsOf(goalStepSchema.safeParse(goal))).toContain('performanceTarget')
    expect(goalStepSchema.safeParse({ ...goal, performanceTarget: 'Sub 5:30' }).success).toBe(true)
    expect(goalStepSchema.safeParse({ ...goal, intent: 'finish-comfortably' }).success).toBe(true)
  })

  it('accepts an empty target date and rejects malformed ones', () => {
    const goal = { type: 'sprint', preferredFormat: 'no-preference', intent: 'finish-comfortably' }
    expect(goalStepSchema.safeParse({ ...goal, targetEventDate: '' }).success).toBe(true)
    expect(goalStepSchema.safeParse({ ...goal, targetEventDate: '12/05/2026' }).success).toBe(false)
  })

  const avail = { trainingDays: [0, 1, 3, 5], maxHoursPerWeek: 6, restDay: 4, access: { pool: true, bicycle: true, indoorTrainer: false, gym: false, safeRunRoutes: true }, preferredTimes: ['morning'], unavailable: [] }

  it('needs at least two training days, one preferred time and sensible weekly hours', () => {
    expect(availabilityStepSchema.safeParse(avail).success).toBe(true)
    expect(pathsOf(availabilityStepSchema.safeParse({ ...avail, trainingDays: [0] }))).toContain('trainingDays')
    expect(pathsOf(availabilityStepSchema.safeParse({ ...avail, preferredTimes: [] }))).toContain('preferredTimes')
    expect(pathsOf(availabilityStepSchema.safeParse({ ...avail, maxHoursPerWeek: 1 }))).toContain('maxHoursPerWeek')
  })

  it('does not allow the rest day to also be a training day', () => {
    expect(pathsOf(availabilityStepSchema.safeParse({ ...avail, restDay: 1 }))).toContain('restDay')
  })

  it('rejects unavailable ranges that end before they start', () => {
    const r = availabilityStepSchema.safeParse({ ...avail, unavailable: [{ start: '2026-05-10', end: '2026-05-01' }] })
    expect(pathsOf(r)).toContain('unavailable.0.end')
  })
})

describe('daily log validation', () => {
  const ci = { date: '2026-03-02', sleepHours: 7, sleepQuality: 4, fatigue: 2, soreness: 2, mood: 4, readiness: 4 }

  it('accepts a valid check-in and an absent resting heart rate', () => {
    expect(recoveryCheckInSchema.safeParse(ci).success).toBe(true)
    expect(recoveryCheckInSchema.safeParse({ ...ci, restingHr: NaN }).success).toBe(true)
  })

  it('rejects 1–5 scales outside range and impossible sleep', () => {
    expect(recoveryCheckInSchema.safeParse({ ...ci, fatigue: 6 }).success).toBe(false)
    expect(recoveryCheckInSchema.safeParse({ ...ci, mood: 0 }).success).toBe(false)
    expect(recoveryCheckInSchema.safeParse({ ...ci, sleepHours: 30 }).success).toBe(false)
    expect(pathsOf(recoveryCheckInSchema.safeParse({ date: ci.date, sleepHours: 7 }))).toEqual(expect.arrayContaining(['fatigue', 'readiness']))
  })

  it('validates workout results', () => {
    expect(workoutResultSchema.safeParse({ actualDurationMin: 45, rpe: 6, symptomsNoted: false }).success).toBe(true)
    expect(workoutResultSchema.safeParse({ actualDurationMin: 0, rpe: 6, symptomsNoted: false }).success).toBe(false)
    expect(workoutResultSchema.safeParse({ actualDurationMin: 45, rpe: 11, symptomsNoted: false }).success).toBe(false)
  })

  it('requires a short reason for missed sessions', () => {
    expect(missedReasonSchema.safeParse({ reason: 'ab' }).success).toBe(false)
    expect(missedReasonSchema.safeParse({ reason: 'Sick' }).success).toBe(true)
  })

  it('validates fueling targets: max >= min, and a named professional when source is professional', () => {
    const t = { carbsMin: 30, carbsMax: 60, fluidMin: 300, fluidMax: 600, source: 'general-education' }
    expect(fuelingTargetsSchema.safeParse(t).success).toBe(true)
    expect(pathsOf(fuelingTargetsSchema.safeParse({ ...t, carbsMax: 20 }))).toContain('carbsMax')
    expect(pathsOf(fuelingTargetsSchema.safeParse({ ...t, source: 'professional' }))).toContain('setBy')
    expect(fuelingTargetsSchema.safeParse({ ...t, source: 'professional', setBy: 'R. Dietitian' }).success).toBe(true)
    expect(fuelingTargetsSchema.safeParse({ ...t, fluidMax: 5000 }).success).toBe(false)
  })

  it('validates fueling logs', () => {
    expect(fuelingLogSchema.safeParse({ date: '2026-03-02', kind: 'training', tolerance: 4, giSymptoms: false }).success).toBe(true)
    expect(fuelingLogSchema.safeParse({ date: '2026-03-02', kind: 'training', tolerance: 9, giSymptoms: false }).success).toBe(false)
    expect(fuelingLogSchema.safeParse({ date: '2026-03-02', kind: 'training', tolerance: 3, giSymptoms: false, actualCarbsG: NaN }).success).toBe(true)
  })
})

describe('medical validation', () => {
  const sym = { bodyArea: 'Knee', symptom: 'Sharp pain', severity: 4, onset: 'today', trend: 'same', duringTraining: true, atRest: false, redFlags: [] }

  it('validates symptom reports', () => {
    expect(symptomReportSchema.safeParse(sym).success).toBe(true)
    expect(symptomReportSchema.safeParse({ ...sym, severity: 11 }).success).toBe(false)
    expect(symptomReportSchema.safeParse({ ...sym, severity: NaN }).success).toBe(false)
    expect(pathsOf(symptomReportSchema.safeParse({ ...sym, bodyArea: '', symptom: 'x' }))).toEqual(expect.arrayContaining(['bodyArea', 'symptom']))
  })

  const res = { title: 'No running', description: 'Advised by physio', source: 'clinician', clinicianName: 'Dr. Lee', severity: 'modify', blockedSports: ['run'], maxIntensity: 'none' }

  it('requires a clinician name for clinician-sourced restrictions', () => {
    expect(restrictionSchema.safeParse(res).success).toBe(true)
    expect(pathsOf(restrictionSchema.safeParse({ ...res, clinicianName: '' }))).toContain('clinicianName')
    expect(restrictionSchema.safeParse({ ...res, source: 'athlete-reported', clinicianName: '' }).success).toBe(true)
  })

  it('validates rehab logs', () => {
    const log = { exerciseId: 'ex1', setsDone: 3, symptomBefore: 1, symptomDuring: 2, symptomAfter: 1 }
    expect(rehabLogSchema.safeParse(log).success).toBe(true)
    expect(rehabLogSchema.safeParse({ ...log, symptomAfter: 12 }).success).toBe(false)
    expect(rehabLogSchema.safeParse({ ...log, setsDone: NaN }).success).toBe(false)
  })
})

describe('race validation', () => {
  const race = { name: 'City Sprint', date: '2026-07-12', location: 'Lakeside', category: 'sprint', swimM: 750, bikeKm: 20, runKm: 5, priority: 'A' }

  it('validates events', () => {
    expect(raceEventSchema.safeParse(race).success).toBe(true)
    expect(pathsOf(raceEventSchema.safeParse({ ...race, name: '', location: '' }))).toEqual(expect.arrayContaining(['name', 'location']))
    expect(raceEventSchema.safeParse({ ...race, priority: 'Z' }).success).toBe(false)
    expect(raceEventSchema.safeParse({ ...race, bikeKm: 999 }).success).toBe(false)
  })

  it('needs at least one distance', () => {
    expect(raceEventSchema.safeParse({ ...race, swimM: 0, bikeKm: 0, runKm: 0 }).success).toBe(false)
  })

  it('validates self-entered finish times', () => {
    for (const ok of ['2:34:10', '34:10', '12:05:00']) expect(raceResultSchema.safeParse({ finishTime: ok }).success).toBe(true)
    for (const bad of ['abc', '2:3', '99', '']) expect(raceResultSchema.safeParse({ finishTime: bad }).success).toBe(false)
  })
})
