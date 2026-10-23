import type { Entity, GoalType, ISODate, TimeOfDay } from './common'
import type { UnitSystem } from '@/lib/units'

export type ExperienceLevel = 'none' | 'beginner' | 'intermediate' | 'advanced'
export type SwimConfidence = 'learning' | 'basic' | 'comfortable' | 'strong'
export type OpenWaterExperience = 'none' | 'some' | 'regular'
export type Consistency = 'none' | 'occasional' | 'regular' | 'very-consistent'
export type AgeRange = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65+'
export type RaceFormat = 'open-water' | 'pool-swim' | 'no-preference'
export type GoalIntent = 'finish-comfortably' | 'performance'
export type RecoveryPattern = 'recover-quickly' | 'average' | 'recover-slowly'
export type ProfessionalSupport = 'coach' | 'nutritionist' | 'physiotherapist' | 'physician' | 'none'
export type DietaryPattern =
  | 'omnivore'
  | 'vegetarian'
  | 'vegan'
  | 'pescatarian'
  | 'gluten-free'
  | 'dairy-free'
  | 'halal'
  | 'kosher'

export interface RecentRace {
  id: string
  name: string
  category: GoalType | 'other'
  date?: ISODate
  finishTime?: string
}

/** Self-reported baseline. No lab testing, GPS watch or power meter required. */
export interface FitnessBaseline {
  swimSessionsPerWeek: number
  swimMetersPerWeek: number
  /** Longest swim that feels comfortable (metres, continuous or with short rests). */
  comfortableSwimM: number
  bikeSessionsPerWeek: number
  bikeMinutesPerWeek: number
  comfortableBikeMin: number
  runSessionsPerWeek: number
  runMinutesPerWeek: number
  comfortableRunMin: number
  consistency: Consistency
  recentRaces: RecentRace[]
  /** Optional metrics — all can be left blank. */
  restingHr?: number
  maxHr?: number
  runThresholdPaceSecPerKm?: number
  bikeFtpWatts?: number
  /** Athlete-reported injuries or clinician-provided restrictions (free text). */
  injuryNote?: string
  hasClinicianRestrictions: boolean
}

export interface AthleteGoal {
  type: GoalType
  targetEventDate?: ISODate
  intermediateEvents?: string
  preferredFormat: RaceFormat
  intent: GoalIntent
  performanceTarget?: string
}

export interface AthletePreferences {
  dietary: DietaryPattern[]
  allergies: string[]
  equipment: string[]
  sleepHoursTypical: number
  recoveryPattern: RecoveryPattern
  fatigueNote?: string
  professionalSupport: ProfessionalSupport[]
}

export interface AthleteProfile extends Entity {
  displayName: string
  ageRange: AgeRange
  units: UnitSystem
  generalExperience: ExperienceLevel
  swimConfidence: SwimConfidence
  openWater: OpenWaterExperience
  bikeExperience: ExperienceLevel
  runExperience: ExperienceLevel
  /** Optional, athlete-chosen disclosure. Not interpreted as a diagnosis. */
  healthNotes?: string
  baseline: FitnessBaseline
  goal: AthleteGoal
  preferences: AthletePreferences
  /** True while the profile holds clearly-labelled sample data. */
  isDemo: boolean
}

export interface UnavailableRange {
  id: string
  start: ISODate
  end: ISODate
  reason?: string
}

export interface AthleteAvailability extends Entity {
  athleteId: string
  /** 0 = Monday … 6 = Sunday */
  trainingDays: number[]
  maxHoursPerWeek: number
  /** 0 = Monday … 6 = Sunday, or null when the athlete has no fixed rest day */
  restDay: number | null
  constraints?: string
  access: {
    pool: boolean
    bicycle: boolean
    indoorTrainer: boolean
    gym: boolean
    safeRunRoutes: boolean
  }
  preferredTimes: TimeOfDay[]
  unavailable: UnavailableRange[]
}
