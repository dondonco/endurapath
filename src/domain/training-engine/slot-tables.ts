import type { PhaseType, Sport, StageId } from '../models/common'
import type { SessionKind } from './workout-library'

export interface Slot {
  kind: SessionKind
  /** Relative share of the week's training minutes. */
  share: number
  /** Key sessions are the ones to protect when life gets busy. */
  key?: boolean
}

export type TableKind = 'base' | 'build' | 'race' | 'taper' | 'recovery'

const s = (kind: SessionKind, share: number, key = false): Slot => ({ kind, share, key })

export const KIND_SPORT: Record<SessionKind, Sport> = {
  'swim-technique': 'swim',
  'swim-endurance': 'swim',
  'swim-intervals': 'swim',
  'swim-openwater': 'swim',
  'bike-easy': 'bike',
  'bike-long': 'bike',
  'bike-tempo': 'bike',
  'bike-intervals': 'bike',
  'bike-race-pace': 'bike',
  'run-easy': 'run',
  'run-walk': 'run',
  'run-long': 'run',
  'run-tempo': 'run',
  'run-intervals': 'run',
  brick: 'brick',
  strength: 'strength',
  mobility: 'mobility',
  recovery: 'recovery',
  rehab: 'rehab',
  'assess-swim': 'swim',
  'assess-bike': 'bike',
  'assess-run': 'run',
}

export function isLongKind(kind: SessionKind): boolean {
  return kind === 'bike-long' || kind === 'run-long'
}

/** Slots are listed in priority order — a week with fewer sessions simply takes the first N. */
const TABLES: Record<'A' | 'B' | 'CD', Record<Exclude<TableKind, 'taper' | 'recovery'>, Slot[]>> = {
  A: {
    base: [
      s('swim-technique', 1),
      s('bike-easy', 1.1),
      s('run-walk', 0.9),
      s('bike-long', 1.6, true),
      s('strength', 0.8),
      s('swim-endurance', 1),
      s('run-easy', 0.8),
    ],
    build: [
      s('swim-endurance', 1),
      s('bike-easy', 1),
      s('run-easy', 1),
      s('bike-long', 1.7, true),
      s('strength', 0.8),
      s('swim-technique', 0.8),
      s('run-easy', 0.8),
    ],
    race: [
      s('swim-endurance', 1),
      s('brick', 1.4, true),
      s('run-easy', 1),
      s('bike-long', 1.5, true),
      s('strength', 0.7),
      s('swim-technique', 0.8),
      s('bike-easy', 0.8),
    ],
  },
  B: {
    base: [
      s('swim-technique', 1),
      s('bike-easy', 1),
      s('run-easy', 1),
      s('bike-long', 1.7, true),
      s('strength', 0.8),
      s('swim-endurance', 1),
      s('run-easy', 0.9),
    ],
    build: [
      s('swim-intervals', 0.9),
      s('bike-tempo', 1.1, true),
      s('run-easy', 1),
      s('bike-long', 1.7, true),
      s('run-tempo', 0.9, true),
      s('strength', 0.7),
      s('swim-endurance', 1),
      s('brick', 1.2),
    ],
    race: [
      s('swim-endurance', 0.9),
      s('brick', 1.4, true),
      s('run-intervals', 0.8),
      s('bike-race-pace', 1.3, true),
      s('run-easy', 1),
      s('bike-long', 1.4, true),
      s('strength', 0.6),
      s('swim-intervals', 0.8),
    ],
  },
  CD: {
    base: [
      s('swim-endurance', 1),
      s('bike-easy', 1),
      s('run-easy', 1),
      s('bike-long', 2, true),
      s('run-long', 1.5, true),
      s('strength', 0.7),
      s('swim-technique', 0.8),
      s('bike-easy', 0.9),
    ],
    build: [
      s('swim-intervals', 0.9),
      s('bike-tempo', 1.1, true),
      s('run-tempo', 1, true),
      s('bike-long', 2.1, true),
      s('run-long', 1.5, true),
      s('strength', 0.7),
      s('swim-endurance', 1),
      s('brick', 1.3, true),
    ],
    race: [
      s('swim-endurance', 1),
      s('brick', 1.5, true),
      s('bike-race-pace', 1.6, true),
      s('run-long', 1.4, true),
      s('swim-intervals', 0.8),
      s('bike-easy', 0.9),
      s('run-easy', 0.9),
      s('bike-long', 2, true),
    ],
  },
}

function tableGroup(stage: StageId): 'A' | 'B' | 'CD' {
  return stage === 'A' ? 'A' : stage === 'B' ? 'B' : 'CD'
}

/**
 * `phase` is the *effective* table: recovery weeks reuse the stage's base table (with intensity capped later);
 * taper weeks reuse the race table at reduced volume.
 */
export function slotTable(stage: StageId, phase: TableKind): Slot[] {
  const group = TABLES[tableGroup(stage)]
  if (phase === 'recovery') return group.base
  if (phase === 'taper') return group.race
  return group[phase]
}

export function tableKindForPhase(phase: PhaseType): TableKind {
  switch (phase) {
    case 'race-specific':
      return 'race'
    case 'base':
    case 'build':
    case 'taper':
    case 'recovery':
      return phase
  }
}
