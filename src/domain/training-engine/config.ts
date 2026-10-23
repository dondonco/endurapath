import type { Consistency } from '../models/athlete'
import type { GoalType, IntensityLevel, PhaseType, StageId } from '../models/common'

/**
 * ALL numbers in this file are illustrative planning defaults, not universal prescriptions.
 * They are deliberately centralised so a coach, clinician or product team can change them
 * without touching engine logic. An athlete may need more time than any range shown.
 */

export interface StageConfig {
  id: StageId
  label: string
  shortLabel: string
  description: string
  goalTypes: GoalType[]
  /** Illustrative preparation range in weeks (the "+" in "8–16+" is implied everywhere). */
  minWeeks: number
  maxWeeks: number
  /** Weekly training minutes at the start / peak of a stage, before availability limits. */
  startMinutes: number
  peakMinutes: number
  /** Longest single-session targets for the stage (minutes). Availability may lower these. */
  longBikeMax: number
  longRunMax: number
  longSwimMax: number
  /** Default session cap on non-long sessions. */
  sessionMax: number
  maxHardSessionsPerWeek: number
}

export interface EntryRequirements {
  comfortableSwimM: number
  comfortableBikeMin: number
  comfortableRunMin: number
  weeklyMinutes: number
  consistency: Consistency
  /** Practical weekly hours the athlete needs to be able to commit. */
  hoursAvailable: number
  /** Recommended (never gating) prior race experience. */
  recommendedRaces: GoalType[]
}

export interface ReadinessConfig {
  weights: Record<string, number>
  /** Overall score needed (in addition to every gate) for "progression recommended". */
  progressThreshold: number
  minCompletionRate: number
  /**
   * Fraction of the stage's illustrative minimum weeks that must have elapsed before progression can even be
   * considered. This is a necessary gate, never a sufficient one — time alone never advances an athlete.
   */
  minStageFraction: number
  /** Look-back windows in days. */
  windows: { consistency: number; recovery: number; symptoms: number; fueling: number }
  minSessionsForConsistency: number
  minCheckIns: number
  maxAvgFatigue: number
  reduceBelowRecoveryScore: number
  /** Required fraction (0–1) of next-stage entry capacity before the capacity gate passes. */
  capacityGate: number
}

export interface EngineConfig {
  stages: Record<StageId, StageConfig>
  entry: Record<StageId, EntryRequirements>
  /** Every Nth load week becomes a recovery week. Shorter for newer or older athletes. */
  recoveryEvery: { default: number; cautious: number }
  recoveryWeekFactor: number
  /** Soft ceiling on week-to-week ramps. This is a planning guard, NOT a safety guarantee. */
  maxWeeklyIncrease: number
  maxWeeklyIncreaseMin: number
  taperWeeks: Record<GoalType, number>
  taperFactors: Record<number, number[]>
  phaseSplit: { base: number; build: number; race: number }
  /** Minimum plan length (weeks) the generator will build for a stage. */
  minStageWeeks: number
  /** How many weeks of detailed workouts to generate at once. Later weeks are regenerated as the plan evolves. */
  horizonWeeks: number
  avgSessionMinutes: number
  weekdayMaxMin: number
  mobilityMinutes: number
  /** Start next Monday when the plan is created on or after this weekday index (Mon = 0). */
  nextWeekFromDayIndex: number
  readiness: ReadinessConfig
}

export const RACE_DISTANCES: Record<GoalType, { swimM: number; bikeKm: number; runKm: number; label: string }> = {
  'first-tri': { swimM: 400, bikeKm: 10, runKm: 2.5, label: 'Beginner-friendly format' },
  sprint: { swimM: 750, bikeKm: 20, runKm: 5, label: 'Sprint' },
  olympic: { swimM: 1500, bikeKm: 40, runKm: 10, label: 'Olympic' },
  'half-ironman': { swimM: 1900, bikeKm: 90, runKm: 21.1, label: '70.3' },
  ironman: { swimM: 3800, bikeKm: 180, runKm: 42.2, label: 'Full distance' },
}

export const GOAL_TO_STAGE: Record<GoalType, StageId> = {
  'first-tri': 'A',
  sprint: 'B',
  olympic: 'B',
  'half-ironman': 'C',
  ironman: 'D',
}

export const STAGE_ORDER: StageId[] = ['A', 'B', 'C', 'D']

export const CONSISTENCY_RANK: Record<Consistency, number> = {
  none: 0,
  occasional: 1,
  regular: 2,
  'very-consistent': 3,
}

export const INTENSITY_RANK: Record<IntensityLevel, number> = { recovery: 0, easy: 1, moderate: 2, hard: 3 }

