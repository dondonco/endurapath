import type { AthleteAvailability, UnavailableRange } from '../models/athlete'
import type { RaceEvent } from '../models/events'
import { eventConstraintFor } from './sessions'
import { dayIndex, isInRange, type ISODate } from '@/lib/dates'

export function isUnavailableDate(date: ISODate, ranges: UnavailableRange[]): boolean {
  return ranges.some((r) => isInRange(date, r.start, r.end))
}

export function isTrainingDay(date: ISODate, availability: Pick<AthleteAvailability, 'trainingDays' | 'restDay'>): boolean {
  const i = dayIndex(date)
  return availability.trainingDays.includes(i) && availability.restDay !== i
}

export type DateCheck = { ok: true } | { ok: false; reason: string }

/** Whether a session may be placed on a date, with a human-readable reason when it cannot. */
export function checkDateAvailable(
  date: ISODate,
  availability: Pick<AthleteAvailability, 'trainingDays' | 'restDay' | 'unavailable'>,
  events: RaceEvent[],
  opts: { allowNonTrainingDay?: boolean } = {},
): DateCheck {
  if (isUnavailableDate(date, availability.unavailable)) return { ok: false, reason: 'You marked this date as unavailable.' }
  const c = eventConstraintFor(date, events)
  if (c.blocked) return { ok: false, reason: c.reason ?? 'Race day.' }
  if (!opts.allowNonTrainingDay && !isTrainingDay(date, availability))
    return {
      ok: false,
      reason: availability.restDay === dayIndex(date) ? 'This is your preferred rest day.' : 'This is not one of your training days.',
    }
  return { ok: true }
}
