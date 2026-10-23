import { z } from 'zod'
import { GOAL_TYPES, TIMES_OF_DAY } from '../models/common'

/** Blank numeric inputs (NaN from `valueAsNumber`) become `undefined`. */
export const optionalNumber = (min: number, max: number, label: string) =>
  z
    .union([
      z.nan().transform(() => undefined),
      z
        .number({ error: `${label} must be a number` })
        .min(min, `${label} must be at least ${min}`)
        .max(max, `${label} must be at most ${max}`),
    ])
    .optional()

export const requiredNumber = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label} is required` })
    .refine((n) => !Number.isNaN(n), `${label} is required`)
    .refine((n) => n >= min, `${label} must be at least ${min}`)
    .refine((n) => n <= max, `${label} must be at most ${max}`)

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
const optionalIsoDate = z.union([z.literal(''), isoDate]).optional()

const trimmed = (label: string, min = 1, max = 80) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`)

/* ----------------------------- Onboarding steps ----------------------------- */

export const profileStepSchema = z.object({
  displayName: trimmed('Preferred name', 1, 40),
  ageRange: z.enum(['18-24', '25-34', '35-44', '45-54', '55-64', '65+'], { error: 'Choose an age range' }),
  units: z.enum(['metric', 'imperial']),
  generalExperience: z.enum(['none', 'beginner', 'intermediate', 'advanced'], { error: 'Choose your experience' }),
  swimConfidence: z.enum(['learning', 'basic', 'comfortable', 'strong'], { error: 'Choose your swim confidence' }),
  openWater: z.enum(['none', 'some', 'regular'], { error: 'Choose your open-water experience' }),
  bikeExperience: z.enum(['none', 'beginner', 'intermediate', 'advanced'], { error: 'Choose your cycling experience' }),
  runExperience: z.enum(['none', 'beginner', 'intermediate', 'advanced'], { error: 'Choose your running experience' }),
  healthNotes: z.string().trim().max(400, 'Keep this under 400 characters').optional(),
})

export const baselineStepSchema = z
  .object({
    swimSessionsPerWeek: requiredNumber(0, 7, 'Swim sessions'),
    swimMetersPerWeek: requiredNumber(0, 30000, 'Weekly swim volume'),
    comfortableSwimM: requiredNumber(0, 10000, 'Comfortable swim distance'),
    bikeSessionsPerWeek: requiredNumber(0, 7, 'Bike sessions'),
    bikeMinutesPerWeek: requiredNumber(0, 1500, 'Weekly bike time'),
    comfortableBikeMin: requiredNumber(0, 600, 'Comfortable ride length'),
    runSessionsPerWeek: requiredNumber(0, 7, 'Run sessions'),
    runMinutesPerWeek: requiredNumber(0, 1200, 'Weekly run time'),
    comfortableRunMin: requiredNumber(0, 360, 'Comfortable run length'),
    consistency: z.enum(['none', 'occasional', 'regular', 'very-consistent'], { error: 'Choose your recent consistency' }),
    recentRaceName: z.string().trim().max(80).optional(),
    recentRaceCategory: z.union([z.enum([...GOAL_TYPES, 'other']), z.literal('')]).optional(),
    recentRaceTime: z
      .string()
      .trim()
      .regex(/^(\d{1,2}:)?\d{1,2}:\d{2}$/, 'Use h:mm:ss or mm:ss')
      .optional()
      .or(z.literal('')),
    restingHr: optionalNumber(30, 120, 'Resting heart rate'),
    maxHr: optionalNumber(120, 230, 'Max heart rate'),
    runPace: z
      .string()
      .trim()
      .regex(/^\d{1,2}:\d{2}$/, 'Use mm:ss')
      .optional()
      .or(z.literal('')),
    bikeFtpWatts: optionalNumber(50, 600, 'Cycling power'),
    injuryNote: z.string().trim().max(400, 'Keep this under 400 characters').optional(),
    hasClinicianRestrictions: z.boolean(),
    restrictionDetail: z.string().trim().max(400).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.swimSessionsPerWeek === 0 && v.swimMetersPerWeek > 0)
      ctx.addIssue({ code: 'custom', path: ['swimMetersPerWeek'], message: 'Set swim sessions above 0 or volume to 0' })
    if (v.bikeSessionsPerWeek === 0 && v.bikeMinutesPerWeek > 0)
      ctx.addIssue({ code: 'custom', path: ['bikeMinutesPerWeek'], message: 'Set bike sessions above 0 or time to 0' })
    if (v.runSessionsPerWeek === 0 && v.runMinutesPerWeek > 0)
      ctx.addIssue({ code: 'custom', path: ['runMinutesPerWeek'], message: 'Set run sessions above 0 or time to 0' })
    if (v.hasClinicianRestrictions && !v.restrictionDetail?.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['restrictionDetail'],
        message: 'Describe the restriction your clinician gave you, so the plan can respect it',
      })
    if (v.maxHr && v.restingHr && v.maxHr <= v.restingHr)
      ctx.addIssue({ code: 'custom', path: ['maxHr'], message: 'Max heart rate must be above resting heart rate' })
  })