/** Highest intensity each phase allows in a normal week. */
export const PHASE_INTENSITY_CAP: Record<PhaseType, IntensityLevel> = {
  base: 'moderate',
  build: 'hard',
  'race-specific': 'hard',
  taper: 'moderate',
  recovery: 'easy',
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  stages: {
    A: {
      id: 'A',
      label: 'Stage A — Foundation & first triathlon',
      shortLabel: 'Foundation',
      description: 'Build comfort and consistency across swim, bike and run. Learn pacing, fueling basics and transitions.',
      goalTypes: ['first-tri'],
      minWeeks: 8,
      maxWeeks: 16,
      startMinutes: 120,
      peakMinutes: 270,
      longBikeMax: 90,
      longRunMax: 45,
      longSwimMax: 40,
      sessionMax: 60,
      maxHardSessionsPerWeek: 0,
    },
    B: {
      id: 'B',
      label: 'Stage B — Sprint & Olympic development',
      shortLabel: 'Sprint / Olympic',
      description: 'Develop aerobic capacity, race-pace durability and brick running for sprint and Olympic distances.',
      goalTypes: ['sprint', 'olympic'],
      minWeeks: 12,
      maxWeeks: 24,
      startMinutes: 240,
      peakMinutes: 420,
      longBikeMax: 150,
      longRunMax: 80,
      longSwimMax: 55,
      sessionMax: 75,
      maxHardSessionsPerWeek: 2,
    },
    C: {
      id: 'C',
      label: 'Stage C — IRONMAN 70.3 preparation',
      shortLabel: 'IRONMAN 70.3',
      description: 'Extend endurance, fueling practice and race-specific durability for a half-distance event.',
      goalTypes: ['half-ironman'],
      minWeeks: 16,
      maxWeeks: 24,
      startMinutes: 360,
      peakMinutes: 600,
      longBikeMax: 240,
      longRunMax: 120,
      longSwimMax: 70,
      sessionMax: 90,
      maxHardSessionsPerWeek: 2,
    },
    D: {
      id: 'D',
      label: 'Stage D — Full-distance IRONMAN preparation',
      shortLabel: 'IRONMAN',
      description: 'Build a deep endurance base, long-session fueling and pacing discipline for a full-distance event.',
      goalTypes: ['ironman'],
      minWeeks: 24,
      maxWeeks: 36,
      startMinutes: 480,
      peakMinutes: 780,
      longBikeMax: 300,
      longRunMax: 150,
      longSwimMax: 80,
      sessionMax: 100,
      maxHardSessionsPerWeek: 2,
    },
  },
  entry: {
    A: {
      comfortableSwimM: 0,
      comfortableBikeMin: 0,
      comfortableRunMin: 0,
      weeklyMinutes: 0,
      consistency: 'none',
      hoursAvailable: 3,
      recommendedRaces: [],
    },
    B: {
      comfortableSwimM: 400,
      comfortableBikeMin: 45,
      comfortableRunMin: 20,
      weeklyMinutes: 120,
      consistency: 'regular',
      hoursAvailable: 4,
      recommendedRaces: ['first-tri', 'sprint'],
    },
    C: {
      comfortableSwimM: 1000,
      comfortableBikeMin: 90,
      comfortableRunMin: 60,
      weeklyMinutes: 300,
      consistency: 'regular',
      hoursAvailable: 7,
      recommendedRaces: ['sprint', 'olympic'],
    },
    D: {
      comfortableSwimM: 1900,
      comfortableBikeMin: 180,
      comfortableRunMin: 90,
      weeklyMinutes: 480,
      consistency: 'very-consistent',
      hoursAvailable: 10,
      recommendedRaces: ['half-ironman'],
    },
  },
  recoveryEvery: { default: 4, cautious: 3 },
  recoveryWeekFactor: 0.7,
  maxWeeklyIncrease: 0.1,
  maxWeeklyIncreaseMin: 15,
  taperWeeks: { 'first-tri': 1, sprint: 1, olympic: 1, 'half-ironman': 2, ironman: 3 },
  taperFactors: {
    1: [0.6],
    2: [0.75, 0.5],
    3: [0.8, 0.6, 0.4],
  },
  phaseSplit: { base: 0.4, build: 0.4, race: 0.2 },
  minStageWeeks: 3,
  horizonWeeks: 24,
  avgSessionMinutes: 55,
  weekdayMaxMin: 75,
  mobilityMinutes: 20,
  nextWeekFromDayIndex: 5,
  readiness: {
    weights: {
      consistency: 0.2,
      keySessions: 0.15,
      capacity: 0.2,
      recovery: 0.15,
      symptoms: 0.1,
      fueling: 0.07,
      time: 0.07,
      race: 0.06,
    },
    progressThreshold: 75,
    minCompletionRate: 0.75,
    minStageFraction: 0.5,
    windows: { consistency: 28, recovery: 14, symptoms: 14, fueling: 42 },
    minSessionsForConsistency: 6,
    minCheckIns: 3,
    maxAvgFatigue: 3.6,
    reduceBelowRecoveryScore: 45,
    capacityGate: 0.9,
  },
}

export function nextStage(stage: StageId): StageId | null {
  const i = STAGE_ORDER.indexOf(stage)
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null
}

export function stageRank(stage: StageId): number {
  return STAGE_ORDER.indexOf(stage)
}
