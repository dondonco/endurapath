export type UnitSystem = 'metric' | 'imperial'

const KM_PER_MILE = 1.609344
const YARDS_PER_M = 1.093613

export function formatBikeRunDistance(meters: number, units: UnitSystem): string {
  if (units === 'imperial') return `${(meters / 1000 / KM_PER_MILE).toFixed(1)} mi`
  return `${(meters / 1000).toFixed(1)} km`
}

export function formatSwimDistance(meters: number, units: UnitSystem): string {
  if (units === 'imperial') return `${Math.round((meters * YARDS_PER_M) / 25) * 25} yd`
  return `${Math.round(meters / 25) * 25} m`
}

export function formatDistance(meters: number, sport: string, units: UnitSystem): string {
  return sport === 'swim' ? formatSwimDistance(meters, units) : formatBikeRunDistance(meters, units)
}

export function kmToUnit(km: number, units: UnitSystem): number {
  return units === 'imperial' ? km / KM_PER_MILE : km
}

export function distanceUnitLabel(units: UnitSystem): string {
  return units === 'imperial' ? 'mi' : 'km'
}

export function formatPace(secPerKm: number, units: UnitSystem): string {
  const sec = units === 'imperial' ? secPerKm * KM_PER_MILE : secPerKm
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  const mm = s === 60 ? m + 1 : m
  const ss = s === 60 ? 0 : s
  return `${mm}:${String(ss).padStart(2, '0')}/${units === 'imperial' ? 'mi' : 'km'}`
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${r} min`
}

export function formatHours(minutes: number): string {
  return `${(minutes / 60).toFixed(1)} h`
}

export function formatMeters(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m % 1000 === 0 ? 0 : 1)} km` : `${m} m`
}
