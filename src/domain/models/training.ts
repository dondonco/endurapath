import type {
  Entity,
  GoalType,
  ISODate,
  IntensityLevel,
  PhaseType,
  Sport,
  StageId,
  TimeOfDay,
  Timestamp,
} from './common'

export type WorkoutStatus = 'planned' | 'completed' | 'skipped'

/** All metric fields are optional: beginners need only RPE and the talk test. Values are stored metric. */
export interface IntensityTarget {
  rpe: [number, number]
  description: string
  zone?: string
  heartRateBpm?: [number, number]
  paceSecPerKm?: [number, number]
  powerWatts?: [number, number]
}

export interface FuelingGuidance {
  level: 'none' | 'minimal' | 'practice' | 'structured'
  summary: string
  before: string
  during: string
  after: string
  carbsPerHour?: { min: number; max: number }
  fluidNote: string
  /** Always general education unless a professional supplied the targets. */
  source: 'general-education' | 'professional'
}

export interface WorkoutSnapshot {
  title: string
  sport: Sport
  durationMin: number
  intensity: IntensityLevel
  date: ISODate
}

/** A *planned* session. Completed results live in WorkoutResult so rescheduling never erases history. */
export interface Workout extends Entity {
  planId: string
  phaseId: string
  /** Effective phase of the week this session belongs to (a recovery week reports "recovery"). */
  phaseType: PhaseType
  stage: StageId
  weekStart: ISODate
  date: ISODate
  originalDate: ISODate
  timeOfDay?: TimeOfDay
  sport: Sport
  kind: string
  title: string
  durationMin: number
  distanceM?: number
  intensity: IntensityLevel
  target: IntensityTarget
  warmup: string
  mainSet: string
  cooldown: string
  purpose: string
  coachingNotes: string
  fueling?: FuelingGuidance
  isKey: boolean
  status: WorkoutStatus
  /** True once the session has been edited / adjusted after generation. */
  modified: boolean
  statusReason?: string
  rehabPlanId?: string
  /** Set when a clinical restriction shaped this session. */
  restrictionNote?: string
  /** What the session looked like before it was replaced or restriction-adjusted. */
  originalSnapshot?: WorkoutSnapshot
}

export interface WorkoutResult extends Entity {
  workoutId: string
  completedOn: ISODate
  actualDurationMin: number
  actualDistanceM?: number
  /** 1–10 rating of perceived exertion */
  rpe: number
  /** 1 (poor) – 5 (great) */
  feeling?: number
  notes?: string
  symptomsNoted: boolean
  /** Snapshot of the plan at completion time — keeps history intact if the workout is later edited. */
  planned: WorkoutSnapshot & { stage: StageId; kind: string }
}

export interface TrainingPhase {
  id: string
  planId: string
  stage: StageId
  type: PhaseType
  startDate: ISODate
  endDate: ISODate
  weekCount: number
  focus: string
}

export interface PlannedWeek {
  /** 0-based position in the plan. */
  index: number
  /** 1-based week number within its stage. */
  weekInStage: number
  weekStart: ISODate
  stage: StageId
  phaseId: string
  phaseType: PhaseType
  isRecoveryWeek: boolean
  /** Training-load target for the week, before availability adjustments. */
  targetMinutes: number
  /** Minutes actually scheduled (excludes rehab). Equals the target until workouts are generated. */
  plannedMinutes: number
  /** The underlying phase table (a recovery week keeps the phase it interrupts). */
  tablePhase: PhaseType
  /** Weekly minutes the stage starts from; with loadProgress this reproduces the week's target. */
  startMinutes: number
  /** Position within the stage's load progression, 0 (start) – 1 (peak). Drives long-session length. */
  loadProgress: number
  /** 1 for a normal week; below 1 for recovery and taper weeks. */
  volumeFactor: number
  /** True once detailed workouts exist for this week. */
  generated: boolean
  note?: string
}

export interface PathwayStage {
  stage: StageId
  label: string
  /** Configurable illustrative range — not a promise. */
  minWeeks: number
  maxWeeks: number
  /** Estimate adjusted for the athlete's baseline. */
  estimatedMinWeeks: number
  estimatedMaxWeeks: number
  status: 'completed' | 'current' | 'upcoming' | 'not-needed' | 'beyond-goal'
  reason: string
}

export interface Prerequisite {
  id: string
  /** The stage this prerequisite unlocks. */
  stage: StageId
  label: string
  met: boolean
  current: string
  required: string
  /** Non-gating prerequisites are recommendations that never block the start stage. */
  gating: boolean
}

export interface TrainingPlan extends Entity {
  athleteId: string
  name: string
  goalType: GoalType
  startStage: StageId
  targetStage: StageId
  currentStage: StageId
  startDate: ISODate
  primaryEventId?: string
  pathway: PathwayStage[]
  prerequisites: Prerequisite[]
  phases: TrainingPhase[]
  weeks: PlannedWeek[]
  assumptions: string[]
  warnings: string[]
  baselineAssessments: string[]
  estimatedTotalWeeks: { min: number; max: number }
  status: 'active' | 'archived'
  version: number
}

export type PlanChangeKind =
  | 'plan-created'
  | 'plan-regenerated'
  | 'reschedule'
  | 'swap'
  | 'skip'
  | 'replace-with-recovery'
  | 'edit'
  | 'restriction-adjustment'
  | 'symptom-adjustment'
  | 'adjustment-applied'
  | 'adjustment-requested'
  | 'stage-progression'
  | 'rehab-scheduled'

export interface PlanChangeDetail {
  workoutId: string
  field: string
  from: string
  to: string
}

export interface PlanChange extends Entity {
  planId: string
  kind: PlanChangeKind
  summary: string
  reason: string
  initiatedBy: 'athlete' | 'plan-engine' | 'safety-rule'
  workoutIds: string[]
  details: PlanChangeDetail[]
  at: Timestamp
}

export type ProposedChangeKind = 'move' | 'shorten' | 'downgrade' | 'skip' | 'convert-to-recovery'

export interface ProposedChange {
  workoutId: string
  kind: ProposedChangeKind
  toDate?: ISODate
  toDurationMin?: number
  toIntensity?: IntensityLevel
  description: string
}

export interface AdjustmentProposal {
  id: string
  trigger: string
  summary: string
  rationale: string[]
  changes: ProposedChange[]
  weeklyMinutesDelta: number
  progression: { affected: boolean; note: string }
}
