import { addDays, differenceInCalendarDays, differenceInCalendarWeeks, format, parseISO, startOfWeek } from 'date-fns'

/** Dates in the domain are plain 'yyyy-MM-dd' strings in the athlete's local calendar. */
export type ISODate = string

export function toISODate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd')
}

export function parseDate(s: ISODate): Date {
  return parseISO(s)
}

export function addDaysISO(s: ISODate, n: number): ISODate {
  return toISODate(addDays(parseDate(s), n))
}

export function mondayOf(s: ISODate): ISODate {
  return toISODate(startOfWeek(parseDate(s), { weekStartsOn: 1 }))
}

/** Monday = 0 … Sunday = 6 */
export function dayIndex(s: ISODate): number {
  return (parseDate(s).getDay() + 6) % 7
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseDate(to), parseDate(from))
}

export function weeksBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarWeeks(parseDate(to), parseDate(from), { weekStartsOn: 1 })
}

export function isoDateOf(now: Date | string): ISODate {
  return typeof now === 'string' ? (now.length > 10 ? toISODate(parseISO(now)) : now) : toISODate(now)
}

export function formatDate(s: ISODate, pattern = 'EEE d MMM'): string {
  return format(parseDate(s), pattern)
}

export function formatDateTime(iso: string, pattern = 'd MMM, HH:mm'): string {
  return format(parseISO(iso), pattern)
}

export function isInRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end
}

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function datesOfWeekISO(anyDateInWeek: ISODate): ISODate[] {
  const monday = mondayOf(anyDateInWeek)
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i))
}
