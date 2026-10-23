import type { ISODate } from '@/lib/dates'

export type { ISODate }

/** ISO-8601 date-time, e.g. 2026-03-02T07:15:00.000Z */
export type Timestamp = string

export interface Entity {
  /** Stable opaque identifier. Never reused. */
  id: string
  createdAt: Timestamp
  updatedAt: Timestamp
}

export const SPORTS = ['swim', 'bike', 'run', 'brick', 'strength', 'mobility', 'recovery', 'rehab'] as const
export type Sport = (typeof SPORTS)[number]

export const SPORT_LABELS: Record<Sport, string> = {
  swim: 'Swim',
  bike: 'Bike',
  run: 'Run',
  brick: 'Brick',
  strength: 'Strength',
  mobility: 'Mobility',
  recovery: 'Recovery',
  rehab: 'Rehab',
}

export const GOAL_TYPES = ['first-tri', 'sprint', 'olympic', 'half-ironman', 'ironman'] as const
export type GoalType = (typeof GOAL_TYPES)[number]

export const GOAL_LABELS: Record<GoalType, string> = {
  'first-tri': 'First triathlon',
  sprint: 'Sprint triathlon',
  olympic: 'Olympic-distance triathlon',
  'half-ironman': 'IRONMAN 70.3',
  ironman: 'Full-distance IRONMAN',
}

export const STAGE_IDS = ['A', 'B', 'C', 'D'] as const
export type StageId = (typeof STAGE_IDS)[number]

export const PHASE_TYPES = ['base', 'build', 'race-specific', 'taper', 'recovery'] as const
export type PhaseType = (typeof PHASE_TYPES)[number]

export const PHASE_LABELS: Record<PhaseType, string> = {
  base: 'Base',
  build: 'Build',
  'race-specific': 'Race-specific',
  taper: 'Taper',
  recovery: 'Recovery',
}

export type IntensityLevel = 'recovery' | 'easy' | 'moderate' | 'hard'

export const TIMES_OF_DAY = ['early-morning', 'morning', 'midday', 'evening', 'flexible'] as const
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]

export const PERSONA_IDS = ['atlas', 'fuelwise', 'meridian', 'motionlab'] as const
export type PersonaId = (typeof PERSONA_IDS)[number]
