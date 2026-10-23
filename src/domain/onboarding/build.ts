import type { AthleteAvailability, AthleteProfile, FitnessBaseline } from '../models/athlete'
import type { Timestamp } from '../models/common'
import type { RaceEvent } from '../models/events'
import type { ClinicalRestriction } from '../models/health'
import type { OnboardingValues } from '../validation/schemas'
import { defaultChecklist } from '../events/checklist'
import { RACE_DISTANCES } from '../training-engine/config'
import { GOAL_LABELS } from '../models/common'
import { newId } from '@/lib/ids'

export interface BuildEnv {
  now: Timestamp
  mk?: (prefix: string) => string
  /** Reuse IDs when editing an existing profile so relationships survive. */
  existingAthleteId?: string
  existingAvailabilityId?: string
  createdAt?: Timestamp
}

export function parsePace(mmss?: string): number | undefined {
  if (!mmss) return undefined
  const m = /^(\d{1,2}):(\d{2})$/.exec(mmss.trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined
}

export function formatPaceInput(secPerKm?: number): string {
  if (!secPerKm) return ''
  return `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')}`
}

export function athleteFromValues(v: OnboardingValues, env: BuildEnv): AthleteProfile {
  const mk = env.mk ?? newId
  const b = v.baseline
  const races: FitnessBaseline['recentRaces'] = b.recentRaceName?.trim()
    ? [
        {
          id: mk('rr'),
          name: b.recentRaceName.trim(),
          category: b.recentRaceCategory || 'other',
          finishTime: b.recentRaceTime || undefined,
        },
      ]
    : []
  return {
    id: env.existingAthleteId ?? mk('ath'),
    createdAt: env.createdAt ?? env.now,
    updatedAt: env.now,
    displayName: v.profile.displayName,
    ageRange: v.profile.ageRange,
    units: v.profile.units,
    generalExperience: v.profile.generalExperience,
    swimConfidence: v.profile.swimConfidence,
    openWater: v.profile.openWater,
    bikeExperience: v.profile.bikeExperience,
    runExperience: v.profile.runExperience,
    healthNotes: v.profile.healthNotes?.trim() || undefined,
    baseline: {
      swimSessionsPerWeek: b.swimSessionsPerWeek,
      swimMetersPerWeek: b.swimMetersPerWeek,
      comfortableSwimM: b.comfortableSwimM,
      bikeSessionsPerWeek: b.bikeSessionsPerWeek,
      bikeMinutesPerWeek: b.bikeMinutesPerWeek,
      comfortableBikeMin: b.comfortableBikeMin,
      runSessionsPerWeek: b.runSessionsPerWeek,
      runMinutesPerWeek: b.runMinutesPerWeek,
      comfortableRunMin: b.comfortableRunMin,
      consistency: b.consistency,
      recentRaces: races,
      restingHr: b.restingHr,
      maxHr: b.maxHr,
      runThresholdPaceSecPerKm: parsePace(b.runPace),
      bikeFtpWatts: b.bikeFtpWatts,
      injuryNote: b.injuryNote?.trim() || undefined,
      hasClinicianRestrictions: b.hasClinicianRestrictions,
    },
    goal: {
      type: v.goal.type,
      targetEventDate: v.goal.targetEventDate || undefined,
      intermediateEvents: v.goal.intermediateEvents?.trim() || undefined,
      preferredFormat: v.goal.preferredFormat,
      intent: v.goal.intent,
      performanceTarget: v.goal.intent === 'performance' ? v.goal.performanceTarget?.trim() : undefined,
    },
    preferences: {
      dietary: v.preferences.dietary,
      allergies: (v.preferences.allergies ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      equipment: v.preferences.equipment,
      sleepHoursTypical: v.preferences.sleepHoursTypical,
      recoveryPattern: v.preferences.recoveryPattern,
      fatigueNote: v.preferences.fatigueNote?.trim() || undefined,
      professionalSupport: v.preferences.professionalSupport.length ? v.preferences.professionalSupport : ['none'],
    },
    isDemo: false,
  }
}

export function availabilityFromValues(v: OnboardingValues, athleteId: string, env: BuildEnv): AthleteAvailability {
  const mk = env.mk ?? newId
  const a = v.availability
  return {
    id: env.existingAvailabilityId ?? mk('avl'),
    createdAt: env.createdAt ?? env.now,
    updatedAt: env.now,
    athleteId,
    trainingDays: [...a.trainingDays].sort(),
    maxHoursPerWeek: a.maxHoursPerWeek,
    restDay: a.restDay >= 0 ? a.restDay : null,
    constraints: a.constraints?.trim() || undefined,
    access: a.access,
    preferredTimes: a.preferredTimes,
    unavailable: a.unavailable.map((u) => ({ id: mk('una'), start: u.start, end: u.end, reason: u.reason?.trim() || undefined })),
  }
}

export function goalEventFromValues(v: OnboardingValues, env: BuildEnv): RaceEvent | null {
  if (!v.goal.targetEventDate) return null
  const mk = env.mk ?? newId
  const d = RACE_DISTANCES[v.goal.type]
  return {
    id: mk('evt'),
    createdAt: env.now,
    updatedAt: env.now,
    name: v.goal.eventName?.trim() || `${GOAL_LABELS[v.goal.type]} (goal race)`,
    date: v.goal.targetEventDate,
    location: 'To be confirmed',
    category: v.goal.type,
    swimM: d.swimM,
    bikeKm: d.bikeKm,
    runKm: d.runKm,
    priority: 'A',
    targetOutcome: v.goal.intent === 'performance' ? (v.goal.performanceTarget ?? 'Performance target') : 'Finish comfortably',
    notes: v.goal.intermediateEvents?.trim() ? `Other events mentioned: ${v.goal.intermediateEvents.trim()}` : undefined,
    checklist: defaultChecklist(v.goal.type, mk),
    status: 'planned',
  }
}

/**
 * Athlete-disclosed restrictions become *visible, athlete-reported* restrictions with a conservative default
 * (easy intensity only). They never claim clinician verification and are removed only by an explicit, logged action.
 */
export function restrictionFromOnboarding(v: OnboardingValues, env: BuildEnv): ClinicalRestriction | null {
  if (!v.baseline.hasClinicianRestrictions || !v.baseline.restrictionDetail?.trim()) return null
  const mk = env.mk ?? newId
  return {
    id: mk('res'),
    createdAt: env.now,
    updatedAt: env.now,
    title: 'Restriction disclosed at onboarding',
    description: v.baseline.restrictionDetail.trim(),
    source: 'athlete-reported',
    severity: 'modify',
    effect: { blockedSports: [], maxIntensity: 'easy' },
    status: 'active',
  }
}