export const goalStepSchema = z
  .object({
    type: z.enum(GOAL_TYPES, { error: 'Choose a goal' }),
    targetEventDate: optionalIsoDate,
    eventName: z.string().trim().max(80).optional(),
    intermediateEvents: z.string().trim().max(300).optional(),
    preferredFormat: z.enum(['open-water', 'pool-swim', 'no-preference']),
    intent: z.enum(['finish-comfortably', 'performance']),
    performanceTarget: z.string().trim().max(120).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.intent === 'performance' && !v.performanceTarget?.trim())
      ctx.addIssue({ code: 'custom', path: ['performanceTarget'], message: 'Describe your performance target' })
  })

export const availabilityStepSchema = z
  .object({
    trainingDays: z.array(z.number().int().min(0).max(6)).min(2, 'Choose at least 2 training days'),
    maxHoursPerWeek: requiredNumber(2, 30, 'Weekly hours'),
    restDay: z.number().int().min(-1).max(6),
    constraints: z.string().trim().max(300).optional(),
    access: z.object({
      pool: z.boolean(),
      bicycle: z.boolean(),
      indoorTrainer: z.boolean(),
      gym: z.boolean(),
      safeRunRoutes: z.boolean(),
    }),
    preferredTimes: z.array(z.enum(TIMES_OF_DAY)).min(1, 'Choose at least one preferred time'),
    unavailable: z
      .array(
        z.object({
          start: isoDate,
          end: isoDate,
          reason: z.string().trim().max(80).optional(),
        }),
      )
      .max(10),
  })
  .superRefine((v, ctx) => {
    if (v.restDay >= 0 && v.trainingDays.includes(v.restDay))
      ctx.addIssue({ code: 'custom', path: ['restDay'], message: 'Your rest day cannot also be a training day' })
    v.unavailable.forEach((r, i) => {
      if (r.end < r.start)
        ctx.addIssue({ code: 'custom', path: ['unavailable', i, 'end'], message: 'End date must be on or after the start date' })
    })
  })

