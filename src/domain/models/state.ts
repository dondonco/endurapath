import type { AthleteAvailability, AthleteProfile } from './athlete'
import type { Timestamp } from './common'
import type { RaceEvent } from './events'
import type {
  ClinicalRestriction,
  FuelingLog,
  NutritionPlan,
  Notification,
  PersonaMessage,
  ReadinessAssessment,
  RecoveryCheckIn,
  RehabLog,
  RehabilitationPlan,
  SymptomReport,
} from './health'
import type { PlanChange, TrainingPlan, Workout, WorkoutResult } from './training'

/**
 * Medical data is kept in its own subtree, persisted under its own storage key, and only exposed to
 * authorised workflows (see services/access). Ordinary training analytics never read from it.
 */
export interface MedicalData {
  restrictions: ClinicalRestriction[]
  symptoms: SymptomReport[]
  rehabPlans: RehabilitationPlan[]
  rehabLogs: RehabLog[]
}

export interface AppSettings {
  /** The only provider implemented in this prototype. */
  aiProvider: 'simulated'
  hydrationReminders: boolean
  showSampleDataBanner: boolean
}

export interface AppState {
  schemaVersion: number
  onboarded: boolean
  /** True while the data in the store is the labelled sample data set. */
  isSampleData: boolean
  athlete: AthleteProfile | null
  availability: AthleteAvailability | null
  plan: TrainingPlan | null
  workouts: Workout[]
  results: WorkoutResult[]
  changes: PlanChange[]
  events: RaceEvent[]
  checkIns: RecoveryCheckIn[]
  nutrition: NutritionPlan | null
  fuelingLogs: FuelingLog[]
  messages: PersonaMessage[]
  assessments: ReadinessAssessment[]
  notifications: Notification[]
  medical: MedicalData
  settings: AppSettings
  updatedAt: Timestamp
}

export const SCHEMA_VERSION = 1

export const EMPTY_MEDICAL: MedicalData = { restrictions: [], symptoms: [], rehabPlans: [], rehabLogs: [] }

export const DEFAULT_SETTINGS: AppSettings = { aiProvider: 'simulated', hydrationReminders: true, showSampleDataBanner: true }

export function emptyState(now: Timestamp): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    onboarded: false,
    isSampleData: false,
    athlete: null,
    availability: null,
    plan: null,
    workouts: [],
    results: [],
    changes: [],
    events: [],
    checkIns: [],
    nutrition: null,
    fuelingLogs: [],
    messages: [],
    assessments: [],
    notifications: [],
    medical: { ...EMPTY_MEDICAL },
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: now,
  }
}
