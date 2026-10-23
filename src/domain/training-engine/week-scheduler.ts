import type { Sport } from '../models/common'
import { dayIndex, daysBetween, type ISODate } from '@/lib/dates'

export interface PlaceableSession {
  sport: Sport
  /** Hard intensity. */
  hard: boolean
  /** Long session, brick or race-pace — anything that taxes recovery. */
  demanding: boolean
  long: boolean
  strength: boolean
  gentle: boolean
}

function isConsecutive(a: ISODate, b: ISODate): boolean {
  return Math.abs(daysBetween(a, b)) === 1
}

/**
 * Penalty for a candidate arrangement — lower is better. Every term is a plain, explainable rule:
 *  - never stack demanding days back to back
 *  - keep long sessions on weekend days when possible
 *  - avoid strength immediately before a long session
 *  - avoid the same sport on consecutive days
 *  - prefer gentle sessions the day after a demanding one
 */
export function placementCost(sessions: PlaceableSession[], dates: ISODate[]): number {
  let cost = 0
  const order = dates.map((d, i) => ({ d, s: sessions[i] })).sort((a, b) => (a.d < b.d ? -1 : 1))
  for (let i = 0; i < order.length; i++) {
    const cur = order[i]
    const idx = dayIndex(cur.d)
    if (cur.s.long && idx < 5) cost += 20
    if (cur.s.long && cur.s.sport === 'bike' && idx !== 5) cost += 4
    if (cur.s.long && cur.s.sport === 'run' && idx !== 6) cost += 2
    const next = order[i + 1]
    if (next && isConsecutive(cur.d, next.d)) {
      if (cur.s.demanding && next.s.demanding) cost += 40
      if (cur.s.hard && next.s.hard) cost += 80
      if ((cur.s.hard && next.s.demanding) || (cur.s.demanding && next.s.hard)) cost += 30
      if (cur.s.sport === next.s.sport) cost += 6
      if (cur.s.strength && next.s.demanding) cost += 25
      if (cur.s.demanding && next.s.gentle) cost -= 6
    }
    const next2 = order[i + 2]
    if (next && next2 && isConsecutive(cur.d, next.d) && isConsecutive(next.d, next2.d)) cost += 3
  }
  return cost
}

/**
 * Assigns sessions (in priority order) to distinct available dates. Exhaustive for ≤ 7 days, deterministic
 * (first arrangement with the lowest cost wins). Returns dates aligned with `sessions`.
 */
export function placeSessions(sessions: PlaceableSession[], available: ISODate[]): ISODate[] {
  const n = sessions.length
  if (n === 0) return []
  const days = [...available].sort()
  if (n > days.length) throw new Error('More sessions than available days')

  let best: ISODate[] = []
  let bestCost = Infinity
  const used = new Array<boolean>(days.length).fill(false)
  const current: ISODate[] = new Array<ISODate>(n)

  const recurse = (i: number): void => {
    if (i === n) {
      const c = placementCost(sessions, current)
      if (c < bestCost) {
        bestCost = c
        best = [...current]
      }
      return
    }
    for (let j = 0; j < days.length; j++) {
      if (used[j]) continue
      used[j] = true
      current[i] = days[j]
      recurse(i + 1)
      used[j] = false
    }
  }
  recurse(0)
  return best
}

/** Evenly spread `count` picks across `days` (used for rehab, which can share a day with training). */
export function spreadDays(days: ISODate[], count: number): ISODate[] {
  const sorted = [...days].sort()
  if (count <= 0 || sorted.length === 0) return []
  if (count >= sorted.length) return sorted
  const out: ISODate[] = []
  for (let i = 0; i < count; i++) out.push(sorted[Math.floor((i * sorted.length) / count)])
  return out
}
