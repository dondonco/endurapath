import type { Entity, ISODate, PersonaId, Sport, Timestamp } from './common'

export type TriageLevel = 'emergency' | 'urgent' | 'professional-assessment' | 'monitor'

export interface RecoveryCheckIn extends Entity {
  date: ISODate
  sleepHours: number
  /** 1 (poor) – 5 (excellent) */
  sleepQuality: number
  /** 1 (fresh) – 5 (very fatigued) */
  fatigue: number
  /** 1 (none) – 5 (severe) */
  soreness: number
  /** 1 (low) – 5 (great) */
  mood: number
  /** 1 (not ready) – 5 (fully ready) */
  readiness: number
  restingHr?: number
  notes?: string
}

/* ------------------------------ Nutrition ------------------------------ */

export type TargetSource = 'general-education' | 'professional'

export interface FuelingTargets {
  carbsPerHour: { min: number; max: number }
  fluidMlPerHour: { min: number; max: number }
  sodiumNote?: string
  source: TargetSource
  /** Required when source is "professional". */
  setBy?: string
  effectiveFrom: ISODate
}

export interface NutritionPlan extends Entity {
  athleteId: string
  targets: FuelingTargets
  hydrationReminders: boolean
}

export interface FuelingLog extends Entity {
  date: ISODate
  kind: 'training' | 'race-rehearsal'
  workoutId?: string
  eventId?: string
  plannedCarbsG?: number
  actualCarbsG?: number
  plannedFluidMl?: number
  actualFluidMl?: number
  products?: string
  /** 1 (poor) – 5 (tolerated well) */
  tolerance: number
  giSymptoms: boolean
  notes?: string
}

/* ------------------------------- Medical ------------------------------- */

export type RestrictionSeverity = 'monitor' | 'modify' | 'pause'
export type RestrictionSource = 'clinician' | 'athlete-reported'

export interface RestrictionEffect {
  /** Sports that must not be scheduled while the restriction is active. */
  blockedSports: Sport[]
  /** Highest intensity allowed. */
  maxIntensity?: 'recovery' | 'easy' | 'moderate'
  maxDurationMin?: number
  /** Pause all training except approved rehab. */
  pauseAllTraining?: boolean
}

export interface ClinicalRestriction extends Entity {
  title: string
  description: string
  source: RestrictionSource
  /** Clinician name entered by the athlete or provided by the demo. Not verified by the app. */
  clinicianName?: string
  severity: RestrictionSeverity
  effect: RestrictionEffect
  status: 'active' | 'resolved'
  reviewDate?: ISODate
  resolution?: { at: Timestamp; clinicianName: string; note: string; verified: false }
}

export interface SymptomReport extends Entity {
  reportedAt: Timestamp
  bodyArea: string
  symptom: string
  /** 0 – 10 */
  severity: number
  onset: 'today' | 'few-days' | 'week-plus'
  trend: 'improving' | 'same' | 'worsening'
  duringTraining: boolean
  atRest: boolean
  redFlags: string[]
  notes?: string
  linkedWorkoutId?: string
  triage: { level: TriageLevel; reasons: string[] }
  /** Set when the athlete records that a clinician has reviewed this report. */
  clinicianReviewed: boolean
}

export interface RehabilitationExercise {
  id: string
  name: string
  sets: number
  reps?: number
  holdSeconds?: number
  frequencyPerWeek: number
  notes: string
  cues: string[]
  /** Only modifications approved by the clinician. */
  approvedModification?: string
  stopIf: string
}

export interface ReturnMilestone {
  id: string
  label: string
  status: 'pending' | 'reviewed'
  reviewDate?: ISODate
}

export interface RehabilitationPlan extends Entity {
  title: string
  restrictionId?: string
  approvedBy: string
  approvedOn: ISODate
  reviewDate: ISODate
  status: 'active' | 'paused' | 'completed'
  exercises: RehabilitationExercise[]
  referral: { status: 'none' | 'recommended' | 'booked' | 'attended'; provider?: string; date?: ISODate }
  milestones: ReturnMilestone[]
  /** Demo plans are sample data and not real clinical advice. */
  isSample: boolean
}

export interface RehabLog extends Entity {
  planId: string
  exerciseId: string
  date: ISODate
  setsDone: number
  /** 0 – 10 symptom level */
  symptomBefore: number
  symptomDuring: number
  symptomAfter: number
  notes?: string
}

/* ------------------------------ Personas etc. ------------------------------ */

export interface PersonaMessage extends Entity {
  personaId: PersonaId
  role: 'athlete' | 'persona' | 'system'
  text: string
  source: 'user' | 'simulated' | 'live-ai'
  safetyLevel?: TriageLevel
  actions?: { label: string; to: string }[]
}

export type ReadinessOutcome = 'progress' | 'continue' | 'reduce' | 'clinical-review'

export interface ReadinessFactor {
  id: string
  label: string
  weight: number
  /** 0 – 100, or null when there is not enough data */
  score: number | null
  detail: string
}

export interface ReadinessGate {
  id: string
  label: string
  passed: boolean
  detail: string
}

export interface ReadinessAssessment extends Entity {
  stage: string
  nextStage: string | null
  outcome: ReadinessOutcome
  score: number
  confidence: 'low' | 'medium' | 'high'
  factors: ReadinessFactor[]
  gates: ReadinessGate[]
  /** Reasons a rule overrode the numeric score (e.g. active restriction). */
  overrides: string[]
  reasons: string[]
  nextSteps: string[]
  asOf: ISODate
}

export interface Notification extends Entity {
  kind: 'plan-change' | 'safety' | 'readiness' | 'event' | 'system'
  severity: 'info' | 'warning' | 'critical'
  title: string
  body: string
  link?: string
  readAt?: Timestamp
}
