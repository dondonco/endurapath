import type { Sport } from '../models/common'
import type { ClinicalRestriction, RestrictionEffect } from '../models/health'

export const RESTRICTION_SPORT_OPTIONS: Sport[] = ['swim', 'bike', 'run', 'brick', 'strength']

export function activeRestrictions(restrictions: ClinicalRestriction[]): ClinicalRestriction[] {
  return restrictions.filter((r) => r.status === 'active')
}

/** Merge every active restriction into the most conservative combined effect. */
export function combinedEffect(restrictions: ClinicalRestriction[]): RestrictionEffect {
  const active = activeRestrictions(restrictions)
  const order = ['recovery', 'easy', 'moderate'] as const
  let maxIntensity: RestrictionEffect['maxIntensity']
  let maxDurationMin: number | undefined
  const blocked = new Set<Sport>()
  let pause = false
  for (const r of active) {
    r.effect.blockedSports.forEach((s) => blocked.add(s))
    if (r.effect.pauseAllTraining) pause = true
    if (r.effect.maxIntensity) {
      if (!maxIntensity || order.indexOf(r.effect.maxIntensity) < order.indexOf(maxIntensity))
        maxIntensity = r.effect.maxIntensity
    }
    if (r.effect.maxDurationMin !== undefined)
      maxDurationMin = maxDurationMin === undefined ? r.effect.maxDurationMin : Math.min(maxDurationMin, r.effect.maxDurationMin)
  }
  return { blockedSports: Array.from(blocked), maxIntensity, maxDurationMin, pauseAllTraining: pause || undefined }
}

export function hasTrainingPause(restrictions: ClinicalRestriction[]): boolean {
  return Boolean(combinedEffect(restrictions).pauseAllTraining)
}

export function isSportBlocked(sport: Sport, restrictions: ClinicalRestriction[]): boolean {
  const e = combinedEffect(restrictions)
  if (e.pauseAllTraining) return sport !== 'rehab'
  if (sport === 'rehab') return false
  if (sport === 'brick') return e.blockedSports.some((s) => s === 'run' || s === 'bike' || s === 'brick')
  return e.blockedSports.includes(sport)
}

export function describeEffect(effect: RestrictionEffect): string {
  if (effect.pauseAllTraining) return 'All training paused — approved rehabilitation only'
  const parts: string[] = []
  if (effect.blockedSports.length) parts.push(`No ${effect.blockedSports.join(', ')}`)
  if (effect.maxIntensity) parts.push(`Max intensity: ${effect.maxIntensity}`)
  if (effect.maxDurationMin) parts.push(`Sessions ≤ ${effect.maxDurationMin} min`)
  return parts.length ? parts.join(' · ') : 'Monitor only'
}

export interface ResolveRequest {
  restrictionId: string
  clinicianName: string
  note: string
}

export type ResolveCheck = { ok: true } | { ok: false; error: string }

/**
 * Restrictions are never removed automatically — not by time passing, not by a high readiness score.
 * The athlete may record that a named clinician lifted a restriction; the app cannot verify it,
 * so the record is flagged `verified: false` and the change is logged.
 */
export function validateRestrictionResolution(req: ResolveRequest): ResolveCheck {
  if (req.clinicianName.trim().length < 2) return { ok: false, error: 'Enter the name of the clinician who lifted this restriction.' }
  if (req.note.trim().length < 3) return { ok: false, error: 'Add a short note about what the clinician advised.' }
  return { ok: true }
}

export const CLINICAL_DISCLAIMER =
  'EnduraPath provides general educational guidance and simulated assistant responses. It is not medical care, cannot diagnose, and cannot clear you to return to sport.'