export const preferencesStepSchema = z.object({
  dietary: z.array(
    z.enum(['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'gluten-free', 'dairy-free', 'halal', 'kosher']),
  ),
  allergies: z.string().trim().max(200, 'Keep this under 200 characters').optional(),
  equipment: z.array(z.string()),
  sleepHoursTypical: requiredNumber(3, 12, 'Typical sleep'),
  recoveryPattern: z.enum(['recover-quickly', 'average', 'recover-slowly']),
  fatigueNote: z.string().trim().max(300).optional(),
  professionalSupport: z.array(z.enum(['coach', 'nutritionist', 'physiotherapist', 'physician', 'none'])),
})

export const onboardingSchema = z.object({
  profile: profileStepSchema,
  baseline: baselineStepSchema,
  goal: goalStepSchema,
  availability: availabilityStepSchema,
  preferences: preferencesStepSchema,
})

export type OnboardingInput = z.input<typeof onboardingSchema>
export type OnboardingValues = z.output<typeof onboardingSchema>

export const ONBOARDING_STEP_KEYS = ['profile', 'baseline', 'goal', 'availability', 'preferences'] as const
export type OnboardingStepKey = (typeof ONBOARDING_STEP_KEYS)[number]

export const ONBOARDING_STEP_SCHEMAS = {
  profile: profileStepSchema,
  baseline: baselineStepSchema,
  goal: goalStepSchema,
  availability: availabilityStepSchema,
  preferences: preferencesStepSchema,
} as const

/* --------------------------------- Daily logs --------------------------------- */

const scale = (label: string) =>
  z
    .number({ error: `${label} is required` })
    .int()
    .min(1, `${label}: choose 1–5`)
    .max(5, `${label}: choose 1–5`)

export const recoveryCheckInSchema = z.object({
  date: isoDate,
  sleepHours: requiredNumber(0, 16, 'Sleep'),
  sleepQuality: scale('Sleep quality'),
  fatigue: scale('Fatigue'),
  soreness: scale('Soreness'),
  mood: scale('Mood'),
  readiness: scale('Readiness'),
  restingHr: optionalNumber(30, 120, 'Resting heart rate'),
  notes: z.string().trim().max(300).optional(),
})
export type RecoveryCheckInInput = z.input<typeof recoveryCheckInSchema>

export const workoutResultSchema = z.object({
  actualDurationMin: requiredNumber(1, 900, 'Duration'),
  actualDistanceM: optionalNumber(0, 400000, 'Distance'),
  rpe: requiredNumber(1, 10, 'Perceived effort'),
  feeling: z.number().int().min(1).max(5).optional(),
  notes: z.string().trim().max(500).optional(),
  symptomsNoted: z.boolean(),
})
export type WorkoutResultInput = z.input<typeof workoutResultSchema>

export const symptomReportSchema = z.object({
  bodyArea: trimmed('Body area', 1, 60),
  symptom: trimmed('Symptom', 3, 200),
  severity: requiredNumber(0, 10, 'Severity'),
  onset: z.enum(['today', 'few-days', 'week-plus']),
  trend: z.enum(['improving', 'same', 'worsening']),
  duringTraining: z.boolean(),
  atRest: z.boolean(),
  redFlags: z.array(z.string()),
  notes: z.string().trim().max(500).optional(),
})
export type SymptomReportInput = z.input<typeof symptomReportSchema>

export const fuelingLogSchema = z.object({
  date: isoDate,
  kind: z.enum(['training', 'race-rehearsal']),
  workoutId: z.string().optional(),
  eventId: z.string().optional(),
  plannedCarbsG: optionalNumber(0, 600, 'Planned carbohydrate'),
  actualCarbsG: optionalNumber(0, 600, 'Actual carbohydrate'),
  plannedFluidMl: optionalNumber(0, 6000, 'Planned fluid'),
  actualFluidMl: optionalNumber(0, 6000, 'Actual fluid'),
  products: z.string().trim().max(200).optional(),
  tolerance: scale('Tolerance'),
  giSymptoms: z.boolean(),
  notes: z.string().trim().max(300).optional(),
})
export type FuelingLogInput = z.input<typeof fuelingLogSchema>

export const fuelingTargetsSchema = z
  .object({
    carbsMin: requiredNumber(0, 120, 'Minimum carbohydrate'),
    carbsMax: requiredNumber(0, 120, 'Maximum carbohydrate'),
    fluidMin: requiredNumber(0, 1500, 'Minimum fluid'),
    fluidMax: requiredNumber(0, 1500, 'Maximum fluid'),
    source: z.enum(['general-education', 'professional']),
    setBy: z.string().trim().max(80).optional(),
    sodiumNote: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.carbsMax < v.carbsMin)
      ctx.addIssue({ code: 'custom', path: ['carbsMax'], message: 'Maximum must be at least the minimum' })
    if (v.fluidMax < v.fluidMin)
      ctx.addIssue({ code: 'custom', path: ['fluidMax'], message: 'Maximum must be at least the minimum' })
    if (v.source === 'professional' && !v.setBy?.trim())
      ctx.addIssue({ code: 'custom', path: ['setBy'], message: 'Enter the name of the professional who set these targets' })
  })
export type FuelingTargetsInput = z.input<typeof fuelingTargetsSchema>

export const raceEventSchema = z
  .object({
    name: trimmed('Race name', 2, 80),
    date: isoDate,
    location: trimmed('Location', 2, 80),
    category: z.enum(GOAL_TYPES),
    swimM: requiredNumber(0, 5000, 'Swim distance'),
    bikeKm: requiredNumber(0, 200, 'Bike distance'),
    runKm: requiredNumber(0, 50, 'Run distance'),
    priority: z.enum(['A', 'B', 'C']),
    targetOutcome: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.swimM + v.bikeKm + v.runKm === 0)
      ctx.addIssue({ code: 'custom', path: ['swimM'], message: 'Enter at least one distance' })
  })
export type RaceEventInput = z.input<typeof raceEventSchema>

export const raceResultSchema = z.object({
  finishTime: z.string().trim().regex(/^(\d{1,2}:)?\d{1,2}:\d{2}$/, 'Use h:mm:ss or mm:ss'),
  notes: z.string().trim().max(300).optional(),
})

export const restrictionSchema = z
  .object({
    title: trimmed('Title', 3, 80),
    description: trimmed('Description', 3, 300),
    source: z.enum(['clinician', 'athlete-reported']),
    clinicianName: z.string().trim().max(80).optional(),
    severity: z.enum(['monitor', 'modify', 'pause']),
    blockedSports: z.array(z.string()),
    maxIntensity: z.enum(['none', 'recovery', 'easy', 'moderate']),
    maxDurationMin: optionalNumber(10, 300, 'Maximum duration'),
    reviewDate: optionalIsoDate,
  })
  .superRefine((v, ctx) => {
    if (v.source === 'clinician' && !v.clinicianName?.trim())
      ctx.addIssue({ code: 'custom', path: ['clinicianName'], message: 'Enter who gave you this restriction' })
  })
export type RestrictionInput = z.input<typeof restrictionSchema>

export const rehabLogSchema = z.object({
  exerciseId: z.string().min(1),
  setsDone: requiredNumber(0, 20, 'Sets'),
  symptomBefore: requiredNumber(0, 10, 'Symptoms before'),
  symptomDuring: requiredNumber(0, 10, 'Symptoms during'),
  symptomAfter: requiredNumber(0, 10, 'Symptoms after'),
  notes: z.string().trim().max(300).optional(),
})
export type RehabLogInput = z.input<typeof rehabLogSchema>

export const missedReasonSchema = z.object({
  reason: z.string().trim().min(3, 'Add a short reason (3+ characters)').max(200),
})
