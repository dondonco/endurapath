import type { Entity, GoalType, ISODate } from './common'

export type EventPriority = 'A' | 'B' | 'C'

export interface ChecklistItem {
  id: string
  category: 'equipment' | 'nutrition' | 'travel' | 'transition'
  label: string
  done: boolean
}

export interface RaceEvent extends Entity {
  name: string
  date: ISODate
  location: string
  category: GoalType
  swimM: number
  bikeKm: number
  runKm: number
  priority: EventPriority
  targetOutcome: string
  notes?: string
  checklist: ChecklistItem[]
  /** Self-entered. EnduraPath has no race-registration or results integration. */
  result?: { finishTime: string; notes?: string }
  status: 'planned' | 'completed' | 'cancelled'
}

export type { ISODate }
